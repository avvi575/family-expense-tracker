import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './categories.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  private async assertRole(familyId: string, userId: string, requireAdmin = false) {
    const m = await this.prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId, userId } },
    });
    if (!m) throw new ForbiddenException('Not a member of this family');
    if (requireAdmin && m.role !== 'ADMIN') throw new ForbiddenException('Admin role required');
    return m;
  }

  /** All categories visible to the family (system + family), with parent + children info. */
  async list(familyId: string, userId: string) {
    await this.assertRole(familyId, userId);
    return this.prisma.category.findMany({
      where: { OR: [{ familyId: null }, { familyId }] },
      include: { parent: true, children: { select: { id: true, name: true, icon: true } } },
      orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
    });
  }

  async create(dto: CreateCategoryDto, userId: string) {
    await this.assertRole(dto.familyId, userId, true);
    const parentId = dto.parentId ?? null;
    if (parentId) {
      const parent = await this.prisma.category.findUnique({ where: { id: parentId } });
      if (!parent) throw new NotFoundException('Parent category not found');
      // only two levels allowed
      if (parent.parentId) throw new BadRequestException('Subcategories cannot have sub-subcategories');
      // parent must be a system category or belong to this family
      if (parent.familyId && parent.familyId !== dto.familyId) {
        throw new ForbiddenException('Parent belongs to a different family');
      }
    }
    return this.prisma.category.create({
      data: {
        name: dto.name,
        icon: dto.icon ?? '🪔',
        color: dto.color ?? '#6b7280',
        familyId: dto.familyId,
        parentId,
      },
      include: { parent: true, children: { select: { id: true, name: true, icon: true } } },
    });
  }

  async update(id: string, dto: UpdateCategoryDto, userId: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');
    if (!category.familyId) throw new ForbiddenException('System categories cannot be modified');
    await this.assertRole(category.familyId, userId, true);
    if (dto.parentId !== undefined) {
      if (dto.parentId === null) {
        // clear parent
      } else {
        if (dto.parentId === id) throw new BadRequestException('Category cannot be its own parent');
        const parent = await this.prisma.category.findUnique({ where: { id: dto.parentId } });
        if (!parent) throw new NotFoundException('Parent category not found');
        if (parent.parentId) throw new BadRequestException('Subcategories cannot have sub-subcategories');
        if (parent.familyId && parent.familyId !== category.familyId) {
          throw new ForbiddenException('Parent belongs to a different family');
        }
      }
    }
    return this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        icon: dto.icon ?? undefined,
        color: dto.color ?? undefined,
        parentId: dto.parentId === undefined ? undefined : dto.parentId,
      },
      include: { parent: true, children: { select: { id: true, name: true, icon: true } } },
    });
  }

  async delete(id: string, userId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { children: true },
    });
    if (!category) throw new NotFoundException('Category not found');
    if (!category.familyId) throw new ForbiddenException('System categories cannot be deleted');
    await this.assertRole(category.familyId, userId, true);

    // re-parent children to grandparent (system categories can't be children thanks to creation rules)
    for (const child of category.children) {
      await this.prisma.category.update({
        where: { id: child.id },
        data: { parentId: category.parentId ?? null },
      });
    }
    await this.prisma.category.delete({ where: { id } });
    return { ok: true };
  }
}
