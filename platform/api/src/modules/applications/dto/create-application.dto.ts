import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateApplicationDto {
  @ApiPropertyOptional({ example: 'demo-teaching-app' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{3,64}$/)
  appId?: string;

  @ApiProperty({ example: '教学辅助演示应用' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional({ example: '用于验证统一登录接入流程' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'http://localhost:3001' })
  @IsString()
  homeUrl!: string;

  @ApiPropertyOptional({
    example: ['http://localhost:3001'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedOrigins?: string[];

  @ApiPropertyOptional({
    example: ['http://localhost:3001/auth/callback'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  redirectUris?: string[];
}
