import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterStudentDto {
  @ApiProperty({ example: 'student@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'ChangeMe123!' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: '学生姓名' })
  @IsString()
  displayName!: string;

  @ApiProperty({ example: '9-12岁' })
  @IsString()
  ageBand!: string;
}
