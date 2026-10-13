import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AlertsService } from '../alerts/alerts.service';
import { RecurringService } from '../recurring/recurring.service';
import { CreateExpenseDto, UpdateExpenseDto } from './expenses.dto';

const MONTH_RE = /^\d{4}-\d{2}$/;

@Injectable()
export class ExpensesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private alerts: AlertsService,
    private recurring: RecurringService,
  ) {}

  async assertMember(familyId: string, userId: string) {
    const m = await this.prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId, userId } },
    });
    if (!m) throw new ForbiddenException('Not a member of this family');
    return m;
  }

  private monthRange(month: string) {
    if (!MONTH_RE.test(month)) {
      throw new BadRequestException('month must be in YYYY-MM format');
    }
    const [y, m] = month.split('-').map(Number);
    return {
      gte: new Date(Date.UTC(y, m - 1, 1)),
      lt: new Date(Date.UTC(y, m, 1)),
    };
  }

  async list(familyId: string, userId: string, month: string, page = 1, limit = 50) {
    if (!MONTH_RE.test(month)) {
      throw new BadRequestException('month must be in YYYY-MM format');
    }
    await this.assertMember(familyId, userId);
    // materialize due recurring expenses so they show up in the month view
    await this.recurring.materializeFor(familyId);
    const where = { familyId, date: this.monthRange(month) };
    const [items, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: {
          category: true,
          paidBy: { select: { id: true, name: true } },
          recurring: { select: { id: true, name: true, interval: true } },
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: Math.min(limit, 100),
      }),
      this.prisma.expense.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  private parseDate(input: string): Date {
    const [y, m, d] = input.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
      throw new BadRequestException(`Invalid calendar date: ${input}`);
    }
    return dt;
  }

  private rangeWhere(from: string, to: string) {
    const gte = this.parseDate(from);
    const toStart = this.parseDate(to);
    if (gte > toStart) throw new BadRequestException('from must not be after to');
    return { gte, lt: new Date(toStart.getTime() + 24 * 60 * 60 * 1000) };
  }

  async listByRange(familyId: string, userId: string, from: string, to: string, page = 1, limit = 50) {
    await this.assertMember(familyId, userId);
    await this.recurring.materializeFor(familyId);
    const where = { familyId, date: this.rangeWhere(from, to) };
    const [items, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: {
          category: true,
          paidBy: { select: { id: true, name: true } },
          recurring: { select: { id: true, name: true, interval: true } },
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: Math.min(limit, 100),
      }),
      this.prisma.expense.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async create(userId: string, dto: CreateExpenseDto) {
    const membership = await this.assertMember(dto.familyId, userId);
    if (membership.role === 'VIEWER') throw new ForbiddenException('View-only role');
    const expense = await this.prisma.expense.create({
      data: {
        familyId: dto.familyId,
        categoryId: dto.categoryId,
        paidById: dto.paidById || userId,
        amount: dto.amount,
        date: new Date(dto.date),
        paymentMethod: dto.paymentMethod,
        notes: dto.notes,
        receiptUrl: dto.receiptUrl,
        createdById: userId,
        reviewed: true,
        reviewedAt: new Date(),
        reviewedById: userId,
      },
      include: { category: true, paidBy: { select: { id: true, name: true } } },
    });
    await this.checkBudgetAlert(dto.familyId, dto.categoryId, expense.date, Number(expense.amount));
    this.alerts.evaluateFamilyRules(dto.familyId).catch(() => {});
    return expense;
  }

  async update(expenseId: string, userId: string, dto: UpdateExpenseDto) {
    const expense = await this.prisma.expense.findUnique({ where: { id: expenseId } });
    if (!expense) throw new NotFoundException('Expense not found');
    const membership = await this.assertMember(expense.familyId, userId);
    if (membership.role === 'VIEWER') throw new ForbiddenException('View-only role');
    const updated = await this.prisma.expense.update({
      where: { id: expenseId },
      data: {
        amount: dto.amount,
        date: dto.date ? new Date(dto.date) : undefined,
        paymentMethod: dto.paymentMethod,
        notes: dto.notes,
        categoryId: dto.categoryId,
        receiptUrl: dto.receiptUrl,
      },
      include: { category: true, paidBy: { select: { id: true, name: true } } },
    });
    const sameBucket = updated.categoryId === expense.categoryId && updated.date.getTime() === expense.date.getTime();
    const delta = Number(updated.amount) - (sameBucket ? Number(expense.amount) : 0);
    await this.checkBudgetAlert(updated.familyId, updated.categoryId, updated.date, delta);
    this.alerts.evaluateFamilyRules(updated.familyId).catch(() => {});
    return updated;
  }

  async remove(expenseId: string, userId: string) {
    const expense = await this.prisma.expense.findUnique({
      where: { id: expenseId },
      include: { recurring: { select: { id: true, name: true, interval: true } } },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    const membership = await this.assertMember(expense.familyId, userId);
    const isCreatorOrAdmin = expense.createdById === userId || membership.role === 'ADMIN';
    if (!isCreatorOrAdmin) throw new ForbiddenException('Cannot delete this expense');
    if (expense.recurringId) {
      // Materialised recurring expenses are managed from the Recurring Expenses
      // section — deleting one here would either re-appear next cycle or break
      // the audit trail. The frontend also intercepts this with a friendlier
      // modal, but we block at the API too so direct curl/script calls get a
      // clear 400 with the recurring-rule id for context.
      throw new BadRequestException({
        statusCode: 400,
        error: 'Recurring expense locked',
        message: 'This expense was generated by a recurring rule and cannot be deleted from the expense list.',
        code: 'RECURRING_LOCKED',
        recurringId: expense.recurringId,
        recurring: expense.recurring,
        hint: 'Open the "Recurring expenses" section to stop, edit, or delete the rule instead.',
      });
    }
    await this.prisma.expense.delete({ where: { id: expenseId } });
    return { ok: true };
  }

  /**
   * Notify admins only when spending crosses the budget threshold
   * (delta = amount contributed by this change), preventing repeated alerts.
   */
  private async checkBudgetAlert(familyId: string, categoryId: string, date: Date, delta: number) {
    const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    const budget = await this.prisma.budget.findUnique({
      where: { familyId_categoryId_month: { familyId, categoryId, month } },
      include: { category: true },
    });
    if (!budget) return;
    const range = this.monthRange(month);
    const agg = await this.prisma.expense.aggregate({
      where: { familyId, categoryId, date: range },
      _sum: { amount: true },
    });
    const spent = Number(agg._sum.amount ?? 0);
    const spentBefore = spent - delta;
    const budgetAmount = Number(budget.amount);
    if (spent >= budgetAmount && spentBefore < budgetAmount) {
      const admins = await this.prisma.familyMember.findMany({
        where: { familyId, role: 'ADMIN' },
      });
      for (const admin of admins) {
        await this.notifications.notify(
          admin.userId,
          'BUDGET_ALERT',
          'Budget reached',
          `Spending in ${budget.category.name} has reached the ${month} budget`,
        );
      }
    }
  }
}
