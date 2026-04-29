import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class AddOrganizationMemberDto {
  @ApiProperty()
  @IsString()
  userId!: string;

  @ApiPropertyOptional({ description: 'Role id，第一阶段可为空' })
  @IsOptional()
  @IsString()
  roleId?: string;
}

