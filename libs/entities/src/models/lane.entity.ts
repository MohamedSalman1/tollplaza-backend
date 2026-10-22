import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';

/**
 * One row per physical lane. Its cameras are in lane_cameras.
 */
@Table({ tableName: 'lanes', timestamps: true })
export class Lane extends Model {
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
    field: 'number',
    type: DataType.SMALLINT,
    allowNull: false,
  })
  declare number: number;

  @Column({
    field: 'name',
    type: DataType.STRING(64),
    allowNull: false,
  })
  declare name: string;

  @Column({
    field: 'status',
    type: DataType.TINYINT,
    allowNull: false,
    defaultValue: 1,
    comment: '1 = active, 0 = inactive',
  })
  declare status: number;

  @CreatedAt
  declare created_at: Date;

  @UpdatedAt
  declare updated_at: Date;
}
