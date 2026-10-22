import { literal } from 'sequelize';
import { tzOffsetMinutes } from '../utils/time';

/**
 * SQL expressions on crossings columns, shared by stats and reports. Only
 * offsets we compute and fixed aliases are interpolated.
 */

/**
 * Hour of day (0-23) of crossed_at in `tz`.
 */
export function localHour(tz: string, column = 'crossed_at') {
  const offset = tzOffsetMinutes(tz);
  return literal(`HOUR(DATE_ADD(${column}, INTERVAL ${offset} MINUTE))`);
}

/**
 * Local calendar day of crossed_at in `tz`, as a 'YYYY-MM-DD' string (a
 * string, so the driver can't shift it into the server's time zone).
 */
export function localDay(tz: string, column = 'crossed_at') {
  const offset = tzOffsetMinutes(tz);
  return literal(
    `DATE_FORMAT(DATE_ADD(${column}, INTERVAL ${offset} MINUTE), '%Y-%m-%d')`,
  );
}

/**
 * The crossing's tag for reports: tag_class when it's a known tag
 * (tag_classes), otherwise the tag its vehicle_class belongs to
 * (vehicle_classes), as in the dashboard's resolveTag. NULL when neither is
 * known. Reads the tables, so a mapping change applies without a deploy.
 * `alias` is how crossings is named in the query (Sequelize uses the model
 * name).
 */
export function resolvedTag(alias = 'Crossing') {
  return literal(
    `CASE WHEN \`${alias}\`.tag_class IN (SELECT t.tag_class FROM tag_classes t) ` +
      `THEN \`${alias}\`.tag_class ` +
      `ELSE (SELECT v.tag_class FROM vehicle_classes v WHERE v.vehicle_class = \`${alias}\`.vehicle_class) END`,
  );
}
