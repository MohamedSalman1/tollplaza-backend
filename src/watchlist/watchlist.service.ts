import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, fn, literal } from 'sequelize';
import { Crossing } from '@app/entities/models/crossing.entity';
import { User } from '@app/entities/models/user.entity';
import {
  WATCHLIST_CATEGORIES,
  WatchlistEntry,
} from '@app/entities/models/watchlist-entry.entity';
import {
  DB_CONNECTION,
  DEFAULT_TIMEZONE,
} from '@app/entities/constants/constants';
import type { JwtPayload } from '@app/entities/interfaces/jwt-payload.interface';
import { CrossingFilterDto } from '@app/entities/query/crossing-filter.dto';
import { buildCrossingWhere } from '@app/entities/query/crossing-where';
import { formatPlate, normalizePlate } from '@app/entities/utils/plate';
import { formatInTz } from '@app/entities/utils/time';
import { PlazaAccessService } from '../plazas/plaza-access.service';
import {
  CreateWatchlistDto,
  ListWatchlistDto,
  UpdateWatchlistDto,
} from './dto/watchlist.dto';

export type WatchMatch = { id: number; category: string; note: string | null };

const LIST_LIMIT = 1000;

@Injectable()
export class WatchlistService {
  constructor(
    @InjectModel(WatchlistEntry, DB_CONNECTION)
    private readonly entryModel: typeof WatchlistEntry,
    @InjectModel(Crossing, DB_CONNECTION)
    private readonly crossingModel: typeof Crossing,
    private readonly plazaAccess: PlazaAccessService,
  ) {}

  /**
   * Watchlist matches for a page of plates, in one query. A plaza's own
   * entry wins over an all-plaza one.
   */
  async lookup(
    plazaId: number,
    plates: (string | null)[],
  ): Promise<Map<string, WatchMatch>> {
    const wanted = [...new Set(plates.filter((p): p is string => !!p))];
    const matches = new Map<string, WatchMatch>();
    if (!wanted.length) {
      return matches;
    }

    const entries = await this.entryModel.findAll({
      attributes: ['id', 'plaza_id', 'plate_normalized', 'category', 'note'],
      where: {
        plate_normalized: { [Op.in]: wanted },
        [Op.or]: [{ plaza_id: plazaId }, { plaza_id: null }],
      },
      // Global (NULL) first, so the plaza's own entry overwrites it
      order: [[literal('plaza_id IS NOT NULL'), 'ASC']],
      raw: true,
    });
    for (const entry of entries) {
      matches.set(entry.plate_normalized, {
        id: entry.id,
        category: entry.category,
        note: entry.note,
      });
    }
    return matches;
  }

  async list(user: JwtPayload, dto: ListWatchlistDto) {
    const scope = await this.plazaAccess.resolve(user, dto.plaza_id);
    const plate = normalizePlate(dto.q);

    const entries = await this.entryModel.findAll({
      where: {
        [Op.or]: [{ plaza_id: dto.plaza_id }, { plaza_id: null }],
        ...(dto.category && { category: dto.category }),
        ...(plate && { plate_normalized: { [Op.like]: `%${plate}%` } }),
      },
      include: [{ model: User, as: 'adder', attributes: ['id', 'name'] }],
      order: [['created_at', 'DESC']],
      limit: LIST_LIMIT,
    });
    return { items: entries.map((entry) => toEntry(entry, scope.timezone)) };
  }

  async create(user: JwtPayload, dto: CreateWatchlistDto) {
    const plazaId = dto.plaza_id ?? null;
    const tz = await this.assertCanEdit(user, plazaId);
    const plate = this.plateOf(dto.plate);
    await this.assertNotListed(plazaId, plate);

    const entry = await this.entryModel.create({
      plaza_id: plazaId,
      plate_normalized: plate,
      plate_display: formatPlate(plate) ?? plate,
      category: dto.category,
      note: dto.note ?? null,
      added_by: user.sub,
    });
    return this.reload(entry.id, tz);
  }

  async update(user: JwtPayload, id: number, dto: UpdateWatchlistDto) {
    const entry = await this.find(id);
    const tz = await this.assertCanEdit(user, entry.plaza_id);

    const changes: Partial<WatchlistEntry> = {};
    if (dto.plate !== undefined) {
      const plate = this.plateOf(dto.plate);
      if (plate !== entry.plate_normalized) {
        await this.assertNotListed(entry.plaza_id, plate);
        changes.plate_normalized = plate;
        changes.plate_display = formatPlate(plate) ?? plate;
      }
    }
    if (dto.category !== undefined) changes.category = dto.category;
    if (dto.note !== undefined) changes.note = dto.note;

    await entry.update(changes);
    return this.reload(id, tz);
  }

