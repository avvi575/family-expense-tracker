import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateFamilyDto {
  @IsString()
  @MinLength(2)
  name!: string;
}

export class InviteMemberDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  mobile?: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsEnum(['ADMIN', 'MEMBER', 'VIEWER'])
  role!: 'ADMIN' | 'MEMBER' | 'VIEWER';
}

export class JoinFamilyDto {
  @IsString()
  token!: string;
}

export class FamilyIdDto {
  @IsString()
  familyId!: string;
}

export class UpdateMemberRoleDto {
  @IsOptional()
  @IsEnum(['ADMIN', 'MEMBER', 'VIEWER'])
  role?: 'ADMIN' | 'MEMBER' | 'VIEWER';
}
