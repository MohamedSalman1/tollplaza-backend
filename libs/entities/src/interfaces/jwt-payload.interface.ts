import type { Request } from 'express';
import type { UserRole } from '../constants/constants';

export type JwtPayload = {
  sub: number; // user ID
  email: string;
  name: string;
  role: UserRole;
  // Session id, so one session can be logged out (tokens issued before
  // logout existed don't have it)
  jti?: string;
  // Login time in ms (iat is whole seconds)
  iat_ms?: number;
  iat: number;
  exp: number;
};

/**
 * Request after JwtTokenValidationMiddleware has verified the token.
 */
export type AuthenticatedRequest = Request & { user: JwtPayload };
