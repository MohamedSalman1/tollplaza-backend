import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
} from 'sequelize-typescript';

export type LoginFailureReason =
  'unknown_email' | 'wrong_password' | 'inactive';

/**
 * One login attempt. geo_* are filled in after the response by a
 * server-side ipapi lookup, and stay NULL if it fails or is skipped.
 */
@Table({ tableName: 'login_audit', timestamps: true, updatedAt: false })
export class LoginAudit extends Model {
  @Column({
    field: 'id',
    type: DataType.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  })
  declare id: number;

  @Column({ field: 'user_id', type: DataType.INTEGER, allowNull: true })
  declare user_id: number | null;

  @Column({
    field: 'email_attempted',
    type: DataType.STRING(255),
    allowNull: false,
  })
  declare email_attempted: string;

  @Column({ field: 'ip', type: DataType.STRING(64), allowNull: true })
  declare ip: string | null;

  @Column({ field: 'user_agent', type: DataType.STRING(512), allowNull: true })
  declare user_agent: string | null;

  @Column({ field: 'success', type: DataType.BOOLEAN, allowNull: false })
  declare success: boolean;

  @Column({
    field: 'failure_reason',
    type: DataType.STRING(32),
    allowNull: true,
    comment: 'unknown_email | wrong_password | inactive',
  })
  declare failure_reason: LoginFailureReason | null;

  @Column({ field: 'geo_country', type: DataType.STRING(64), allowNull: true })
  declare geo_country: string | null;

  @Column({ field: 'geo_region', type: DataType.STRING(128), allowNull: true })
  declare geo_region: string | null;

  @Column({ field: 'geo_city', type: DataType.STRING(128), allowNull: true })
  declare geo_city: string | null;

  @Column({ field: 'geo_org', type: DataType.STRING(255), allowNull: true })
  declare geo_org: string | null;

  @Column({ field: 'geo_raw', type: DataType.JSON, allowNull: true })
  declare geo_raw: unknown;

  @CreatedAt
  declare created_at: Date;
}
