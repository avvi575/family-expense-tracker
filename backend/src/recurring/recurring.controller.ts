import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { RecurringService } from './recurring.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators';
import { CreateRecurringDto, UpdateRecurringDto } from './recurring.dto';

@Controller('recurring')
@UseGuards(JwtAuthGuard)
export class RecurringController {
  constructor(private recurring: RecurringService) {}

  @Get()
  list(@Query('familyId') familyId: string, @CurrentUser('id') userId: string) {
    return this.recurring.list(familyId, userId);
  }

  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateRecurringDto) {
    return this.recurring.create(userId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: UpdateRecurringDto) {
    return this.recurring.update(id, userId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.recurring.remove(id, userId);
  }
}
