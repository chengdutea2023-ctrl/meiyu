import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateCourseLaunchDto {
  @ApiPropertyOptional({ example: 'course-id' })
  @IsOptional()
  @IsString()
  courseId?: string;

  @ApiPropertyOptional({ example: 'can-machines-learn' })
  @IsOptional()
  @IsString()
  courseSlug?: string;

  @ApiPropertyOptional({ example: 'assignment-id' })
  @IsOptional()
  @IsString()
  assignmentId?: string;

  @ApiPropertyOptional({ example: 'class-id' })
  @IsOptional()
  @IsString()
  classId?: string;
}
