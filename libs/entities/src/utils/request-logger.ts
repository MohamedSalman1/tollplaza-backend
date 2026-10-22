import type { Request } from 'express';
import { DEFAULT_TIMEZONE, REDACTED_LOG_KEYS } from '../constants/constants';

const TIME_OPTIONS = { timeZone: DEFAULT_TIMEZONE, hour12: true };

function redact(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(redact);
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, val]) => [
      key,
      REDACTED_LOG_KEYS.includes(key.toLowerCase())
        ? '[REDACTED]'
        : redact(val),
    ]),
  );
}

// Ingest batches carry up to 500 crossings; logging them whole made one feed
// import write ~100 MB of logs
const BODY_LOG_LIMIT = 2000;

function truncate(text: string) {
  return text.length > BODY_LOG_LIMIT
    ? `${text.slice(0, BODY_LOG_LIMIT)}… (${text.length} chars)`
    : text;
}

/**
 * Prints one request/response summary. Shared by the logs interceptor, the
 * global exception filter and the auth middleware.
 */
export function logRequest(
  location: string,
  request: Request,
  statusCode: number,
  startedAt: number = Date.now(),
) {
  const { ip, originalUrl, method, url, headers, params } = request;
  const body: unknown = request.body;
  const requestTimeGmt = new Date(startedAt);
  const responseTimeGmt = new Date();

  console.group('\x1b[1m\x1b[33m%s', `URL: ${method} ${url}`, '\x1b[0m');
  console.log(`Log Location:`, location);
  console.log(`Original URL:`, originalUrl);
  console.log(`IP:`, ip);
  console.log(
    `Request Time:`,
    requestTimeGmt.toString(),
    '|',
    requestTimeGmt.toLocaleString('en-IN', TIME_OPTIONS),
  );
  console.log(
    `Response Time:`,
    responseTimeGmt.toString(),
    '|',
    responseTimeGmt.toLocaleString('en-IN', TIME_OPTIONS),
  );
  console.log(`Total Time: ${responseTimeGmt.getTime() - startedAt}ms`);
  console.log('Request ID:', headers['x-request-id'] ?? '');
  console.log('Headers: ', JSON.stringify(redact(headers)));
  console.log('Body: ', truncate(JSON.stringify(redact(body)) ?? ''));
  console.log('Params: ', JSON.stringify(params));
  console.log('Status Code:', statusCode);
  console.log('');
  console.groupEnd();
}
