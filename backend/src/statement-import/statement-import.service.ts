import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { copyFileSync, mkdirSync, readdirSync, renameSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { describeCategory } from './categoriser/keyword-rules';
import { MerchantMemoryService } from './merchant-memory.service';
import { cleanDescription } from './cleaner/description-cleaner';
import { extractPdfText } from './pdf-extract';
import { detectParser } from './parsers/parser.registry';
import { preprocessCreditText } from './preprocess/credit-preprocess';
import { RowPatchDto } from './statement-import.dto';

interface CleanRow {
  serialNumber: string;
  date: Date;
  rawDescription: string;
  description: string;
  amount: number;
  isCredit: boolean;
  duplicate: boolean;
  suggestedCategoryId: string | null;
  reviewed: boolean;
  reviewedAt: Date | null;
  reviewedById: string | null;
}

@Injectable()
export class StatementImportService {
  private readonly logger = new Logger(StatementImportService.name);

  constructor(private prisma: PrismaService, private settings: SettingsService, private memory: MerchantMemoryService) {}

  private async assertAdmin(familyId: string, userId: string) {
    const m = await this.prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId, userId } },
    });
    if (!m) throw new ForbiddenException('Not a member of this family');
    if (m.role !== 'ADMIN') throw new ForbiddenException('Admin role required');
    return m;
  }

  private async assertMember(familyId: string, userId: string) {
    const m = await this.prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId, userId } },
    });
    if (!m) throw new ForbiddenException('Not a member of this family');
    return m;
  }

  private async assertCategoryForFamily(familyId: string, categoryId: string) {
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) throw new BadRequestException('Category not found');
    if (category.familyId && category.familyId !== familyId) {
      throw new ForbiddenException('Category belongs to a different family');
    }
    return category;
  }

  private async findCategoryByName(familyId: string, name: string) {
    const familyCategory = await this.prisma.category.findFirst({
      where: { name, familyId },
    });
    return familyCategory ?? this.prisma.category.findFirst({
      where: { name, familyId: null },
    });
  }

  private async getOtherCategory(familyId: string) {
    const familyOther = await this.prisma.category.findFirst({
      where: { name: 'Other', familyId, parentId: null },
    });
    return familyOther ?? this.prisma.category.findFirst({
      where: { name: 'Other', familyId: null, parentId: null },
    });
  }

  async list(familyId: string, userId: string) {
    await this.assertMember(familyId, userId);
    const imports = await this.prisma.statementImport.findMany({
      where: { familyId },
      orderBy: { createdAt: 'desc' },
      include: { rows: { select: { id: true } } },
    });
    return imports.map((i) => ({ ...i, rows: undefined, rowCount: i.rows.length }));
  }

  async detail(importId: string, userId: string) {
    const imp = await this.prisma.statementImport.findUnique({ where: { id: importId } });
    if (!imp) throw new NotFoundException('Import not found');
    await this.assertMember(imp.familyId, userId);
    return this.prisma.statementImport.findUnique({
      where: { id: importId },
      include: {
        rows: {
          include: {
            suggestedCategory: { select: { id: true, name: true, icon: true } },
            confirmedCategory: { select: { id: true, name: true, icon: true } },
            reviewer: { select: { id: true, name: true } },
          },
          orderBy: { date: 'asc' },
        },
      },
    });
  }

  async processFile(
    familyId: string,
    uploadedById: string,
    absolutePath: string,
    originalName: string,
    storedUrl: string,
    sourceType: 'UPLOAD' | 'INBOX',
  ) {
    const buffer = readFileSync(absolutePath);
    const hash = createHash('sha256').update(buffer).digest('hex');

    const alreadyImported = await this.prisma.statementImport.findFirst({
      where: { familyId, fileHash: hash, status: 'IMPORTED' },
    });
    if (alreadyImported) {
      throw new ConflictException('This statement has already been imported');
    }

    const extract = await extractPdfText(new Uint8Array(buffer));
    if (extract.passwordRequired) {
      throw new UnprocessableEntityException('This PDF is password-protected.');
    }
    const text = extract.text;

    if (text.trim().length < 100) {
      throw new UnprocessableEntityException(
        'No text extracted — PDF may be image-based (scanned).',
      );
    }

    const preprocessed = preprocessCreditText(text);
    const parserText = preprocessed.text;

    const parser = detectParser(parserText);
    const meta = parser.parseMetadata(parserText);
    const rawRows = parser.parseTransactions(parserText);
    if (rawRows.length === 0) {
      const snippet = parserText.split('\n').filter((l) => l.trim()).slice(0, 20).join('\n');
      throw new UnprocessableEntityException(
        `No transaction rows found — unsupported statement format. Parser: ${parser.constructor.name}. Sample text:\n${snippet}`,
      );
    }

    const cleaned = rawRows.map((r) => ({
      ...r,
      description: cleanDescription(r.rawDescription, meta.bank),
    }));

    const debits = cleaned.filter((r) => !r.isCredit);
    const extractedDebit = debits.reduce((s, r) => s + r.amount, 0);
    const delta = Math.abs(extractedDebit - meta.statementTotal);
    const validationPass = delta < 1.0;

    // duplicate detection: same serial numbers already IMPORTED in this family
    const serialNums = cleaned.map((r) => r.serialNumber);
    const existingRows = await this.prisma.statementRow.findMany({
      where: { serialNumber: { in: serialNums }, import: { familyId, status: 'IMPORTED' } },
      select: { serialNumber: true },
    });
    const dupSerials = new Set(existingRows.map((r) => r.serialNumber));

    const rows: CleanRow[] = [];
    for (const r of cleaned) {
      const isDup = dupSerials.has(r.serialNumber);
      let suggestedCategoryId: string | null = null;
      if (!isDup && !r.isCredit) {
        const suggestion = this.memory.suggest(r.description) ?? describeCategory(r.description);
        if (suggestion) {
          const catName = suggestion.sub ?? suggestion.cat;
          const cat = await this.findCategoryByName(familyId, catName);
          if (cat) suggestedCategoryId = cat.id;
          else {
            const otherCat = await this.getOtherCategory(familyId);
            suggestedCategoryId = otherCat?.id ?? null;
          }
        }
      }
      rows.push({
        serialNumber: r.serialNumber,
        date: r.date,
        rawDescription: r.rawDescription,
        description: r.description,
        amount: r.amount,
        isCredit: r.isCredit,
        duplicate: isDup,
        suggestedCategoryId,
        reviewed: suggestedCategoryId !== null,
        reviewedAt: suggestedCategoryId !== null ? new Date() : null,
        reviewedById: suggestedCategoryId !== null ? uploadedById : null,
      });
    }

    return this.prisma.statementImport.create({
      data: {
        familyId,
        uploadedById,
        sourceType,
        fileName: originalName,
        fileUrl: storedUrl,
        fileHash: hash,
        bank: meta.bank,
        cardLast4: meta.cardLast4,
        periodFrom: meta.periodFrom,
        periodTo: meta.periodTo,
        statementTotal: meta.statementTotal,
        extractedDebit,
        validationDelta: delta,
        validationPass,
        status: 'PARSED',
        errorMessage: validationPass
          ? null
          : `Extracted ₹${extractedDebit.toFixed(2)} vs statement ₹${meta.statementTotal.toFixed(2)} (delta ₹${delta.toFixed(2)})`,
        rows: { create: rows },
      },
      include: { rows: true },
    });
  }

  async scanInbox(familyId: string, uploadedById: string) {
    const inboxDir = await this.settings.getInboxDir();
    const processedDir = join(inboxDir, 'processed');
    const failedDir = join(inboxDir, 'failed');
    const uploadsDir = join(process.cwd(), 'uploads');
    for (const dir of [inboxDir, processedDir, failedDir, uploadsDir]) mkdirSync(dir, { recursive: true });

    const files = readdirSync(inboxDir, { withFileTypes: true })
      .filter((e) => e.isFile() && /\.pdf$/i.test(e.name))
      .map((e) => e.name);

    if (files.length === 0) return { processed: 0, failed: 0, results: [] };

    const results: { fileName: string; status: 'ok' | 'error'; importId?: string; error?: string }[] = [];
    for (const fileName of files) {
      const absolutePath = join(inboxDir, fileName);
      try {
        const targetName = `${Date.now()}-${fileName.replace(/\.pdf$/i, '.pdf')}`;
        const target = join(uploadsDir, targetName);
        copyFileSync(absolutePath, target);
        const imp = await this.processFile(
          familyId,
          uploadedById,
          target,
          fileName,
          `/uploads/${targetName}`,
          'INBOX',
        );
        results.push({ fileName, status: 'ok', importId: imp.id });
        const dayDir = new Date().toISOString().slice(0, 10);
        mkdirSync(join(processedDir, dayDir), { recursive: true });
        renameSync(absolutePath, join(processedDir, dayDir, fileName));
      } catch (e) {
        const errorMessage = (e as { message?: string })?.message ?? 'Unknown error';
        results.push({ fileName, status: 'error', error: errorMessage });
        try {
          renameSync(absolutePath, join(failedDir, fileName));
          writeFileSync(join(failedDir, `${fileName}.error.txt`), errorMessage, 'utf8');
        } catch (moveErr) {
          this.logger.warn(`Failed to move ${fileName} to failed/: ${moveErr}`);
        }
      }
    }
    return {
      processed: results.filter((r) => r.status === 'ok').length,
      failed: results.filter((r) => r.status === 'error').length,
      results,
    };
  }

  async updateRows(importId: string, userId: string, rows: RowPatchDto[]) {
    const imp = await this.prisma.statementImport.findUnique({ where: { id: importId } });
    if (!imp) throw new NotFoundException('Import not found');
    await this.assertAdmin(imp.familyId, userId);
    if (imp.status === 'IMPORTED') {
      throw new ConflictException('Import already confirmed — rows cannot be edited');
    }

    const now = new Date();
    const updatedIds: string[] = [];
    for (const r of rows) {
      const row = await this.prisma.statementRow.findUnique({
        where: { id: r.id },
        include: { import: { select: { familyId: true, status: true } } },
      });
      if (!row || row.importId !== importId) throw new NotFoundException('Statement row not found');

      const data: {
        categoryId?: string | null;
        description?: string;
        excluded?: boolean;
        reviewed?: boolean;
        reviewedAt?: Date | null;
        reviewedById?: string | null;
      } = {};
      const categoryCleared = r.categoryId === null;

      if (r.categoryId !== undefined && !(categoryCleared && r.reviewed === true)) {
        if (categoryCleared) {
          data.categoryId = null;
          if (r.reviewed !== true && row.reviewed) {
            data.reviewed = false;
            data.reviewedAt = null;
            data.reviewedById = null;
          }
        } else {
          await this.assertCategoryForFamily(imp.familyId, r.categoryId as string);
          data.categoryId = r.categoryId;
          if (r.reviewed !== false) {
            data.reviewed = true;
            data.reviewedAt = now;
            data.reviewedById = userId;
          }
        }
      }

      if (r.reviewed !== undefined) {
        if (r.reviewed) {
          let categoryId = r.categoryId === null
            ? null
            : r.categoryId ?? row.categoryId ?? null;
          if (!categoryId) {
            const other = await this.getOtherCategory(imp.familyId);
            if (!other) throw new BadRequestException('Default Other category is unavailable');
            categoryId = other.id;
          } else {
            await this.assertCategoryForFamily(imp.familyId, categoryId);
          }
          data.categoryId = categoryId;
          data.reviewed = true;
          data.reviewedAt = now;
          data.reviewedById = userId;
        } else {
          data.reviewed = false;
          data.reviewedAt = null;
          data.reviewedById = null;
        }
      }

      if (r.description !== undefined) data.description = r.description;
      if (r.excluded !== undefined) data.excluded = r.excluded;

      if (Object.keys(data).length > 0) {
        await this.prisma.statementRow.update({ where: { id: r.id }, data });
        updatedIds.push(r.id);
      }
    }

    const eligible = await this.prisma.statementRow.count({
      where: { importId, isCredit: false, duplicate: false, excluded: false },
    });
    const reviewedEligible = await this.prisma.statementRow.count({
      where: { importId, reviewed: true, isCredit: false, duplicate: false, excluded: false },
    });
    const nextStatus = reviewedEligible === eligible ? 'REVIEWED' : 'PARSED';
    if (imp.status !== nextStatus) {
      await this.prisma.statementImport.update({
        where: { id: importId },
        data: { status: nextStatus },
      });
    }

    const updated = updatedIds.length > 0
      ? await this.prisma.statementRow.findMany({
          where: { importId, id: { in: updatedIds } },
          include: {
            suggestedCategory: { select: { id: true, name: true, icon: true } },
            confirmedCategory: { select: { id: true, name: true, icon: true } },
            reviewer: { select: { id: true, name: true } },
          },
        })
      : [];
    return { ok: true, rows: updated };
  }

  async confirmImport(importId: string, userId: string) {
    const imp = await this.prisma.statementImport.findUnique({
      where: { id: importId },
      include: { rows: true },
    });
    if (!imp) throw new NotFoundException('Import not found');
    await this.assertAdmin(imp.familyId, userId);
    if (imp.status === 'IMPORTED') {
      throw new ConflictException('Import already confirmed');
    }

    const otherCat = await this.getOtherCategory(imp.familyId);

    const toImport = imp.rows.filter((r) => r.reviewed && !r.isCredit && !r.duplicate && !r.excluded);
    if (toImport.length === 0) {
      throw new BadRequestException('No reviewed rows are ready to import');
    }
    const skipped = imp.rows.length - toImport.length;
    const now = new Date();
    let imported = 0;

    for (const row of toImport) {
      const catId = row.categoryId ?? row.suggestedCategoryId ?? otherCat?.id;
      if (!catId) throw new BadRequestException(`Row ${row.id} has no category`);
      await this.assertCategoryForFamily(imp.familyId, catId);
      const expense = await this.prisma.expense.create({
        data: {
          familyId: imp.familyId,
          categoryId: catId,
          paidById: userId,
          createdById: userId,
          amount: row.amount,
          date: row.date,
          paymentMethod: 'CARD',
          notes: row.description,
          importedRowId: row.id,
          reviewed: true,
          reviewedAt: now,
          reviewedById: userId,
        },
      });
      await this.prisma.statementRow.update({
        where: { id: row.id },
        data: { expenseId: expense.id },
      });
      imported++;
    }

    await this.prisma.statementImport.update({
      where: { id: importId },
      data: { status: 'IMPORTED', importedCount: imported, skippedCount: skipped },
    });
    return { imported, skipped };
  }

  async deleteImport(importId: string, userId: string) {
    const imp = await this.prisma.statementImport.findUnique({ where: { id: importId } });
    if (!imp) throw new NotFoundException('Import not found');
    await this.assertAdmin(imp.familyId, userId);
    if (imp.status === 'IMPORTED') {
      throw new ConflictException('Confirmed imports cannot be deleted');
    }
    await this.prisma.statementImport.delete({ where: { id: importId } });
    return { ok: true };
  }
}
