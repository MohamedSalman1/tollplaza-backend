/**
 * Tag classes and vehicle classes from the tag_classes / vehicle_classes
 * tables, as loaded (and cached) by ReferenceService. Alert rules, tag
 * pricing, report SQL and labels all read the mapping from here.
 */
export type TagClassInfo = {
  tag_class: number;
  description: string;
  vehicle_classes: number[];
};

export type VehicleClassInfo = {
  vehicle_class: number;
  name: string;
  tag_class: number;
  default_price: number;
};

export type ReferenceData = {
  tags: ReadonlyMap<number, TagClassInfo>;
  classes: ReadonlyMap<number, VehicleClassInfo>;
};
