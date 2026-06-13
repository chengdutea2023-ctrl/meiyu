import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class UpdateAssignmentScheduleDto {
  @ApiProperty({ example: '2026-06-13T09:00:00.000Z' })
  @IsDateString()
  startAt!: string;

  @ApiPropertyOptional({ example: '2026-06-13T10:00:00.000Z', nullable: true })
  @IsOptional()
  @IsDateString()
  dueAt?: string | null;
}
