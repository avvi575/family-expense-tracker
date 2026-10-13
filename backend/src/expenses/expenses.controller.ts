import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators';
import { CreateExpenseDto, UpdateExpenseDto } from './expenses.dto';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

@Controller('expenses')
@UseGuards(JwtAuthGuard)
export class ExpensesController {
  constructor(private expenses: ExpensesService) {}

  @Get()
  list(
    @CurrentUser('id') userId: string,
    @Query('familyId') familyId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('month') month?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    if (from || to) {
      if (!from || !to) throw new Error('Both from and to are required for a custom range');
      if (!DATE_RE.test(from) || !DATE_RE.test(to)) throw new Error('from and to must be in YYYY-MM-DD format');
      return this.expenses.listByRange(familyId, userId, from, to, Number(page), Number(limit));
    }
    if (!month || !MONTH_RE.test(month)) {
      throw new Error('month must be in YYYY-MM format');
    }
    return this.expenses.list(familyId, userId, month, Number(page), Number(limit));
  }

  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateExpenseDto) {
    return this.expenses.create(userId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: UpdateExpenseDto) {
    return this.expenses.update(id, userId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.expenses.remove(id, userId);
  }
}
