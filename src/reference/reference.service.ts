import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { TagClass } from '@app/entities/models/tag-class.entity';
import { VehicleClass } from '@app/entities/models/vehicle-class.entity';
import { DB_CONNECTION, INGEST } from '@app/entities/constants/constants';
import type { ReferenceData } from '@app/entities/interfaces/reference-data.interface';

/**
 * The tag / vehicle class mapping and default tariffs, read from the
 * tag_classes and vehicle_classes tables. This is the only source: alert
 * rules, tag pricing, report SQL and labels all use it, so a change to the
 * tables applies everywhere without a deploy (within the cache TTL).
 */
@Injectable()
export class ReferenceService {
  private cached: { data: ReferenceData; loaded_at: number } | null = null;
  private loading: Promise<ReferenceData> | null = null;

  constructor(
    @InjectModel(TagClass, DB_CONNECTION)
    private readonly tagClassModel: typeof TagClass,
    @InjectModel(VehicleClass, DB_CONNECTION)
    private readonly vehicleClassModel: typeof VehicleClass,
  ) {}

  /**
   * Cached for INGEST.cache_ttl_seconds, like the per-plaza ingest data.
   */
  async data(): Promise<ReferenceData> {
    if (
      this.cached &&
      Date.now() - this.cached.loaded_at < INGEST.cache_ttl_seconds * 1000
    ) {
      return this.cached.data;
    }
    // One load at a time, however many requests ask at once
    this.loading ??= this.load().finally(() => (this.loading = null));
    return this.loading;
  }

  invalidate() {
    this.cached = null;
  }

  /**
   * default_price is a tariff, so it's left out unless `withPrices`.
   */
  async tagClasses(withPrices: boolean) {
    const { tags, classes } = await this.data();
    return [...tags.values()].map((tag) => ({
      tag_class: String(tag.tag_class),
      description: tag.description,
      vehicle_classes: tag.vehicle_classes.map((vehicleClass) => {
        const info = classes.get(vehicleClass)!;
        return {
          vehicle_class: String(info.vehicle_class),
          name: info.name,
          ...(withPrices && { default_price: info.default_price }),
        };
      }),
    }));
  }

  /**
   * Vehicle classes ordered by tag, then class.
   */
  async vehicleClasses() {
    const { tags, classes } = await this.data();
    return [...tags.values()].flatMap((tag) =>
      tag.vehicle_classes.map((vehicleClass) => classes.get(vehicleClass)!),
    );
  }

  private async load(): Promise<ReferenceData> {
    const [tagRows, classRows] = await Promise.all([
      this.tagClassModel.findAll({ order: [['tag_class', 'ASC']], raw: true }),
      this.vehicleClassModel.findAll({
        order: [['vehicle_class', 'ASC']],
        raw: true,
      }),
    ]);

    const data: ReferenceData = {
      tags: new Map(
        tagRows.map((tag) => [
          tag.tag_class,
          {
            tag_class: tag.tag_class,
            description: tag.description,
            vehicle_classes: classRows
              .filter((row) => row.tag_class === tag.tag_class)
              .map((row) => row.vehicle_class),
          },
        ]),
      ),
      classes: new Map(
        classRows.map((row) => [
          row.vehicle_class,
          {
            vehicle_class: row.vehicle_class,
            name: row.name,
            tag_class: row.tag_class,
            default_price: row.default_price,
          },
        ]),
      ),
    };
    this.cached = { data, loaded_at: Date.now() };
    return data;
  }
}
