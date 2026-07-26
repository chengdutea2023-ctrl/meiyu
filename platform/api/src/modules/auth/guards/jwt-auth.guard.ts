import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtUserPayload } from '../types/jwt-payload';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      method?: string;
      user?: JwtUserPayload;
    }>();
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authorization.slice('Bearer '.length);

    try {
      const user = this.jwtService.verify<JwtUserPayload>(token, {
        secret: this.config.get<string>(
          'JWT_ACCESS_SECRET',
          'dev-access-secret',
        ),
      });
      if (
        user.readOnlyPreview &&
        (!user.previewExpiresAt ||
          Date.parse(user.previewExpiresAt) <= Date.now())
      ) {
        throw new UnauthorizedException('体验账号已过期');
      }
      if (
        user.readOnlyPreview &&
        !['GET', 'HEAD', 'OPTIONS'].includes(
          String(request.method || '').toUpperCase(),
        )
      ) {
        throw new ForbiddenException('体验账号为只读模式，不能执行此操作');
      }
      request.user = user;
      return true;
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new UnauthorizedException('Invalid bearer token');
    }
  }
}
