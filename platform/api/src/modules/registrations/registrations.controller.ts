import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RegisterStudentDto } from './dto/register-student.dto';
import { RegisterTeacherDto } from './dto/register-teacher.dto';
import { RegistrationsService } from './registrations.service';

@ApiTags('registrations')
@Controller('registrations')
export class RegistrationsController {
  constructor(private readonly registrationsService: RegistrationsService) {}

  @Post('students')
  @ApiOperation({
    summary: '学生在业务底座公开注册',
    description:
      '注册入口归业务底座所有。第三方应用不要在自己的系统内注册学生，也不要保存平台密码。学生注册成功后可通过 SSO 进入第三方应用，第三方应用通过 token 或 app-auth 只读接口获取学生资料。',
  })
  registerStudent(@Body() dto: RegisterStudentDto) {
    return this.registrationsService.registerStudent(dto);
  }

  @Post('teachers')
  @ApiOperation({
    summary: '教师在业务底座公开注册，默认进入待审核',
    description:
      '注册入口归业务底座所有。教师注册后默认 PENDING，需平台管理员审核通过后才能登录第三方应用。第三方应用通过 SSO 或 app-auth 只读接口获取已审核教师资料。',
  })
  registerTeacher(@Body() dto: RegisterTeacherDto) {
    return this.registrationsService.registerTeacher(dto);
  }
}
