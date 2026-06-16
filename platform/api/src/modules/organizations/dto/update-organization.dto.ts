import { ApiPropertyOptional } from '@nestjs/swagger';
import { OrganizationType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ example: '天府七中' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ example: 'tianfu-no7' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{2,64}$/)
  code?: string;

  @ApiPropertyOptional({ enum: OrganizationType })
  @IsOptional()
  @IsEnum(OrganizationType)
  type?: OrganizationType;
}
