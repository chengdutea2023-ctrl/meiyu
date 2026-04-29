import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { AuthorizeQueryDto } from './dto/authorize-query.dto';
import { ExchangeCodeDto } from './dto/exchange-code.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtUserPayload } from './types/jwt-payload';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: '使用用户名/邮箱和密码登录平台' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @ApiOperation({ summary: '使用 refresh token 刷新平台 access token' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Get('authorize')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '为已登录用户生成业务应用一次性授权 code' })
  authorize(
    @CurrentUser() user: JwtUserPayload,
    @Query() query: AuthorizeQueryDto,
  ) {
    return this.authService.authorize(user, query);
  }

  @Post('token')
  @ApiOperation({ summary: '业务应用使用 code + appSecret 换取用户 token' })
  exchangeCode(@Body() dto: ExchangeCodeDto) {
    return this.authService.exchangeCode(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前登录用户上下文' })
  me(@CurrentUser() user: JwtUserPayload) {
    return this.authService.getCurrentUser(user);
  }
}

