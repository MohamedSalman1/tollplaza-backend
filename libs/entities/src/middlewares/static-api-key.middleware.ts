import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';

/**
 * For machine-to-machine routes (e.g. a camera/ingest service pushing
 * crossings). Compares the `x-api-key` header with STATIC_API_KEY.
 */
@Injectable()
export class StaticApiKeyMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const apiKey = req.headers['x-api-key'];
    const expectedKey = process.env.STATIC_API_KEY;

    if (
      !expectedKey ||
      typeof apiKey !== 'string' ||
      !this.isValidKey(apiKey, expectedKey)
    ) {
      throw new UnauthorizedException('Invalid API key');
    }

    next();
  }

  private isValidKey(provided: string, expected: string): boolean {
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);

    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(providedBuffer, expectedBuffer);
  }
}
