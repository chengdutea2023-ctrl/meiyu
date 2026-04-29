import {
  CanActivate,
  ExecutionContext,
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
      user?: JwtUserPayload;
    }>();
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authorization.slice('Bearer '.length);

    try {
      request.user = this.jwtService.verify<JwtUserPayload>(token, {
        secret: this.config.get<string>(
          'JWT_ACCESS_SECRET',
          'dev-access-secret',
        ),
      });
      return true;
    } catch {
      throw new UnauthorizedException('Invalid bearer token');
    }
  }
}

