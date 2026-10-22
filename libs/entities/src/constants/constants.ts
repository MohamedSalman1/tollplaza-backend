/**
 * Sequelize connection name for the primary tollplaza database. Must match
 * the key under `databases:` in config/<NODE_ENV>.yaml.
 */
export const DB_CONNECTION = 'tollplaza_db';

export const ACTIVE_STATUS = 1;
export const INACTIVE_STATUS = 0;

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

/**
 * List endpoints use cursor pagination (keyset on timestamp, id).
 */
export const PAGINATION = {
  default_limit: 50,
  max_limit: 200,
};

export const USER_ROLES = [
  'admin',
  'auditor',
  'supervisor',
  'operator',
  'client_viewer',
] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * Roles allowed to see money figures (amount, collection, losses).
 */
export const MONEY_VISIBLE_ROLES: readonly UserRole[] = [
  'admin',
  'auditor',
  'supervisor',
  'client_viewer',
];

export const TIME_RANGES = [
  'today',
  '1h',
  '3h',
  '7h',
  '15h',
  '24h',
  '7d',
  '15d',
  '30d',
  'all',
] as const;
export type TimeRange = (typeof TIME_RANGES)[number];

/**
 * Used when a request sends neither range nor from/to. Kept bounded so
 * stats don't scan the whole history by default.
 */
export const DEFAULT_RANGE: TimeRange = 'today';

/**
 * Column filters shared by every crossing endpoint: query param -> column.
 * The same keys are the facet fields. `Unknown` as a value matches NULL.
 */
export const CROSSING_FILTER_COLUMNS = {
  lane: 'lane_id',
  state: 'state_name',
  district: 'district',
  region: 'region',
  make: 'vehicle_make',
  model: 'vehicle_model',
  color: 'vehicle_color',
  tag_class: 'tag_class',
  vehicle_class: 'vehicle_class',
  axles: 'axles',
} as const;
export type CrossingFilterField = keyof typeof CROSSING_FILTER_COLUMNS;
export const CROSSING_FILTER_FIELDS = Object.keys(
  CROSSING_FILTER_COLUMNS,
) as CrossingFilterField[];

export const UNKNOWN_FILTER_VALUE = 'Unknown';

/**
 * Sort keys for GET /crossings -> column. `timestamp` sorts on crossed_at
 * alone; every other sort is tie-broken by (crossed_at, id).
 */
export const CROSSING_SORT_COLUMNS = {
  timestamp: null,
  lane: 'lane_id',
  plate: 'plate_normalized',
  state: 'state_name',
  district: 'district',
  region: 'region',
  make: 'vehicle_make',
  model: 'vehicle_model',
  tag_class: 'tag_class',
  vehicle_class: 'vehicle_class',
  axles: 'axles',
  color: 'vehicle_color',
} as const;
export type CrossingSort = keyof typeof CROSSING_SORT_COLUMNS;
export const CROSSING_SORTS = Object.keys(
  CROSSING_SORT_COLUMNS,
) as CrossingSort[];

/**
 * Fields the analytics endpoints can group by (breakdown, matrix):
 * param -> column. Booleans report true/false; NULLs ("Unknown") are left out.
 */
export const STAT_FIELD_COLUMNS = {
  state: 'state_name',
  district: 'district',
  rto: 'rto_code',
  region: 'region',
  make: 'vehicle_make',
  model: 'vehicle_model',
  color: 'vehicle_color',
  plate_type: 'plate_bg_color',
  lane: 'lane_id',
  axles: 'axles',
  tag_class: 'tag_class',
  vehicle_class: 'vehicle_class',
  // Counted over exempt crossings only
  exempt_class: 'exempt_vehicle_class',
  oos: 'is_oos',
  ev: 'is_ev',
  commercial: 'is_commercial',
} as const;
export type StatField = keyof typeof STAT_FIELD_COLUMNS;
export const STAT_FIELDS = Object.keys(STAT_FIELD_COLUMNS) as StatField[];
export const BOOLEAN_STAT_FIELDS: readonly StatField[] = [
  'oos',
  'ev',
  'commercial',
];

/**
 * GET /crossings/stats/hourly group_by values. `none` is one series.
 */
export const HOURLY_GROUPS = [
  'none',
  'region',
  'plate_type',
  'commercial',
  'lane',
  'tag_class',
] as const;
export type HourlyGroup = (typeof HOURLY_GROUPS)[number];

/**
 * Timeline bucket sizes in seconds. Buckets align to plaza local time.
 */
