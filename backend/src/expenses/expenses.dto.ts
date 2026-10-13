import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateExpenseDto {
  @IsString()
  @IsNotEmpty()
  familyId!: string;

  @IsString()
  categoryId!: string;

  @IsOptional()
  @IsString()
  paidById?: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsDateString()
  date!: string;

  @IsEnum(['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'OTHER'])
  paymentMethod!: 'CASH' | 'CARD' | 'UPI' | 'BANK_TRANSFER' | 'OTHER';

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  receiptUrl?: string;
}

export class UpdateExpenseDto {
  @IsOptional() @IsNumber() @IsPositive() amount?: number;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsEnum(['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'OTHER']) paymentMethod?: 'CASH' | 'CARD' | 'UPI' | 'BANK_TRANSFER' | 'OTHER';
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() receiptUrl?: string;
}
