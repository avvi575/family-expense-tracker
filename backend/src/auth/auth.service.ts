import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { DeliveryService } from '../comms/delivery.service';
import { FamiliesService } from '../families/families.service';
import { ForgotPasswordDto, ResetPasswordDto, RegisterDto, LoginDto, AcceptInviteDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private families: FamiliesService,
    private delivery: DeliveryService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash, name: dto.name },
    });
    return this.issue(user.id, user.email, user.name);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issue(user.id, user.email, user.name);
  }

  /**
   * Accept an invite link: creates the user (email from invite) with the provided
   * name/password, adds them to the family with the invited role, returns an
   * access token. If the email is already registered, tells the caller to log in.
   */
  async acceptInvite(dto: AcceptInviteDto) {
    const invite = await this.prisma.invite.findUnique({ where: { token: dto.token } });
    if (!invite || invite.accepted) throw new BadRequestException('Invalid or already-used invite');
    if (invite.expiresAt < new Date()) throw new BadRequestException('Invite link has expired');

    const existing = await this.prisma.user.findUnique({ where: { email: invite.email } });
    if (existing) {
      throw new ConflictException('An account already exists for this email - log in to accept the invite');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { email: invite.email, passwordHash, name: dto.name },
    });

    await this.families.addMembership(invite.id, invite.familyId, user.id, invite.role);

    return this.issue(user.id, user.email, user.name);
  }

private issue(id: string, email: string, name: string) {
  const accessToken = this.jwt.sign({ id, sub: id });
  return { accessToken, user: { id, email, name } };
}

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // Always return success to avoid leaking whether an email exists
    if (!user) return { message: 'If an account exists for this email, a reset link has been sent.' };

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetToken: token, resetTokenExpiry: expiresAt },
    });

    const appBase = (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
    const resetUrl = `${appBase}/reset-password?token=${token}`;

    const result = await this.delivery.sendEmail({
      to: user.email,
      subject: 'Reset your password — Family Expense Tracker',
      text: `Hi ${user.name},

You requested a password reset for your Family Expense Tracker account.
Click the link below to choose a new password:

${resetUrl}

This link expires in 1 hour. If you didn't request this, you can safely ignore this email.

— Family Expense Tracker`,
    });

    return {
      message: 'If an account exists for this email, a reset link has been sent.',
      resetUrl: result.channel === 'outbox' ? undefined : resetUrl,
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: { resetToken: dto.token, resetTokenExpiry: { gt: new Date() } },
    });
    if (!user) throw new BadRequestException('Invalid or expired reset token');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetToken: null, resetTokenExpiry: null },
    });
    return { ok: true };
  }
}
