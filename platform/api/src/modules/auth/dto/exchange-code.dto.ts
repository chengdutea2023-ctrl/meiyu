import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ExchangeCodeDto {
  @ApiProperty({ example: 'demo-teaching-app' })
  @IsString()
  appId!: string;

  @ApiProperty({ example: 'demo-app-secret' })
  @IsString()
  @MinLength(8)
  appSecret!: string;

  @ApiProperty({ example: 'authorization-code-from-callback' })
  @IsString()
  code!: string;

  @ApiProperty({ example: 'http://localhost:3001/auth/callback' })
  @IsString()
  redirectUri!: string;
}

