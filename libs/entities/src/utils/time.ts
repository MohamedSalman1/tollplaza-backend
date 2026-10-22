import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

export { dayjs };

/**
 * ISO 8601 with the offset of `tz`, e.g. `2026-10-20T17:58:06+05:30`.
 */
export function formatInTz(
  value: Date | string | null,
  tz: string,
): string | null {
  if (!value) {
    return null;
  }
  return dayjs(value).tz(tz).format('YYYY-MM-DDTHH:mm:ssZ');
}

/**
 * Current UTC offset of `tz` in whole minutes (IST = 330). Stats bucket in
 * SQL with this fixed offset, which is exact for zones without DST.
 */
export function tzOffsetMinutes(tz: string, at: Date = new Date()): number {
  return Math.round(dayjs(at).tz(tz).utcOffset());
}
