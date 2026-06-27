import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ReplaceStudentMembershipDto {
  @ApiProperty({ example: 'cl_school_123' })
  @IsString()
  organizationId!: string;

  @ApiPropertyOptional({ example: 'cl_class_123' })
  @IsOptional()
  @IsString()
  classId?: string;
}
