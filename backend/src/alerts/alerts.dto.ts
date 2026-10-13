import { IsIn, IsString } from 'class-validator';

export class CreateAlertDto {
  @IsString() familyId!: string;

  @IsString() name!: string;

  @IsString() condition!: string;

  @IsIn(['BUDGET', 'EXPENSE', 'GOAL'])
  type!: 'BUDGET' | 'EXPENSE' | 'GOAL';
}

export class EvaluateAlertDto {
  @IsString() familyId!: string;

  @IsString() condition!: string;
}
