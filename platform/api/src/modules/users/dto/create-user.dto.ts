import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'teacher001' })
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{3,32}$/)
  username!: string;

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

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPlatformAdmin?: boolean;
}

