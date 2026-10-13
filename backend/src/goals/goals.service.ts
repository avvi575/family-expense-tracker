import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateGoalDto, UpdateGoalDto } from './goals.dto';

@Injectable()
export class GoalsService {
  constructor(private prisma: PrismaService) {}

  private async assertMember(familyId: string, userId: string, requireAdmin = false) {
    const m = await this.prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId, userId } },
      include: { user: { select: { name: true, email: true } } },
    });
    if (!m) throw new ForbiddenException('Not a member of this family');
    if (requireAdmin && m.role !== 'ADMIN') throw new ForbiddenException('Admin role required');
    return m;
  }

  async list(familyId: string, userId: string) {
    await this.assertMember(familyId, userId);
    const goals = await this.prisma.goal.findMany({
      where: { familyId },
      orderBy: { createdAt: 'asc' },
    });
    const ids = goals.map((g) => g.id);
    const contribs = ids.length === 0 ? [] : await this.prisma.goalContribution.findMany({
      where: { goalId: { in: ids } },
      orderBy: { createdAt: 'desc' },
    });
    const byGoal = new Map<string, typeof contribs>();
    for (const c of contribs) {
      if (!byGoal.has(c.goalId)) byGoal.set(c.goalId, []);
      byGoal.get(c.goalId)!.push(c);
    }
    return goals.map((g) => ({ ...g, contributions: byGoal.get(g.id) ?? [] }));
  }

  async create(userId: string, dto: CreateGoalDto) {
    await this.assertMember(dto.familyId, userId, true);
    return this.prisma.goal.create({
      data: {
        familyId: dto.familyId,
        name: dto.name,
        targetAmount: dto.targetAmount,
        savedAmount: 0,
        deadline: dto.deadline ? new Date(dto.deadline) : null,
      },
    });
  }

  async update(id: string, userId: string, dto: UpdateGoalDto) {
    const goal = await this.prisma.goal.findUnique({ where: { id } });
    if (!goal) throw new NotFoundException('Goal not found');
    await this.assertMember(goal.familyId, userId, true);
    return this.prisma.goal.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        targetAmount: dto.targetAmount ?? undefined,
        deadline: dto.deadline === undefined ? undefined : dto.deadline ? new Date(dto.deadline) : null,
      },
    });
  }

  async remove(id: string, userId: string) {
    const goal = await this.prisma.goal.findUnique({ where: { id } });
    if (!goal) throw new NotFoundException('Goal not found');
    await this.assertMember(goal.familyId, userId, true);
    // contributions cascade via the schema relation
    await this.prisma.goal.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Any non-VIEWER family member can contribute. Each contribution is recorded
   * in GoalContribution (who, when, how much, optional note) and the
   * Goal.savedAmount cache is incremented atomically.
   */
  async contribute(id: string, userId: string, amount: number, note?: string) {
    const goal = await this.prisma.goal.findUnique({ where: { id } });
    if (!goal) throw new NotFoundException('Goal not found');
    const member = await this.assertMember(goal.familyId, userId);
    if (member.role === 'VIEWER') throw new ForbiddenException('View-only role');

    const [contribution] = await this.prisma.$transaction([
      this.prisma.goalContribution.create({
        data: {
          goalId: goal.id,
          memberId: member.userId,
          memberName: member.user.name,
          amount,
          note: note?.trim() || null,
        },
      }),
      this.prisma.goal.update({
        where: { id: goal.id },
        data: { savedAmount: { increment: amount } },
      }),
    ]);
    return contribution;
  }

  async listContributions(goalId: string, userId: string) {
    const goal = await this.prisma.goal.findUnique({ where: { id: goalId } });
    if (!goal) throw new NotFoundException('Goal not found');
    await this.assertMember(goal.familyId, userId);
    return this.prisma.goalContribution.findMany({
      where: { goalId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Remove a contribution. The contributor can always remove their own; an
   * admin can remove any. The Goal.savedAmount cache is decremented to match.
   */
  async removeContribution(goalId: string, contributionId: string, userId: string) {
    const goal = await this.prisma.goal.findUnique({ where: { id: goalId } });
    if (!goal) throw new NotFoundException('Goal not found');
    const member = await this.assertMember(goal.familyId, userId);
    const contrib = await this.prisma.goalContribution.findUnique({ where: { id: contributionId } });
    if (!contrib || contrib.goalId !== goalId) throw new NotFoundException('Contribution not found');
    const isOwner = contrib.memberId === userId;
    const isAdmin = member.role === 'ADMIN';
    if (!isOwner && !isAdmin) throw new ForbiddenException('You can only remove your own contributions');

    await this.prisma.$transaction([
      this.prisma.goalContribution.delete({ where: { id: contributionId } }),
      this.prisma.goal.update({
        where: { id: goalId },
        data: { savedAmount: { decrement: contrib.amount } },
      }),
    ]);
    return { ok: true };
  }
}
