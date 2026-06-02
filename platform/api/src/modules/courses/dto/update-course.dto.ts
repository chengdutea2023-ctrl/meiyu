import { ApiPropertyOptional } from '@nestjs/swagger';
import { CourseOwnerType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class UpdateCourseDto {
  @ApiPropertyOptional({ example: 'can-machines-learn' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{3,80}$/)
  slug?: string;

  @ApiPropertyOptional({ example: '机器真的能学习吗？' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;

  @ApiPropertyOptional({ example: '面向学生的机器学习启蒙课程' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: CourseOwnerType })
  @IsOptional()
  @IsEnum(CourseOwnerType)
  ownerType?: CourseOwnerType;
}
