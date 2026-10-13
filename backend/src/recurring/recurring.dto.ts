import { IsBoolean, IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export const RECURRING_INTERVALS = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'ANNUAL'] as const;
export type RecurringInterval = (typeof RECURRING_INTERVALS)[number];

export class CreateRecurringDto {
  @IsString() @IsNotEmpty() familyId!: string;

  @IsString() @IsNotEmpty() @MaxLength(80) name!: string;

  @IsString() @IsNotEmpty() categoryId!: string;

  @IsNumber() @IsPositive() amount!: number;

  @IsIn(RECURRING_INTERVALS)
  interval!: RecurringInterval;

  @IsDateString() startDate!: string;

  @IsOptional() @IsDateString() endDate?: string;

  @IsOptional() @IsIn(['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'OTHER'])
  paymentMethod?: 'CASH' | 'CARD' | 'UPI' | 'BANK_TRANSFER' | 'OTHER';

  @IsOptional() @IsString() notes?: string;
}

export class UpdateRecurringDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsNumber() @IsPositive() amount?: number;
  @IsOptional() @IsIn(RECURRING_INTERVALS) interval?: RecurringInterval;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string | null;
  @IsOptional() @IsIn(['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'OTHER'])
  paymentMethod?: 'CASH' | 'CARD' | 'UPI' | 'BANK_TRANSFER' | 'OTHER';
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
