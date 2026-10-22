import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';

@Table({ tableName: 'plazas', timestamps: true })
export class Plaza extends Model {
  @Column({
    field: 'id',
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  declare id: number;

  @Column({
    field: 'code',
    type: DataType.STRING(64),
    allowNull: false,
    unique: true,
  })
  declare code: string;

  @Column({
    field: 'name',
    type: DataType.STRING(255),
    allowNull: false,
  })
  declare name: string;

  @Column({
    field: 'timezone',
    type: DataType.STRING(64),
    allowNull: false,
    defaultValue: 'Asia/Kolkata',
  })
  declare timezone: string;

  @Column({
    field: 'home_state_codes',
    type: DataType.JSON,
    allowNull: false,
    comment: 'State codes that are not out-of-state, e.g. ["MH","BH"]',
  })
  declare home_state_codes: string[] | string;

  @Column({
    field: 'media_base_url',
    type: DataType.STRING(512),
    allowNull: true,
  })
  declare media_base_url: string | null;

  @Column({
    field: 'status',
    type: DataType.TINYINT,
    allowNull: false,
    defaultValue: 1,
    comment: '1 = active, 0 = inactive (ingest rejected)',
  })
  declare status: number;

  @CreatedAt
  declare created_at: Date;

  @UpdatedAt
  declare updated_at: Date;
}
