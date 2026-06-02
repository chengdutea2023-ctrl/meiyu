import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';

export class DeployCourseRuntimeDto {
  @ApiPropertyOptional({
    example: {
      DATABASE_URL: 'postgresql://course_user:course_password@127.0.0.1:5432/course_db',
    },
    description: 'Node 课件运行时环境变量。敏感值只用于当前部署，不会返回给前端。',
  })
  @IsOptional()
  @IsObject()
  env?: Record<string, string>;
}
