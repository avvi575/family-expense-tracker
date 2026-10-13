import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateAlertDto } from './alerts.dto';

@Injectable()
export class AlertsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  private async assertAdmin(familyId: string, userId: string) {
    const m = await this.prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId, userId } },
    });
    if (!m) throw new ForbiddenException('Not a member of this family');
    if (m.role !== 'ADMIN') throw new ForbiddenException('Admin role required');
    return m;
  }

  private async assertMember(familyId: string, userId: string) {
    const m = await this.prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId, userId } },
    });
    if (!m) throw new ForbiddenException('Not a member of this family');
    return m;
  }

  async list(familyId: string, userId: string) {
    await this.assertMember(familyId, userId);
    return this.prisma.alert.findMany({
      where: { familyId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(userId: string, dto: CreateAlertDto) {
    await this.assertAdmin(dto.familyId, userId);
    return this.prisma.alert.create({
      data: {
        familyId: dto.familyId,
        name: dto.name,
        condition: dto.condition,
        type: dto.type,
      },
    });
  }

  /** Evaluate every stored alert rule for a family. Called after expense changes. */
  async evaluateFamilyRules(familyId: string) {
    const month = new Date().toISOString().slice(0, 7);
    const alerts = await this.prisma.alert.findMany({ where: { familyId } });
    for (const alert of alerts) {
      const triggered = await this.evaluateCondition(alert.condition, familyId, month);
      if (triggered && !alert.triggered) {
        await this.prisma.alert.update({ where: { id: alert.id }, data: { triggered: true } });
        await this.notifyAdmins(familyId, 'ALERT_TRIGGERED', `Alert: ${alert.name}`, alert.condition);
      } else if (!triggered && alert.triggered) {
        // reset so the alert can fire again on the next breach
        await this.prisma.alert.update({ where: { id: alert.id }, data: { triggered: false } });
      }
    }
    return { evaluated: alerts.length };
  }

  /** Evaluate an ad-hoc condition string against a family (does not persist). */
  async evaluate(condition: string, familyId: string, userId: string) {
    await this.assertMember(familyId, userId);
    const month = new Date().toISOString().slice(0, 7);
    const triggered = await this.evaluateCondition(condition, familyId, month);
    if (triggered) {
      await this.notifyAdmins(familyId, 'ALERT_TRIGGERED', 'Alert triggered', condition);
    }
    return { condition, triggered };
  }

  private monthRange(month: string) {
    const [y, m] = month.split('-').map(Number);
    return { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
  }

  private async monthlyTotal(familyId: string, month: string, categoryId?: string) {
    const agg = await this.prisma.expense.aggregate({
      where: { familyId, date: this.monthRange(month), ...(categoryId ? { categoryId } : {}) },
      _sum: { amount: true },
    });
    return Number(agg._sum.amount ?? 0);
  }

  private async evaluateCondition(condition: string, familyId: string, currentMonth: string): Promise<boolean> {
    const rules = condition.split('|');
    for (const rule of rules) {
      const [key, ...val] = rule.split(':');
      const param = val.join(':').trim();
      const name = key.trim();
      if (name === 'expenses_total') {
        const total = await this.monthlyTotal(familyId, currentMonth);
        if (param && total > Number(param)) return true;
      } else if (name === 'budget_over') {
        const budgets = await this.prisma.budget.findMany({ where: { familyId } });
        for (const b of budgets) {
          const spent = await this.monthlyTotal(familyId, b.month, b.categoryId);
          if (spent > Number(b.amount)) return true;
        }
      }
    }
    return false;
  }

  private async notifyAdmins(familyId: string, type: string, title: string, message: string) {
    const admins = await this.prisma.familyMember.findMany({
      where: { familyId, role: 'ADMIN' },
    });
    for (const a of admins) {
      await this.notifications.notify(a.userId, type, title, message);
    }
  }
}
