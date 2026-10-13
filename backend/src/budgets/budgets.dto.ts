import { IsNotEmpty, IsNumber, IsPositive, IsString, Matches } from 'class-validator';

export class CreateBudgetDto {
  @IsString() @IsNotEmpty() familyId!: string;
  @IsString() @IsNotEmpty() categoryId!: string;
  @IsString() @Matches(/^\d{4}-\d{2}$/, { message: 'month must be in YYYY-MM format' }) month!: string;
  @IsNumber() @IsPositive() amount!: number;
}

export class UpdateBudgetDto {
  @IsNumber() @IsPositive() amount!: number;
}
