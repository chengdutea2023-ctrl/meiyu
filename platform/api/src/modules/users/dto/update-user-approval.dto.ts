import { ApiProperty } from '@nestjs/swagger';
import { UserApprovalStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateUserApprovalDto {
  @ApiProperty({ enum: UserApprovalStatus })
  @IsEnum(UserApprovalStatus)
  approvalStatus!: UserApprovalStatus;
}
