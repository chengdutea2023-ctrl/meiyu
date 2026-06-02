import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class VerifyCourseLaunchDto {
  @ApiProperty({ example: 'launch-token' })
  @IsString()
  launchToken!: string;
}
