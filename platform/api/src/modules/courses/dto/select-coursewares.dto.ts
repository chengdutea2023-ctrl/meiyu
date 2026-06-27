import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class SelectCoursewaresDto {
  @ApiProperty({
    type: [String],
    maxItems: 10,
    example: ['courseware-id-1', 'courseware-id-2'],
  })
  @IsArray()
  @ArrayMaxSize(10, { message: '一门课程最多选择 10 个课件' })
  @IsString({ each: true })
  coursewareIds!: string[];
}
