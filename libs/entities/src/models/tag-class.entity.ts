import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';

/**
 * FASTag class (4, 5, 6, 7, 12, 15, 16). Reference data.
 */
@Table({ tableName: 'tag_classes', timestamps: true })
export class TagClass extends Model {
  @Column({
    field: 'tag_class',
    type: DataType.TINYINT,
    primaryKey: true,
  })
  declare tag_class: number;

  @Column({
    field: 'description',
    type: DataType.STRING(255),
    allowNull: false,
  })
  declare description: string;

  @CreatedAt
  declare created_at: Date;

  @UpdatedAt
  declare updated_at: Date;
}
