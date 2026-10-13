import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DeliveryService } from '../comms/delivery.service';
import { CreateFamilyDto, InviteMemberDto, JoinFamilyDto } from './families.dto';

const INVITE_TTL_DAYS = 7;

@Injectable()
export class FamiliesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private delivery: DeliveryService,
  ) {}

  async create(userId: string, dto: CreateFamilyDto) {
    return this.prisma.family.create({
      data: {
        name: dto.name,
        ownerId: userId,
        members: { create: { userId, role: 'ADMIN' } },
      },
      include: { members: true },
    });
  }

  async myFamilies(userId: string) {
    const memberships = await this.prisma.familyMember.findMany({
      where: { userId },
      include: { family: { select: { id: true, name: true } } },
    });
    return memberships.map((m) => ({ id: m.family.id, name: m.family.name, role: m.role }));
  }

  async members(familyId: string, userId: string) {
    await this.assertMember(familyId, userId);
    const family = await this.prisma.family.findUnique({
      where: { id: familyId },
      include: { members: { include: { user: { select: { id: true, email: true, name: true } } } } },
    });
    if (!family) throw new NotFoundException('Family not found');
    return family.members.map((m) => ({
      id: m.id,
      role: m.role,
      user: m.user,
    }));
  }

  async invite(familyId: string, userId: string, dto: InviteMemberDto) {
    await this.assertAdmin(familyId, userId);
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      const membership = await this.prisma.familyMember.findUnique({
        where: { familyId_userId: { familyId, userId: existing.id } },
      });
      if (membership) throw new ConflictException('User already a member');
    }
    const token = randomBytes(24).toString('base64url');
    const expires = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    const invite = await this.prisma.invite.create({
      data: {
        familyId,
        email: dto.email,
        mobile: dto.mobile ?? null,
        message: dto.message ?? null,
        role: dto.role,
        token,
        expiresAt: expires,
      } as any,
    });
    await this.deliverInvite(invite);
    await this.notifications.notify(userId, 'INVITE_SENT', 'Invite sent', `Sent invite to ${dto.email}${dto.mobile ? ` (mobile: ${dto.mobile})` : ''}`);
    return {
      inviteToken: invite.token,
      email: invite.email,
      mobile: invite.mobile,
      message: invite.message,
      role: invite.role,
      expiresAt: invite.expiresAt,
    } as {
      inviteToken: string;
      email: string;
      mobile?: string | null;
      message?: string | null;
      role: string;
      expiresAt: Date;
    };
  }

  /** Public invite preview used by the accept page (no auth). */
  async inviteInfo(token: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { token },
      include: { family: { select: { name: true } } },
    });
    if (!invite) throw new BadRequestException('Invalid invite link');
    if (invite.accepted) throw new BadRequestException('Invite already used');
    if (invite.expiresAt < new Date()) throw new BadRequestException('Invite link has expired');
    return {
      email: invite.email,
      mobile: invite.mobile,
      message: invite.message,
      role: invite.role,
      familyName: invite.family.name,
    };
  }

  /** Joined via token with a logged-in user whose email matches the invite. */
  async join(userId: string, dto: JoinFamilyDto) {
    const invite = await this.prisma.invite.findUnique({ where: { token: dto.token } });
    if (!invite || invite.accepted) throw new BadRequestException('Invalid or used invite');
    if (invite.expiresAt < new Date()) throw new BadRequestException('Invite link has expired');
    if (invite.email !== (await this.userEmail(userId))) {
      throw new ForbiddenException('Invite is for a different email');
    }
    await this.addMembership(invite.id, invite.familyId, userId, invite.role);
    return { ok: true };
  }

  /** Mark invite accepted and create the membership (used by invite acceptance + join). */
  async addMembership(inviteId: string, familyId: string, userId: string, role: string) {
    const dupes = await this.prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId, userId } },
    });
    if (dupes) {
      // already a member (e.g. multiple invites) - still mark used
      await this.prisma.invite.update({ where: { id: inviteId }, data: { accepted: true } });
      return;
    }
    await this.prisma.$transaction([
      this.prisma.invite.update({ where: { id: inviteId }, data: { accepted: true } }),
      this.prisma.familyMember.create({ data: { familyId, userId, role } }),
    ]);
  }

  private async deliverInvite(invite: {
    email: string;
    mobile: string | null;
    message: string | null;
    role: string;
    token: string;
    familyId: string;
  }) {
    const family = await this.prisma.family.findUnique({
      where: { id: invite.familyId },
      select: { name: true },
    });
    const appBase = process.env.APP_BASE_URL || 'http://localhost:3000';
    const link = `${appBase}/invite/${invite.token}`;
    const roleLabel = invite.role === 'ADMIN' ? 'an admin' : invite.role === 'VIEWER' ? 'a view-only member' : 'a member';
    const text =
      `You have been invited to join "${family?.name}" as ${roleLabel} on Family Expense Tracker.` +
      (invite.message ? `\n\nMessage: ${invite.message}` : '') +
      `\n\nAccept the invitation and set your password here:\n${link}\n\n` +
      `This link expires in ${INVITE_TTL_DAYS} days.`;
    await this.delivery.sendEmail({
      to: invite.email,
      subject: `Invitation to join ${family?.name} - Family Expense Tracker`,
      text,
    });
    if (invite.mobile) {
      const smsBody = `${family?.name} family invite (${invite.role}): ${link}${invite.message ? ` - ${invite.message}` : ''}`;
      await this.delivery.sendSms({ to: invite.mobile, body: smsBody });
      await this.delivery.sendWhatsapp({ to: invite.mobile, body: smsBody });
    }
  }

  private async assertMember(familyId: string, userId: string) {
    const membership = await this.prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId, userId } },
    });
    if (!membership) throw new ForbiddenException('Not a member of this family');
    return membership;
  }

  private async assertAdmin(familyId: string, userId: string) {
    const membership = await this.assertMember(familyId, userId);
    if (membership.role !== 'ADMIN') throw new ForbiddenException('Admin role required');
    return membership;
  }

  private async userEmail(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return user.email;
  }
}
