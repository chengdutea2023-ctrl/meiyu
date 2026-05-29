import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserApprovalStatus, UserType } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  Matches,
  MinLength,
  IsString,
} from 'class-validator';

export class CreateUserDto {
  @ApiPropertyOptional({ example: 'teacher001' })
  @IsOptional()
  @Matches(/^[a-zA-Z0-9_-]{3,32}$/)
  username?: string;

  @ApiProperty({ example: 'teacher001@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'ChangeMe123!' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({ example: '张老师' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({ enum: UserType, default: UserType.STUDENT })
  @IsOptional()
  @IsEnum(UserType)
  userType?: UserType;

  @ApiPropertyOptional({
    enum: UserApprovalStatus,
    default: UserApprovalStatus.APPROVED,
  })
  @IsOptional()
  @IsEnum(UserApprovalStatus)
  approvalStatus?: UserApprovalStatus;

  @ApiPropertyOptional({ example: '9-12岁' })
  @IsOptional()
  @IsString()
  ageBand?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPlatformAdmin?: boolean;
}
