import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { join } from 'path';

export const STATEMENT_INBOX_KEY = 'statement_inbox_dir';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async getAll() {
    const rows = await this.prisma.appSetting.findMany();
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    return {
      statementInboxDir: map[STATEMENT_INBOX_KEY] || this.defaultInboxDir(),
    };
  }

  async update(partial: { statementInboxDir?: string }) {
    if (partial.statementInboxDir !== undefined) {
      const value = partial.statementInboxDir.trim();
      if (value) {
        await this.prisma.appSetting.upsert({
          where: { key: STATEMENT_INBOX_KEY },
          update: { value },
          create: { key: STATEMENT_INBOX_KEY, value },
        });
      } else {
        await this.prisma.appSetting.deleteMany({ where: { key: STATEMENT_INBOX_KEY } });
      }
    }
    return this.getAll();
  }

  /**
   * Resolve the directory used for the "Scan Inbox" feature. Precedence:
   *   1. value stored in AppSetting (configured via the UI)
   *   2. STATEMENT_INBOX env var
   *   3. <process.cwd()>/statement-inbox
   */
  async getInboxDir(): Promise<string> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: STATEMENT_INBOX_KEY } });
    if (row?.value) return row.value;
    if (process.env.STATEMENT_INBOX) return process.env.STATEMENT_INBOX;
    return this.defaultInboxDir();
  }

  private defaultInboxDir() {
    return join(process.cwd(), 'statement-inbox');
  }
}
