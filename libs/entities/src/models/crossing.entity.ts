import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
} from 'sequelize-typescript';

/**
 * One vehicle crossing. Insert-once: every derived value (flags, lane,
 * price, alert summary, search text) is computed at ingest and the row is
 * never updated afterwards.
 *
 * PK is (id, crossed_at) so the table can be partitioned by month later.
 * Look rows up with `where: { id }`, not findByPk.
 */
@Table({ tableName: 'crossings', timestamps: true, updatedAt: false })
export class Crossing extends Model {
  @Column({
    field: 'id',
    type: DataType.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  })
  declare id: number;

  @Column({
    field: 'crossed_at',
    type: DataType.DATE(3),
    primaryKey: true,
    comment: 'UTC',
  })
  declare crossed_at: Date;

  @Column({ field: 'plaza_id', type: DataType.INTEGER, allowNull: false })
  declare plaza_id: number;

  @Column({ field: 'source_id', type: DataType.STRING(64), allowNull: false })
  declare source_id: string;

  @Column({ field: 'lane_id', type: DataType.INTEGER, allowNull: true })
  declare lane_id: number | null;

  @Column({ field: 'camera_name', type: DataType.STRING(128) })
  declare camera_name: string | null;

  @Column({ field: 'license_plate', type: DataType.STRING(32) })
  declare license_plate: string | null;

  @Column({
    field: 'plate_normalized',
    type: DataType.STRING(32),
    comment: 'Uppercase, letters and digits only',
  })
  declare plate_normalized: string | null;

  @Column({ field: 'plate_bg_color', type: DataType.STRING(16) })
  declare plate_bg_color: string | null;

  @Column({ field: 'plate_text_color', type: DataType.STRING(16) })
  declare plate_text_color: string | null;

  @Column({ field: 'state_name', type: DataType.STRING(64) })
  declare state_name: string | null;

  @Column({ field: 'state_code', type: DataType.STRING(8) })
  declare state_code: string | null;

  @Column({ field: 'rto_code', type: DataType.STRING(16) })
  declare rto_code: string | null;

  @Column({ field: 'district', type: DataType.STRING(128) })
  declare district: string | null;

  @Column({ field: 'location', type: DataType.STRING(255) })
  declare location: string | null;

  @Column({ field: 'region', type: DataType.STRING(32) })
  declare region: string | null;

  @Column({ field: 'vehicle_make', type: DataType.STRING(64) })
  declare vehicle_make: string | null;

  @Column({ field: 'vehicle_model', type: DataType.STRING(64) })
  declare vehicle_model: string | null;

  @Column({ field: 'vehicle_color', type: DataType.STRING(96) })
  declare vehicle_color: string | null;

  @Column({ field: 'vehicle_class', type: DataType.TINYINT })
  declare vehicle_class: number | null;

  @Column({ field: 'tag_class', type: DataType.TINYINT })
  declare tag_class: number | null;

  @Column({ field: 'axles', type: DataType.TINYINT })
  declare axles: number | null;

  @Column({ field: 'description', type: DataType.TEXT })
  declare description: string | null;

  @Column({
    field: 'is_exempt',
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  declare is_exempt: boolean;

  @Column({ field: 'exempt_vehicle_class', type: DataType.STRING(64) })
  declare exempt_vehicle_class: string | null;

  @Column({
    field: 'is_ev',
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  declare is_ev: boolean;

  @Column({
    field: 'is_oos',
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  declare is_oos: boolean;

  @Column({
    field: 'is_commercial',
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  declare is_commercial: boolean;

  @Column({
    field: 'unit_price',
    type: DataType.INTEGER,
    comment: 'Price of vehicle_class at ingest time, kept even when exempt',
  })
  declare unit_price: number | null;

  @Column({
    field: 'amount',
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Toll charged: 0 if exempt, otherwise unit_price',
  })
  declare amount: number;

  @Column({
    field: 'alert_count',
    type: DataType.TINYINT,
    allowNull: false,
    defaultValue: 0,
  })
  declare alert_count: number;

  @Column({
    field: 'alert_max_severity',
    type: DataType.TINYINT,
    allowNull: false,
    defaultValue: 0,
    comment: '3 = HIGH, 2 = MED, 1 = LOW, 0 = none',
  })
  declare alert_max_severity: number;

  @Column({
    field: 'alert_loss',
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  declare alert_loss: number;

  @Column({
    field: 'hard_alert_count',
    type: DataType.TINYINT,
    allowNull: false,
    defaultValue: 0,
    comment: 'Alerts other than soft (description-only) ones',
  })
  declare hard_alert_count: number;

  @Column({
    field: 'hard_alert_max_severity',
    type: DataType.TINYINT,
    allowNull: false,
    defaultValue: 0,
    comment: '3 = HIGH, 2 = MED, 1 = LOW, 0 = none (hard alerts only)',
  })
  declare hard_alert_max_severity: number;

  @Column({
    field: 'hard_alert_loss',
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  declare hard_alert_loss: number;

  // Raw feed fields, stored as sent (meaning not documented by the feed)
  @Column({ field: 'government_class', type: DataType.STRING(64) })
  declare government_class: string | null;

  @Column({ field: 'special_class', type: DataType.STRING(64) })
  declare special_class: string | null;

  @Column({ field: 'clean', type: DataType.STRING(8) })
  declare clean: string | null;

  @Column({ field: 'clean2', type: DataType.STRING(8) })
  declare clean2: string | null;

  @Column({ field: 'clean3', type: DataType.STRING(8) })
  declare clean3: string | null;

  @Column({ field: 'image_path', type: DataType.STRING(512) })
  declare image_path: string | null;

  @Column({ field: 'video_path', type: DataType.STRING(512) })
  declare video_path: string | null;

  @Column({
    field: 'search_text',
    type: DataType.STRING(1024),
    comment: 'Lowercase blob for the q filter',
  })
  declare search_text: string | null;

  @CreatedAt
  declare created_at: Date;
}
