import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LearningRecordStatus } from '@prisma/client';
import { IsEnum, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpsertLaunchLearningRecordDto {
  @ApiProperty({ example: 'launch-token' })
  @IsString()
  launchToken!: string;

  @ApiProperty({ enum: LearningRecordStatus, example: LearningRecordStatus.COMPLETED })
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

  @ApiPropertyOptional({ example: { artworkUrl: '/work/abc123' } })
  @IsOptional()
  @IsObject()
  summary?: Record<string, unknown>;
}
