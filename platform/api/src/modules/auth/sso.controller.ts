import {
  Body,
  Controller,
  Get,
  Query,
  Res,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { RegistrationsService } from '../registrations/registrations.service';
import { AuthService } from './auth.service';
import { AuthorizeQueryDto, OptionalAuthorizeQueryDto } from './dto/authorize-query.dto';
import { LoginDto } from './dto/login.dto';

const SESSION_COOKIE = 'jiaoxue_platform_session';

interface SsoLoginBody extends LoginDto {
  appId: string;
  redirectUri: string;
  state?: string;
  scope?: string;
}

interface SsoRegisterBody {
  appId: string;
  redirectUri: string;
  state?: string;
  scope?: string;
  email: string;
  password: string;
  displayName: string;
  ageBand?: string;
}

interface SsoForgotPasswordBody {
  email: string;
  appId?: string;
  redirectUri?: string;
  state?: string;
  scope?: string;
}

interface SsoResetPasswordBody {
  token: string;
  password: string;
}

@ApiExcludeController()
@Controller('sso')
export class SsoController {
  constructor(
    private readonly authService: AuthService,
    private readonly registrationsService: RegistrationsService,
    private readonly config: ConfigService,
  ) {}

  @Get('authorize')
  async authorize(
    @Req() request: Request,
    @Res() response: Response,
    @Query() query: AuthorizeQueryDto,
  ) {
    const token = this.readCookie(request, SESSION_COOKIE);

    if (!token) {
      return this.renderLogin(response, query);
    }

    try {
      const user = this.authService.verifyAccessToken(token);
      const result = await this.authService.authorize(user, query);
      return response.redirect(result.redirectTo);
    } catch {
      response.clearCookie(SESSION_COOKIE);
      return this.renderLogin(response, query, '登录状态已过期，请重新登录');
    }
  }

  @Post('login')
  async login(@Res() response: Response, @Body() body: SsoLoginBody) {
    const query: AuthorizeQueryDto = {
      appId: body.appId,
      redirectUri: body.redirectUri,
      state: body.state,
      scope: body.scope,
    };

    try {
      return await this.loginAndRedirect(response, query, body.usernameOrEmail, body.password);
    } catch (error) {
      const message =
        error instanceof UnauthorizedException
          ? '账号或密码错误，或账号尚未通过审核'
          : '无法完成登录，请检查业务应用配置';

      return this.renderLogin(response, query, message, body.usernameOrEmail);
    }
  }

  @Get('forgot-password')
  forgotPasswordPage(
    @Res() response: Response,
    @Query() query: OptionalAuthorizeQueryDto,
  ) {
    return this.renderForgotPassword(response, query);
  }

  @Post('forgot-password')
  async forgotPassword(
    @Res() response: Response,
    @Body() body: SsoForgotPasswordBody,
  ) {
    const query = this.optionalBodyToAuthorizeQuery(body);
    const result = await this.authService.requestPasswordReset(body.email);
    const devResetUrl = 'resetUrl' in result ? result.resetUrl : undefined;

    return response.status(200).type('html').send(
      this.page(
        '密码找回邮件已发送',
        `<section class="login success">
          <div class="success-mark">✓</div>
          <h1>请检查邮箱</h1>
          <p class="subtitle">如果这个邮箱属于老师或学生账号，系统会发送一封密码重置邮件。链接有效期为 30 分钟。</p>
          ${devResetUrl ? `<a class="dev-link" href="${this.escape(devResetUrl)}">开发测试：打开重置链接</a>` : ''}
          ${query ? `<a class="button-link" href="/sso/authorize?${this.escape(this.queryString(query))}">返回登录</a>` : ''}
        </section>`,
      ),
    );
  }

  @Get('reset-password')
  resetPasswordPage(
    @Res() response: Response,
    @Query('token') token?: string,
  ) {
    return this.renderResetPassword(response, token ?? '');
  }

  @Post('reset-password')
  async resetPassword(
    @Res() response: Response,
    @Body() body: SsoResetPasswordBody,
  ) {
    try {
      await this.authService.resetPassword(body.token, body.password);

      return response.status(200).type('html').send(
        this.page(
          '密码已重置',
          `<section class="login success">
            <div class="success-mark">✓</div>
            <h1>密码已重置</h1>
            <p class="subtitle">请返回老师后台或学生后台，用新密码重新登录。</p>
            <div class="portal-links">
              <a href="${this.escape(this.teacherPortalBaseUrl())}">教师后台</a>
              <a href="${this.escape(this.defaultStudentPortalUrl())}">学生后台</a>
            </div>
          </section>`,
        ),
      );
    } catch {
      return this.renderResetPassword(
        response,
        body.token,
        '重置链接无效或已过期，请重新申请找回密码。',
      );
    }
  }

  @Get('register/student')
  registerStudentPage(
    @Res() response: Response,
    @Query() query: AuthorizeQueryDto,
  ) {
    return this.renderRegistration(response, query, 'student');
  }

  @Post('register/student')
  async registerStudent(
    @Res() response: Response,
    @Body() body: SsoRegisterBody,
  ) {
    const query = this.bodyToAuthorizeQuery(body);

    try {
      await this.registrationsService.registerStudent({
        email: body.email,
        password: body.password,
        displayName: body.displayName,
        ageBand: body.ageBand ?? '',
      });
      const loginResult = await this.loginAndSetSession(response, body.email, body.password);
      return response.redirect(
        this.studentPortalRedirectUrl(loginResult.accessToken, loginResult.refreshToken),
      );
    } catch {
      return this.renderRegistration(
        response,
        query,
        'student',
        '学生注册失败，请检查邮箱是否已存在，以及密码是否至少 8 位。',
        body,
      );
    }
  }

  @Get('register/teacher')
  registerTeacherPage(
    @Res() response: Response,
    @Query() query: AuthorizeQueryDto,
  ) {
    return this.renderRegistration(response, query, 'teacher');
  }

  @Post('register/teacher')
  async registerTeacher(
    @Res() response: Response,
    @Body() body: SsoRegisterBody,
  ) {
    const query = this.bodyToAuthorizeQuery(body);

    try {
      await this.registrationsService.registerTeacher({
        email: body.email,
        password: body.password,
        displayName: body.displayName,
      });

      return response.status(200).type('html').send(
        this.page(
          '教师注册已提交',
          `<section class="login">
            <h1>教师注册已提交</h1>
            <p class="subtitle">教师账号需要平台管理员审核。审核通过后，你可以使用这个邮箱和密码登录教师后台。</p>
            <a class="button-link" href="${this.escape(this.teacherPortalBaseUrl())}">进入教师后台</a>
          </section>`,
        ),
      );
    } catch {
      return this.renderRegistration(
        response,
        query,
        'teacher',
        '教师注册失败，请检查邮箱是否已存在，以及密码是否至少 8 位。',
        body,
      );
    }
  }

  @Post('logout')
  logout(@Res() response: Response, @Body('returnTo') returnTo?: string) {
    response.clearCookie(SESSION_COOKIE, { path: '/sso' });
    return response.redirect(returnTo || '/sso/signed-out');
  }

  @Get('signed-out')
  signedOut(@Res() response: Response) {
    return response
      .status(200)
      .type('html')
      .send(this.page('已退出登录', '<p>你已经退出统一登录。</p>'));
  }

  private readCookie(request: Request, name: string): string | undefined {
    const header = request.headers.cookie;

    if (!header) {
      return undefined;
    }

    const cookies = header.split(';').map((part) => part.trim());
    const target = cookies.find((part) => part.startsWith(`${name}=`));

    if (!target) {
      return undefined;
    }

    return decodeURIComponent(target.slice(name.length + 1));
  }

  private bodyToAuthorizeQuery(body: SsoRegisterBody): AuthorizeQueryDto {
    return {
      appId: body.appId,
      redirectUri: body.redirectUri,
      state: body.state,
      scope: body.scope,
    };
  }

  private optionalBodyToAuthorizeQuery(
    body: SsoForgotPasswordBody,
  ): AuthorizeQueryDto | undefined {
    if (!body.appId || !body.redirectUri) {
      return undefined;
    }

    return {
      appId: body.appId,
      redirectUri: body.redirectUri,
      state: body.state,
      scope: body.scope,
    };
  }

  private async loginAndRedirect(
    response: Response,
    query: AuthorizeQueryDto,
    usernameOrEmail: string,
    password: string,
  ) {
    const loginResult = await this.loginAndSetSession(response, usernameOrEmail, password);
    const registrationRole = this.registrationRoleFromRedirectUri(query.redirectUri);
    const user = this.authService.verifyAccessToken(loginResult.accessToken);
    const result = await this.authService.authorize(user, query);

    if (registrationRole === 'teacher') {
      return response.redirect(
        this.teacherPortalRedirectUrl(loginResult.accessToken, loginResult.refreshToken),
      );
    }

    if (registrationRole === 'student') {
      return response.redirect(
        this.studentPortalRedirectUrl(loginResult.accessToken, loginResult.refreshToken),
      );
    }

    return response.redirect(result.redirectTo);
  }

  private async loginAndSetSession(
    response: Response,
    usernameOrEmail: string,
    password: string,
  ) {
    const loginResult = await this.authService.login({
      usernameOrEmail,
      password,
    });
    const secure = this.config
      .get<string>('PLATFORM_PUBLIC_URL', 'http://localhost:3000')
      .startsWith('https://');

    response.cookie(SESSION_COOKIE, loginResult.accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      maxAge: loginResult.expiresIn * 1000,
      path: '/sso',
    });

    return loginResult;
  }

  private registrationRoleFromRedirectUri(redirectUri: string): 'student' | 'teacher' | undefined {
    try {
      const url = new URL(redirectUri);

      if (!url.pathname.endsWith('/registration/done')) {
        return undefined;
      }

      const role = url.searchParams.get('role');
      return role === 'teacher' || role === 'student' ? role : undefined;
    } catch {
      const params = new URLSearchParams(redirectUri.split('?')[1] ?? '');
      const role = params.get('role');
      return role === 'teacher' || role === 'student' ? role : undefined;
    }
  }

  private teacherPortalRedirectUrl(accessToken: string, refreshToken?: string): string {
    return this.portalRedirectUrl(
      this.teacherPortalBaseUrl(),
      accessToken,
      refreshToken,
    );
  }

  private teacherPortalBaseUrl(): string {
    const configuredUrl =
      this.config.get<string>('TEACHER_PORTAL_PUBLIC_URL') ||
      this.config.get<string>('TEACHER_PUBLIC_URL');

    return (configuredUrl || this.defaultTeacherPortalUrl()).replace(/\/$/, '');
  }

  private studentPortalRedirectUrl(accessToken: string, refreshToken?: string): string {
    const configuredUrl =
      this.config.get<string>('STUDENT_PORTAL_PUBLIC_URL') ||
      this.config.get<string>('STUDENT_PUBLIC_URL');

    return this.portalRedirectUrl(
      (configuredUrl || this.defaultStudentPortalUrl()).replace(/\/$/, ''),
      accessToken,
      refreshToken,
    );
  }

  private portalRedirectUrl(baseUrl: string, accessToken: string, refreshToken?: string): string {
    const hash = new URLSearchParams({ accessToken });

    if (refreshToken) {
      hash.set('refreshToken', refreshToken);
    }

    try {
      const url = new URL(baseUrl);
      url.hash = hash.toString();
      return url.toString();
    } catch {
      return `${baseUrl}#${hash.toString()}`;
    }
  }

  private defaultTeacherPortalUrl(): string {
    const publicUrl = this.config.get<string>('PLATFORM_PUBLIC_URL', 'http://localhost:3000');

    try {
      const url = new URL(publicUrl);

      if (url.hostname.endsWith('docpine.online')) {
        return `${url.protocol}//teacher.docpine.online`;
      }

      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        return 'http://localhost:5173/?portal=teacher';
      }

      return `${url.protocol}//${url.host}`;
    } catch {
      return 'http://teacher.docpine.online';
    }
  }

  private defaultStudentPortalUrl(): string {
    const publicUrl = this.config.get<string>('PLATFORM_PUBLIC_URL', 'http://localhost:3000');

    try {
      const url = new URL(publicUrl);

      if (url.hostname.endsWith('docpine.online')) {
        return `${url.protocol}//student.docpine.online`;
      }

      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        return 'http://localhost:5173/?portal=student';
      }

      return `${url.protocol}//${url.host}`;
    } catch {
      return 'http://student.docpine.online';
    }
  }

  private queryString(query: Partial<AuthorizeQueryDto>): string {
    const params = new URLSearchParams();

    if (query.appId) {
      params.set('appId', query.appId);
    }

    if (query.redirectUri) {
      params.set('redirectUri', query.redirectUri);
    }

    if (query.state) {
      params.set('state', query.state);
    }

    if (query.scope) {
      params.set('scope', query.scope);
    }

    return params.toString();
  }

  private renderLogin(
    response: Response,
    query: AuthorizeQueryDto,
    error?: string,
    usernameOrEmail = '',
  ) {
    const action = '/sso/login';
    const queryString = this.queryString(query);
    const errorHtml = error
      ? `<div class="error">${this.escape(error)}</div>`
      : '';

    return response.status(200).type('html').send(
      this.page(
        '智美教育新生态业务底座登录',
        `
        <form class="login" method="post" action="${action}">
          <input type="hidden" name="appId" value="${this.escape(query.appId)}" />
          <input type="hidden" name="redirectUri" value="${this.escape(query.redirectUri)}" />
          <input type="hidden" name="state" value="${this.escape(query.state ?? '')}" />
          <input type="hidden" name="scope" value="${this.escape(query.scope ?? '')}" />
          <h1>智美教育新生态业务底座</h1>
          <p class="subtitle">使用统一账号继续访问业务应用</p>
          ${errorHtml}
          <label>
            <span>用户名或邮箱</span>
            <input name="usernameOrEmail" autocomplete="username" value="${this.escape(usernameOrEmail)}" required />
          </label>
          <label>
            <span>密码</span>
            <input name="password" type="password" autocomplete="current-password" required />
          </label>
          <button type="submit">登录并继续</button>
          <p class="form-links">
            <a href="/sso/register/student?${this.escape(queryString)}">学生注册</a>
            <a href="/sso/register/teacher?${this.escape(queryString)}">教师入驻申请</a>
            <a href="/sso/forgot-password?${this.escape(queryString)}">忘记密码</a>
          </p>
        </form>
        `,
      ),
    );
  }

  private renderRegistration(
    response: Response,
    query: AuthorizeQueryDto,
    type: 'student' | 'teacher',
    error?: string,
    values?: Partial<SsoRegisterBody>,
  ) {
    const isStudent = type === 'student';
    const title = isStudent ? '学生注册' : '教师入驻申请';
    const action = isStudent ? '/sso/register/student' : '/sso/register/teacher';
    const errorHtml = error
      ? `<div class="error">${this.escape(error)}</div>`
      : '';

    return response.status(200).type('html').send(
      this.page(
        `智美教育新生态业务底座${title}`,
        `
        <form class="login" method="post" action="${action}">
          <input type="hidden" name="appId" value="${this.escape(query.appId)}" />
          <input type="hidden" name="redirectUri" value="${this.escape(query.redirectUri)}" />
          <input type="hidden" name="state" value="${this.escape(query.state ?? '')}" />
          <input type="hidden" name="scope" value="${this.escape(query.scope ?? '')}" />
          <h1>${title}</h1>
          <p class="subtitle">${isStudent ? '注册后可直接进入业务应用，学校和班级由管理员分配。' : '提交后等待平台管理员审核，审核通过后即可登录。'}</p>
          ${errorHtml}
          <label>
            <span>姓名</span>
            <input name="displayName" autocomplete="name" value="${this.escape(values?.displayName ?? '')}" required />
          </label>
          <label>
            <span>邮箱</span>
            <input name="email" type="email" autocomplete="email" value="${this.escape(values?.email ?? '')}" required />
          </label>
          ${isStudent ? `
          <label>
            <span>年龄段</span>
            <select name="ageBand" required>
              ${['6-12岁', '13-15岁', '16-18岁', '成人'].map((ageBand) => (
                `<option value="${this.escape(ageBand)}" ${values?.ageBand === ageBand ? 'selected' : ''}>${this.escape(ageBand)}</option>`
              )).join('')}
            </select>
          </label>` : ''}
          <label>
            <span>密码</span>
            <input name="password" type="password" autocomplete="new-password" minlength="8" required />
          </label>
          <button type="submit">${isStudent ? '注册并继续' : '提交审核'}</button>
          <p class="form-links"><a href="/sso/authorize?${this.escape(this.queryString(query))}">已有账号，返回登录</a></p>
        </form>
        `,
      ),
    );
  }

  private renderForgotPassword(
    response: Response,
    query: OptionalAuthorizeQueryDto,
    error?: string,
    email = '',
  ) {
    const errorHtml = error
      ? `<div class="error">${this.escape(error)}</div>`
      : '';
    const queryString = this.queryString(query);

    return response.status(200).type('html').send(
      this.page(
        '找回密码',
        `<form class="login" method="post" action="/sso/forgot-password">
          <input type="hidden" name="appId" value="${this.escape(query.appId ?? '')}" />
          <input type="hidden" name="redirectUri" value="${this.escape(query.redirectUri ?? '')}" />
          <input type="hidden" name="state" value="${this.escape(query.state ?? '')}" />
          <input type="hidden" name="scope" value="${this.escape(query.scope ?? '')}" />
          <h1>找回密码</h1>
          <p class="subtitle">请输入老师或学生账号邮箱。管理员账号暂不支持这里找回。</p>
          ${errorHtml}
          <label>
            <span>邮箱</span>
            <input name="email" type="email" autocomplete="email" value="${this.escape(email)}" required />
          </label>
          <button type="submit">发送重置邮件</button>
          ${queryString ? `<p class="form-links"><a href="/sso/authorize?${this.escape(queryString)}">返回登录</a></p>` : ''}
        </form>`,
      ),
    );
  }

  private renderResetPassword(
    response: Response,
    token: string,
    error?: string,
  ) {
    const errorHtml = error
      ? `<div class="error">${this.escape(error)}</div>`
      : '';

    return response.status(200).type('html').send(
      this.page(
        '重置密码',
        `<form class="login" method="post" action="/sso/reset-password">
          <input type="hidden" name="token" value="${this.escape(token)}" />
          <h1>重置密码</h1>
          <p class="subtitle">请输入新的老师或学生账号密码，至少 8 位。</p>
          ${errorHtml}
          <label>
            <span>新密码</span>
            <input name="password" type="password" autocomplete="new-password" minlength="8" required />
          </label>
          <button type="submit">保存新密码</button>
        </form>`,
      ),
    );
  }

  private page(title: string, body: string): string {
    return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${this.escape(title)}</title>
    <style>
      :root {
        color-scheme: light;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f6f7fb;
        color: #172033;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
      }
      .login {
        width: min(380px, calc(100vw - 32px));
        background: #fff;
        border: 1px solid #d9deea;
        border-radius: 8px;
        padding: 28px;
        box-shadow: 0 18px 48px rgba(23, 32, 51, 0.08);
      }
      h1 {
        margin: 0;
        font-size: 24px;
        line-height: 1.25;
      }
      .subtitle {
        margin: 8px 0 24px;
        color: #5b6680;
        font-size: 14px;
      }
      label {
        display: grid;
        gap: 8px;
        margin-top: 16px;
        font-size: 14px;
        color: #33405c;
      }
      input {
        height: 42px;
        border: 1px solid #cbd3e1;
        border-radius: 6px;
        padding: 0 12px;
        font-size: 15px;
      }
      select {
        height: 42px;
        border: 1px solid #cbd3e1;
        border-radius: 6px;
        padding: 0 12px;
        font-size: 15px;
        background: #fff;
      }
      input:focus {
        outline: 2px solid #8bb7ff;
        border-color: #2f76e5;
      }
      button {
        width: 100%;
        height: 44px;
        margin-top: 24px;
        border: 0;
        border-radius: 6px;
        background: #1f6feb;
        color: #fff;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
      }
      .error {
        margin: 0 0 16px;
        padding: 10px 12px;
        border-radius: 6px;
        background: #fff1f0;
        border: 1px solid #ffccc7;
        color: #a8071a;
        font-size: 14px;
      }
      .form-links {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 16px;
        margin: 16px 0 0;
        font-size: 14px;
      }
      a {
        color: #1f6feb;
        text-decoration: none;
      }
      .button-link {
        display: grid;
        place-items: center;
        width: 100%;
        height: 44px;
        margin-top: 24px;
        border-radius: 6px;
        background: #1f6feb;
        color: #fff;
        font-size: 15px;
        font-weight: 600;
      }
      .success {
        text-align: center;
      }
      .success-mark {
        display: inline-grid;
        place-items: center;
        width: 56px;
        height: 56px;
        margin-bottom: 18px;
        border-radius: 50%;
        background: #e8f5e9;
        color: #198754;
        font-size: 30px;
        font-weight: 800;
      }
    </style>
  </head>
  <body>${body}</body>
</html>`;
  }

  private escape(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
