import { Module } from '@nestjs/common';
import { StatementImportController } from './statement-import.controller';
import { StatementImportService } from './statement-import.service';
import { BankStatementController } from './bank-statement.controller';
import { BankStatementService } from './bank-statement.service';
import { MerchantMemoryService } from './merchant-memory.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [StatementImportController, BankStatementController],
  providers: [StatementImportService, BankStatementService, MerchantMemoryService],
})
export class StatementImportModule {}