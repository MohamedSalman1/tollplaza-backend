import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Plaza } from '@app/entities/models/plaza.entity';
import { UserPlaza } from '@app/entities/models/user-plaza.entity';
import { Lane } from '@app/entities/models/lane.entity';
import {
  ACTIVE_STATUS,
  DB_CONNECTION,
  MONEY_VISIBLE_ROLES,
} from '@app/entities/constants/constants';
import type { JwtPayload } from '@app/entities/interfaces/jwt-payload.interface';
import type { CrossingScope } from '@app/entities/query/crossing-where';

export type LaneInfo = { id: number; number: number; name: string };

/**
 * Everything a crossing read needs about the plaza, resolved once per
 * request after the access check.
 */
export type PlazaScope = CrossingScope & {
  media_base_url: string | null;
  lanes_by_id: ReadonlyMap<number, LaneInfo>;
  can_see_money: boolean;
};

@Injectable()
export class PlazaAccessService {
  constructor(
    @InjectModel(Plaza, DB_CONNECTION)
    private readonly plazaModel: typeof Plaza,
    @InjectModel(UserPlaza, DB_CONNECTION)
    private readonly userPlazaModel: typeof UserPlaza,
    @InjectModel(Lane, DB_CONNECTION)
    private readonly laneModel: typeof Lane,
  ) {}

  /**
   * Active plazas the user can see: all of them for admins, otherwise the
   * ones in user_plazas.
   */
  async listForUser(user: JwtPayload) {
    const allowed =
      user.role === 'admin'
        ? null
        : (
            await this.userPlazaModel.findAll({
              attributes: ['plaza_id'],
              where: { user_id: user.sub },
              raw: true,
            })
          ).map((row) => row.plaza_id);

    const plazas = await this.plazaModel.findAll({
      attributes: ['id', 'code', 'name', 'timezone'],
      where: {
        status: ACTIVE_STATUS,
        ...(allowed && { id: { [Op.in]: allowed } }),
      },
      order: [['name', 'ASC']],
      raw: true,
    });
    return plazas;
  }

  /**
   * 404 if the plaza doesn't exist or is inactive, 403 if the user can't see
   * it. Admins can see every plaza; other roles need a user_plazas row.
   * `tz` overrides the plaza's own time zone for bucketing.
   */
  async resolve(
    user: JwtPayload,
    plazaId: number,
    tz?: string,
  ): Promise<PlazaScope> {
    const [plaza, access, lanes] = await Promise.all([
      this.plazaModel.findOne({
        where: { id: plazaId, status: ACTIVE_STATUS },
        raw: true,
      }),
      user.role === 'admin'
        ? Promise.resolve(true)
        : this.userPlazaModel.count({
            where: { user_id: user.sub, plaza_id: plazaId },
          }),
      this.laneModel.findAll({
        attributes: ['id', 'number', 'name'],
        where: { plaza_id: plazaId },
        raw: true,
      }),
    ]);

    if (!plaza) {
      throw new NotFoundException('Plaza not found');
    }
    if (!access) {
      throw new ForbiddenException('You do not have access to this plaza');
    }

    return {
      plaza_id: plaza.id,
      timezone: tz ?? plaza.timezone,
      media_base_url: plaza.media_base_url,
      lane_ids_by_number: new Map(lanes.map((lane) => [lane.number, lane.id])),
      lanes_by_id: new Map(lanes.map((lane) => [lane.id, lane])),
      can_see_money: MONEY_VISIBLE_ROLES.includes(user.role),
    };
  }
}
