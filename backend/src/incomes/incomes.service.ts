import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateIncomeDto, UpdateIncomeDto } from './incomes.dto';

const MONTH_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class IncomesService {
  constructor(private prisma: PrismaService) {}

  private async assertRole(familyId: string, userId: string, requireAdmin = false) {
    const m = await this.prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId, userId } },
    });
    if (!m) throw new ForbiddenException('Not a member of this family');
    if (m.role === 'VIEWER') throw new ForbiddenException('View-only role');
    if (requireAdmin && m.role !== 'ADMIN') throw new ForbiddenException('Admin role required');
    return m;
  }

  private async assertMemberRead(familyId: string, userId: string) {
    const m = await this.prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId, userId } },
    });
    if (!m) throw new ForbiddenException('Not a member of this family');
    return m;
  }

  private resolveRange(month?: string, from?: string, to?: string): { gte: Date; lt: Date } {
    if (from || to) {
      if (!from || !to) throw new BadRequestException('Both from and to are required');
      if (!DATE_RE.test(from) || !DATE_RE.test(to)) throw new BadRequestException('from/to must be YYYY-MM-DD');
      const [fy, fm, fd] = from.split('-').map(Number);
      const [ty, tm, td] = to.split('-').map(Number);
      const gte = new Date(Date.UTC(fy, fm - 1, fd));
      const toStart = new Date(Date.UTC(ty, tm - 1, td));
      if (gte > toStart) throw new BadRequestException('from must not be after to');
      return { gte, lt: new Date(toStart.getTime() + 86400000) };
    }
    if (!month || !MONTH_RE.test(month)) throw new BadRequestException('Provide month=YYYY-MM or from/to range');
    const [y, m] = month.split('-').map(Number);
    return { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
  }

  private monthsInRange(gte: Date, lt: Date): number {
    const startMonth = new Date(Date.UTC(gte.getUTCFullYear(), gte.getUTCMonth(), 1));
    const endMoment = new Date(lt.getTime() - 1);
    const endMonth = new Date(Date.UTC(endMoment.getUTCFullYear(), endMoment.getUTCMonth(), 1));
    let count = 0;
    const cur = new Date(startMonth);
    while (cur <= endMonth) { count++; cur.setUTCMonth(cur.getUTCMonth() + 1); }
    return Math.max(1, count);
  }

  async list(familyId: string, userId: string) {
    await this.assertMemberRead(familyId, userId);
    return this.prisma.income.findMany({
      where: { familyId },
      include: {
        member: { select: { id: true, name: true, email: true } },
        declaredBy: { select: { id: true, name: true } },
      },
      orderBy: [{ isRecurring: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(userId: string, dto: CreateIncomeDto) {
    const m = await this.assertRole(dto.familyId, userId);
    const memberId = dto.memberId ?? userId;
    if (memberId !== userId && m.role !== 'ADMIN') throw new ForbiddenException('Members can only declare their own income');
    if (memberId !== userId) {
      const target = await this.prisma.familyMember.findUnique({
        where: { familyId_userId: { familyId: dto.familyId, userId: memberId } },
      });
      if (!target) throw new BadRequestException('Target member is not part of this family');
    }
    return this.prisma.income.create({
      data: {
        familyId: dto.familyId, memberId, declaredById: userId,
        amount: dto.amount, type: dto.type, source: dto.source,
        isRecurring: dto.isRecurring, date: new Date(dto.date),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        notes: dto.notes,
      },
      include: { member: { select: { id: true, name: true, email: true } }, declaredBy: { select: { id: true, name: true } } },
    });
  }

  async update(id: string, userId: string, dto: UpdateIncomeDto) {
    const income = await this.prisma.income.findUnique({ where: { id } });
    if (!income) throw new NotFoundException('Income not found');
    const m = await this.assertRole(income.familyId, userId);
    if (income.declaredById !== userId && m.role !== 'ADMIN') throw new ForbiddenException('Only the declarer or an admin can edit this income');
    return this.prisma.income.update({
      where: { id },
      data: {
        amount: dto.amount, type: dto.type,
        source: dto.source ?? undefined,
        date: dto.date ? new Date(dto.date) : undefined,
        endDate: dto.endDate === undefined ? undefined : dto.endDate === null ? null : new Date(dto.endDate),
        notes: dto.notes, active: dto.active,
      },
      include: { member: { select: { id: true, name: true, email: true } }, declaredBy: { select: { id: true, name: true } } },
    });
  }

  async remove(id: string, userId: string) {
    const income = await this.prisma.income.findUnique({ where: { id } });
    if (!income) throw new NotFoundException('Income not found');
    const m = await this.assertRole(income.familyId, userId);
    if (income.declaredById !== userId && m.role !== 'ADMIN') throw new ForbiddenException('Only the declarer or an admin can delete this income');
    await this.prisma.income.delete({ where: { id } });
    return { ok: true };
  }

  async summary(familyId: string, userId: string, month?: string, from?: string, to?: string) {
    await this.assertMemberRead(familyId, userId);
    const range = this.resolveRange(month, from, to);
    const months = this.monthsInRange(range.gte, range.lt);
    const [adhocItems, recurringItems] = await Promise.all([
      this.prisma.income.findMany({
        where: { familyId, isRecurring: false, active: true, date: range },
        include: { member: { select: { id: true, name: true } } },
      }),
      this.prisma.income.findMany({
        where: { familyId, isRecurring: true, active: true, date: { lte: range.lt },
          OR: [{ endDate: null }, { endDate: { gte: range.gte } }] },
        include: { member: { select: { id: true, name: true } } },
      }),
    ]);
    // Per-item month counting: intersect each recurring income's active window with the query range
    const itemMonths = (i: { date: Date; endDate: Date | null }) => {
      const effStart = i.date > range.gte ? i.date : range.gte;
      const effEnd = i.endDate && i.endDate < range.lt ? i.endDate : new Date(range.lt.getTime() - 1);
      if (effStart > effEnd) return 0;
      return this.monthsInRange(effStart, new Date(effEnd.getTime() + 1));
    };
    const recurringTotal = recurringItems.reduce((s, i) => s + Number(i.amount) * itemMonths(i), 0);
    const adhocTotal = adhocItems.reduce((s, i) => s + Number(i.amount), 0);
    const totalIncome = recurringTotal + adhocTotal;
    const byMember = new Map<string, { userId: string; name: string; recurring: number; adhoc: number; total: number }>();
    for (const i of recurringItems) {
      const eff = Number(i.amount) * itemMonths(i);
      const v = byMember.get(i.memberId) ?? { userId: i.memberId, name: i.member.name, recurring: 0, adhoc: 0, total: 0 };
      v.recurring += eff; v.total += eff; byMember.set(i.memberId, v);
    }
    for (const i of adhocItems) {
      const eff = Number(i.amount);
      const v = byMember.get(i.memberId) ?? { userId: i.memberId, name: i.member.name, recurring: 0, adhoc: 0, total: 0 };
      v.adhoc += eff; v.total += eff; byMember.set(i.memberId, v);
    }
    const byType = new Map<string, { type: string; total: number }>();
    for (const i of recurringItems) {
      const v = byType.get(i.type) ?? { type: i.type, total: 0 };
      v.total += Number(i.amount) * itemMonths(i); byType.set(i.type, v);
    }
    for (const i of adhocItems) {
      const v = byType.get(i.type) ?? { type: i.type, total: 0 };
      v.total += Number(i.amount); byType.set(i.type, v);
    }
    return {
      totalIncome, recurringTotal, adhocTotal, months,
      byMember: [...byMember.values()].sort((a, b) => b.total - a.total),
      byType: [...byType.values()].sort((a, b) => b.total - a.total),
      recurringItems, adhocItems,
    };
  }
}
