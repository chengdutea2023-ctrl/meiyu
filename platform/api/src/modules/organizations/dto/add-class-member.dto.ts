import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClassMemberRole } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class AddClassMemberDto {
  @ApiProperty()
  @IsString()
  userId!: string;

  @ApiPropertyOptional({ enum: ClassMemberRole, default: ClassMemberRole.STUDENT })
  @IsOptional()
  @IsEnum(ClassMemberRole)
  role?: ClassMemberRole;
}

