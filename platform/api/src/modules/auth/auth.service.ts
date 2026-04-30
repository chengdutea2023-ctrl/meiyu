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
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
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
        OR: [{ username: usernameOrEmail }, { email }],
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE || !user.passwordHash) {
      throw new UnauthorizedException('Invalid account or password');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid account or password');
    }

    const accessToken = this.signAccessToken({
      sub: user.id,
      username: user.username ?? user.email,
      email: user.email,
      isPlatformAdmin: user.isPlatformAdmin,
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
      stored.user.status !== UserStatus.ACTIVE
    ) {
      throw new UnauthorizedException('Invalid refresh token');
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

    const user = await this.prisma.user.findUnique({
      where: { id: userPayload.sub },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User is not available');
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

    if (storedCode.user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User is not available');
    }

    const accessToken = this.signAccessToken({
      sub: storedCode.user.id,
      username: storedCode.user.username ?? storedCode.user.email,
      email: storedCode.user.email,
      isPlatformAdmin: storedCode.user.isPlatformAdmin,
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
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
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

  private toPublicUser(user: {
    id: string;
    username: string | null;
    email: string;
    displayName: string | null;
    isPlatformAdmin: boolean;
  }) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      isPlatformAdmin: user.isPlatformAdmin,
    };
  }
}
