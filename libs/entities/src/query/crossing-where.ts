import { Op, Sequelize, col, literal, type WhereOptions } from 'sequelize';
import {
  ALERT_TYPES,
  CROSSING_FILTER_COLUMNS,
  CROSSING_FILTER_FIELDS,
  DEFAULT_ALERT_KIND,
  DEFAULT_RANGE,
  type AlertKind,
  UNKNOWN_FILTER_VALUE,
  type CrossingFilterField,
} from '../constants/constants';
import { normalizePlate } from '../utils/plate';
import { dayjs } from '../utils/time';
import type { CrossingFilterDto } from './crossing-filter.dto';

/**
 * Per-request plaza context the filters need: which plaza, which time zone
 * to read `today` in, and lane number -> lane id for the lane filter.
 */
export type CrossingScope = {
  plaza_id: number;
  timezone: string;
  lane_ids_by_number: ReadonlyMap<number, number>;
};

type WhereBuildOptions = {
  // Leave one column filter out (facet counts for that column)
  exclude?: CrossingFilterField;
  // Apply only plaza and time range ("of Y" totals)
  timeOnly?: boolean;
};

const ROLLING_RANGE = /^(\d+)([hd])$/;

/**
 * Resolves range / from / to into a UTC [start, end) window. A null bound
 * is open. from/to take precedence over range.
 */
export function resolveTimeWindow(
  filter: Pick<CrossingFilterDto, 'range' | 'from' | 'to'>,
  tz: string,
  now: Date = new Date(),
): { start: Date | null; end: Date | null } {
  if (filter.from || filter.to) {
    return {
      start: filter.from ? new Date(filter.from) : null,
      end: filter.to ? new Date(filter.to) : null,
    };
  }

  const range = filter.range ?? DEFAULT_RANGE;
  if (range === 'all') {
    return { start: null, end: null };
  }
  if (range === 'today') {
    return { start: dayjs(now).tz(tz).startOf('day').toDate(), end: null };
  }

  const [, amount, unit] = ROLLING_RANGE.exec(range)!;
  return {
    start: dayjs(now)
      .subtract(Number(amount), unit === 'h' ? 'hour' : 'day')
      .toDate(),
    end: null,
  };
}

/**
 * The WHERE clause every crossing endpoint uses, so the list, KPIs,
 * analytics and reports always count the same rows.
 */
export function buildCrossingWhere(
  filter: CrossingFilterDto,
  scope: CrossingScope,
  options: WhereBuildOptions = {},
): WhereOptions {
  const and: WhereOptions[] = [{ plaza_id: scope.plaza_id }];

  const { start, end } = resolveTimeWindow(filter, scope.timezone);
  if (start) {
    and.push({ crossed_at: { [Op.gte]: start } });
  }
  if (end) {
    and.push({ crossed_at: { [Op.lt]: end } });
  }

  if (options.timeOnly) {
    return { [Op.and]: and };
  }

  const search = filter.q?.trim();
  if (search) {
    const anyOf: WhereOptions[] = [
      { search_text: { [Op.like]: `%${escapeLike(search.toLowerCase())}%` } },
    ];
    const plate = normalizePlate(search);
    if (plate) {
      anyOf.push({ plate_normalized: { [Op.like]: `%${escapeLike(plate)}%` } });
    }
    and.push({ [Op.or]: anyOf });
  }

  const toggles = {
    ev: 'is_ev',
    oos: 'is_oos',
    commercial: 'is_commercial',
    exempt: 'is_exempt',
  } as const;
  for (const [param, column] of Object.entries(toggles)) {
    const value = filter[param as keyof typeof toggles];
    if (value !== undefined) {
      and.push({ [column]: value });
    }
  }

  if (filter.has_alerts !== undefined) {
    and.push(hasAlertsCondition(filter.has_alerts, filter.alert_kind));
  }

  if (filter.alert_type?.length) {
    // Values are validated against ALERT_TYPES, so quoting them is safe
    const types = filter.alert_type
      .filter((type) => ALERT_TYPES.includes(type))
      .map((type) => `'${type}'`)
      .join(', ');
    and.push({
      id: {
        [Op.in]: literal(
          `(SELECT a.crossing_id FROM crossing_alerts a WHERE a.plaza_id = ${Number(scope.plaza_id)} AND a.type IN (${types || 'NULL'}))`,
        ),
      },
    });
  }

  if (filter.plate) {
    and.push({ plate_normalized: normalizePlate(filter.plate) });
  }

  if (filter.watchlist !== undefined) {
    // Uncorrelated, so it works whatever alias crossings has in the query
    const watched = literal(
      `(SELECT w.plate_normalized FROM watchlist_entries w WHERE w.plaza_id = ${Number(scope.plaza_id)} OR w.plaza_id IS NULL)`,
    );
    and.push(
      filter.watchlist
        ? { plate_normalized: { [Op.in]: watched } }
        : {
            [Op.or]: [
              { plate_normalized: { [Op.notIn]: watched } },
              { plate_normalized: null },
            ],
          },
    );
  }

  for (const field of CROSSING_FILTER_FIELDS) {
    const values = filter[field];
    if (field === options.exclude || !values?.length) {
      continue;
    }
    and.push(columnFilter(field, values, scope));
  }

  return { [Op.and]: and };
}

