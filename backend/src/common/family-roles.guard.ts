import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../common/prisma.service';
import { ROLES_KEY } from '../common/decorators';

@Injectable()
export class FamilyRolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.user?.id;
    const familyId =
      request.body?.familyId ||
      request.query?.familyId ||
      request.params?.familyId ||
      request.body?.id;

    if (!userId || !familyId) throw new ForbiddenException('Family context required');

    const membership = await this.prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId: familyId as string, userId } },
    });
    if (!membership) throw new ForbiddenException('Not a member of this family');
    if (required.includes(membership.role)) return true;
    throw new ForbiddenException('Insufficient role');
  }
}
