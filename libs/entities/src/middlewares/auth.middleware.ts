import {
  Injectable,
  Logger,
  NestMiddleware,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import dayjs from 'dayjs';
import { JwtService } from '@nestjs/jwt';
import type {
  AuthenticatedRequest,
  JwtPayload,
} from '../interfaces/jwt-payload.interface';
import { logRequest } from '../utils/request-logger';
import { SessionService } from '../services/session.service';

@Injectable()
export class JwtTokenValidationMiddleware implements NestMiddleware {
  private readonly logger = new Logger(JwtTokenValidationMiddleware.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly sessions: SessionService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    req.headers['x-request-id'] = dayjs().format('YYYYMMDD.HHmmss.SSS');

    const [scheme, token] = (req.headers['authorization'] ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      logRequest('Auth Middleware', req, 401);
      throw new UnauthorizedException('Unauthorized!');
    }

    let payload: JwtPayload;
    try {
      // verifyAsync throws if the token is invalid or expired
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      logRequest('Auth Middleware', req, 401);
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (!payload.sub) {
      logRequest('Auth Middleware', req, 401);
      throw new UnauthorizedException('Not authorized!');
    }

    // Logged out (this session or everywhere). Fails closed: if the
    // revocation store can't be read, the request is refused.
    let revoked: boolean;
    try {
      revoked = await this.sessions.isRevoked(payload);
    } catch (error) {
      this.logger.error(`Session check failed: ${String(error)}`);
      logRequest('Auth Middleware', req, 503);
      throw new ServiceUnavailableException('Session check unavailable');
    }
    if (revoked) {
      logRequest('Auth Middleware', req, 401);
      throw new UnauthorizedException(
        'Session has ended, please sign in again',
      );
    }

    (req as AuthenticatedRequest).user = payload;
    next();
  }
}
