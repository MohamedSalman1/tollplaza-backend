import { SEVERITY_BY_RANK } from '@app/entities/constants/constants';
import type { Crossing } from '@app/entities/models/crossing.entity';
import { formatPlate } from '@app/entities/utils/plate';
import { formatInTz } from '@app/entities/utils/time';
import type { PlazaScope } from '../plazas/plaza-access.service';
import type { WatchMatch } from '../watchlist/watchlist.service';

export type WatchMatches = ReadonlyMap<string, WatchMatch>;

/**
 * Columns read for list items. Detail adds the rest.
 */
export const LIST_ATTRIBUTES = [
  'id',
  'crossed_at',
  'lane_id',
  'camera_name',
  'license_plate',
  'plate_normalized',
  'plate_bg_color',
  'state_name',
  'state_code',
  'district',
  'region',
  'vehicle_make',
  'vehicle_model',
  'vehicle_color',
  'vehicle_class',
  'tag_class',
  'axles',
  'description',
  'is_ev',
  'is_oos',
  'is_commercial',
  'is_exempt',
  'exempt_vehicle_class',
  'amount',
  'alert_count',
  'alert_max_severity',
  'alert_loss',
  'hard_alert_count',
  'hard_alert_max_severity',
  'hard_alert_loss',
  'image_path',
] as const;

export const DETAIL_ATTRIBUTES = [
  ...LIST_ATTRIBUTES,
  'plaza_id',
  'location',
  'rto_code',
  'plate_text_color',
  'unit_price',
  'video_path',
  'government_class',
  'special_class',
  'clean',
  'clean2',
  'clean3',
] as const;

type ListRow = Pick<Crossing, (typeof LIST_ATTRIBUTES)[number]>;
type DetailRow = Pick<Crossing, (typeof DETAIL_ATTRIBUTES)[number]>;

/**
 * Relative upload paths are joined to the plaza's media base URL so the
 * frontend never needs to know the upload location.
 */
export function mediaUrl(base: string | null, path: string | null) {
  if (!path || /^https?:\/\//i.test(path)) {
    return path;
  }
  return base ? `${base.replace(/\/+$/, '')}/${path}` : path;
}

// The feed sends classes as strings, and the frontend already expects that
const asString = (value: number | null) =>
  value === null ? null : String(value);

/**
 * List item shape (workflow doc §2.2). Money fields are left out for roles
 * that can't see money.
 */
export function toListItem(
  row: ListRow,
  scope: PlazaScope,
  watch?: WatchMatches,
) {
  const match = row.plate_normalized
    ? watch?.get(row.plate_normalized)
    : undefined;
  const lane = row.lane_id ? scope.lanes_by_id.get(row.lane_id) : undefined;

  return {
    id: String(row.id),
    timestamp: formatInTz(row.crossed_at, scope.timezone),
    lane: lane
      ? {
          id: lane.id,
          number: lane.number,
          name: lane.name,
          camera: row.camera_name,
        }
      : null,
    license_plate: row.license_plate,
    plate_formatted: formatPlate(row.license_plate),
    plate_bg_color: row.plate_bg_color,
    state_name: row.state_name,
    state_code: row.state_code,
    district: row.district,
    region: row.region,
    vehicle_make: row.vehicle_make,
    vehicle_model: row.vehicle_model,
    vehicle_color: row.vehicle_color,
    vehicle_class: asString(row.vehicle_class),
    tag_class: asString(row.tag_class),
    axles: row.axles,
    description: row.description,
    flags: {
      ev: Boolean(row.is_ev),
      oos: Boolean(row.is_oos),
      commercial: Boolean(row.is_commercial),
      exempt: Boolean(row.is_exempt),
    },
    exempt_vehicle_class: row.exempt_vehicle_class,
    ...(scope.can_see_money && { amount: row.amount }),
    // Hard alerts only; soft (description-only) ones are counted apart
    alerts: {
      count: row.hard_alert_count,
      max_severity: SEVERITY_BY_RANK[row.hard_alert_max_severity] ?? null,
      ...(scope.can_see_money && { loss: row.hard_alert_loss }),
      soft_count: row.alert_count - row.hard_alert_count,
    },
    watchlist: match ? { category: match.category, note: match.note } : null,
    thumbnail_url: mediaUrl(scope.media_base_url, row.image_path),
  };
}

export function toDetail(
  row: DetailRow,
  scope: PlazaScope,
  plateCrossingCount: number,
  watch?: WatchMatches,
) {
  return {
    ...toListItem(row, scope, watch),
    location: row.location,
    rto_code: row.rto_code,
    plate_text_color: row.plate_text_color,
    ...(scope.can_see_money && { unit_price: row.unit_price }),
    image_url: mediaUrl(scope.media_base_url, row.image_path),
    video_url: mediaUrl(scope.media_base_url, row.video_path),
    plate_crossing_count: plateCrossingCount,
    // Raw feed fields, as sent
    feed: {
      government_class: row.government_class,
      special_class: row.special_class,
      clean: row.clean,
      clean2: row.clean2,
      clean3: row.clean3,
    },
  };
}
