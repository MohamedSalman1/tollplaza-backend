import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';

/**
 * Vehicle class, the tag class it's charged under, and the default tariff
 * used to seed a new plaza (each plaza's own prices are in plaza_pricing).
 * Reference data.
 */
@Table({ tableName: 'vehicle_classes', timestamps: true })
export class VehicleClass extends Model {
  @Column({
    field: 'vehicle_class',
    type: DataType.TINYINT,
    primaryKey: true,
  })
  declare vehicle_class: number;

  @Column({
    field: 'name',
    type: DataType.STRING(255),
    allowNull: false,
  })
  declare name: string;

  @Column({
    field: 'tag_class',
    type: DataType.TINYINT,
    allowNull: false,
  })
  declare tag_class: number;

  @Column({
    field: 'default_price',
    type: DataType.INTEGER,
    allowNull: false,
    comment: 'Whole rupees',
  })
  declare default_price: number;

  @CreatedAt
  declare created_at: Date;

  @UpdatedAt
  declare updated_at: Date;
}
