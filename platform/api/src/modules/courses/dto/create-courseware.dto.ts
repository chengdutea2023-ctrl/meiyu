import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CourseRuntimeType } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Max, Min, MinLength } from 'class-validator';

export class CreateCoursewareDto {
  @ApiPropertyOptional({
    example: 'eco-demo',
    description: '课件访问短名，用于生成网址；不填则由系统自动生成。',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{3,80}$/)
  slug?: string;

  @ApiProperty({ example: '生态岛互动体验' })
  @IsString()
  @MinLength(2)
  title!: string;

  @ApiPropertyOptional({ example: '学生通过互动任务理解生态保护。' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: CourseRuntimeType, default: CourseRuntimeType.STATIC })
  @IsOptional()
  @IsEnum(CourseRuntimeType)
  runtimeType?: CourseRuntimeType;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ example: 'http://agent.docpine.online/eco-island-rescue/eco-demo/' })
  @IsOptional()
  @IsString()
  entryUrl?: string;

  @ApiPropertyOptional({
    example: 4102,
    description: 'Node 课件本地监听端口；不填则由系统自动分配。',
  })
  @IsOptional()
  @IsInt()
  @Min(1024)
  @Max(65535)
  nodePort?: number;
}
