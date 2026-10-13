import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { describeCategory, normaliseDescription } from '../statement-import/categoriser/keyword-rules';

export interface MerchantMemoryEntry {
  merchantKey: string;
  cat: string;
  sub?: string;
  confidence: number;
  hitCount: number;
}

@Injectable()
export class MerchantMemoryService {
  private cache = new Map<string, MerchantMemoryEntry>();

  constructor(private prisma: PrismaService) {}

  async loadForFamily(familyId: string) {
    const rows = await this.prisma.statementRow.findMany({
      where: { import: { familyId }, confirmedCategory: { isNot: null } },
      include: { confirmedCategory: true, import: { select: { familyId: true } } },
    });
    for (const row of rows) {
      if (!row.confirmedCategory || !row.description) continue;
      const key = normaliseDescription(row.description);
      if (!key) continue;
      const existing = this.cache.get(key);
      if (existing) {
        existing.hitCount += 1;
        existing.confidence = Math.min(1, 0.7 + existing.hitCount * 0.05);
      } else {
        this.cache.set(key, {
          merchantKey: key,
          cat: row.confirmedCategory.name,
          sub: row.confirmedCategory.name,
          confidence: 0.75,
          hitCount: 1,
        });
      }
    }
  }

  recordCorrection(description: string, cat: string, sub?: string) {
    const key = normaliseDescription(description);
    if (!key) return;
    const existing = this.cache.get(key);
    if (existing) {
      existing.hitCount += 1;
      existing.confidence = Math.min(1, 0.7 + existing.hitCount * 0.05);
      if (cat) existing.cat = cat;
      if (sub) existing.sub = sub;
    } else {
      this.cache.set(key, {
        merchantKey: key,
        cat,
        sub,
        confidence: 0.85,
        hitCount: 1,
      });
    }
  }

  lookup(description: string): { cat: string; sub?: string; confidence: number; source: 'memory' } | null {
    const key = normaliseDescription(description);
    if (!key) return null;
    const entry = this.cache.get(key);
    if (!entry || entry.confidence < 0.6) return null;
    return { cat: entry.cat, sub: entry.sub, confidence: entry.confidence, source: 'memory' };
  }

  suggest(description: string) {
    const memory = this.lookup(description);
    if (memory && memory.confidence >= 0.75) return memory;
    const rule = describeCategory(description);
    if (rule) return { cat: rule.cat, sub: rule.sub, confidence: rule.confidence, source: 'rule' as const };
    return null;
  }
}
