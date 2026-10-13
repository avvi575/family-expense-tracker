import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RecurringExpense } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { CreateRecurringDto, RecurringInterval, UpdateRecurringDto } from './recurring.dto';

const INTERVAL_MONTHS: Record<RecurringInterval, number | null> = {
  WEEKLY: null, // weekly steps by days, not months
  MONTHLY: 1,
  QUARTERLY: 3,
  HALF_YEARLY: 6,
  ANNUAL: 12,
};

/** Step a date forward by one interval, clamping end-of-month (e.g. Jan 31 -> Feb 28). */
export function stepInterval(date: Date, interval: RecurringInterval): Date {
  if (interval === 'WEEKLY') {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 7));
  }
  const months = INTERVAL_MONTHS[interval]!;
  const day = date.getUTCDate();
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

@Injectable()
export class RecurringService {
  private readonly logger = new Logger(RecurringService.name);

  constructor(private prisma: PrismaService) {}

  private async assertMember(familyId: string, userId: string, write = false) {
    const m = await this.prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId, userId } },
    });
    if (!m) throw new ForbiddenException('Not a member of this family');
    if (write && m.role !== 'ADMIN') throw new ForbiddenException('Admin role required');
    return m;
  }

  async list(familyId: string, userId: string) {
    await this.assertMember(familyId, userId);
    const items = await this.prisma.recurringExpense.findMany({
      where: { familyId },
      include: { category: true, paidBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return items.map((item) => ({ ...item, nextDue: this.nextDueDate(item) }));
  }

  async create(userId: string, dto: CreateRecurringDto) {
    const membership = await this.assertMember(dto.familyId, userId, true);
    this.validateDates(dto.startDate, dto.endDate);
    const recurring = await this.prisma.recurringExpense.create({
      data: {
        familyId: dto.familyId,
        name: dto.name,
        categoryId: dto.categoryId,
        paidById: membership.userId,
        amount: dto.amount,
        interval: dto.interval,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        paymentMethod: dto.paymentMethod ?? 'CASH',
        notes: dto.notes,
      },
      include: { category: true, paidBy: { select: { id: true, name: true } } },
    });
    await this.materializeFor(dto.familyId, [recurring.id]);
    return { ...recurring, nextDue: this.nextDueDate(recurring) };
  }

  async update(id: string, userId: string, dto: UpdateRecurringDto) {
    const recurring = await this.prisma.recurringExpense.findUnique({ where: { id } });
    if (!recurring) throw new NotFoundException('Recurring expense not found');
    await this.assertMember(recurring.familyId, userId, true);
    this.validateDates(dto.startDate, dto.endDate, recurring);
    const updated = await this.prisma.recurringExpense.update({
      where: { id },
      data: {
        name: dto.name,
        categoryId: dto.categoryId,
        amount: dto.amount,
        interval: dto.interval,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate === undefined ? undefined : dto.endDate === null ? null : new Date(dto.endDate),
        paymentMethod: dto.paymentMethod,
        notes: dto.notes,
        active: dto.active,
      },
      include: { category: true, paidBy: { select: { id: true, name: true } } },
    });
    await this.materializeFor(recurring.familyId, [id]);
    return { ...updated, nextDue: this.nextDueDate(updated) };
  }

  async remove(id: string, userId: string) {
    const recurring = await this.prisma.recurringExpense.findUnique({ where: { id } });
    if (!recurring) throw new NotFoundException('Recurring expense not found');
    await this.assertMember(recurring.familyId, userId, true);
    await this.prisma.recurringExpense.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Create real Expense rows for every occurrence of a family's active recurring
   * templates that is due up to `now`. Idempotent via (recurringId, date) lookup.
   * Called on expenses list, reports summary, and after create/update of a template.
   */
  async materializeFor(familyId: string, onlyIds?: string[]): Promise<number> {
    const templates = await this.prisma.recurringExpense.findMany({
      where: { familyId, active: true, ...(onlyIds ? { id: { in: onlyIds } } : {}) },
    });
    let created = 0;
    for (const t of templates) {
      created += await this.materializeTemplate(t).catch((err) => {
        this.logger.warn(`Recurring materialization failed for ${t.id}: ${err}`);
        return 0;
      });
    }
    return created;
  }

  private async materializeTemplate(template: RecurringExpense): Promise<number> {
    const interval = template.interval as RecurringInterval;
    const now = new Date();
    let occurrence = this.toUtcDayStart(template.startDate);
    const end = template.endDate ? this.toUtcDayStart(template.endDate) : null;
    let created = 0;

    // step through occurrences; guard against runaway loops (max ~10 years of weekly)
    for (let i = 0; i < 600; i++) {
      if (occurrence > now || (end && occurrence > end)) break;
      const due = new Date(occurrence);
      // idempotent: skip if an expense for this occurrence already exists
      const existing = await this.prisma.expense.findFirst({
        where: { recurringId: template.id, date: due },
        select: { id: true },
      });
      if (!existing) {
        await this.prisma.expense.create({
          data: {
            familyId: template.familyId,
            categoryId: template.categoryId,
            paidById: template.paidById,
            createdById: template.paidById,
            reviewed: true,
            reviewedAt: new Date(),
            reviewedById: template.paidById,
            amount: template.amount,
            date: due,
            paymentMethod: template.paymentMethod,
            notes: template.notes ?? `${template.name} (recurring ${interval.toLowerCase()})`,
            recurringId: template.id,
          },
        });
        created++;
      }
      occurrence = stepInterval(occurrence, interval);
    }
    return created;
  }

  /** Next upcoming (or today) occurrence date for display purposes. */
  private nextDueDate(template: RecurringExpense): Date | null {
    if (!template.active) return null;
    const interval = template.interval as RecurringInterval;
    const now = new Date();
    let occurrence = this.toUtcDayStart(template.startDate);
    const end = template.endDate ? this.toUtcDayStart(template.endDate) : null;
    for (let i = 0; i < 600; i++) {
      if (end && occurrence > end) return null;
      if (occurrence >= now || i === 600 - 1) return occurrence;
      occurrence = stepInterval(occurrence, interval);
    }
    return null;
  }

  private toUtcDayStart(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  private validateDates(startDate?: string, endDate?: string | null, existing?: RecurringExpense) {
    if (endDate === null || endDate === undefined) {
      if (!startDate || !existing) return;
      return;
    }
    const start = new Date(startDate ?? existing!.startDate);
    const end = new Date(endDate);
    if (end < start) throw new BadRequestException('endDate must not be before startDate');
  }
}
