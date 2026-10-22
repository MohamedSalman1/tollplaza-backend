import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { logRequest } from '../utils/request-logger';

@Injectable()
@Catch()
export class GlobalCatchExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    console.group('> Exception');
    console.error(exception);
    console.groupEnd();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    logRequest('Global Exception', request, status);

    response.status(status).json({
      statusCode: status,
      message: this.getMessage(exception),
    });
  }

  // Only HttpExceptions carry client-safe messages. Anything else (DB
  // driver errors, TypeErrors, ...) can include hosts, SQL or stack details,
  // so it is logged above and replaced with a generic message here.
  private getMessage(exception: unknown) {
    if (!(exception instanceof HttpException)) {
      return 'Internal server error';
    }

    const body = exception.getResponse();
    if (typeof body === 'object' && body !== null && 'message' in body) {
      return body.message;
    }
    return exception.message;
  }
}
