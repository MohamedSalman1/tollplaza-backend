import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
  UpdatedAt,
  BelongsTo,
  ForeignKey,
} from 'sequelize-typescript';
import type { AlertSeverity, AlertType } from '../constants/constants';
import { Crossing } from './crossing.entity';
import { User } from './user.entity';

export const ALERT_STATUSES = ['open', 'reviewed'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

/**
 * One alert raised by the rules at ingest. Only status, reviewed_by,
 * reviewed_at and review_note change afterwards.
 */
@Table({ tableName: 'crossing_alerts', timestamps: true })
export class CrossingAlert extends Model {
  @Column({
    field: 'id',
    type: DataType.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  })
  declare id: number;

  @ForeignKey(() => Crossing)
  @Column({ field: 'crossing_id', type: DataType.BIGINT, allowNull: false })
  declare crossing_id: number;

  // No DB constraint (crossings may be partitioned); join on crossings.id
  @BelongsTo(() => Crossing, {
    foreignKey: 'crossing_id',
    targetKey: 'id',
    constraints: false,
  })
  declare crossing?: Crossing;

  @Column({ field: 'plaza_id', type: DataType.INTEGER, allowNull: false })
  declare plaza_id: number;

  @Column({
    field: 'crossed_at',
    type: DataType.DATE(3),
    allowNull: false,
    comment: 'UTC, copied from the crossing',
  })
  declare crossed_at: Date;

  @Column({ field: 'lane_id', type: DataType.INTEGER, allowNull: true })
  declare lane_id: number | null;

  @Column({ field: 'type', type: DataType.STRING(32), allowNull: false })
  declare type: AlertType;

  @Column({ field: 'severity', type: DataType.STRING(8), allowNull: false })
  declare severity: AlertSeverity;

  @Column({
    field: 'severity_rank',
    type: DataType.TINYINT,
    allowNull: false,
    comment: '3 = HIGH, 2 = MED, 1 = LOW',
  })
  declare severity_rank: number;

  @Column({ field: 'charged_tag', type: DataType.TINYINT, allowNull: true })
  declare charged_tag: number | null;

  @Column({
    field: 'expected_tag',
    type: DataType.STRING(8),
    allowNull: true,
    comment: 'A tag class, or e.g. "7+" for description mismatches',
  })
  declare expected_tag: string | null;

  @Column({
    field: 'loss',
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  declare loss: number;

  @Column({ field: 'reason', type: DataType.STRING(512), allowNull: false })
  declare reason: string;

  @Column({
    field: 'status',
    type: DataType.STRING(16),
    allowNull: false,
    defaultValue: 'open',
    comment: 'open | reviewed',
  })
  declare status: AlertStatus;

  @ForeignKey(() => User)
  @Column({ field: 'reviewed_by', type: DataType.INTEGER, allowNull: true })
  declare reviewed_by: number | null;

  @BelongsTo(() => User, { foreignKey: 'reviewed_by', constraints: false })
  declare reviewer?: User;

  @Column({ field: 'reviewed_at', type: DataType.DATE, allowNull: true })
  declare reviewed_at: Date | null;

  @Column({
    field: 'review_note',
    type: DataType.STRING(512),
    allowNull: true,
  })
  declare review_note: string | null;

  @CreatedAt
  declare created_at: Date;

  @UpdatedAt
  declare updated_at: Date;
}
