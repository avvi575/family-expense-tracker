import { IsBoolean, IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export const INCOME_TYPES = ['SALARY', 'RENTAL', 'BUSINESS', 'INVESTMENT', 'GIFT', 'BONUS', 'FREELANCE', 'OTHER'] as const;
export type IncomeType = (typeof INCOME_TYPES)[number];

export class CreateIncomeDto {
  @IsString() @IsNotEmpty() familyId!: string;

  @IsOptional() @IsString() memberId?: string; // defaults to declaredById if omitted

  @IsNumber() @IsPositive() amount!: number;

  @IsIn(INCOME_TYPES) type!: IncomeType;

  @IsString() @IsNotEmpty() @MaxLength(80) source!: string; // "Apartment Rent", "Gift from uncle"

  @IsBoolean() isRecurring!: boolean;

  @IsDateString() date!: string; // recurring: start date; adhoc: event date

  @IsOptional() @IsDateString() endDate?: string;

  @IsOptional() @IsString() notes?: string;
}

export class UpdateIncomeDto {
  @IsOptional() @IsNumber() @IsPositive() amount?: number;
  @IsOptional() @IsIn(INCOME_TYPES) type?: IncomeType;
  @IsOptional() @IsString() @MaxLength(80) source?: string;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsDateString() endDate?: string | null;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
