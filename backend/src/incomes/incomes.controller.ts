import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IncomesService } from './incomes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators';
import { CreateIncomeDto, UpdateIncomeDto } from './incomes.dto';

@Controller('incomes')
@UseGuards(JwtAuthGuard)
export class IncomesController {
  constructor(private incomes: IncomesService) {}

  @Get()
  list(@Query('familyId') familyId: string, @CurrentUser('id') userId: string) {
    return this.incomes.list(familyId, userId);
  }

  @Get('summary')
  summary(
    @Query('familyId') familyId: string,
    @CurrentUser('id') userId: string,
    @Query('month') month?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.incomes.summary(familyId, userId, month, from, to);
  }

  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateIncomeDto) {
    return this.incomes.create(userId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: UpdateIncomeDto) {
    return this.incomes.update(id, userId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.incomes.remove(id, userId);
  }
}
