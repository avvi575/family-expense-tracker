import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators';
import { CreateAlertDto, EvaluateAlertDto } from './alerts.dto';

@Controller('alerts')
@UseGuards(JwtAuthGuard)
export class AlertsController {
  constructor(private alerts: AlertsService) {}

  @Get()
  list(@Query('familyId') familyId: string, @CurrentUser('id') userId: string) {
    return this.alerts.list(familyId, userId);
  }

  @Post()
  create(@Body() dto: CreateAlertDto, @CurrentUser('id') userId: string) {
    return this.alerts.create(userId, dto);
  }

  @Post('evaluate')
  evaluate(@Body() dto: EvaluateAlertDto, @CurrentUser('id') userId: string) {
    return this.alerts.evaluate(dto.condition, dto.familyId, userId);
  }
}
