import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';

export class CourseUploadFileDto {
  @ApiProperty({ example: 'static/index.html' })
  @IsString()
  path!: string;

  @ApiProperty({ example: 'PGh0bWw+PC9odG1sPg==' })
  @IsString()
  contentBase64!: string;
}

export class UploadCourseFilesDto {
  @ApiProperty({ type: [CourseUploadFileDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CourseUploadFileDto)
  files!: CourseUploadFileDto[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}
