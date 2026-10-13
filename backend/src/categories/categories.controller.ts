import { Controller, Delete, Get, Param, Patch, Post, Query, Body, UseGuards } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators';
import { CreateCategoryDto, UpdateCategoryDto } from './categories.dto';

@Controller('categories')
@UseGuards(JwtAuthGuard)
export class CategoriesController {
  constructor(private categories: CategoriesService) {}

  @Get()
  list(@Query('familyId') familyId: string, @CurrentUser('id') userId: string) {
    return this.categories.list(familyId, userId);
  }

  @Post()
  create(@Body() dto: CreateCategoryDto, @CurrentUser('id') userId: string) {
    return this.categories.create(dto, userId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto, @CurrentUser('id') userId: string) {
    return this.categories.update(id, dto, userId);
  }

  @Delete(':id')
  deleteCategory(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.categories.delete(id, userId);
  }
}
