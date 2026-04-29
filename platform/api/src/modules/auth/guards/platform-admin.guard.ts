import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { JwtUserPayload } from '../types/jwt-payload';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: JwtUserPayload;
    }>();

    if (!request.user?.isPlatformAdmin) {
      throw new ForbiddenException('Platform admin permission required');
    }

    return true;
  }
}

