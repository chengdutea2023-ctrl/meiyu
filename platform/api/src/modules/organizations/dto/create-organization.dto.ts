import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrganizationType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateOrganizationDto {
  @ApiProperty({ example: '示例学校' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional({ example: 'demo-school' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{2,64}$/)
  code?: string;

  @ApiPropertyOptional({ enum: OrganizationType, default: OrganizationType.SCHOOL })
  @IsOptional()
  @IsEnum(OrganizationType)
  type?: OrganizationType;
}