/**
 * has_alerts for the chosen alert kind: hard (default) and all read the
 * stored summaries; soft compares them (alerts beyond the hard ones).
 */
function hasAlertsCondition(
  hasAlerts: boolean,
  kind: AlertKind = DEFAULT_ALERT_KIND,
): WhereOptions {
  if (kind === 'soft') {
    const soft = Sequelize.where(
      col('alert_count'),
      Op.gt,
      col('hard_alert_count'),
    );
    return hasAlerts
      ? soft
      : Sequelize.where(col('alert_count'), Op.eq, col('hard_alert_count'));
  }
  const column =
    kind === 'all' ? 'alert_max_severity' : 'hard_alert_max_severity';
  return { [column]: hasAlerts ? { [Op.gt]: 0 } : 0 };
}

/**
 * True when the filter has anything beyond plaza and time range. Tables
 * that copy plaza_id and crossed_at (crossing_alerts) only need to join
 * crossings when this is true.
 */
export function hasCrossingFilters(filter: CrossingFilterDto): boolean {
  return Boolean(
    filter.q?.trim() ||
    filter.ev !== undefined ||
    filter.oos !== undefined ||
    filter.commercial !== undefined ||
    filter.exempt !== undefined ||
    filter.has_alerts !== undefined ||
    filter.plate ||
    CROSSING_FILTER_FIELDS.some((field) => filter[field]?.length),
  );
}

/**
 * `?make=Tata,Unknown` -> vehicle_make IN ('Tata') OR vehicle_make IS NULL
 */
function columnFilter(
  field: CrossingFilterField,
  values: string[],
  scope: CrossingScope,
): WhereOptions {
  const column = CROSSING_FILTER_COLUMNS[field];
  const unknown = UNKNOWN_FILTER_VALUE.toLowerCase();
  const includeNull = values.some((value) => value.toLowerCase() === unknown);
  const known = values.filter((value) => value.toLowerCase() !== unknown);

  let matches: (string | number)[] = known;
  if (field === 'lane') {
    // Lane numbers -> lane ids; a number with no lane matches nothing
    matches = known.flatMap((value) => {
      const id = scope.lane_ids_by_number.get(Number(value));
      return id === undefined ? [] : [id];
    });
  } else if (['tag_class', 'vehicle_class', 'axles'].includes(field)) {
    matches = known.map(Number);
  }

  const anyOf: WhereOptions[] = [];
  if (known.length) {
    // An empty IN list compiles to IN (NULL), which matches nothing
    anyOf.push({ [column]: { [Op.in]: matches } });
  }
  if (includeNull) {
    anyOf.push({ [column]: null });
  }
  return anyOf.length === 1 ? anyOf[0] : { [Op.or]: anyOf };
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, '\\$&');
}
