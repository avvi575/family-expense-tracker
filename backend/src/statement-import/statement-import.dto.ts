import { IsArray, IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class ScanInboxDto {
  @IsString() familyId!: string;
}

export class RowPatchDto {
  @IsString() id!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    // empty string / null → null; meaningful string → string
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

export class PatchRowsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RowPatchDto)
  rows!: RowPatchDto[];
}
