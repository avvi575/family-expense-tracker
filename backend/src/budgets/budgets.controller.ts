import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { BudgetsService } from './budgets.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators';
import { CreateBudgetDto, UpdateBudgetDto } from './budgets.dto';

@Controller('budgets')
@UseGuards(JwtAuthGuard)
export class BudgetsController {
  constructor(private budgets: BudgetsService) {}

  @Get()
  list(@CurrentUser('id') userId: string, @Query('familyId') familyId: string, @Query('month') month: string) {
    return this.budgets.list(familyId, userId, month);
  }

  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateBudgetDto) {
    return this.budgets.create(userId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: UpdateBudgetDto) {
    return this.budgets.update(id, userId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.budgets.remove(id, userId);
  }
}
