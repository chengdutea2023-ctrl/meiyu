import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtUserPayload } from './types/jwt-payload';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtUserPayload => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtUserPayload }>();
    return request.user;
  },
);

