import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class SelectCoursewaresDto {
  @ApiProperty({
    type: [String],
    maxItems: 5,
    example: ['courseware-id-1', 'courseware-id-2'],
  })
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  coursewareIds!: string[];
}
