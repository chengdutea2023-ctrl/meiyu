import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class AuthorizeQueryDto {
  @ApiProperty({ example: 'demo-teaching-app' })
  @IsString()
  appId!: string;

  @ApiProperty({ example: 'http://localhost:3001/auth/callback' })
  @IsString()
  redirectUri!: string;

  @ApiPropertyOptional({ example: 'opaque-state-from-business-app' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: 'profile organization class' })
  @IsOptional()
  @IsString()
  scope?: string;
}

