import { All, Body, Controller, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtUserPayload } from '../auth/types/jwt-payload';
import { CourseRuntimeService } from './course-runtime.service';
import { CreateCourseLaunchDto } from './dto/create-course-launch.dto';
import { UpsertLaunchLearningRecordDto } from './dto/upsert-launch-learning-record.dto';
import { UpsertLearningRecordDto } from './dto/upsert-learning-record.dto';
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

  @All('proxy/:courseSlug')
  @ApiOperation({ summary: '代理 Node 课件根路径' })
  proxyCourseRoot(
    @Param('courseSlug') courseSlug: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    return this.courseRuntimeService.proxyNodeRuntime(courseSlug, '', request, response);
  }

  @All('proxy/:courseSlug/*path')
  @ApiOperation({ summary: '代理 Node 课件运行路径' })
  proxyCoursePath(
    @Param('courseSlug') courseSlug: string,
    @Param('path') coursePath: string | string[],
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const normalizedPath = Array.isArray(coursePath)
      ? coursePath.join('/')
      : coursePath;
    return this.courseRuntimeService.proxyNodeRuntime(
      courseSlug,
      normalizedPath,
      request,
      response,
    );
  }
}
