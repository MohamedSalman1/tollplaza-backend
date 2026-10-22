import type { ReferenceData } from '../interfaces/reference-data.interface';

/**
 * Price of a tag class: the highest price among its vehicle classes. One
 * rule for alert losses and the overload report (the reference app used the
 * cheapest class for overload, which made the two disagree).
 */
export function tagPrice(
  tag: number | null,
  prices: ReadonlyMap<number, number>,
  reference: ReferenceData,
): number {
  const info = tag === null ? undefined : reference.tags.get(tag);
  if (!info) {
    return 0;
  }
  return Math.max(
    0,
    ...info.vehicle_classes.map(
      (vehicleClass) => prices.get(vehicleClass) ?? 0,
    ),
  );
}
