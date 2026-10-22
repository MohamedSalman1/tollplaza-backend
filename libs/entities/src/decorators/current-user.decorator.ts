import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  AuthenticatedRequest,
  JwtPayload,
} from '../interfaces/jwt-payload.interface';

/**
 * Returns the JWT payload verified by JwtTokenValidationMiddleware, or one
 * field of it: `@CurrentUser() user`, `@CurrentUser('sub') userId`.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const { user } = ctx.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!user) {
      throw new UnauthorizedException('No token provided');
    }

    return data ? user[data] : user;
  },
);
