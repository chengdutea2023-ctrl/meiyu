import { ApiPropertyOptional } from '@nestjs/swagger';
import { CourseRuntimeType } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';

export class UpdateCoursewareDto {
  @ApiPropertyOptional({ example: 'eco-demo' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{3,80}$/)
  slug?: string;

  @ApiPropertyOptional({ example: '生态岛互动体验' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;

  @ApiPropertyOptional({ example: '学生通过互动任务理解生态保护。' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: CourseRuntimeType })
  @IsOptional()
  @IsEnum(CourseRuntimeType)
  runtimeType?: CourseRuntimeType;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ example: 'http://agent.docpine.online/eco-island-rescue/eco-demo/' })
  @IsOptional()
  @IsString()
  entryUrl?: string;
}
