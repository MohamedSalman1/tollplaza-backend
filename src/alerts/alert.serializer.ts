import type { CrossingAlert } from '@app/entities/models/crossing-alert.entity';
import { alertKindOf } from '@app/entities/constants/constants';
import { formatInTz } from '@app/entities/utils/time';
import type { PlazaScope } from '../plazas/plaza-access.service';

/**
 * The alert's own fields (no crossing). Used by the alerts list and the
 * crossing detail drawer. `loss` is left out for roles that can't see money.
 */
export function toAlertFields(
  alert: Pick<
    CrossingAlert,
    | 'id'
    | 'type'
    | 'severity'
    | 'charged_tag'
    | 'expected_tag'
    | 'loss'
    | 'reason'
    | 'status'
    | 'reviewer'
    | 'reviewed_at'
    | 'review_note'
  >,
  scope: PlazaScope,
) {
  return {
    id: String(alert.id),
    type: alert.type,
    // soft = based only on the image description (more false alarms)
    kind: alertKindOf(alert.type),
    severity: alert.severity,
    charged_tag: alert.charged_tag === null ? null : String(alert.charged_tag),
    expected_tag: alert.expected_tag,
    ...(scope.can_see_money && { loss: alert.loss }),
    reason: alert.reason,
    status: alert.status,
    reviewed_by: alert.reviewer
      ? { id: alert.reviewer.id, name: alert.reviewer.name }
      : null,
    reviewed_at: formatInTz(alert.reviewed_at, scope.timezone),
    review_note: alert.review_note,
  };
}
