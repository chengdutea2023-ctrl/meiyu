import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class UpdateClassDto {
  @ApiPropertyOptional({ example: '一年级 1 班' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ example: 'grade1-class1' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{2,64}$/)
  code?: string;
}
