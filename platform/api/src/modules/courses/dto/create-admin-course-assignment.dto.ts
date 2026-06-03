import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateAdminCourseAssignmentDto {
  @ApiProperty({ example: 'course-id' })
  @IsString()
  courseId!: string;

  @ApiProperty({ example: 'class-id' })
  @IsString()
  classId!: string;

  @ApiProperty({ example: 'teacher-id' })
  @IsString()
  teacherId!: string;

  @ApiProperty({ example: '第一课：机器如何从例子中学习' })
  @IsString()
  @MinLength(2)
  title!: string;

  @ApiPropertyOptional({ example: '完成课件中的互动练习，并提交结果。' })
  @IsOptional()
  @IsString()
  instructions?: string;

  @ApiPropertyOptional({ example: '2026-06-02T08:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  startAt?: string;

  @ApiPropertyOptional({ example: '2026-06-09T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  dueAt?: string;
}
