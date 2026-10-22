import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
  UpdatedAt,
  BelongsTo,
  ForeignKey,
} from 'sequelize-typescript';
import { User } from './user.entity';

export const WATCHLIST_CATEGORIES = [
  'stolen',
  'bolo',
  'blacklisted',
  'vip',
  'custom',
] as const;
export type WatchlistCategory = (typeof WATCHLIST_CATEGORIES)[number];

/**
 * A plate to watch for. plaza_id NULL applies to every plaza.
 */
@Table({ tableName: 'watchlist_entries', timestamps: true })
export class WatchlistEntry extends Model {
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
    allowNull: true,
    comment: 'NULL = all plazas',
  })
  declare plaza_id: number | null;

  @Column({
    field: 'plate_normalized',
    type: DataType.STRING(32),
    allowNull: false,
  })
  declare plate_normalized: string;

  @Column({
    field: 'plate_display',
    type: DataType.STRING(32),
    allowNull: false,
  })
  declare plate_display: string;

  @Column({
    field: 'category',
    type: DataType.STRING(16),
    allowNull: false,
    comment: 'stolen | bolo | blacklisted | vip | custom',
  })
  declare category: WatchlistCategory;

  @Column({ field: 'note', type: DataType.STRING(512), allowNull: true })
  declare note: string | null;

  @ForeignKey(() => User)
  @Column({ field: 'added_by', type: DataType.INTEGER, allowNull: true })
  declare added_by: number | null;

  @BelongsTo(() => User, { foreignKey: 'added_by', constraints: false })
  declare adder?: User;

  @CreatedAt
  declare created_at: Date;

  @UpdatedAt
  declare updated_at: Date;
}
