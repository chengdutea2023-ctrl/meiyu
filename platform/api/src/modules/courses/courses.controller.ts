import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { JwtUserPayload } from '../auth/types/jwt-payload';
import { CoursesService } from './courses.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { DeployCourseRuntimeDto } from './dto/deploy-course-runtime.dto';
import { UpdateCourseStatusDto } from './dto/update-course-status.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { UploadCourseFilesDto } from './dto/upload-course-files.dto';
import { UploadCourseZipDto } from './dto/upload-course-zip.dto';

@ApiTags('courses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Post()
  @ApiOperation({ summary: '管理员创建课程/课件登记' })
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

  @Post(':courseId/files')
  @ApiOperation({ summary: '管理员上传课程/课件文件到课程运行目录' })
  uploadFiles(
    @Param('courseId') courseId: string,
    @Body() dto: UploadCourseFilesDto,
  ) {
    return this.coursesService.uploadFiles(courseId, dto);
  }

  @Post(':courseId/zip')
  @ApiOperation({ summary: '管理员上传课程/课件 ZIP 并校验 manifest' })
  uploadZip(
    @Param('courseId') courseId: string,
    @Body() dto: UploadCourseZipDto,
  ) {
    return this.coursesService.uploadZip(courseId, dto);
  }

  @Get(':courseId/manifest')
  @ApiOperation({ summary: '管理员查看课程 manifest 与校验结果' })
  getManifest(@Param('courseId') courseId: string) {
    return this.coursesService.getManifest(courseId);
  }

  @Get(':courseId/runtime-status')
  @ApiOperation({ summary: '管理员查看课件部署状态' })
  getRuntimeStatus(@Param('courseId') courseId: string) {
    return this.coursesService.getRuntimeStatus(courseId);
  }

  @Post(':courseId/deploy')
  @ApiOperation({ summary: '管理员一键部署 Node 课件' })
  deployRuntime(
    @Param('courseId') courseId: string,
    @Body() dto: DeployCourseRuntimeDto,
  ) {
    return this.coursesService.deployRuntime(courseId, dto);
  }

  @Post(':courseId/restart')
  @ApiOperation({ summary: '管理员重启 Node 课件' })
  restartRuntime(
    @Param('courseId') courseId: string,
    @Body() dto: DeployCourseRuntimeDto,
  ) {
    return this.coursesService.restartRuntime(courseId, dto);
  }
}
