import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { CoursesService } from './courses.service';
import { CreateAdminCourseAssignmentDto } from './dto/create-admin-course-assignment.dto';

@ApiTags('course-assignments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('course-assignments')
export class CourseAssignmentsController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  @ApiOperation({ summary: '管理员查看课程布置任务列表' })
  findMany() {
    return this.coursesService.listAssignments();
  }

  @Post()
  @ApiOperation({ summary: '管理员把已发布课程布置给班级' })
  create(@Body() dto: CreateAdminCourseAssignmentDto) {
    return this.coursesService.createAssignment(dto);
  }
}
