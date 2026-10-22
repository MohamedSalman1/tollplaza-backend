import {
  SEVERITY_RANK,
  alertKindOf,
  type AlertSeverity,
  type AlertType,
} from '@app/entities/constants/constants';
import { tagPrice } from '@app/entities/utils/pricing';
import type { ReferenceData } from '@app/entities/interfaces/reference-data.interface';
import type { CrossingRow } from './crossing-enricher';

/**
 * The five fraud rules from the reference dashboard (computeAlerts), run
 * once at ingest with the plaza's prices and the vehicle class -> tag
 * mapping (vehicle_classes table) at that moment. Pure: no DB access.
 */

export type AlertDraft = {
  type: AlertType;
  severity: AlertSeverity;
  severity_rank: number;
  charged_tag: number | null;
  expected_tag: string | null;
  loss: number;
  reason: string;
};

type RuleInput = Pick<
  CrossingRow,
  | 'tag_class'
  | 'vehicle_class'
  | 'axles'
  | 'description'
  | 'is_exempt'
  | 'exempt_vehicle_class'
>;

// Tags from cheapest to most expensive vehicle, for "is the expected tag higher"
const TAG_ORDER = [4, 5, 7, 6, 12, 16, 15];
const HEAVY_TAGS = [12, 15, 16];
const LOW_TAGS = [4, 5];
const HIGH_VALUE_CLASSES = [6, 8, 11, 12, 13, 14, 15, 16, 17];

const HEAVY_DESCRIPTION =
  /\b(truck|bus|goods\s*carrier|multi[\s-]*axle|heavy|crane|excavator|cement\s*mixer|trailer|tanker|tipper|dumper|lorry|trolley|cargo|container)\b/i;
const LIGHT_DESCRIPTION =
  /\b(mini[\s-]*van|pickup|bolero|tata\s*ace|maruti\s*van|eeco|omni|tempo)\b/i;
const VERY_HEAVY_DESCRIPTION =
  /multi[\s-]*axle|7[\s-]*axle|trailer|tanker|crane|excavator/i;
const OFFICIAL_CLASS =
  /(ambulance|police|army|military|fire|defen[cs]e|government|hearse|vip|judge)/i;
const OFFICIAL_DESCRIPTION =
  /\b(emergency|siren|patrol|govt|govern|jawan|officer|red\s*cross|funeral)\b/i;

const REASON_MAX = 512;

const tagLabel = (tag: number | null) => (tag === null ? '—' : String(tag));

function alert(
  type: AlertType,
  severity: AlertSeverity,
  fields: Omit<AlertDraft, 'type' | 'severity' | 'severity_rank'>,
): AlertDraft {
  return {
    type,
    severity,
    severity_rank: SEVERITY_RANK[severity],
    ...fields,
    reason: fields.reason.slice(0, REASON_MAX),
  };
}

