import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ApplicationStatus,
  AuthorizationCodeStatus,
  UserApprovalStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as nodemailer from 'nodemailer';
import { addSeconds, generateToken, parseDurationToSeconds, sha256 } from '../../common/crypto';
import { appendQueryParams } from '../../common/url';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizeQueryDto } from './dto/authorize-query.dto';
import { ExchangeCodeDto } from './dto/exchange-code.dto';
import { LoginDto } from './dto/login.dto';
import { JwtUserPayload } from './types/jwt-payload';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const usernameOrEmail = dto.usernameOrEmail.trim();
    const email = usernameOrEmail.toLowerCase();

    const user = await this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [{ username: usernameOrEmail }, { email }],
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE || !user.passwordHash) {
      throw new UnauthorizedException('账号或密码错误');
    }

    if (!user.isPlatformAdmin && user.approvalStatus !== UserApprovalStatus.APPROVED) {
      throw new UnauthorizedException('账号还在审核中，请等待管理员审核通过');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException('账号或密码错误');
    }

    const accessToken = this.signAccessToken({
      sub: user.id,
      username: user.username ?? user.email,
      email: user.email,
      isPlatformAdmin: user.isPlatformAdmin,
      userType: user.userType,
      audience: 'platform',
    });
    const refreshToken = await this.issueRefreshToken(user.id, undefined);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.accessTokenTtlSeconds(),
      user: this.toPublicUser(user),
    };
  }

  async refresh(rawRefreshToken: string) {
    const tokenHash = sha256(rawRefreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true, application: true },
    });

    if (
      !stored ||
      stored.revokedAt ||
      stored.expiresAt.getTime() <= Date.now() ||
      stored.user.deletedAt ||
      stored.user.status !== UserStatus.ACTIVE
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!stored.user.isPlatformAdmin && stored.user.approvalStatus !== UserApprovalStatus.APPROVED) {
      throw new UnauthorizedException('Account is pending approval');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const audience = stored.application ? 'application' : 'platform';
    const accessToken = this.signAccessToken({
      sub: stored.user.id,
      username: stored.user.username ?? stored.user.email,
      email: stored.user.email,
      isPlatformAdmin: stored.user.isPlatformAdmin,
      userType: stored.user.userType,
      audience,
      appId: stored.application?.appId,
    });
    const refreshToken = await this.issueRefreshToken(
      stored.user.id,
      stored.applicationId ?? undefined,
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.accessTokenTtlSeconds(),
    };
  }

  async authorize(userPayload: JwtUserPayload, dto: AuthorizeQueryDto) {
    const application = await this.prisma.application.findUnique({
      where: { appId: dto.appId },
    });

    if (!application || application.status !== ApplicationStatus.ACTIVE) {
      throw new BadRequestException('Application is not available');
    }

    if (!application.redirectUris.includes(dto.redirectUri)) {
      throw new BadRequestException('redirectUri is not registered');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userPayload.sub, deletedAt: null },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User is not available');
    }

    if (!user.isPlatformAdmin && user.approvalStatus !== UserApprovalStatus.APPROVED) {
      throw new UnauthorizedException('Account is pending approval');
    }

    const rawCode = generateToken(32);
    const ttlSeconds = Number(
      this.config.get<string>('AUTH_CODE_TTL_SECONDS', '120'),
    );

    await this.prisma.authorizationCode.create({
      data: {
        codeHash: sha256(rawCode),
        userId: user.id,
        applicationId: application.id,
        redirectUri: dto.redirectUri,
        scope: dto.scope,
        expiresAt: addSeconds(new Date(), ttlSeconds),
      },
    });

    return {
      redirectTo: appendQueryParams(dto.redirectUri, {
        code: rawCode,
        state: dto.state,
      }),
      expiresIn: ttlSeconds,
    };
  }

  async exchangeCode(dto: ExchangeCodeDto) {
    const application = await this.prisma.application.findUnique({
      where: { appId: dto.appId },
    });

    if (!application || application.status !== ApplicationStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid application credentials');
    }

    const secretMatches = await bcrypt.compare(
      dto.appSecret,
      application.appSecretHash,
    );

    if (!secretMatches) {
      throw new UnauthorizedException('Invalid application credentials');
    }

    const codeHash = sha256(dto.code);
    const storedCode = await this.prisma.authorizationCode.findUnique({
      where: { codeHash },
      include: { user: true, application: true },
    });

    if (
      !storedCode ||
      storedCode.applicationId !== application.id ||
      storedCode.status !== AuthorizationCodeStatus.ACTIVE ||
      storedCode.redirectUri !== dto.redirectUri ||
      storedCode.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException('Invalid authorization code');
    }

    const updateResult = await this.prisma.authorizationCode.updateMany({
      where: {
        id: storedCode.id,
        status: AuthorizationCodeStatus.ACTIVE,
      },
      data: {
        status: AuthorizationCodeStatus.USED,
        usedAt: new Date(),
      },
    });

    if (updateResult.count !== 1) {
      throw new UnauthorizedException('Authorization code was already used');
    }

    if (storedCode.user.deletedAt || storedCode.user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User is not available');
    }

    if (!storedCode.user.isPlatformAdmin && storedCode.user.approvalStatus !== UserApprovalStatus.APPROVED) {
      throw new UnauthorizedException('Account is pending approval');
    }

    const accessToken = this.signAccessToken({
      sub: storedCode.user.id,
      username: storedCode.user.username ?? storedCode.user.email,
      email: storedCode.user.email,
      isPlatformAdmin: storedCode.user.isPlatformAdmin,
      userType: storedCode.user.userType,
      audience: 'application',
      appId: application.appId,
    });
    const refreshToken = await this.issueRefreshToken(
      storedCode.user.id,
      application.id,
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.accessTokenTtlSeconds(),
      user: this.toPublicUser(storedCode.user),
    };
  }

  async getCurrentUser(payload: JwtUserPayload) {
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      include: {
        organizations: {
          include: {
            organization: true,
            role: true,
          },
        },
        classes: {
          include: {
            class: {
              include: {
                organization: true,
              },
            },
          },
        },
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User is not available');
    }

    if (!user.isPlatformAdmin && user.approvalStatus !== UserApprovalStatus.APPROVED) {
      throw new UnauthorizedException('Account is pending approval');
    }

    return {
      user: this.toPublicUser(user),
      audience: payload.audience,
      appId: payload.appId,
      organizations: user.organizations.map((membership) => ({
        id: membership.organization.id,
        name: membership.organization.name,
        code: membership.organization.code,
        type: membership.organization.type,
        role: membership.role
          ? {
              key: membership.role.key,
              name: membership.role.name,
              permissions: membership.role.permissions,
            }
          : null,
      })),
      classes: user.classes.map((membership) => ({
        id: membership.class.id,
        name: membership.class.name,
        code: membership.class.code,
        role: membership.role,
        organization: {
          id: membership.class.organization.id,
          name: membership.class.organization.name,
        },
      })),
    };
  }

  async requestPasswordReset(emailInput: string) {
    const email = emailInput.trim().toLowerCase();
    const genericResponse = { ok: true };

    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });

    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      user.isPlatformAdmin ||
      user.userType === UserType.ADMIN ||
      (user.userType !== UserType.TEACHER && user.userType !== UserType.STUDENT)
    ) {
      return genericResponse;
    }

    const rawToken = generateToken(48);
    const expiresAt = addSeconds(new Date(), this.passwordResetTtlSeconds());

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          tokenHash: sha256(rawToken),
          userId: user.id,
          expiresAt,
        },
      }),
    ]);

    const resetUrl = this.buildPasswordResetUrl(rawToken);
    const emailSent = await this.sendPasswordResetEmail(
      user.email,
      user.displayName ?? user.email,
      resetUrl,
    );

    if (this.shouldExposePasswordResetUrl()) {
      return { ok: true, emailSent, resetUrl };
    }

    return genericResponse;
  }

  async resetPassword(rawToken: string, password: string) {
    const stored = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(rawToken.trim()) },
      include: { user: true },
    });

    if (
      !stored ||
      stored.usedAt ||
      stored.expiresAt.getTime() <= Date.now() ||
      stored.user.deletedAt ||
      stored.user.status !== UserStatus.ACTIVE
    ) {
      throw new BadRequestException('Password reset link is invalid or expired');
    }

    if (
      stored.user.isPlatformAdmin ||
      stored.user.userType === UserType.ADMIN ||
      (stored.user.userType !== UserType.TEACHER && stored.user.userType !== UserType.STUDENT)
    ) {
      throw new BadRequestException('This account cannot reset password here');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: stored.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.deleteMany({ where: { userId: stored.userId } }),
      this.prisma.authorizationCode.deleteMany({ where: { userId: stored.userId } }),
    ]);

    return { ok: true };
  }

  verifyAccessToken(token: string): JwtUserPayload {
    try {
      return this.jwtService.verify<JwtUserPayload>(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET', 'dev-access-secret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
  }

  private signAccessToken(payload: JwtUserPayload): string {
    return this.jwtService.sign(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET', 'dev-access-secret'),
      expiresIn: this.accessTokenTtlSeconds(),
    });
  }

  private async issueRefreshToken(
    userId: string,
    applicationId: string | undefined,
  ): Promise<string> {
    const rawToken = generateToken(48);
    const ttlSeconds = parseDurationToSeconds(
      this.config.get<string>('JWT_REFRESH_TTL', '7d'),
    );

    await this.prisma.refreshToken.create({
      data: {
        tokenHash: sha256(rawToken),
        userId,
        applicationId,
        expiresAt: addSeconds(new Date(), ttlSeconds),
      },
    });

    return rawToken;
  }

  private accessTokenTtlSeconds(): number {
    return parseDurationToSeconds(
      this.config.get<string>('JWT_ACCESS_TTL', '15m'),
    );
  }

  private passwordResetTtlSeconds(): number {
    return parseDurationToSeconds(
      this.config.get<string>('PASSWORD_RESET_TTL', '30m'),
    );
  }

  private buildPasswordResetUrl(rawToken: string): string {
    const baseUrl = this.config
      .get<string>('PLATFORM_PUBLIC_URL', 'http://localhost:3000')
      .replace(/\/+$/, '');

    return `${baseUrl}/sso/reset-password?token=${encodeURIComponent(rawToken)}`;
  }

  private shouldExposePasswordResetUrl(): boolean {
    return this.config.get<string>('PASSWORD_RESET_DEBUG_RESPONSE') === 'true';
  }

  private async sendPasswordResetEmail(
    to: string,
    displayName: string,
    resetUrl: string,
  ): Promise<boolean> {
    const host = this.config.get<string>('SMTP_HOST');
    const from = this.config.get<string>('SMTP_FROM');

    if (!host || !from) {
      console.warn(`[password-reset] SMTP is not configured. Reset link for ${to}: ${resetUrl}`);
      return false;
    }

    const port = Number(this.config.get<string>('SMTP_PORT', '465'));
    const secureConfig = this.config.get<string>('SMTP_SECURE');
    const secure = secureConfig ? secureConfig !== 'false' : port === 465;
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS') ?? this.config.get<string>('SMTP_PASSWORD');

    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: user && pass ? { user, pass } : undefined,
      });

      await transporter.sendMail({
        from,
        to,
        subject: '智美教育新生态业务底座密码重置',
        text: `${displayName}，你好：\n\n请在 ${Math.floor(this.passwordResetTtlSeconds() / 60)} 分钟内打开下面的链接重置密码：\n${resetUrl}\n\n如果不是你本人操作，可以忽略这封邮件。`,
        html: `<p>${displayName}，你好：</p><p>请在 ${Math.floor(this.passwordResetTtlSeconds() / 60)} 分钟内点击下面的链接重置密码：</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>如果不是你本人操作，可以忽略这封邮件。</p>`,
      });

      return true;
    } catch (error) {
      console.warn(
        `[password-reset] Failed to send reset email to ${to}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  private toPublicUser(user: {
    id: string;
    username: string | null;
    email: string;
    displayName: string | null;
    userType: string;
    approvalStatus: string;
    ageBand: string | null;
    isPlatformAdmin: boolean;
  }) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      userType: user.userType,
      approvalStatus: user.approvalStatus,
      ageBand: user.ageBand,
      isPlatformAdmin: user.isPlatformAdmin,
    };
  }
}
