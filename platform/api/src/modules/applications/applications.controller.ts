import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationAccessScopeDto } from './dto/update-application-access-scope.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';

@ApiTags('applications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  @ApiOperation({ summary: '管理员登记业务应用，返回一次性 appSecret' })
  create(@Body() dto: CreateApplicationDto) {
    return this.applicationsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '管理员查看业务应用列表' })
  findMany() {
    return this.applicationsService.findMany();
  }

  @Get(':appId/access-scope')
  @ApiOperation({ summary: '管理员查看业务应用可读取的学校/班级范围' })
  findAccessScope(@Param('appId') appId: string) {
    return this.applicationsService.findAccessScope(appId);
  }

  @Patch(':appId/access-scope')
  @ApiOperation({ summary: '管理员设置业务应用可读取的学校/班级范围' })
  updateAccessScope(
    @Param('appId') appId: string,
    @Body() dto: UpdateApplicationAccessScopeDto,
  ) {
    return this.applicationsService.updateAccessScope(appId, dto);
  }

  @Get(':appId')
  @ApiOperation({ summary: '管理员查看业务应用详情' })
  findOne(@Param('appId') appId: string) {
    return this.applicationsService.findByAppId(appId);
  }

  @Get(':appId/users')
  @ApiOperation({ summary: '管理员查看业务应用授权范围内的平台用户' })
  findUsers(
    @Param('appId') appId: string,
    @Query('userType') userType?: UserType,
  ) {
    return this.applicationsService.findUsers(appId, userType);
  }

  @Patch(':appId/status')
  @ApiOperation({ summary: '管理员启用或禁用业务应用' })
  updateStatus(
    @Param('appId') appId: string,
    @Body() dto: UpdateApplicationStatusDto,
  ) {
    return this.applicationsService.updateStatus(appId, dto.status);
  }
}
