import { All, Body, Controller, Get, Next, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NextFunction } from 'express';
import { Request, Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtUserPayload } from '../auth/types/jwt-payload';
import { CourseRuntimeService } from './course-runtime.service';
import { CreateCourseLaunchDto } from './dto/create-course-launch.dto';
import { UpsertLaunchLearningRecordDto } from './dto/upsert-launch-learning-record.dto';
import { UpsertLearningRecordDto } from './dto/upsert-learning-record.dto';
import { UploadLaunchArtifactDto } from './dto/upload-launch-artifact.dto';
import { VerifyCourseLaunchDto } from './dto/verify-course-launch.dto';

@ApiTags('course-runtime')
@Controller('course-runtime')
export class CourseRuntimeController {
  constructor(private readonly courseRuntimeService: CourseRuntimeService) {}

  @Post('launch')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '学生从门户启动课件并生成短期启动凭证' })
  createLaunch(
    @CurrentUser() user: JwtUserPayload,
    @Body() dto: CreateCourseLaunchDto,
  ) {
    return this.courseRuntimeService.createLaunch(user.sub, dto);
  }

  @Post('launch/verify')
  @ApiOperation({ summary: '课件使用启动凭证换取学生、课程、任务上下文' })
  verifyLaunch(@Body() dto: VerifyCourseLaunchDto) {
    return this.courseRuntimeService.verifyLaunch(dto.launchToken);
  }

  @Post('launch/records')
  @ApiOperation({ summary: '课件使用启动凭证上报学习记录和成绩' })
  upsertLaunchRecord(@Body() dto: UpsertLaunchLearningRecordDto) {
    return this.courseRuntimeService.upsertLaunchRecord(dto);
  }

  @Post('launch/artifacts')
  @ApiOperation({ summary: '课件使用启动凭证上传图片、录音、视频或其他作品文件' })
  uploadLaunchArtifact(@Body() dto: UploadLaunchArtifactDto) {
    return this.courseRuntimeService.uploadLaunchArtifact(dto);
  }

  @Get('artifacts/:artifactId/file')
  @ApiOperation({ summary: '读取课件学习记录附件文件' })
  artifactFile(
    @Param('artifactId') artifactId: string,
    @Res() response: Response,
  ) {
    return this.courseRuntimeService.sendArtifactFile(artifactId, response);
  }

  @Post('records')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '课件上报学生学习开始、进度、完成和成绩' })
  upsertRecord(
    @CurrentUser() user: JwtUserPayload,
    @Body() dto: UpsertLearningRecordDto,
  ) {
    return this.courseRuntimeService.upsertRecord(user.sub, dto);
  }

  @All('proxy/:courseSlug/:coursewareSlug')
  @ApiOperation({ summary: '代理 Node 课件根路径' })
  proxyCourseRoot(
    @Param('courseSlug') courseSlug: string,
    @Param('coursewareSlug') coursewareSlug: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    return this.courseRuntimeService.proxyNodeRuntime(
      courseSlug,
      coursewareSlug,
      '',
      request,
      response,
    );
  }

  @All('proxy/:courseSlug/:coursewareSlug/*path')
  @ApiOperation({ summary: '代理 Node 课件运行路径' })
  proxyCoursePath(
    @Param('courseSlug') courseSlug: string,
    @Param('coursewareSlug') coursewareSlug: string,
    @Param('path') coursePath: string | string[],
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const normalizedPath = Array.isArray(coursePath)
      ? coursePath.join('/')
      : coursePath;
    return this.courseRuntimeService.proxyNodeRuntime(
      courseSlug,
      coursewareSlug,
      normalizedPath,
      request,
      response,
    );
  }
}

@Controller()
export class CourseRuntimePublicController {
  constructor(private readonly courseRuntimeService: CourseRuntimeService) {}

  @All(':courseSlug/:coursewareSlug')
  serveCoursewareRoot(
    @Param('courseSlug') courseSlug: string,
    @Param('coursewareSlug') coursewareSlug: string,
    @Req() request: Request,
    @Res() response: Response,
    @Next() next: NextFunction,
  ) {
    if (this.shouldPassThrough(courseSlug)) {
      return next();
    }

    return this.courseRuntimeService.serveCoursewareRuntime(
      courseSlug,
      coursewareSlug,
      '',
      request,
      response,
    );
  }

  @All(':courseSlug/:coursewareSlug/*path')
  serveCoursewarePath(
    @Param('courseSlug') courseSlug: string,
    @Param('coursewareSlug') coursewareSlug: string,
    @Param('path') coursePath: string | string[],
    @Req() request: Request,
    @Res() response: Response,
    @Next() next: NextFunction,
  ) {
    if (this.shouldPassThrough(courseSlug)) {
      return next();
    }

    const normalizedPath = Array.isArray(coursePath)
      ? coursePath.join('/')
      : coursePath;
    return this.courseRuntimeService.serveCoursewareRuntime(
      courseSlug,
      coursewareSlug,
      normalizedPath,
      request,
      response,
    );
  }

  private shouldPassThrough(courseSlug: string) {
    return ['api', 'sso', 'register', 'registration'].includes(courseSlug);
  }
}
