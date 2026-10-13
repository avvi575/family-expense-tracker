import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { RecurringService } from '../recurring/recurring.service';
import { FinancialReportService } from './financial-report.service';
import * as ExcelJS from 'exceljs';

const MONTH_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type AggregationType = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private prisma: PrismaService,
    private recurring: RecurringService,
    private financialReport: FinancialReportService,
  ) {}

  private async assertMember(familyId: string, userId: string) {
    const m = await this.prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId, userId } },
    });
    if (!m) throw new ForbiddenException('Not a member of this family');
  }

  private parseDate(input: string): Date {
    const [y, m, d] = input.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
      throw new BadRequestException(`Invalid calendar date: ${input}`);
    }
    return dt;
  }

  private resolveRange(month?: string, from?: string, to?: string): { gte: Date; lt: Date } {
    if (from || to) {
      if (!from || !to) throw new BadRequestException('Both from and to are required for a custom range');
      if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
        throw new BadRequestException('from and to must be in YYYY-MM-DD format');
      }
      const gte = this.parseDate(from);
      const toStart = this.parseDate(to);
      if (gte > toStart) throw new BadRequestException('from must not be after to');
      return { gte, lt: new Date(toStart.getTime() + 24 * 60 * 60 * 1000) };
    }
    if (!month || !MONTH_RE.test(month)) {
      throw new BadRequestException('Provide month=YYYY-MM or a custom range from/to (YYYY-MM-DD)');
    }
    const [y, m] = month.split('-').map(Number);
    return { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
  }

  private getPeriodKey(date: Date, aggregation: AggregationType): string {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    const dayOfWeek = date.getUTCDay(); // 0 = Sunday

    switch (aggregation) {
      case 'DAILY':
        return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      case 'WEEKLY':
        // Get the Monday of the week (ISO week)
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(date);
        monday.setUTCDate(date.getUTCDate() + mondayOffset);
        const mondayYear = monday.getUTCFullYear();
        const mondayMonth = monday.getUTCMonth();
        const mondayDay = monday.getUTCDate();
        const weekNum = Math.ceil((mondayDay + new Date(mondayYear, mondayMonth, 1).getUTCDay()) / 7);
        return `${mondayYear}-W${String(weekNum).padStart(2, '0')}`;
      case 'MONTHLY':
        return `${year}-${String(month + 1).padStart(2, '0')}`;
      case 'QUARTERLY':
        return `${year}-Q${Math.floor(month / 3) + 1}`;
      case 'HALF_YEARLY':
        return `${year}-H${month < 6 ? 1 : 2}`;
      case 'YEARLY':
        return `${year}`;
      default:
        return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  private aggregateDailyTotals(dailyTotals: { date: string; total: number }[], aggregation: AggregationType): { period: string; total: number }[] {
    const aggregated = new Map<string, number>();

    for (const { date, total } of dailyTotals) {
      const d = new Date(date + 'T00:00:00.000Z');
      const period = this.getPeriodKey(d, aggregation);
      aggregated.set(period, (aggregated.get(period) ?? 0) + total);
    }

    return [...aggregated.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, total]) => ({ period, total }));
  }

  private aggregateByMemberAndPeriod(expenses: any[], aggregation: AggregationType): Map<string, { period: string; total: number }[]> {
    const memberPeriodMap = new Map<string, Map<string, number>>();

    for (const e of expenses) {
      const amount = Number(e.amount);
      const day = e.date.toISOString().slice(0, 10);
      const d = new Date(day + 'T00:00:00.000Z');
      const period = this.getPeriodKey(d, aggregation);
      const memberId = e.paidById;

      if (!memberPeriodMap.has(memberId)) {
        memberPeriodMap.set(memberId, new Map());
      }
      const periodMap = memberPeriodMap.get(memberId)!;
      periodMap.set(period, (periodMap.get(period) ?? 0) + amount);
    }

    const result = new Map<string, { period: string; total: number }[]>();
    for (const [memberId, periodMap] of memberPeriodMap.entries()) {
      const sorted = [...periodMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([period, total]) => ({ period, total }));
      result.set(memberId, sorted);
    }
    return result;
  }

  async summary(familyId: string, userId: string, month?: string, from?: string, to?: string, aggregation?: AggregationType, memberId?: string) {
    await this.assertMember(familyId, userId);
    const range = this.resolveRange(month, from, to);
    await this.recurring.materializeFor(familyId);

    const where = memberId ? { familyId, date: range, paidById: memberId } : { familyId, date: range };
    const expenses = await this.prisma.expense.findMany({
      where,
      include: {
        category: true,
        paidBy: { select: { id: true, name: true } },
        recurring: { select: { id: true, name: true } },
      },
    });

    let totalSpent = 0;
    let recurringTotal = 0;
    const byCategory = new Map<string, { categoryId: string; name: string; color: string; total: number }>();
    const byMember = new Map<string, { userId: string; name: string; total: number }>();
    const byRecurring = new Map<string, { id: string; name: string; total: number }>();
    const daily = new Map<string, number>();

    for (const e of expenses) {
      const amount = Number(e.amount);
      totalSpent += amount;
      const cat = byCategory.get(e.categoryId) ?? {
        categoryId: e.categoryId,
        name: `${e.category.icon} ${e.category.name}`,
        color: e.category.color,
        total: 0,
      };
      cat.total += amount;
      byCategory.set(e.categoryId, cat);

      const mem = byMember.get(e.paidById) ?? { userId: e.paidById, name: e.paidBy.name, total: 0 };
      mem.total += amount;
      byMember.set(e.paidById, mem);

      if (e.recurringId && e.recurring) {
        recurringTotal += amount;
        const rec = byRecurring.get(e.recurringId) ?? { id: e.recurringId, name: e.recurring.name, total: 0 };
        rec.total += amount;
        byRecurring.set(e.recurringId, rec);
      }

      const day = e.date.toISOString().slice(0, 10);
      daily.set(day, (daily.get(day) ?? 0) + amount);
    }

    const dailyTotals = [...daily.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({ date, total }));

    const aggregatedTotals = aggregation ? this.aggregateDailyTotals(dailyTotals, aggregation) : undefined;
    const aggregatedByMember = aggregation ? this.aggregateByMemberAndPeriod(expenses, aggregation) : undefined;

    return {
      totalSpent,
      recurringTotal,
      oneTimeTotal: totalSpent - recurringTotal,
      byCategory: [...byCategory.values()].sort((a, b) => b.total - a.total),
      byMember: [...byMember.values()].sort((a, b) => b.total - a.total),
      byRecurring: [...byRecurring.values()].sort((a, b) => b.total - a.total),
      dailyTotals,
      aggregatedTotals,
      aggregatedByMember,
    };
  }

  /** Professionally designed financial report (xlsx) when exceljs is available */
  async reportXlsx(familyId: string, userId: string, month?: string, from?: string, to?: string): Promise<[string, Buffer]> {
    const range = this.resolveRange(month, from, to);
    const months = this.monthsInRange(range.gte, range.lt);
    const expenseSummary = await this.summary(familyId, userId, month, from, to);
    const incomes = await this.prisma.income.findMany({
      where: { familyId, active: true },
      include: { member: { select: { id: true, name: true } } },
    });
    let totalIncome = 0;
    const byMemberMap = new Map<string, { name: string; total: number }>();
    const byTypeMap = new Map<string, number>();
    for (const i of incomes) {
      const eff = Number(i.amount) * months;
      totalIncome += eff;
      const m = byMemberMap.get(i.memberId);
      byMemberMap.set(i.memberId, { name: i.member.name, total: (m?.total ?? 0) + eff });
      byTypeMap.set(i.type, (byTypeMap.get(i.type) ?? 0) + eff);
    }
    const label = from && to ? `${from}_to_${to}` : month ?? '';
    const data = {
      month: label || 'report',
      familyName: (await this.prisma.family.findUnique({ where: { id: familyId }, select: { name: true } }))?.name ?? 'Family',
      income: {
        total: totalIncome,
        byMember: [...byMemberMap.values()].sort((a, b) => b.total - a.total),
        byType: [...byTypeMap.entries()].map(([type, total]) => ({ type, total })).sort((a, b) => b.total - a.total),
      },
      expense: {
        total: expenseSummary.totalSpent,
        recurringTotal: expenseSummary.recurringTotal,
        oneTimeTotal: expenseSummary.oneTimeTotal,
        byCategory: expenseSummary.byCategory,
        byMember: expenseSummary.byMember,
        byRecurring: expenseSummary.byRecurring,
        dailyTotals: expenseSummary.dailyTotals,
      },
    };
    const wb = this.financialReport.build(data);
    const buffer = await wb.xlsx.writeBuffer();
    return [label || 'report', buffer as unknown as Buffer];
  }




  private monthsInRange(gte: Date, lt: Date): number {
    const startMonth = new Date(Date.UTC(gte.getUTCFullYear(), gte.getUTCMonth(), 1));
    const endMoment = new Date(lt.getTime() - 1);
    const endMonth = new Date(Date.UTC(endMoment.getUTCFullYear(), endMoment.getUTCMonth(), 1));
    let count = 0;
    const cur = new Date(startMonth);
    while (cur <= endMonth) {
      count++;
      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
    return Math.max(1, count);
  }
}
