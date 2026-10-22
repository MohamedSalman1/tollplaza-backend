import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';

/**
 * Current price per vehicle class. Crossings store the price they were
 * charged at, so changing a row here only affects future crossings.
 */
@Table({ tableName: 'plaza_pricing', timestamps: true })
export class PlazaPricing extends Model {
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
    field: 'vehicle_class',
    type: DataType.TINYINT,
    allowNull: false,
  })
  declare vehicle_class: number;

  @Column({
    field: 'price',
    type: DataType.INTEGER,
    allowNull: false,
    comment: 'Whole rupees',
  })
  declare price: number;

  @Column({
    field: 'updated_by',
    type: DataType.INTEGER,
    allowNull: true,
  })
  declare updated_by: number | null;

  @CreatedAt
  declare created_at: Date;

  @UpdatedAt
  declare updated_at: Date;
}
