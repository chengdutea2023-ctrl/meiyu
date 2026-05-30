import { Controller, Get, Res } from '@nestjs/common';
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
      this.registrationUrl('/sso/register/student'),
    );
  }

  @Get('register/teacher')
  registerTeacher(@Res() response: Response) {
    return response.redirect(
      this.registrationUrl('/sso/register/teacher'),
    );
  }

  @Get('registration/done')
  registrationDone(@Res() response: Response) {
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
      <p>你的账号已经提交到底座。学生账号可以直接使用；教师账号需要管理员审核后才能登录课件。</p>
      <a href="/register/student">继续注册学生</a>
    </section>
  </body>
</html>`);
  }

  private registrationUrl(path: string) {
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
      redirectUri,
    });

    return `${path}?${query.toString()}`;
  }
}
