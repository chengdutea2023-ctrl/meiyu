import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';

@ApiExcludeController()
@Controller()
export class RegistrationLinksController {
  constructor(private readonly config: ConfigService) {}

  @Get('register/student')
  registerStudent(@Res() response: Response) {
    return response.redirect(
      this.registrationUrl('/sso/register/student', 'student'),
    );
  }

  @Get('register/teacher')
  registerTeacher(@Res() response: Response) {
    return response.redirect(
      this.registrationUrl('/sso/register/teacher', 'teacher'),
    );
  }

  @Get('registration/done')
  registrationDone(@Query('role') role: string | undefined, @Res() response: Response) {
    const registrationRole = role === 'teacher' || role === 'student' ? role : undefined;
    const message =
      registrationRole === 'teacher'
        ? '教师入驻申请已提交。管理员审核通过后，你可以使用邮箱和密码登录教师后台。'
        : registrationRole === 'student'
          ? '学生账号已注册完成，可以直接登录学生后台。'
          : '账号注册完成。';
    const actionHtml =
      registrationRole === 'student'
        ? `<a href="${this.escape(this.studentPortalUrl())}">进入学生后台</a>`
        : registrationRole === 'teacher'
          ? `<a href="${this.escape(this.teacherPortalUrl())}">进入教师后台</a>`
          : '';

    return response.status(200).type('html').send(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>注册完成</title>
    <style>
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        background: #f6f7fb;
        color: #172033;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      section {
        width: min(420px, calc(100vw - 32px));
        padding: 32px;
        border: 1px solid #d9deea;
        border-radius: 8px;
        background: #fff;
        box-shadow: 0 18px 48px rgba(23, 32, 51, 0.08);
        text-align: center;
      }
      h1 {
        margin: 0;
        font-size: 26px;
      }
      p {
        margin: 12px 0 0;
        color: #5b6680;
        line-height: 1.7;
      }
      a {
        display: inline-grid;
        place-items: center;
        height: 42px;
        margin-top: 24px;
        padding: 0 18px;
        border-radius: 8px;
        background: #1f6feb;
        color: #fff;
        font-weight: 700;
        text-decoration: none;
      }
    </style>
  </head>
  <body>
    <section>
      <h1>注册完成</h1>
      <p>${message}</p>
      ${actionHtml}
    </section>
  </body>
</html>`);
  }

  private registrationUrl(path: string, role: 'student' | 'teacher') {
    const publicUrl = this.config
      .get<string>('PLATFORM_PUBLIC_URL', 'http://localhost:3000')
      .replace(/\/$/, '');
    const appId = this.config.get<string>(
      'SHORT_REGISTER_APP_ID',
      this.config.get<string>('DEMO_APP_ID', 'demo-teaching-app'),
    );
    const redirectUri = this.config.get<string>(
      'SHORT_REGISTER_REDIRECT_URI',
      `${publicUrl}/registration/done`,
    );
    const query = new URLSearchParams({
      appId,
      redirectUri: this.registrationDoneUrl(redirectUri, role),
    });

    return `${path}?${query.toString()}`;
  }

  private registrationDoneUrl(redirectUri: string, role: 'student' | 'teacher') {
    try {
      const url = new URL(redirectUri);
      url.searchParams.set('role', role);
      return url.toString();
    } catch {
      const separator = redirectUri.includes('?') ? '&' : '?';
      return `${redirectUri}${separator}role=${role}`;
    }
  }

  private teacherPortalUrl(): string {
    const configuredUrl =
      this.config.get<string>('TEACHER_PORTAL_PUBLIC_URL') ||
      this.config.get<string>('TEACHER_PUBLIC_URL');

    return (configuredUrl || this.defaultPortalUrl('teacher')).replace(/\/$/, '');
  }

  private studentPortalUrl(): string {
    const configuredUrl =
      this.config.get<string>('STUDENT_PORTAL_PUBLIC_URL') ||
      this.config.get<string>('STUDENT_PUBLIC_URL');

    return (configuredUrl || this.defaultPortalUrl('student')).replace(/\/$/, '');
  }

  private defaultPortalUrl(portal: 'teacher' | 'student'): string {
    const publicUrl = this.config.get<string>('PLATFORM_PUBLIC_URL', 'http://localhost:3000');

    try {
      const url = new URL(publicUrl);

      if (url.hostname.endsWith('docpine.online')) {
        return `${url.protocol}//${portal}.docpine.online`;
      }

      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        return `http://localhost:5173/?portal=${portal}`;
      }

      return `${url.protocol}//${url.host}`;
    } catch {
      return `http://${portal}.docpine.online`;
    }
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
