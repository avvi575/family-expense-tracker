import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { DeliveryService } from '../comms/delivery.service';
import { statfsSync } from 'fs';
import { join } from 'path';

interface HealthCheck {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  checks: {
    database: { ok: boolean; latencyMs?: number; error?: string };
    smtp: { ok: boolean; reason?: string };
    disk: { ok: boolean; freeBytes?: number; totalBytes?: number; usedPercent?: number; error?: string };
    uptime: number;
  };
}

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: DeliveryService,
  ) {}

  @Get()
  async check(): Promise<HealthCheck> {
    const checks: HealthCheck['checks'] = {
      database: await this.checkDatabase(),
      smtp: await this.checkSmtp(),
      disk: this.checkDisk(),
      uptime: process.uptime(),
    };

    const allOk = checks.database.ok && checks.smtp.ok && checks.disk.ok;
    const anyError = !checks.database.ok || !checks.smtp.ok || !checks.disk.ok;

    return {
      status: allOk ? 'ok' : anyError ? 'error' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  private async checkDatabase(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async checkSmtp(): Promise<{ ok: boolean; reason?: string }> {
    return this.delivery.verifySmtp();
  }

  private checkDisk(): { ok: boolean; freeBytes?: number; totalBytes?: number; usedPercent?: number; error?: string } {
    try {
      const uploadsDir = join(process.cwd(), 'uploads');
      const stats = statfsSync(uploadsDir);
      const totalBytes = stats.blocks * stats.bsize;
      const freeBytes = stats.bavail * stats.bsize;
      const usedBytes = totalBytes - freeBytes;
      const usedPercent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;

      return { ok: usedPercent < 90, freeBytes, totalBytes, usedPercent };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}