export const TIMELINE_BUCKETS = {
  '5m': 5 * 60,
  '15m': 15 * 60,
  '1h': 60 * 60,
  '1d': 24 * 60 * 60,
} as const;
export type TimelineBucket = keyof typeof TIMELINE_BUCKETS;
// Above this, ask for a bigger bucket rather than fill thousands of zeros
export const TIMELINE_MAX_BUCKETS = 3000;

export const STATS = {
  breakdown_default_limit: 10,
  breakdown_max_limit: 100,
  matrix_default_rows: 8,
  matrix_default_cols: 10,
  matrix_max: 30,
};

export const FACETS = {
  default_limit: 50,
  max_limit: 200,
};

/**
 * Pulls the lane number out of a camera name: `bbai-arcpl-lane3-lpr` and
 * `lane3_lpr` are both lane 3.
 */
export const LANE_CAMERA_PATTERN = /lane[\s_-]*(\d+)/i;

/**
 * Derived flags, applied once at ingest.
 */
export const DEFAULT_HOME_STATE_CODES = ['MH', 'BH'];
export const EV_PLATE_BG_COLOR = 'green';
export const COMMERCIAL_DESCRIPTION_PATTERN =
  /truck|bus|goods|lorry|commercial|cargo/i;
export const COMMERCIAL_VEHICLE_CLASSES = [3, 5, 6, 7];

export const INGEST = {
  max_batch: 500,
  // How long plaza, lane and price lookups are cached per plaza
  cache_ttl_seconds: 60,
  // Same plate on the same lane within this window is logged as a possible
  // duplicate capture (several cameras on one lane), not merged
  duplicate_window_seconds: 30,
};

// Tag classes, vehicle classes and default tariffs are reference data in
// the tag_classes / vehicle_classes tables (see ReferenceService).

export const ALERT_TYPES = [
  'TAG_MISMATCH',
  'AXLE_MISMATCH',
  'DESC_MISMATCH',
  'EXEMPT_ANOMALY',
  'HIGH_VALUE',
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

/**
 * Soft alerts rest only on the AI image description, so they produce more
 * false alarms (e.g. mini-trucks described as "truck"). Hard alerts rest on
 * the detected class, axles or exempt data. Alert counts and the has_alerts
 * filter cover hard alerts unless alert_kind says otherwise.
 */
export const SOFT_ALERT_TYPES: readonly AlertType[] = ['DESC_MISMATCH'];
export const HARD_ALERT_TYPES: readonly AlertType[] = ALERT_TYPES.filter(
  (type) => !SOFT_ALERT_TYPES.includes(type),
);
export const ALERT_KINDS = ['hard', 'soft', 'all'] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];
export const DEFAULT_ALERT_KIND: AlertKind = 'hard';
export const alertKindOf = (type: AlertType): 'hard' | 'soft' =>
  SOFT_ALERT_TYPES.includes(type) ? 'soft' : 'hard';

export const ALERT_SEVERITIES = ['HIGH', 'MED', 'LOW'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const SEVERITY_RANK: Record<AlertSeverity, number> = {
  HIGH: 3,
  MED: 2,
  LOW: 1,
};

/**
 * crossings.alert_max_severity / crossing_alerts.severity_rank values.
 */
export const SEVERITY_BY_RANK: Record<number, AlertSeverity> = {
  3: 'HIGH',
  2: 'MED',
  1: 'LOW',
};

/**
 * Who can mark alerts reviewed (client viewers are read-only).
 */
export const ALERT_REVIEW_ROLES: readonly UserRole[] = [
  'admin',
  'auditor',
  'supervisor',
  'operator',
];

export const ALERT_STATUS_FILTERS = ['open', 'reviewed', 'all'] as const;
export type AlertStatusFilter = (typeof ALERT_STATUS_FILTERS)[number];

export const ALERT_REVIEW_MAX_IDS = 500;

/**
 * Who can add, change or remove watchlist entries. All-plaza entries
 * (plaza_id null) are admin only.
 */
export const WATCHLIST_EDIT_ROLES: readonly UserRole[] = [
  'admin',
  'supervisor',
  'operator',
];

/**
 * Who can change a plaza's price table.
 */
export const PRICING_EDIT_ROLES: readonly UserRole[] = ['admin'];

/**
 * Lane health thresholds, based on time since the lane's last crossing.
 */
export const LANE_HEALTH = {
  ok_under_seconds: 10 * 60,
  stale_under_seconds: 60 * 60,
};

/**
 * Keys masked before request headers/bodies are written to the logs.
 */
export const REDACTED_LOG_KEYS = [
  'authorization',
  'password',
  'x-api-key',
  'token',
];
