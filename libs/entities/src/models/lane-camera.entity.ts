import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';

/**
 * Maps a camera name to its physical lane. A lane can have many cameras.
 */
@Table({ tableName: 'lane_cameras', timestamps: true })
export class LaneCamera extends Model {
  @Column({
    field: 'id',
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  declare id: number;

  @Column({
    field: 'plaza_id',
    type: DataType.INTEGER,
    allowNull: false,
  })
  declare plaza_id: number;

  @Column({
    field: 'lane_id',
    type: DataType.INTEGER,
    allowNull: false,
  })
  declare lane_id: number;

  @Column({
    field: 'camera_name',
    type: DataType.STRING(128),
    allowNull: false,
  })
  declare camera_name: string;

  @Column({
    field: 'role',
    type: DataType.STRING(32),
    allowNull: true,
    comment: 'Free-text label: lpr | rear | axle | ...',
  })
  declare role: string | null;

  @CreatedAt
  declare created_at: Date;

  @UpdatedAt
  declare updated_at: Date;
}
