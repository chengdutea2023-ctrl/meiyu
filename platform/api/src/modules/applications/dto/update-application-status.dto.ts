import { ApiProperty } from '@nestjs/swagger';
import { ApplicationStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateApplicationStatusDto {
  @ApiProperty({ enum: ApplicationStatus })
  @IsEnum(ApplicationStatus)
  status!: ApplicationStatus;
}

