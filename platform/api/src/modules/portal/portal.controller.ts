import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtUserPayload } from '../auth/types/jwt-payload';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { PortalService } from './portal.service';

@ApiTags('portal')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('portal')
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  @Get('me')
  @ApiOperation({ summary: '教师/学生门户获取当前用户上下文' })
  me(@CurrentUser() user: JwtUserPayload) {
    return this.portalService.me(user.sub);
  }

  @Get('teacher/classes')
  @ApiOperation({ summary: '教师查看自己管理的班级' })
  teacherClasses(@CurrentUser() user: JwtUserPayload) {
    return this.portalService.teacherClasses(user.sub);
  }

  @Get('teacher/classes/:classId/students')
  @ApiOperation({ summary: '教师查看自己班级中的学生' })
  teacherClassStudents(
    @CurrentUser() user: JwtUserPayload,
    @Param('classId') classId: string,
  ) {
    return this.portalService.teacherClassStudents(user.sub, classId);
  }

  @Get('teacher/courses')
  @ApiOperation({ summary: '教师查看可布置课程' })
  teacherCourses(@CurrentUser() user: JwtUserPayload) {
    return this.portalService.teacherCourses(user.sub);
  }

  @Post('teacher/assignments')
  @ApiOperation({ summary: '教师给自己班级布置课程任务' })
  createTeacherAssignment(
    @CurrentUser() user: JwtUserPayload,
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.portalService.createTeacherAssignment(user.sub, dto);
  }

  @Get('teacher/assignments')
  @ApiOperation({ summary: '教师查看自己布置的任务' })
  teacherAssignments(@CurrentUser() user: JwtUserPayload) {
    return this.portalService.teacherAssignments(user.sub);
  }

  @Get('teacher/learning-records')
  @ApiOperation({ summary: '教师查看自己班级的学习记录' })
  teacherLearningRecords(
    @CurrentUser() user: JwtUserPayload,
    @Query('classId') classId?: string,
    @Query('assignmentId') assignmentId?: string,
    @Query('courseId') courseId?: string,
  ) {
    return this.portalService.teacherLearningRecords(user.sub, {
      classId,
      assignmentId,
      courseId,
    });
  }

  @Get('student/courses')
  @ApiOperation({ summary: '学生查看自己班级可学习课程' })
  studentCourses(@CurrentUser() user: JwtUserPayload) {
    return this.portalService.studentCourses(user.sub);
  }

  @Get('student/assignments')
  @ApiOperation({ summary: '学生查看自己的课程任务' })
  studentAssignments(@CurrentUser() user: JwtUserPayload) {
    return this.portalService.studentAssignments(user.sub);
  }

  @Get('student/learning-records')
  @ApiOperation({ summary: '学生查看自己的学习记录' })
  studentLearningRecords(@CurrentUser() user: JwtUserPayload) {
    return this.portalService.studentLearningRecords(user.sub);
  }
}
