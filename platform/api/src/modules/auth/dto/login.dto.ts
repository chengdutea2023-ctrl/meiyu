import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@example.com' })
  @IsString({ message: '请输入用户名或邮箱' })
  usernameOrEmail!: string;

  @ApiProperty({ example: 'ChangeMe123!' })
  @IsString({ message: '请输入密码' })
  @MinLength(8, { message: '密码至少需要 8 位' })
  password!: string;
}
