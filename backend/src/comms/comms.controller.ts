import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators';
import { DeliveryService, EmailMessage } from './delivery.service';

@Controller('comms')
@UseGuards(JwtAuthGuard)
export class CommsController {
  constructor(private readonly delivery: DeliveryService) {}

  @Post('test-email')
  async testEmail(@CurrentUser('id') userId: string, @Body() body: { to: string; subject?: string; text?: string }) {
    const msg: EmailMessage = {
      to: body.to,
      subject: body.subject || 'Family Expense Tracker — test email',
      text: body.text || `Hello,\n\nThis is a test email from Family Expense Tracker.\n\nIf you received this, SMTP is working correctly.\n\nTimestamp: ${new Date().toISOString()}`,
    };
    return this.delivery.sendEmail(msg);
  }

  @Get('outbox')
  listOutbox(@Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : 20;
    return this.delivery.listOutbox(Math.min(Math.max(n, 1), 100));
  }

  @Get('outbox/:fileName')
  getOutbox(@Param('fileName') fileName: string) {
    return { fileName, content: this.delivery.readOutbox(fileName) };
  }

  @Get('smtp/verify')
  async verifySmtp() {
    return this.delivery.verifySmtp();
  }
}
