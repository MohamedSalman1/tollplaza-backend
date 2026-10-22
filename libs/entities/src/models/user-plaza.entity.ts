import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
} from 'sequelize-typescript';

/**
 * Which plazas a user can see. Admins skip this check.
 */
@Table({ tableName: 'user_plazas', timestamps: true, updatedAt: false })
export class UserPlaza extends Model {
  @Column({
    field: 'user_id',
    type: DataType.INTEGER,
    primaryKey: true,
  })
  declare user_id: number;

  @Column({
    field: 'plaza_id',
    type: DataType.INTEGER,
    primaryKey: true,
  })
  declare plaza_id: number;

  @CreatedAt
  declare created_at: Date;
}
