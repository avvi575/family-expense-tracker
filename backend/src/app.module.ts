import { Module } from '@nestjs/common';
import { PrismaModule } from './common/prisma.module';
import { AuthModule } from './auth/auth.module';
import { FamiliesModule } from './families/families.module';
import { CategoriesModule } from './categories/categories.module';
import { ExpensesModule } from './expenses/expenses.module';
import { BudgetsModule } from './budgets/budgets.module';
import { GoalsModule } from './goals/goals.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReportsModule } from './reports/reports.module';
import { AlertsModule } from './alerts/alerts.module';
import { RecurringModule } from './recurring/recurring.module';
import { IncomesModule } from './incomes/incomes.module';
import { StatementImportModule } from './statement-import/statement-import.module';
import { CommsModule } from './comms/comms.module';
import { SettingsModule } from './settings/settings.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    PrismaModule,
    CommsModule,
    AuthModule,
    FamiliesModule,
    CategoriesModule,
    ExpensesModule,
    BudgetsModule,
    GoalsModule,
    NotificationsModule,
    ReportsModule,
    AlertsModule,
    RecurringModule,
    IncomesModule,
    StatementImportModule,
    SettingsModule,
    HealthModule,
  ],
})
export class AppModule {}
