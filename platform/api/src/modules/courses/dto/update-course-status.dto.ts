import { ApiProperty } from '@nestjs/swagger';
import { CourseStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateCourseStatusDto {
  @ApiProperty({ enum: CourseStatus })
  @IsEnum(CourseStatus)
  status!: CourseStatus;
}
