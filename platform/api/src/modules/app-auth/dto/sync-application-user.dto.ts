import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class SyncApplicationUserDto {
  @ApiProperty({ example: 'teacher@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'a_10001' })
  @IsString()
  @MinLength(1)
  externalUserId!: string;

  @ApiPropertyOptional({ example: 'teacher01' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ example: '张老师' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({ example: '6-12岁', description: '业务应用采集的年龄段' })
  @IsOptional()
  @IsString()
  ageBand?: string;

  @ApiPropertyOptional({ example: '普通话练习智能体', description: '用户所属或当前选择的智能体名称' })
  @IsOptional()
  @IsString()
  agentName?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  emailVerified?: boolean;
}
