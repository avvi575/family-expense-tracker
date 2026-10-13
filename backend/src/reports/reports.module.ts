import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { RecurringModule } from '../recurring/recurring.module';
import { FinancialReportService } from './financial-report.service';

@Module({
  imports: [RecurringModule],
  controllers: [ReportsController],
  providers: [ReportsService, FinancialReportService],
})
export class ReportsModule {}