  async remove(user: JwtPayload, id: number) {
    const entry = await this.find(id);
    await this.assertCanEdit(user, entry.plaza_id);
    await entry.destroy();
  }

  /**
   * Entries by category, and crossings in the filtered range whose plate is
   * on the list. The hit list itself is GET /crossings?watchlist=true.
   */
  async summary(user: JwtPayload, dto: CrossingFilterDto) {
    const scope = await this.plazaAccess.resolve(user, dto.plaza_id, dto.tz);

    const [entries, hitsByPlate] = await Promise.all([
      this.entryModel.findAll({
        attributes: ['category', [fn('COUNT', literal('*')), 'count']],
        where: { [Op.or]: [{ plaza_id: dto.plaza_id }, { plaza_id: null }] },
        group: ['category'],
        raw: true,
      }) as unknown as Promise<{ category: string; count: number | string }[]>,
      this.crossingModel.findAll({
        attributes: ['plate_normalized', [fn('COUNT', literal('*')), 'count']],
        where: buildCrossingWhere({ ...dto, watchlist: true }, scope),
        group: ['plate_normalized'],
        raw: true,
      }) as unknown as Promise<
        { plate_normalized: string; count: number | string }[]
      >,
    ]);

    // Hit plates are a subset of the (small) watchlist: map them in memory
    const matches = await this.lookup(
      dto.plaza_id,
      hitsByPlate.map((row) => row.plate_normalized),
    );
    const hits = new Map<string, number>(
      WATCHLIST_CATEGORIES.map((category) => [category, 0]),
    );
    let totalHits = 0;
    for (const row of hitsByPlate) {
      const category = matches.get(row.plate_normalized)?.category;
      if (category) {
        hits.set(category, (hits.get(category) ?? 0) + Number(row.count));
        totalHits += Number(row.count);
      }
    }
    const counts = new Map(
      entries.map((row) => [row.category, Number(row.count)]),
    );

    return {
      entries: [...counts.values()].reduce((a, b) => a + b, 0),
      hits: totalHits,
      plates_seen: hitsByPlate.length,
      by_category: WATCHLIST_CATEGORIES.map((category) => ({
        category,
        entries: counts.get(category) ?? 0,
        hits: hits.get(category) ?? 0,
      })),
    };
  }

  /**
   * All-plaza entries are admin only; a plaza entry needs access to that
   * plaza. Returns the time zone to format timestamps in.
   */
  private async assertCanEdit(user: JwtPayload, plazaId: number | null) {
    if (plazaId === null) {
      if (user.role !== 'admin') {
        throw new ForbiddenException(
          'Only admins can add or change all-plaza watchlist entries',
        );
      }
      return DEFAULT_TIMEZONE;
    }
    return (await this.plazaAccess.resolve(user, plazaId)).timezone;
  }

  private plateOf(raw: string) {
    const plate = normalizePlate(raw);
    if (!plate || plate.length < 4) {
      throw new BadRequestException(
        'plate must have at least 4 letters or digits',
      );
    }
    return plate;
  }

  // NULL plaza_ids don't collide in the unique index, so check here too
  private async assertNotListed(plazaId: number | null, plate: string) {
    const existing = await this.entryModel.count({
      where: { plaza_id: plazaId, plate_normalized: plate },
    });
    if (existing) {
      throw new ConflictException('That plate is already on this watchlist');
    }
  }

  private async find(id: number) {
    const entry = await this.entryModel.findByPk(id);
    if (!entry) {
      throw new NotFoundException('Watchlist entry not found');
    }
    return entry;
  }

  private async reload(id: number, tz: string) {
    const entry = await this.entryModel.findByPk(id, {
      include: [{ model: User, as: 'adder', attributes: ['id', 'name'] }],
    });
    return toEntry(entry!, tz);
  }
}

function toEntry(entry: WatchlistEntry, tz: string) {
  return {
    id: entry.id,
    plaza_id: entry.plaza_id,
    plate: entry.plate_display,
    plate_normalized: entry.plate_normalized,
    category: entry.category,
    note: entry.note,
    added_by: entry.adder
      ? { id: entry.adder.id, name: entry.adder.name }
      : null,
    created_at: formatInTz(entry.created_at, tz),
    updated_at: formatInTz(entry.updated_at, tz),
  };
}
