import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppAuthService } from './app-auth.service';
import { SyncApplicationUserDto } from './dto/sync-application-user.dto';

@ApiTags('app-auth')
@ApiHeader({ name: 'X-App-Id', required: true })
@ApiHeader({ name: 'X-App-Secret', required: true })
@Controller('app-auth')
export class AppAuthController {
  constructor(private readonly appAuthService: AppAuthService) {}

  @Post('users/sync')
  @ApiOperation({ summary: '业务应用同步本地用户到底座' })
  syncUser(
    @Headers('x-app-id') appId: string | undefined,
    @Headers('x-app-secret') appSecret: string | undefined,
    @Body() dto: SyncApplicationUserDto,
  ) {
    return this.appAuthService.syncUser(appId, appSecret, dto);
  }

  @Get('users/by-email')
  @ApiOperation({ summary: '业务应用按 email 查询已绑定的平台用户上下文' })
  findByEmail(
    @Headers('x-app-id') appId: string | undefined,
    @Headers('x-app-secret') appSecret: string | undefined,
    @Query('email') email: string | undefined,
  ) {
    return this.appAuthService.findByEmail(appId, appSecret, email);
  }
}
