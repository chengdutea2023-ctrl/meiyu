import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsString, Min, ValidateNested } from 'class-validator';

class CoursewareOrderItemDto {
  @ApiProperty({ example: 'courseware-id' })
  @IsString()
  id!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class UpdateCoursewareOrderDto {
  @ApiProperty({ type: [CoursewareOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CoursewareOrderItemDto)
  items!: CoursewareOrderItemDto[];
}
