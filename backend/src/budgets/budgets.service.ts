import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateBudgetDto, UpdateBudgetDto } from './budgets.dto';

const MONTH_RE = /^\d{4}-\d{2}$/;

@Injectable()
export class BudgetsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  private monthRange(month: string) {
    if (!MONTH_RE.test(month)) {
      throw new BadRequestException('month must be in YYYY-MM format');
    }
    const [y, m] = month.split('-').map(Number);
    return { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
  }

  async assertRole(familyId: string, userId: string, write = false) {
    const m = await this.prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId, userId } },
    });
    if (!m) throw new ForbiddenException('Not a member of this family');
    if (write && m.role === 'VIEWER') throw new ForbiddenException('View-only role');
    return m;
  }

  async list(familyId: string, userId: string, month: string) {
    await this.assertRole(familyId, userId);
    const range = this.monthRange(month);
    const [budgets, spent] = await Promise.all([
      this.prisma.budget.findMany({
        where: { familyId, month },
        include: { category: true },
      }),
      this.prisma.expense.groupBy({
        by: ['categoryId'],
        where: { familyId, date: range },
        _sum: { amount: true },
      }),
    ]);
    const spentMap = new Map(
      spent.map((s) => [s.categoryId, Number(s._sum.amount ?? 0)] as const),
    );
    return {
      items: budgets.map((b) => ({
        id: b.id,
        categoryId: b.categoryId,
        amount: b.amount,
        month: b.month,
        category: b.category,
        spent: spentMap.get(b.categoryId) ?? 0,
      })),
    };
  }

  async create(userId: string, dto: CreateBudgetDto) {
    await this.assertRole(dto.familyId, userId, true);
    if (!MONTH_RE.test(dto.month)) {
      throw new BadRequestException('month must be in YYYY-MM format');
    }
    const budget = await this.prisma.budget.upsert({
      where: {
        familyId_categoryId_month: {
          familyId: dto.familyId,
          categoryId: dto.categoryId,
          month: dto.month,
        },
      },
      update: { amount: dto.amount },
      create: {
        familyId: dto.familyId,
        categoryId: dto.categoryId,
        month: dto.month,
        amount: dto.amount,
      },
      include: { category: true },
    });
    await this.alertIfOver(dto.familyId, dto.categoryId, dto.month, budget.amount);
    return budget;
  }

  private async alertIfOver(familyId: string, categoryId: string, month: string, amount: Prisma.Decimal) {
    const range = this.monthRange(month);
    const agg = await this.prisma.expense.aggregate({
      where: { familyId, categoryId, date: range },
      _sum: { amount: true },
    });
    const spent = Number(agg._sum.amount ?? 0);
    if (spent >= Number(amount)) {
      const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
      const admins = await this.prisma.familyMember.findMany({
        where: { familyId, role: 'ADMIN' },
      });
      for (const admin of admins) {
        await this.notifications.notify(
          admin.userId,
          'BUDGET_ALERT',
          'Budget reached',
          `Spending in ${category?.name ?? 'category'} has reached the ${month} budget`,
        );
      }
    }
  }

  async update(id: string, userId: string, dto: UpdateBudgetDto) {
    const budget = await this.prisma.budget.findUnique({ where: { id } });
    if (!budget) throw new NotFoundException('Budget not found');
    await this.assertRole(budget.familyId, userId, true);
    return this.prisma.budget.update({ where: { id }, data: { amount: dto.amount } });
  }

  async remove(id: string, userId: string) {
    const budget = await this.prisma.budget.findUnique({ where: { id } });
    if (!budget) throw new NotFoundException('Budget not found');
    // deletion is restricted to family admins; editing is open to members
    const m = await this.assertRole(budget.familyId, userId, true);
    if (m.role !== 'ADMIN') throw new ForbiddenException('Admin role required');
    await this.prisma.budget.delete({ where: { id } });
    return { ok: true };
  }
}
