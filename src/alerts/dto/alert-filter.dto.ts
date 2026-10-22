import { IsIn, IsOptional, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { CrossingFilterDto } from '@app/entities/query/crossing-filter.dto';
import { toList } from '@app/entities/query/transforms';
import {
  ALERT_SEVERITIES,
  ALERT_STATUS_FILTERS,
  ALERT_TYPES,
  type AlertSeverity,
  type AlertStatusFilter,
  type AlertType,
} from '@app/entities/constants/constants';

/**
 * The crossing filters plus alert-only ones. Shared by the list, summary and
 * CSV export.
 */
export class AlertFilterDto extends CrossingFilterDto {
  @Transform(toList)
  @IsOptional()
  @IsIn(ALERT_SEVERITIES, {
    each: true,
    message: `severity must be one or more of: ${ALERT_SEVERITIES.join(', ')}`,
  })
  declare severity?: AlertSeverity[];

  @Transform(toList)
  @IsOptional()
  @IsIn(ALERT_TYPES, {
    each: true,
    message: `type must be one or more of: ${ALERT_TYPES.join(', ')}`,
  })
  declare type?: AlertType[];

  // Default open. Ignored by the summary, which reports both.
  @IsOptional()
  @IsIn(ALERT_STATUS_FILTERS, {
    message: `status must be one of: ${ALERT_STATUS_FILTERS.join(', ')}`,
  })
  declare status?: AlertStatusFilter;

  // An expected tag (alerts that should have been charged it) or `exempt`.
  // Tags come from tag_classes, so any number is accepted; an unknown one
  // simply matches nothing.
  @IsOptional()
  @Matches(/^(\d{1,2}|exempt)$/, {
    message: 'focus must be a tag class (e.g. 12) or exempt',
  })
  declare focus?: string;
}
