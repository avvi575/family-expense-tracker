import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class ScanBankInboxDto {
  @IsString() familyId!: string;
  @IsIn(['SAVINGS', 'CURRENT', 'CREDIT_CARD'])
  @IsOptional()
  accountType: 'SAVINGS' | 'CURRENT' | 'CREDIT_CARD' = 'SAVINGS';
}

export class UnlockBankDto {
  @IsString() password!: string;
}

export class BankRowSplitDto {
  @IsString() categoryId!: string;
  @IsNumber() amount!: number;
  @IsOptional() @IsString() notes?: string;
}

export class BankRowPatchDto {
  @IsString() id!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    if (value === '' || value === null || value === undefined) return null;
    return value;
  })
  categoryId?: string | null;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  excluded?: boolean;

  @IsOptional()
  @IsBoolean()
  reviewed?: boolean;
}

export class PatchBankRowsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BankRowPatchDto)
  rows!: BankRowPatchDto[];
}

export class SetSplitsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BankRowSplitDto)
  splits!: BankRowSplitDto[];
}

export class ReconcileDto {
  @IsOptional() @IsString() expenseId?: string | null;
}

export class CreateRecurringDto {
  @IsString() patternId!: string;
  @IsOptional() @IsString() categoryId?: string;
}