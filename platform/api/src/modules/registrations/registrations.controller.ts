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
  @ApiOperation({ summary: '学生在业务底座公开注册' })
  registerStudent(@Body() dto: RegisterStudentDto) {
    return this.registrationsService.registerStudent(dto);
  }

  @Post('teachers')
  @ApiOperation({ summary: '教师在业务底座公开注册，默认进入待审核' })
  registerTeacher(@Body() dto: RegisterTeacherDto) {
    return this.registrationsService.registerTeacher(dto);
  }
}
