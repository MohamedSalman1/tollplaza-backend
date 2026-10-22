import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import dayjs from 'dayjs';

/**
 * Applied to routes excluded from JwtTokenValidationMiddleware so they still
 * get a request id.
 */
@Injectable()
export class PublicApisMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    req.headers['x-request-id'] = dayjs().format('YYYYMMDD.HHmmss.SSS');
    next();
  }
}
