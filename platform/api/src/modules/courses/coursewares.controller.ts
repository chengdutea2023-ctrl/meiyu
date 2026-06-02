import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { CoursesService } from './courses.service';
import { DeployCourseRuntimeDto } from './dto/deploy-course-runtime.dto';
import { UpdateCoursewareStatusDto } from './dto/update-courseware-status.dto';
import { UpdateCoursewareDto } from './dto/update-courseware.dto';
import { UploadCourseFilesDto } from './dto/upload-course-files.dto';
import { UploadCourseZipDto } from './dto/upload-course-zip.dto';

@ApiTags('coursewares')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('coursewares')
export class CoursewaresController {
  constructor(private readonly coursesService: CoursesService) {}

  @Patch(':coursewareId')
  @ApiOperation({ summary: '管理员更新课件资料' })
  updateCourseware(
    @Param('coursewareId') coursewareId: string,
    @Body() dto: UpdateCoursewareDto,
  ) {
    return this.coursesService.updateCourseware(coursewareId, dto);
  }

  @Patch(':coursewareId/status')
  @ApiOperation({ summary: '管理员发布、下架或归档课件' })
  updateCoursewareStatus(
    @Param('coursewareId') coursewareId: string,
    @Body() dto: UpdateCoursewareStatusDto,
  ) {
    return this.coursesService.updateCoursewareStatus(coursewareId, dto.status);
  }

  @Post(':coursewareId/files')
  @ApiOperation({ summary: '管理员上传课件文件到课件运行目录' })
  uploadFiles(
    @Param('coursewareId') coursewareId: string,
    @Body() dto: UploadCourseFilesDto,
  ) {
    return this.coursesService.uploadCoursewareFiles(coursewareId, dto);
  }

  @Post(':coursewareId/zip')
  @ApiOperation({ summary: '管理员上传课件 ZIP 并校验 manifest' })
  uploadZip(
    @Param('coursewareId') coursewareId: string,
    @Body() dto: UploadCourseZipDto,
  ) {
    return this.coursesService.uploadCoursewareZip(coursewareId, dto);
  }

  @Get(':coursewareId/manifest')
  @ApiOperation({ summary: '管理员查看课件 manifest 与校验结果' })
  getManifest(@Param('coursewareId') coursewareId: string) {
    return this.coursesService.getCoursewareManifest(coursewareId);
  }

  @Get(':coursewareId/runtime-status')
  @ApiOperation({ summary: '管理员查看课件部署状态' })
  getRuntimeStatus(@Param('coursewareId') coursewareId: string) {
    return this.coursesService.getCoursewareRuntimeStatus(coursewareId);
  }

  @Post(':coursewareId/deploy')
  @ApiOperation({ summary: '管理员一键部署 Node 课件' })
  deployRuntime(
    @Param('coursewareId') coursewareId: string,
    @Body() dto: DeployCourseRuntimeDto,
  ) {
    return this.coursesService.deployCoursewareRuntime(coursewareId, dto);
  }

  @Post(':coursewareId/restart')
  @ApiOperation({ summary: '管理员重启 Node 课件' })
  restartRuntime(
    @Param('coursewareId') coursewareId: string,
    @Body() dto: DeployCourseRuntimeDto,
  ) {
    return this.coursesService.restartCoursewareRuntime(coursewareId, dto);
  }
}
