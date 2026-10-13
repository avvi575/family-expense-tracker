import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateGoalDto {
  @IsString() @IsNotEmpty() familyId!: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsNumber() @Min(1) targetAmount!: number;
  @IsOptional() @IsDateString() deadline?: string;
}

export class UpdateGoalDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() @Min(1) targetAmount?: number;
  @IsOptional() @IsDateString() deadline?: string;
}

export class ContributeDto {
  @IsNumber() @Min(1) amount!: number;
  @IsOptional() @IsString() note?: string;
}
