import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import type { UserRole } from '../constants/constants';

@Table({ tableName: 'users', timestamps: true })
export class User extends Model {
  @Column({
    field: 'id',
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  declare id: number;

  @Column({
    field: 'name',
    type: DataType.STRING(255),
    allowNull: false,
  })
  declare name: string;

  @Column({
    field: 'email_address',
    type: DataType.STRING(255),
    allowNull: false,
    unique: true,
  })
  declare email_address: string;

  @Column({
    field: 'password',
    type: DataType.TEXT,
    allowNull: false,
    comment: 'argon2id hash',
  })
  declare password: string;

  @Column({
    field: 'role',
    type: DataType.STRING(32),
    allowNull: false,
    defaultValue: 'operator',
    comment: 'admin | auditor | supervisor | operator | client_viewer',
  })
  declare role: UserRole;

  @Column({
    field: 'status',
    type: DataType.TINYINT,
    allowNull: false,
    defaultValue: 0,
    comment: '1 = active/login allowed, 0 = inactive',
  })
  declare status: number;

  @CreatedAt
  declare created_at: Date;

  @UpdatedAt
  declare updated_at: Date;
}
