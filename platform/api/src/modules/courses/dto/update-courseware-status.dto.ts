import { ApiProperty } from '@nestjs/swagger';
import { CourseStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateCoursewareStatusDto {
  @ApiProperty({ enum: CourseStatus })
  @IsEnum(CourseStatus)
  status!: CourseStatus;
}
