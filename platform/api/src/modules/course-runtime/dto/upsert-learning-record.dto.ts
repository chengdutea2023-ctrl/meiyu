import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LearningRecordStatus } from '@prisma/client';
import { IsEnum, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpsertLearningRecordDto {
  @ApiPropertyOptional({ example: 'course-id' })
  @IsOptional()
  @IsString()
  courseId?: string;

  @ApiPropertyOptional({ example: 'can-machines-learn' })
  @IsOptional()
  @IsString()
  courseSlug?: string;

  @ApiPropertyOptional({ example: 'courseware-id' })
  @IsOptional()
  @IsString()
  coursewareId?: string;

  @ApiPropertyOptional({ example: 'intro-activity' })
  @IsOptional()
  @IsString()
  coursewareSlug?: string;

  @ApiPropertyOptional({ example: 'assignment-id' })
  @IsOptional()
  @IsString()
  assignmentId?: string;

  @ApiPropertyOptional({ example: 'class-id' })
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiProperty({ enum: LearningRecordStatus, example: LearningRecordStatus.STARTED })
  @IsEnum(LearningRecordStatus)
  status!: LearningRecordStatus;

  @ApiPropertyOptional({ example: 92 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  score?: number;

  @ApiPropertyOptional({ example: 480 })
  @IsOptional()
  @IsInt()
  @Min(0)
  durationSeconds?: number;

  @ApiPropertyOptional({ example: { comment: '完成互动练习' } })
  @IsOptional()
  @IsObject()
  summary?: Record<string, unknown>;
}
