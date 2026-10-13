import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Body,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators';
import { StatementImportService } from './statement-import.service';
import { ScanInboxDto, PatchRowsDto } from './statement-import.dto';

const UPLOAD_DIR = join(process.cwd(), 'uploads');

@Controller('statement-imports')
@UseGuards(JwtAuthGuard)
export class StatementImportController {
  constructor(private service: StatementImportService) {}

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
    @CurrentUser('id') userId: string,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    return this.service.processFile(
      familyId,
      userId,
      file.path,
      file.originalname,
      `/uploads/${file.filename}`,
      'UPLOAD',
    );
  }

  @Post('scan-inbox')
  scanInbox(@Body() dto: ScanInboxDto, @CurrentUser('id') userId: string) {
    return this.service.scanInbox(dto.familyId, userId);
  }

  @Get()
  list(@Query('familyId') familyId: string, @CurrentUser('id') userId: string) {
    return this.service.list(familyId, userId);
  }

  @Get(':id')
  detail(@Param('id') importId: string, @CurrentUser('id') userId: string) {
    return this.service.detail(importId, userId);
  }

  @Patch(':id/rows')
  updateRows(@Param('id') importId: string, @CurrentUser('id') userId: string, @Body() dto: PatchRowsDto) {
    return this.service.updateRows(importId, userId, dto.rows);
  }

  @Post(':id/confirm')
  confirm(@Param('id') importId: string, @CurrentUser('id') userId: string) {
    return this.service.confirmImport(importId, userId);
  }

  @Delete(':id')
  deleteImp(@Param('id') importId: string, @CurrentUser('id') userId: string) {
    return this.service.deleteImport(importId, userId);
  }
}