export function computeAlerts(
  row: RuleInput,
  prices: ReadonlyMap<number, number>,
  reference: ReferenceData,
): AlertDraft[] {
  const out: AlertDraft[] = [];
  const tag = row.tag_class;
  const vehicleClass = row.vehicle_class;
  const axles = row.axles;
  const description = row.description ?? '';
  const loss = (expected: number | null, charged: number | null) =>
    Math.max(
      0,
      tagPrice(expected, prices, reference) -
        tagPrice(charged, prices, reference),
    );
  const classInfo =
    vehicleClass !== null ? reference.classes.get(vehicleClass) : undefined;

  // 1. TAG_MISMATCH: the detected vehicle class maps to another tag
  const expectedByClass = classInfo?.tag_class;
  if (
    tag !== null &&
    expectedByClass !== undefined &&
    expectedByClass !== tag
  ) {
    const amount = loss(expectedByClass, tag);
    let severity: AlertSeverity = 'LOW';
    if (TAG_ORDER.indexOf(expectedByClass) > TAG_ORDER.indexOf(tag)) {
      if (HEAVY_TAGS.includes(expectedByClass) && LOW_TAGS.includes(tag)) {
        severity = 'HIGH';
      } else if (amount >= 100) {
        severity = 'HIGH';
      } else if (amount > 0) {
        severity = 'MED';
      }
    }
    out.push(
      alert('TAG_MISMATCH', severity, {
        charged_tag: tag,
        expected_tag: String(expectedByClass),
        loss: amount,
        reason: `AI detected class ${vehicleClass} (${classInfo?.name ?? 'unknown'}) → expected Tag ${expectedByClass}, charged Tag ${tag}`,
      }),
    );
  }

  // 2. AXLE_MISMATCH: the axle count implies a higher tag
  if (axles !== null && axles > 0 && tag !== null) {
    let expectedByAxle: number | null = null;
    let severity: AlertSeverity = 'LOW';
    if (axles >= 7) {
      expectedByAxle = 15;
      severity = 'HIGH';
    } else if (axles >= 4) {
      if (!HEAVY_TAGS.includes(tag)) {
        expectedByAxle = 12;
        severity = axles >= 5 ? 'HIGH' : 'MED';
      }
    } else if (axles === 3) {
      if (![6, ...HEAVY_TAGS].includes(tag)) {
        expectedByAxle = 6;
        severity = 'MED';
      }
    }
    if (expectedByAxle !== null && expectedByAxle !== tag) {
      out.push(
        alert('AXLE_MISMATCH', severity, {
          charged_tag: tag,
          expected_tag: String(expectedByAxle),
          loss: loss(expectedByAxle, tag),
          reason: `Vehicle has ${axles} axles — expected Tag ${expectedByAxle} (axle-based), charged Tag ${tag}`,
        }),
      );
    }
  }

  // 3. DESC_MISMATCH: tag 4 charged but the image describes a heavy vehicle
  if (
    tag === 4 &&
    description &&
    HEAVY_DESCRIPTION.test(description) &&
    !LIGHT_DESCRIPTION.test(description)
  ) {
    const excerpt =
      description.length > 80 ? `${description.slice(0, 80)}…` : description;
    out.push(
      alert(
        'DESC_MISMATCH',
        VERY_HEAVY_DESCRIPTION.test(description) ? 'HIGH' : 'MED',
        {
          charged_tag: 4,
          // Bus/Truck 2-axle as the conservative baseline
          expected_tag: '7+',
          loss: loss(7, 4),
          reason: `Image describes "${excerpt}" — but charged as Tag 4`,
        },
      ),
    );
  }

  // 4. EXEMPT_ANOMALY: exempt with no valid class, or an official class whose
  // description doesn't look official
  if (row.is_exempt) {
    const exemptClass = row.exempt_vehicle_class ?? '';
    const lostToll = tagPrice(tag ?? 4, prices, reference);
    if (!exemptClass || exemptClass.toLowerCase() === 'not exempt') {
      out.push(
        alert('EXEMPT_ANOMALY', 'HIGH', {
          charged_tag: tag,
          expected_tag: null,
          loss: lostToll,
          reason: `Marked exempt (is_exempt=1) but exempt class is missing or "Not exempt"`,
        }),
      );
    } else if (
      OFFICIAL_CLASS.test(exemptClass) &&
      description &&
      !OFFICIAL_CLASS.test(description) &&
      !OFFICIAL_DESCRIPTION.test(description)
    ) {
      out.push(
        alert('EXEMPT_ANOMALY', 'MED', {
          charged_tag: tag,
          expected_tag: null,
          loss: lostToll,
          reason: `Claimed exempt as "${exemptClass}" but description doesn't indicate an official vehicle`,
        }),
      );
    }
  }

  // 5. HIGH_VALUE: heavy class charged tag 4/5, unless TAG_MISMATCH already
  // covers it (in practice it always does when the class maps to a tag)
  if (
    vehicleClass !== null &&
    tag !== null &&
    HIGH_VALUE_CLASSES.includes(vehicleClass) &&
    LOW_TAGS.includes(tag) &&
    !out.some((existing) => existing.type === 'TAG_MISMATCH')
  ) {
    const expected = classInfo?.tag_class ?? null;
    out.push(
      alert('HIGH_VALUE', 'HIGH', {
        charged_tag: tag,
        expected_tag: expected === null ? null : String(expected),
        loss: loss(expected, tag),
        reason: `Heavy commercial vehicle (class ${vehicleClass}) charged at low Tag ${tagLabel(tag)}`,
      }),
    );
  }

  return out;
}

/**
 * Denormalized onto the crossing row so the list needs no join: one summary
 * over every alert and one over hard alerts only (see SOFT_ALERT_TYPES).
 */
export function summarizeAlerts(alerts: AlertDraft[]) {
  const hard = alerts.filter((a) => alertKindOf(a.type) === 'hard');
  return {
    alert_count: alerts.length,
    alert_max_severity: Math.max(0, ...alerts.map((a) => a.severity_rank)),
    alert_loss: alerts.reduce((sum, a) => sum + a.loss, 0),
    hard_alert_count: hard.length,
    hard_alert_max_severity: Math.max(0, ...hard.map((a) => a.severity_rank)),
    hard_alert_loss: hard.reduce((sum, a) => sum + a.loss, 0),
  };
}
