import {
  BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators';
import { BankStatementService } from './bank-statement.service';
import {
  CreateRecurringDto, PatchBankRowsDto, ReconcileDto, ScanBankInboxDto, SetSplitsDto, UnlockBankDto,
} from './bank-statement.dto';

const UPLOAD_DIR = join(process.cwd(), 'uploads');

@Controller('bank-statements')
@UseGuards(JwtAuthGuard)
export class BankStatementController {
  constructor(private service: BankStatementService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOAD_DIR,
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname).toLowerCase()}`;
          cb(null, unique);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (extname(file.originalname).toLowerCase() === '.pdf') cb(null, true);
        else cb(new BadRequestException('Only PDF files are accepted'), false);
      },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Query('familyId') familyId: string,
    @Query('accountType') accountType: 'SAVINGS' | 'CURRENT' | 'CREDIT_CARD',
    @Body('password') password: string,
    @CurrentUser('id') userId: string,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    return this.service.processFile(
      familyId, userId, file.path, file.originalname, `/uploads/${file.filename}`,
      'UPLOAD', accountType ?? 'SAVINGS', password,
    );
  }

  @Post('scan-inbox')
  scanInbox(@Body() dto: ScanBankInboxDto, @CurrentUser('id') userId: string) {
    return this.service.scanInbox(dto.familyId, userId, dto.accountType);
  }

  @Get()
  list(
    @Query('familyId') familyId: string,
    @Query('accountType') accountType: 'SAVINGS' | 'CURRENT' | 'CREDIT_CARD' | undefined,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.list(familyId, userId, accountType);
  }

  @Get(':id')
  detail(@Param('id') importId: string, @CurrentUser('id') userId: string) {
    return this.service.detail(importId, userId);
  }

  @Get(':id/export')
  async export(
    @Param('id') importId: string,
    @Query('format') format: 'csv' | 'json' = 'csv',
    @CurrentUser('id') userId: string,
    @Res() res: Response,
  ) {
    const data = await this.service.export(importId, userId, format);
    res.setHeader('Content-Type', format === 'json' ? 'application/json' : 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="statement-${importId}.${format}"`);
    res.send(data);
  }

  @Post(':id/unlock')
  unlock(@Param('id') importId: string, @Body() dto: UnlockBankDto, @CurrentUser('id') userId: string) {
    return this.service.unlockWithPassword(importId, userId, dto.password);
  }

  @Patch(':id/rows')
  updateRows(@Param('id') importId: string, @CurrentUser('id') userId: string, @Body() dto: PatchBankRowsDto) {
    return this.service.updateRows(importId, userId, dto.rows);
  }

  @Post('rows/:rowId/splits')
  setSplits(@Param('rowId') rowId: string, @Body() dto: SetSplitsDto, @CurrentUser('id') userId: string) {
    return this.service.setSplits(rowId, userId, dto.splits);
  }

  @Post('rows/:rowId/reconcile')
  reconcile(@Param('rowId') rowId: string, @Body() dto: ReconcileDto, @CurrentUser('id') userId: string) {
    return this.service.reconcileRow(rowId, userId, dto.expenseId ?? null);
  }

  @Get('rows/:rowId/matches')
  matches(@Param('rowId') rowId: string, @CurrentUser('id') userId: string) {
    return this.service.findMatches(rowId, userId);
  }

  @Post(':id/confirm')
  confirm(@Param('id') importId: string, @CurrentUser('id') userId: string) {
    return this.service.confirmImport(importId, userId);
  }

  @Delete(':id')
  deleteImp(@Param('id') importId: string, @CurrentUser('id') userId: string) {
    return this.service.deleteImport(importId, userId);
  }

  @Get('recurring/family/:familyId')
  listRecurring(@Param('familyId') familyId: string, @CurrentUser('id') userId: string) {
    return this.service.listRecurringPatterns(familyId, userId);
  }

  @Post('recurring/family/:familyId/detect')
  detect(@Param('familyId') familyId: string, @CurrentUser('id') userId: string) {
    return this.service.detectRecurringPatterns(familyId, userId);
  }

  @Post('recurring/family/:familyId/promote')
  promote(@Param('familyId') familyId: string, @Body() dto: CreateRecurringDto, @CurrentUser('id') userId: string) {
    return this.service.promoteToRecurringExpense(familyId, userId, dto);
  }

  @Post('merchant-memory/family/:familyId/reload')
  reloadMemory(@Param('familyId') familyId: string, @CurrentUser('id') userId: string) {
    return this.service.reloadMerchantMemory(familyId, userId);
  }
}