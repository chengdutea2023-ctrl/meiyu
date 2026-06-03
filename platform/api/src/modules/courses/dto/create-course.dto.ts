import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CourseOwnerType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateCourseDto {
  @ApiPropertyOptional({
    example: 'can-machines-learn',
    description: '课程访问短名，用于生成网址；不填则由系统自动生成。',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{3,80}$/)
  slug?: string;

  @ApiProperty({ example: '机器真的能学习吗？' })
  @IsString()
  @MinLength(2)
  title!: string;

  @ApiPropertyOptional({ example: '面向学生的机器学习启蒙课程' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: CourseOwnerType, default: CourseOwnerType.ADMIN })
  @IsOptional()
  @IsEnum(CourseOwnerType)
  ownerType?: CourseOwnerType;
}
