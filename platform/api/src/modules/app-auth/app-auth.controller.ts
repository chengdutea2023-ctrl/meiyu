import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserType } from '@prisma/client';
import { AppAuthService } from './app-auth.service';
import { SyncApplicationUserDto } from './dto/sync-application-user.dto';

@ApiTags('app-auth')
@ApiHeader({ name: 'X-App-Id', required: true })
@ApiHeader({ name: 'X-App-Secret', required: true })
@Controller('app-auth')
export class AppAuthController {
  constructor(private readonly appAuthService: AppAuthService) {}

  @Post('users/sync')
  @ApiOperation({
    summary: '已禁用：第三方应用不再允许同步创建平台用户',
    description:
      '旧的第三方同步注册模型已经废弃。教师和学生必须在业务底座注册，第三方应用只能通过 SSO 回调 token 或只读查询接口获取底座用户数据。',
  })
  syncUser(
    @Headers('x-app-id') appId: string | undefined,
    @Headers('x-app-secret') appSecret: string | undefined,
    @Body() dto: SyncApplicationUserDto,
  ) {
    return this.appAuthService.syncUser(appId, appSecret, dto);
  }

  @Get('users')
  @ApiOperation({
    summary: '业务应用读取授权范围内的平台用户',
    description:
      '第三方应用服务端用 appId/appSecret 拉取业务底座中的教师、学生和管理员数据。返回结果只包含该应用被后台授权的学校/班级范围，适合用于同步第三方本地业务库中的用户快照。',
  })
  findUsers(
    @Headers('x-app-id') appId: string | undefined,
    @Headers('x-app-secret') appSecret: string | undefined,
    @Query('userType') userType?: UserType,
    @Query('organizationId') organizationId?: string,
    @Query('classId') classId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.appAuthService.findUsers(appId, appSecret, {
      userType,
      organizationId,
      classId,
      limit,
    });
  }

  @Get('users/by-email')
  @ApiOperation({
    summary: '业务应用按 email 查询已绑定的平台用户上下文',
    description:
      '第三方应用按 email 查询单个底座用户。用户必须存在、已审核、未禁用，并且处于该应用的授权学校/班级范围内。',
  })
  findByEmail(
    @Headers('x-app-id') appId: string | undefined,
    @Headers('x-app-secret') appSecret: string | undefined,
    @Query('email') email: string | undefined,
  ) {
    return this.appAuthService.findByEmail(appId, appSecret, email);
  }
}
