import type { ExecutionContext } from '@nestjs/common';
import { createParamDecorator, UnauthorizedException } from '@nestjs/common';

import type { AuthRequest } from '../authRequest.js';

export const CurrentAuth = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const auth = context.switchToHttp().getRequest<AuthRequest>().auth;

  if (!auth) {
    throw new UnauthorizedException();
  }

  return auth;
});
