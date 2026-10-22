import {
  COMMERCIAL_DESCRIPTION_PATTERN,
  COMMERCIAL_VEHICLE_CLASSES,
  EV_PLATE_BG_COLOR,
  LANE_CAMERA_PATTERN,
} from '@app/entities/constants/constants';
import { normalizePlate } from '@app/entities/utils/plate';
import { dayjs } from '@app/entities/utils/time';
import type { IngestCrossingItemDto } from './dto/ingest-crossings.dto';

/**
 * Pure rules applied to every crossing at ingest. No DB access: the plaza,
 * lane and prices are passed in, so this can be unit-tested on its own.
 */

export type EnrichContext = {
  plaza_id: number;
  timezone: string;
  home_state_codes: ReadonlySet<string>;
  prices: ReadonlyMap<number, number>;
  lane: { id: number; name: string } | null;
};

export type CrossingRow = {
  plaza_id: number;
  source_id: string;
  crossed_at: Date;
  lane_id: number | null;
  camera_name: string | null;
  license_plate: string | null;
  plate_normalized: string | null;
  plate_bg_color: string | null;
  plate_text_color: string | null;
  state_name: string | null;
  state_code: string | null;
  rto_code: string | null;
  district: string | null;
  location: string | null;
  region: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_color: string | null;
  vehicle_class: number | null;
  tag_class: number | null;
  axles: number | null;
  description: string | null;
  is_exempt: boolean;
  exempt_vehicle_class: string | null;
  is_ev: boolean;
  is_oos: boolean;
  is_commercial: boolean;
  unit_price: number | null;
  amount: number;
  // Set from the alert rules after enrichment
  alert_count: number;
  alert_max_severity: number;
  alert_loss: number;
  hard_alert_count: number;
  hard_alert_max_severity: number;
  hard_alert_loss: number;
  government_class: string | null;
  special_class: string | null;
  clean: string | null;
  clean2: string | null;
  clean3: string | null;
  image_path: string | null;
  video_path: string | null;
  search_text: string | null;
};

// Values the feed uses to mean "no value"
const EMPTY_VALUES = new Set(['', 'unknown', 'null']);

const OFFSET_SUFFIX = /(z|[+-]\d{2}:?\d{2})$/i;

const SEARCH_TEXT_MAX = 1024;

/**
 * Trims, maps empty/unknown to null and cuts to the column size.
 */
export function clean(
  value: string | null | undefined,
  maxLength: number,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = String(value).trim();
  if (EMPTY_VALUES.has(trimmed.toLowerCase())) {
    return null;
  }
  return trimmed.slice(0, maxLength);
}

/**
 * A timestamp with an offset (or Z) is used as is. One without an offset is
 * plaza local time. Returns null if it can't be parsed.
 */
export function parseCrossedAt(value: string, tz: string): Date | null {
  const trimmed = value.trim();
  const parsed = OFFSET_SUFFIX.test(trimmed)
    ? dayjs(trimmed)
    : dayjs.tz(trimmed, tz);
  return parsed.isValid() ? parsed.toDate() : null;
}

/**
 * `bbai-arcpl-lane3-lpr` -> 3, `lane3_lpr` -> 3, `gate-cam` -> null
 */
export function laneNumberFromCamera(cameraName: string | null): number | null {
  const match = LANE_CAMERA_PATTERN.exec(cameraName ?? '');
  return match ? Number(match[1]) : null;
}

/**
 * Relative upload paths are stored without a leading slash. Absolute URLs
 * (some video_url values) are kept as they are.
 */
function mediaPath(value: string | null | undefined): string | null {
  const path = clean(value, 512);
  if (!path || /^https?:\/\//i.test(path)) {
    return path;
  }
  return path.replace(/^\/+/, '');
}

/**
 * Turns one validated feed item into a crossings row. Returns null when the
 * timestamp can't be parsed.
 */
export function enrichCrossing(
  item: IngestCrossingItemDto,
  ctx: EnrichContext,
): CrossingRow | null {
  const crossed_at = parseCrossedAt(item.timestamp, ctx.timezone);
  if (!crossed_at) {
    return null;
  }

  const license_plate = clean(item.license_plate, 32);
  const plate_bg_color = clean(item.plate_bg_color, 16)?.toLowerCase() ?? null;
  const state_code = clean(item.state_code, 8)?.toUpperCase() ?? null;
  const description = clean(item.description, 65535);
  const vehicle_class = item.vehicle_class ?? null;
  const is_exempt = item.is_exempt ?? false;

  const unit_price =
    vehicle_class !== null ? (ctx.prices.get(vehicle_class) ?? null) : null;

  const row: CrossingRow = {
    plaza_id: ctx.plaza_id,
    source_id: item.id,
    crossed_at,
    lane_id: ctx.lane?.id ?? null,
    camera_name: clean(item.camera_name, 128),
    license_plate,
    plate_normalized: normalizePlate(license_plate),
    plate_bg_color,
    plate_text_color: clean(item.plate_text_color, 16)?.toLowerCase() ?? null,
    state_name: clean(item.state_name, 64),
    state_code,
    rto_code: clean(item.rto_code, 16)?.toUpperCase() ?? null,
    district: clean(item.district, 128),
    location: clean(item.location, 255),
    region: clean(item.region, 32),
    vehicle_make: clean(item.vehicle_make, 64),
    vehicle_model: clean(item.vehicle_model, 64),
    vehicle_color: clean(item.vehicle_color, 96),
    vehicle_class,
    tag_class: item.tag_class ?? null,
    axles: item.axles ?? null,
    description,
    is_exempt,
    exempt_vehicle_class: clean(item.exempt_vehicle_class, 64),
    is_ev: plate_bg_color === EV_PLATE_BG_COLOR,
    is_oos: state_code !== null && !ctx.home_state_codes.has(state_code),
    is_commercial:
      COMMERCIAL_DESCRIPTION_PATTERN.test(description ?? '') ||
      (vehicle_class !== null &&
        COMMERCIAL_VEHICLE_CLASSES.includes(vehicle_class)),
    unit_price,
    amount: is_exempt ? 0 : (unit_price ?? 0),
    alert_count: 0,
    alert_max_severity: 0,
    alert_loss: 0,
    hard_alert_count: 0,
    hard_alert_max_severity: 0,
    hard_alert_loss: 0,
    government_class: clean(item.government_class, 64),
    special_class: clean(item.special_class, 64),
    clean: clean(item.clean, 8),
    clean2: clean(item.clean2, 8),
    clean3: clean(item.clean3, 8),
    image_path: mediaPath(item.image_url),
    video_path: mediaPath(item.video_url),
    search_text: null,
  };

  row.search_text = buildSearchText(row, ctx.lane?.name ?? null);
  return row;
}

function buildSearchText(row: CrossingRow, laneName: string | null) {
  // Short fields first so a long description is what gets cut off
  const text = [
    row.license_plate,
    row.plate_normalized,
    row.state_name,
    row.state_code,
    row.district,
    row.location,
    row.rto_code,
    row.vehicle_color,
    row.vehicle_make,
    row.vehicle_model,
    laneName,
    row.description,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .slice(0, SEARCH_TEXT_MAX);
  return text || null;
}
