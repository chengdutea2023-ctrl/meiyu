import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtUserPayload } from '../auth/types/jwt-payload';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentScheduleDto } from './dto/update-assignment-schedule.dto';
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
  @ApiOperation({ summary: '已停用：课程任务由平台管理员布置' })
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

  @Patch('teacher/assignments/:assignmentId/schedule')
  @ApiOperation({ summary: '教师调整自己任务的计划上课时间' })
  updateTeacherAssignmentSchedule(
    @CurrentUser() user: JwtUserPayload,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: UpdateAssignmentScheduleDto,
  ) {
    return this.portalService.updateTeacherAssignmentSchedule(user.sub, assignmentId, dto);
  }

  @Patch('teacher/assignments/:assignmentId/open')
  @ApiOperation({ summary: '教师开始或重新开始课堂' })
  openTeacherAssignment(
    @CurrentUser() user: JwtUserPayload,
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.portalService.openTeacherAssignment(user.sub, assignmentId);
  }

  @Patch('teacher/assignments/:assignmentId/close')
  @ApiOperation({ summary: '教师结束课堂' })
  closeTeacherAssignment(
    @CurrentUser() user: JwtUserPayload,
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.portalService.closeTeacherAssignment(user.sub, assignmentId);
  }

  @Get('teacher/assignments/:assignmentId/coursewares')
  @ApiOperation({ summary: '教师查看本次排课下每个课件的开放状态' })
  teacherAssignmentCoursewares(
    @CurrentUser() user: JwtUserPayload,
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.portalService.teacherAssignmentCoursewares(user.sub, assignmentId);
  }

  @Patch('teacher/assignments/:assignmentId/coursewares/:coursewareId/open')
  @ApiOperation({ summary: '教师开放本次排课下的单个课件' })
  openTeacherAssignmentCourseware(
    @CurrentUser() user: JwtUserPayload,
    @Param('assignmentId') assignmentId: string,
    @Param('coursewareId') coursewareId: string,
  ) {
    return this.portalService.openTeacherAssignmentCourseware(
      user.sub,
      assignmentId,
      coursewareId,
    );
  }

  @Patch('teacher/assignments/:assignmentId/coursewares/:coursewareId/close')
  @ApiOperation({ summary: '教师关闭本次排课下的单个课件' })
  closeTeacherAssignmentCourseware(
    @CurrentUser() user: JwtUserPayload,
    @Param('assignmentId') assignmentId: string,
    @Param('coursewareId') coursewareId: string,
  ) {
    return this.portalService.closeTeacherAssignmentCourseware(
      user.sub,
      assignmentId,
      coursewareId,
    );
  }

  @Get('teacher/assignments/:assignmentId/coursewares/:coursewareId/records')
  @ApiOperation({ summary: '教师查看某次排课下单个课件的学生提交数据' })
  teacherAssignmentCoursewareRecords(
    @CurrentUser() user: JwtUserPayload,
    @Param('assignmentId') assignmentId: string,
    @Param('coursewareId') coursewareId: string,
    @Query('sort') sort?: string,
  ) {
    return this.portalService.teacherAssignmentCoursewareRecords(
      user.sub,
      assignmentId,
      coursewareId,
      sort,
    );
  }

  @Get('teacher/learning-records')
  @ApiOperation({ summary: '教师查看自己班级的学习记录' })
  teacherLearningRecords(
    @CurrentUser() user: JwtUserPayload,
    @Query('classId') classId?: string,
    @Query('assignmentId') assignmentId?: string,
    @Query('courseId') courseId?: string,
    @Query('coursewareId') coursewareId?: string,
    @Query('sort') sort?: string,
  ) {
    return this.portalService.teacherLearningRecords(user.sub, {
      classId,
      assignmentId,
      courseId,
      coursewareId,
      sort,
    });
  }

  @Get('teacher/learning-records/:recordId')
  @ApiOperation({ summary: '教师查看单个学生提交详情' })
  teacherLearningRecord(
    @CurrentUser() user: JwtUserPayload,
    @Param('recordId') recordId: string,
  ) {
    return this.portalService.teacherLearningRecord(user.sub, recordId);
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

  @Get('student/learning-records/:recordId')
  @ApiOperation({ summary: '学生查看自己的单个课件学习记录详情' })
  studentLearningRecord(
    @CurrentUser() user: JwtUserPayload,
    @Param('recordId') recordId: string,
  ) {
    return this.portalService.studentLearningRecord(user.sub, recordId);
  }
}
