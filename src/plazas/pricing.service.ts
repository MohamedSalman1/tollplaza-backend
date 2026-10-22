import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { PlazaPricing } from '@app/entities/models/plaza-pricing.entity';
import { DB_CONNECTION } from '@app/entities/constants/constants';
import type { JwtPayload } from '@app/entities/interfaces/jwt-payload.interface';
import { formatInTz } from '@app/entities/utils/time';
import { PlazaContextService } from '../ingest/plaza-context.service';
import { PlazaAccessService } from './plaza-access.service';
import { ReferenceService } from '../reference/reference.service';
import { UpdatePricingDto } from './dto/update-pricing.dto';

@Injectable()
export class PricingService {
  constructor(
    @InjectModel(PlazaPricing, DB_CONNECTION)
    private readonly pricingModel: typeof PlazaPricing,
    private readonly plazaAccess: PlazaAccessService,
    private readonly plazaContext: PlazaContextService,
    private readonly reference: ReferenceService,
  ) {}

  /**
   * Every vehicle class in vehicle_classes, with this plaza's price or null
   * when none is set (a crossing of an unpriced class is stored with amount
   * 0), and the default tariff for reference.
   */
  async get(user: JwtPayload, plazaId: number) {
    const scope = await this.plazaAccess.resolve(user, plazaId);
    const [rows, classes] = await Promise.all([
      this.pricingModel.findAll({ where: { plaza_id: plazaId }, raw: true }),
      this.reference.vehicleClasses(),
    ]);
    const byClass = new Map(rows.map((row) => [row.vehicle_class, row]));

    return {
      plaza_id: plazaId,
      prices: classes.map((vehicleClass) => {
        const row = byClass.get(vehicleClass.vehicle_class);
        return {
          vehicle_class: String(vehicleClass.vehicle_class),
          name: vehicleClass.name,
          tag_class: String(vehicleClass.tag_class),
          default_price: vehicleClass.default_price,
          price: row?.price ?? null,
          updated_by: row?.updated_by ?? null,
          updated_at: formatInTz(row?.updated_at ?? null, scope.timezone),
        };
      }),
    };
  }

  async update(user: JwtPayload, plazaId: number, dto: UpdatePricingDto) {
    await this.plazaAccess.resolve(user, plazaId);

    const classes = dto.prices.map((item) => item.vehicle_class);
    if (new Set(classes).size !== classes.length) {
      throw new BadRequestException('Each vehicle_class can appear only once');
    }
    const known = new Set(
      (await this.reference.vehicleClasses()).map((row) => row.vehicle_class),
    );
    const unknown = classes.filter((vehicleClass) => !known.has(vehicleClass));
    if (unknown.length) {
      throw new BadRequestException(
        `Unknown vehicle_class: ${unknown.join(', ')}`,
      );
    }

    await this.pricingModel.bulkCreate(
      dto.prices.map((item) => ({
        plaza_id: plazaId,
        vehicle_class: item.vehicle_class,
        price: item.price,
        updated_by: user.sub,
      })),
      { updateOnDuplicate: ['price', 'updated_by', 'updated_at'] },
    );

    // New crossings on this instance pick up the prices immediately; other
    // instances within INGEST.cache_ttl_seconds
    this.plazaContext.invalidate(plazaId);

    return this.get(user, plazaId);
  }
}
