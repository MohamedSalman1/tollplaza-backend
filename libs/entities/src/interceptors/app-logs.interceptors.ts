import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request, Response } from 'express';
import { logRequest } from '../utils/request-logger';

/**
 * Logs every successful request once, when its response completes (so a
 * long-lived SSE stream isn't logged per event). Failed requests are logged
 * by GlobalCatchExceptionFilter instead.
 */
@Injectable()
export class GlobalLogsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        complete: () =>
          logRequest(
            'Log Interceptor',
            request,
            response.statusCode,
            startedAt,
          ),
      }),
    );
  }
}
