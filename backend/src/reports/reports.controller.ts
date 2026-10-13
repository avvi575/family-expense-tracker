import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Get('summary')
  summary(
    @CurrentUser('id') userId: string,
    @Query('familyId') familyId: string,
    @Query('month') month?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('aggregation') aggregation?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY',
    @Query('memberId') memberId?: string,
  ) {
    return this.reports.summary(familyId, userId, month, from, to, aggregation, memberId);
  }

  @Get('summary.csv')
  async summaryCsv(
    @Res() res: Response,
    @CurrentUser('id') userId: string,
    @Query('familyId') familyId: string,
    @Query('month') month?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    let label: string;
    let buffer: Buffer | string;
    let contentType = 'text/csv; charset=utf-8';
    try {
      [label, buffer] = await this.reports.reportXlsx(familyId, userId, month, from, to);
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } catch {
      const summary = await this.reports.summary(familyId, userId, month, from, to);
      const isRange = Boolean(from && to);
      label = isRange ? `${from}_${to}` : month ?? 'report';
      const escape = (v: string | number) =>
        typeof v === 'string' && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : String(v);
      const rows: string[] = [];
      rows.push(`${isRange ? 'Range' : 'Month'},Total Spent,Recurring Total,One-time Total`);
      rows.push(`${label},${summary.totalSpent},${summary.recurringTotal},${summary.oneTimeTotal}`);
      rows.push('');
      rows.push('By Category,Amount');
      for (const c of summary.byCategory) rows.push(`${escape(c.name)},${c.total}`);
      rows.push('');
      rows.push('By Member,Amount');
      for (const m of summary.byMember) rows.push(`${escape(m.name)},${m.total}`);
      rows.push('');
      rows.push('Recurring Expense,Amount');
      for (const r of summary.byRecurring) rows.push(`${escape(r.name)},${r.total}`);
      rows.push('');
      rows.push('Date,Daily Total');
      for (const d of summary.dailyTotals) rows.push(`${d.date},${d.total}`);
      buffer = rows.join('\n');
    }
    const ext = typeof buffer === 'string' ? 'csv' : 'xlsx';
    res.setHeader('content-type', contentType);
    res.setHeader('content-disposition', `attachment; filename="report-${label}.${ext}"`);
    res.send(buffer);
  }
}
