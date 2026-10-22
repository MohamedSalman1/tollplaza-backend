import type { ReferenceData } from '@app/entities/interfaces/reference-data.interface';

/**
 * The reference data the create-tag-and-vehicle-classes migration seeds, for
 * unit tests (the app itself reads the tables via ReferenceService).
 */
const TAGS: [number, string][] = [
  [4, 'Car / Jeep / Van / TATA Ace and similar mini LCV'],
  [5, 'Light Commercial Vehicle'],
  [6, 'Three Axle Commercial Vehicle'],
  [7, 'Bus / Truck (2-axle)'],
  [12, '4 to 6 Axle'],
  [15, '7 or More Axle'],
  [16, 'Heavy Construction Machinery'],
];

// [vehicle_class, name, tag_class, default_price]
const CLASSES: [number, string, number, number][] = [
  [4, 'Car / Jeep / Van', 4, 65],
  [20, 'TATA Ace and similar mini LCV', 4, 105],
  [5, 'Light Commercial Vehicle 2-axle', 5, 105],
  [9, 'Mini-Bus', 5, 105],
  [6, 'Light Commercial Vehicle 3-axle', 6, 235],
  [8, 'Bus 3-axle', 6, 235],
  [11, 'Truck 3-axle', 6, 235],
  [7, 'Bus 2-axle', 7, 215],
  [10, 'Truck 2-axle', 7, 215],
  [12, 'Truck 4-Axle', 12, 340],
  [13, 'Truck 5-Axle', 12, 340],
  [14, 'Truck 6-Axle', 12, 340],
  [15, 'Truck Multi Axle (7 and Above)', 15, 410],
  [16, 'Earth Moving Machinery', 16, 340],
  [17, 'Heavy Construction Machinery', 16, 340],
];

export const TEST_REFERENCE: ReferenceData = {
  tags: new Map(
    TAGS.map(([tag_class, description]) => [
      tag_class,
      {
        tag_class,
        description,
        vehicle_classes: CLASSES.filter(([, , tag]) => tag === tag_class).map(
          ([vehicleClass]) => vehicleClass,
        ),
      },
    ]),
  ),
  classes: new Map(
    CLASSES.map(([vehicle_class, name, tag_class, default_price]) => [
      vehicle_class,
      { vehicle_class, name, tag_class, default_price },
    ]),
  ),
};

/**
 * Default tariff per vehicle class, as a plaza starts with.
 */
export const TEST_PRICES: ReadonlyMap<number, number> = new Map(
  CLASSES.map(([vehicleClass, , , price]) => [vehicleClass, price]),
);
