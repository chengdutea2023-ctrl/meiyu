import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { JwtUserPayload } from '../auth/types/jwt-payload';
import { CoursesService } from './courses.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { CreateCoursewareDto } from './dto/create-courseware.dto';
import { UpdateCourseStatusDto } from './dto/update-course-status.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { UpdateCoursewareOrderDto } from './dto/update-courseware-order.dto';

@ApiTags('courses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Post()
  @ApiOperation({ summary: '管理员创建课程容器' })
  create(@CurrentUser() user: JwtUserPayload, @Body() dto: CreateCourseDto) {
    return this.coursesService.create(dto, user.sub);
  }

  @Get()
  @ApiOperation({ summary: '管理员查看课程列表' })
  findMany() {
    return this.coursesService.findMany();
  }

  @Get(':courseId')
  @ApiOperation({ summary: '管理员查看课程详情' })
  findOne(@Param('courseId') courseId: string) {
    return this.coursesService.findById(courseId);
  }

  @Patch(':courseId')
  @ApiOperation({ summary: '管理员更新课程资料' })
  update(@Param('courseId') courseId: string, @Body() dto: UpdateCourseDto) {
    return this.coursesService.update(courseId, dto);
  }

  @Patch(':courseId/status')
  @ApiOperation({ summary: '管理员发布、下架或归档课程' })
  updateStatus(
    @Param('courseId') courseId: string,
    @Body() dto: UpdateCourseStatusDto,
  ) {
    return this.coursesService.updateStatus(courseId, dto.status);
  }

  @Delete(':courseId')
  @ApiOperation({ summary: '管理员将课程移入回收站，并同步归档其课件' })
  moveToRecycleBin(@Param('courseId') courseId: string) {
    return this.coursesService.moveCourseToRecycleBin(courseId);
  }

  @Patch(':courseId/restore')
  @ApiOperation({ summary: '管理员从回收站恢复课程' })
  restore(@Param('courseId') courseId: string) {
    return this.coursesService.restoreCourse(courseId);
  }

  @Delete(':courseId/permanent')
  @ApiOperation({ summary: '管理员永久删除回收站中的课程及其课件' })
  permanentlyDelete(@Param('courseId') courseId: string) {
    return this.coursesService.permanentlyDeleteCourse(courseId);
  }

  @Post(':courseId/coursewares')
  @ApiOperation({ summary: '管理员在课程下创建课件登记' })
  createCourseware(
    @Param('courseId') courseId: string,
    @Body() dto: CreateCoursewareDto,
  ) {
    return this.coursesService.createCourseware(courseId, dto);
  }

  @Get(':courseId/coursewares')
  @ApiOperation({ summary: '管理员查看课程下课件列表' })
  listCoursewares(@Param('courseId') courseId: string) {
    return this.coursesService.listCoursewares(courseId);
  }

  @Patch(':courseId/coursewares/order')
  @ApiOperation({ summary: '管理员调整课程下课件顺序' })
  updateCoursewareOrder(
    @Param('courseId') courseId: string,
    @Body() dto: UpdateCoursewareOrderDto,
  ) {
    return this.coursesService.updateCoursewareOrder(courseId, dto);
  }
}
