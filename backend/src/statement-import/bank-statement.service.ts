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
import { cleanDescription } from './cleaner/description-cleaner';
import { describeCategory, merchantKeyFromDescription } from './categoriser/keyword-rules';
import { MerchantMemoryService } from './merchant-memory.service';
import { extractPdfText } from './pdf-extract';
import { detectParser } from './parsers/parser.registry';
import {
  BankRowPatchDto, BankRowSplitDto, CreateRecurringDto,
} from './bank-statement.dto';

interface CleanBankRow {
  serialNumber: string;
  date: Date;
  valueDate?: Date;
  rawDescription: string;
  description: string;
  refNumber?: string;
  amount: number;
  isCredit: boolean;
  balanceAfter?: number;
  duplicate: boolean;
  suggestedCategoryId: string | null;
  reviewed: boolean;
  reviewedAt: Date | null;
  reviewedById: string | null;
}

@Injectable()
export class BankStatementService {
  private readonly logger = new Logger(BankStatementService.name);

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

  async list(familyId: string, userId: string, accountType?: 'SAVINGS' | 'CURRENT' | 'CREDIT_CARD') {
    await this.assertMember(familyId, userId);
    const where: any = { familyId };
    if (accountType) where.accountType = accountType;
    const imports = await this.prisma.bankStatementImport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { rows: { select: { id: true } } },
    });
    return imports.map((i) => ({ ...i, rows: undefined, rowCount: i.rows.length }));
  }

  async detail(importId: string, userId: string) {
    const imp = await this.prisma.bankStatementImport.findUnique({ where: { id: importId } });
    if (!imp) throw new NotFoundException('Import not found');
    await this.assertMember(imp.familyId, userId);
    return this.prisma.bankStatementImport.findUnique({
      where: { id: importId },
      include: {
        rows: {
          include: {
            suggestedCategory: { select: { id: true, name: true, icon: true } },
            confirmedCategory: { select: { id: true, name: true, icon: true } },
            splits: { include: { category: { select: { id: true, name: true, icon: true } } } },
            reconciledExpense: true,
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
    accountType: 'SAVINGS' | 'CURRENT' | 'CREDIT_CARD',
    password?: string,
  ) {
    const buffer = readFileSync(absolutePath);
    const hash = createHash('sha256').update(buffer).digest('hex');

    const alreadyImported = await this.prisma.bankStatementImport.findFirst({
      where: { familyId, fileHash: hash, status: 'IMPORTED' },
    });
    if (alreadyImported) {
      throw new ConflictException('This statement has already been imported');
    }

    await this.memory.loadForFamily(familyId);

    const extract = await extractPdfText(new Uint8Array(buffer), password);
    if (extract.passwordRequired && !password) {
      // Create a record marking the import as needing a password
      return this.prisma.bankStatementImport.create({
        data: {
          familyId,
          uploadedById,
          sourceType,
          accountType,
          fileName: originalName,
          fileUrl: storedUrl,
          fileHash: hash,
          bank: 'UNKNOWN',
          status: 'PASSWORD_REQUIRED',
          passwordHint: 'PDF is password-protected. Provide password to continue.',
          periodFrom: new Date(),
          periodTo: new Date(),
        },
      });
    }
    if (extract.passwordRequired) {
      throw new UnprocessableEntityException('Incorrect PDF password.');
    }

    const text = extract.text;
    if (text.trim().length < 100) {
      throw new UnprocessableEntityException(
        'No text extracted — PDF may be image-based (scanned).',
      );
    }

    const parser = detectParser(text, accountType === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'SAVINGS');
    const meta = parser.parseMetadata(text);
    const rawRows = parser.parseTransactions(text);
    if (rawRows.length === 0) {
      throw new UnprocessableEntityException('No transaction rows found — unsupported statement format.');
    }

    const cleaned = rawRows.map((r) => ({
      ...r,
      description: cleanDescription(r.rawDescription, meta.bank),
    }));

    const debits = cleaned.filter((r) => !r.isCredit);
    const credits = cleaned.filter((r) => r.isCredit);
    const totalDebits = debits.reduce((s, r) => s + r.amount, 0);
    const totalCredits = credits.reduce((s, r) => s + r.amount, 0);

    // Duplicate detection: same (date + amount + description-merge) seen in another IMPORTED bank import,
    // OR an existing expense with same (date + amount + paymentMethod=UPI/CARD).
    const serialNums = cleaned.map((r) => r.serialNumber);
    const existingImportRows = await this.prisma.bankStatementRow.findMany({
      where: { serialNumber: { in: serialNums }, import: { familyId, status: 'IMPORTED' } },
      select: { serialNumber: true },
    });
    const dupSerials = new Set(existingImportRows.map((r) => r.serialNumber));

    // Fuzzy duplicate detection against existing expenses (within ±2 days, same amount)
    const expCandidates = await this.prisma.expense.findMany({
      where: {
        familyId,
        amount: { in: cleaned.map((r) => r.amount) },
        date: { gte: new Date(Math.min(...cleaned.map((r) => r.date.getTime())) - 2 * 86400000),
                 lte: new Date(Math.max(...cleaned.map((r) => r.date.getTime())) + 2 * 86400000) },
      },
      select: { id: true, amount: true, date: true, notes: true },
    });

    const rows: CleanBankRow[] = [];
    for (const r of cleaned) {
      const isDupBySerial = dupSerials.has(r.serialNumber);
      // Fuzzy: same amount + within 1 day + similar notes
      const rDay = Math.floor(r.date.getTime() / 86400000);
      const isDupByExpense = expCandidates.some((e) =>
        Math.abs(Math.floor(e.date.getTime() / 86400000) - rDay) <= 1 &&
        Math.abs(Number(e.amount) - r.amount) < 0.01 &&
        e.notes && r.description && this.similarText(e.notes, r.description) > 0.6
      );
      const isDup = isDupBySerial || isDupByExpense;

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
        valueDate: r.valueDate,
        rawDescription: r.rawDescription,
        description: r.description,
        refNumber: r.refNumber,
        amount: r.amount,
        isCredit: r.isCredit,
        balanceAfter: r.balanceAfter,
        duplicate: isDup,
        suggestedCategoryId,
        reviewed: suggestedCategoryId !== null,
        reviewedAt: suggestedCategoryId !== null ? new Date() : null,
        reviewedById: suggestedCategoryId !== null ? uploadedById : null,
      });
    }

    // Validation: closing balance should be opening + credits - debits (within rounding)
    let validationPass = false;
    let validationDelta = 0;
    if (meta.openingBalance !== undefined && meta.closingBalance !== undefined) {
      const expected = meta.openingBalance + totalCredits - totalDebits;
      validationDelta = Math.abs(expected - meta.closingBalance);
      validationPass = validationDelta < 1.0;
    } else if (meta.openingBalance !== undefined) {
      // Estimate closing balance from last row
      const lastRow = cleaned[cleaned.length - 1];
      if (lastRow?.balanceAfter !== undefined) {
        const expected = meta.openingBalance + totalCredits - totalDebits;
        validationDelta = Math.abs(expected - lastRow.balanceAfter);
        validationPass = validationDelta < 1.0;
      } else {
        validationPass = totalDebits + totalCredits > 0;
      }
    } else {
      validationPass = totalDebits + totalCredits > 0;
    }

    return this.prisma.bankStatementImport.create({
      data: {
        familyId,
        uploadedById,
        sourceType,
        accountType,
        fileName: originalName,
        fileUrl: storedUrl,
        fileHash: hash,
        bank: meta.bank,
        accountLast4: meta.accountLast4 ?? '',
        periodFrom: meta.periodFrom,
        periodTo: meta.periodTo,
        openingBalance: meta.openingBalance,
        closingBalance: meta.closingBalance ?? rows[rows.length - 1]?.balanceAfter ?? null,
        totalCredits,
        totalDebits,
        validationPass,
        validationDelta,
        status: 'PARSED',
        errorMessage: validationPass
          ? null
          : `Credits ₹${totalCredits.toFixed(2)} - Debits ₹${totalDebits.toFixed(2)} vs expected closing balance (delta ₹${validationDelta.toFixed(2)})`,
        rows: { create: rows },
      },
      include: { rows: true },
    });
  }

  async scanInbox(familyId: string, uploadedById: string, accountType: 'SAVINGS' | 'CURRENT' | 'CREDIT_CARD') {
    const inboxDir = await this.settings.getInboxDir();
    const processedDir = join(inboxDir, 'processed');
    const failedDir = join(inboxDir, 'failed');
    const uploadsDir = join(process.cwd(), 'uploads');
    for (const dir of [inboxDir, processedDir, failedDir, uploadsDir]) mkdirSync(dir, { recursive: true });

    const files = readdirSync(inboxDir, { withFileTypes: true })
      .filter((e) => e.isFile() && /\.pdf$/i.test(e.name))
      .map((e) => e.name);

    if (files.length === 0) return { processed: 0, failed: 0, results: [] };

    const results: { fileName: string; status: 'ok' | 'password_required' | 'error'; importId?: string; error?: string }[] = [];
    for (const fileName of files) {
      const absolutePath = join(inboxDir, fileName);
      try {
        const targetName = `${Date.now()}-${fileName.replace(/\.pdf$/i, '.pdf')}`;
        const target = join(uploadsDir, targetName);
        copyFileSync(absolutePath, target);
        const imp = await this.processFile(
          familyId, uploadedById, target, fileName, `/uploads/${targetName}`, 'INBOX', accountType,
        );
        if (imp.status === 'PASSWORD_REQUIRED') {
          results.push({ fileName, status: 'password_required', importId: imp.id });
        } else {
          results.push({ fileName, status: 'ok', importId: imp.id });
          const dayDir = new Date().toISOString().slice(0, 10);
          mkdirSync(join(processedDir, dayDir), { recursive: true });
          renameSync(absolutePath, join(processedDir, dayDir, fileName));
        }
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
      failed: results.filter((r) => r.status !== 'ok').length,
      results,
    };
  }

  /** Retry a PASSWORD_REQUIRED import with a password */
  async unlockWithPassword(importId: string, userId: string, password: string) {
    const imp = await this.prisma.bankStatementImport.findUnique({ where: { id: importId } });
    if (!imp) throw new NotFoundException('Import not found');
    await this.assertAdmin(imp.familyId, userId);
    if (imp.status !== 'PASSWORD_REQUIRED') {
      throw new BadRequestException('Import does not need a password');
    }
    // Delete old rows (none should exist) and re-process
    await this.prisma.bankStatementRow.deleteMany({ where: { importId } });
    const result = await this.processFile(
      imp.familyId,
      imp.uploadedById,
      join(process.cwd(), imp.fileUrl.replace(/^\/uploads\//, 'uploads/')),
      imp.fileName,
      imp.fileUrl,
      imp.sourceType as 'UPLOAD' | 'INBOX',
      imp.accountType as 'SAVINGS' | 'CURRENT' | 'CREDIT_CARD',
      password,
    );
    if (result.status === 'PASSWORD_REQUIRED') {
      throw new UnprocessableEntityException('Incorrect password. Please try again.');
    }
    await this.prisma.bankStatementImport.delete({ where: { id: importId } });
    return result;
  }

  async updateRows(importId: string, userId: string, rows: BankRowPatchDto[]) {
    const imp = await this.prisma.bankStatementImport.findUnique({ where: { id: importId } });
    if (!imp) throw new NotFoundException('Import not found');
    await this.assertAdmin(imp.familyId, userId);
    if (imp.status === 'IMPORTED') {
      throw new ConflictException('Import already confirmed — rows cannot be edited');
    }

    const now = new Date();
    const updatedIds: string[] = [];
    for (const r of rows) {
      const row = await this.prisma.bankStatementRow.findUnique({
        where: { id: r.id },
        include: { import: { select: { familyId: true, status: true } } },
      });
      if (!row || row.importId !== importId) throw new NotFoundException('Bank statement row not found');

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
          const categoryId = r.categoryId === null
            ? null
            : r.categoryId ?? row.categoryId ?? null;
          if (!categoryId) {
            const other = await this.getOtherCategory(imp.familyId);
            if (!other) throw new BadRequestException('Default Other category is unavailable');
            data.categoryId = other.id;
          } else {
            await this.assertCategoryForFamily(imp.familyId, categoryId);
            data.categoryId = categoryId;
          }
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
        await this.prisma.bankStatementRow.update({ where: { id: r.id }, data });
        updatedIds.push(r.id);
      }
    }

    const eligible = await this.prisma.bankStatementRow.count({
      where: { importId, isCredit: false, duplicate: false, excluded: false },
    });
    const reviewedEligible = await this.prisma.bankStatementRow.count({
      where: { importId, reviewed: true, isCredit: false, duplicate: false, excluded: false },
    });
    const nextStatus = reviewedEligible === eligible ? 'REVIEWED' : 'PARSED';
    if (imp.status !== nextStatus) {
      await this.prisma.bankStatementImport.update({
        where: { id: importId },
        data: { status: nextStatus },
      });
    }

    const updated = updatedIds.length > 0
      ? await this.prisma.bankStatementRow.findMany({
          where: { importId, id: { in: updatedIds } },
          include: {
            suggestedCategory: { select: { id: true, name: true, icon: true } },
            confirmedCategory: { select: { id: true, name: true, icon: true } },
            reconciledExpense: true,
            reviewer: { select: { id: true, name: true } },
          },
        })
      : [];
    return { ok: true, rows: updated };
  }

  async setSplits(rowId: string, userId: string, splits: BankRowSplitDto[]) {
    const row = await this.prisma.bankStatementRow.findUnique({
      where: { id: rowId },
      include: { import: true, splits: true },
    });
    if (!row) throw new NotFoundException('Row not found');
    await this.assertAdmin(row.import.familyId, userId);
    if (row.import.status === 'IMPORTED') {
      throw new ConflictException('Import already confirmed');
    }

    const sum = splits.reduce((s, x) => s + x.amount, 0);
    if (Math.abs(sum - Number(row.amount)) > 0.01) {
      throw new BadRequestException(`Split amounts (₹${sum.toFixed(2)}) must equal row amount (₹${Number(row.amount).toFixed(2)})`);
    }
    for (const split of splits) {
      await this.assertCategoryForFamily(row.import.familyId, split.categoryId);
    }

    await this.prisma.bankStatementSplit.deleteMany({ where: { rowId } });
    if (splits.length > 0) {
      await this.prisma.bankStatementSplit.createMany({
        data: splits.map((s) => ({
          rowId,
          categoryId: s.categoryId,
          amount: s.amount,
          notes: s.notes,
        })),
      });
    }

    const hasCategory = row.categoryId !== null || splits.length > 0;
    await this.prisma.bankStatementRow.update({
      where: { id: rowId },
      data: {
        reviewed: hasCategory,
        reviewedAt: hasCategory ? new Date() : null,
        reviewedById: hasCategory ? userId : null,
      },
    });
    return { ok: true, splitCount: splits.length };
  }

  async reconcileRow(rowId: string, userId: string, expenseId: string | null) {
    const row = await this.prisma.bankStatementRow.findUnique({
      where: { id: rowId },
      include: { import: true },
    });
    if (!row) throw new NotFoundException('Row not found');
    await this.assertMember(row.import.familyId, userId);
    if (expenseId) {
      const exp = await this.prisma.expense.findUnique({ where: { id: expenseId } });
      if (!exp || exp.familyId !== row.import.familyId) {
        throw new BadRequestException('Expense does not belong to this family');
      }
    }
    const reviewed = expenseId !== null;
    await this.prisma.bankStatementRow.update({
      where: { id: rowId },
      data: {
        reconciledExpenseId: expenseId,
        reviewed,
        reviewedAt: reviewed ? new Date() : null,
        reviewedById: reviewed ? userId : null,
      },
    });
    return { ok: true };
  }

  async findMatches(rowId: string, userId: string) {
    const row = await this.prisma.bankStatementRow.findUnique({
      where: { id: rowId },
      include: { import: true },
    });
    if (!row) throw new NotFoundException('Row not found');
    await this.assertMember(row.import.familyId, userId);
    const dayMs = 86400000;
    const from = new Date(row.date.getTime() - 2 * dayMs);
    const to = new Date(row.date.getTime() + 2 * dayMs);
    const candidates = await this.prisma.expense.findMany({
      where: {
        familyId: row.import.familyId,
        amount: row.amount,
        date: { gte: from, lte: to },
      },
      include: { category: { select: { id: true, name: true, icon: true } } },
      take: 10,
    });
    // Score each by notes/description similarity
    return candidates
      .map((c) => ({ ...c, similarity: c.notes ? this.similarText(c.notes, row.description) : 0 }))
      .sort((a, b) => b.similarity - a.similarity);
  }

  async confirmImport(importId: string, userId: string) {
    const imp = await this.prisma.bankStatementImport.findUnique({
      where: { id: importId },
      include: { rows: { include: { splits: true } } },
    });
    if (!imp) throw new NotFoundException('Import not found');
    await this.assertAdmin(imp.familyId, userId);
    if (imp.status === 'IMPORTED') {
      throw new ConflictException('Import already confirmed');
    }

    const otherCat = await this.getOtherCategory(imp.familyId);

    const toImport = imp.rows.filter((r) => r.reviewed && !r.isCredit && !r.duplicate && !r.excluded && !r.reconciledExpenseId);
    if (toImport.length === 0) {
      throw new BadRequestException('No reviewed rows are ready to import');
    }
    const skipped = imp.rows.length - toImport.length;
    const now = new Date();
    let imported = 0;

    for (const row of toImport) {
      if (row.splits.length > 0) {
        for (const split of row.splits) {
          await this.assertCategoryForFamily(imp.familyId, split.categoryId);
          await this.prisma.expense.create({
            data: {
              familyId: imp.familyId,
              categoryId: split.categoryId,
              paidById: userId,
              createdById: userId,
              amount: split.amount,
              date: row.date,
              paymentMethod: imp.accountType === 'CREDIT_CARD' ? 'CARD' : 'UPI',
              notes: split.notes || row.description,
              reviewed: true,
              reviewedAt: now,
              reviewedById: userId,
            },
          });
          imported++;
        }
      } else {
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
            paymentMethod: imp.accountType === 'CREDIT_CARD' ? 'CARD' : 'UPI',
            notes: row.description,
            reviewed: true,
            reviewedAt: now,
            reviewedById: userId,
          },
        });
        await this.prisma.bankStatementRow.update({
          where: { id: row.id },
          data: { reconciledExpenseId: expense.id },
        });
        imported++;
      }
    }

    await this.prisma.bankStatementImport.update({
      where: { id: importId },
      data: { status: 'IMPORTED', importedCount: imported, skippedCount: skipped },
    });

    // Run recurring detection on the imported rows
    await this.detectRecurringPatterns(imp.familyId, userId);

    return { imported, skipped };
  }

  async deleteImport(importId: string, userId: string) {
    const imp = await this.prisma.bankStatementImport.findUnique({ where: { id: importId } });
    if (!imp) throw new NotFoundException('Import not found');
    await this.assertAdmin(imp.familyId, userId);
    if (imp.status === 'IMPORTED') {
      throw new ConflictException('Confirmed imports cannot be deleted');
    }
    await this.prisma.bankStatementImport.delete({ where: { id: importId } });
    return { ok: true };
  }

  /** Detect recurring patterns from imported rows for a family.
   *  Groups rows by merchant key + amount bucket; if at least 2 occurrences
   *  are spaced ~30 days apart, creates or updates a RecurringPattern.
   */
  async detectRecurringPatterns(familyId: string, userId: string) {
    await this.assertMember(familyId, userId);
    const rows = await this.prisma.bankStatementRow.findMany({
      where: { import: { familyId, status: 'IMPORTED' }, isCredit: false },
      include: { import: true },
      orderBy: { date: 'asc' },
    });
    if (rows.length < 2) return { patterns: 0 };

    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = merchantKeyFromDescription(r.description);
      if (!key) continue;
      const arr = groups.get(key) ?? [];
      arr.push(r);
      groups.set(key, arr);
    }

    let created = 0;
    for (const [key, list] of groups) {
      if (list.length < 2) continue;
      // Compute gaps between consecutive occurrences
      const gaps: number[] = [];
      for (let i = 1; i < list.length; i++) {
        gaps.push((list[i].date.getTime() - list[i - 1].date.getTime()) / 86400000);
      }
      // Determine dominant interval
      const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length;
      let intervalDays = 0;
      if (avg >= 5 && avg <= 9) intervalDays = 7;
      else if (avg >= 25 && avg <= 35) intervalDays = 30;
      else if (avg >= 85 && avg <= 95) intervalDays = 90;
      else if (avg >= 175 && avg <= 185) intervalDays = 180;
      else if (avg >= 355 && avg <= 375) intervalDays = 365;
      else continue;
      // Amount consistency (within 10%)
      const amounts = list.map((r) => Number(r.amount));
      const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length;
      const maxDelta = Math.max(...amounts.map((a) => Math.abs(a - avgAmount)));
      if (maxDelta / avgAmount > 0.10) continue;
      // Most-used category
      const catCounts = new Map<string, number>();
      for (const r of list) {
        const cId = r.categoryId ?? r.suggestedCategoryId;
        if (!cId) continue;
        catCounts.set(cId, (catCounts.get(cId) ?? 0) + 1);
      }
      const topCat = [...catCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      const lastSeen = list[list.length - 1].date;
      await this.prisma.recurringPattern.upsert({
        where: { familyId_descriptionKey: { familyId, descriptionKey: key } },
        update: {
          amountAvg: avgAmount,
          intervalDays,
          occurrences: list.length,
          lastSeen,
          categoryId: topCat,
          merchant: key,
        },
        create: {
          familyId,
          descriptionKey: key,
          merchant: key,
          amountAvg: avgAmount,
          intervalDays,
          occurrences: list.length,
          lastSeen,
          categoryId: topCat,
        },
      });
      created++;
    }
    return { patterns: created };
  }

  async listRecurringPatterns(familyId: string, userId: string) {
    await this.assertMember(familyId, userId);
    return this.prisma.recurringPattern.findMany({
      where: { familyId, occurrences: { gte: 2 } },
      include: { category: { select: { id: true, name: true, icon: true } } },
      orderBy: { lastSeen: 'desc' },
    });
  }

  async promoteToRecurringExpense(familyId: string, userId: string, dto: CreateRecurringDto) {
    await this.assertAdmin(familyId, userId);
    const pattern = await this.prisma.recurringPattern.findUnique({ where: { id: dto.patternId } });
    if (!pattern || pattern.familyId !== familyId) throw new NotFoundException('Pattern not found');
    const interval =
      pattern.intervalDays === 7 ? 'WEEKLY' :
      pattern.intervalDays === 30 ? 'MONTHLY' :
      pattern.intervalDays === 90 ? 'QUARTERLY' :
      pattern.intervalDays === 180 ? 'HALF_YEARLY' :
      'ANNUAL';
    return this.prisma.recurringExpense.create({
      data: {
        familyId,
        name: pattern.merchant,
        categoryId: dto.categoryId ?? pattern.categoryId ?? (await this.resolveOtherCategoryId(familyId)) ?? '',
        paidById: userId,
        amount: Number(pattern.amountAvg),
        interval,
        startDate: pattern.lastSeen,
        paymentMethod: 'UPI',
        notes: `Promoted from pattern with ${pattern.occurrences} occurrences`,
        active: true,
      },
    });
  }

  /** Export an import's rows as CSV or JSON */
  async export(importId: string, userId: string, format: 'csv' | 'json') {
    const imp = await this.detail(importId, userId);
    if (!imp) throw new NotFoundException('Import not found');
    if (format === 'json') {
      return JSON.stringify(imp, null, 2);
    }
    const header = 'Date,Description,Amount,IsCredit,BalanceAfter,Category,RefNumber,Notes';
    const lines = imp.rows.map((r: any) => [
      r.date.toISOString().slice(0, 10),
      `"${(r.description || '').replace(/"/g, '""')}"`,
      r.amount,
      r.isCredit ? 'CR' : 'DR',
      r.balanceAfter ?? '',
      r.confirmedCategory?.name ?? r.suggestedCategory?.name ?? '',
      r.refNumber ?? '',
      `"${(r.notes || '').replace(/"/g, '""')}"`,
    ].join(','));
    return [header, ...lines].join('\n');
  }

  private async resolveOtherCategoryId(familyId: string) {
    const otherCat = await this.getOtherCategory(familyId);
    return otherCat?.id;
  }

  /** Simple Jaccard-like similarity between two strings (word overlap) */
  private similarText(a: string, b: string): number {
    const aWords = new Set(a.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
    const bWords = new Set(b.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
    if (aWords.size === 0 || bWords.size === 0) return 0;
    let inter = 0;
    for (const w of aWords) if (bWords.has(w)) inter++;
    const union = new Set([...aWords, ...bWords]).size;
    return inter / union;
  }

  async reloadMerchantMemory(familyId: string, userId: string) {
    await this.assertAdmin(familyId, userId);
    await this.memory.loadForFamily(familyId);
    return { ok: true, message: 'Merchant memory reloaded' };
  }
}