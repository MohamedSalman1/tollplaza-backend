import { TEST_PRICES } from '../testing/reference.fixture';
import {
  enrichCrossing,
  laneNumberFromCamera,
  parseCrossedAt,
  type EnrichContext,
} from './crossing-enricher';
import type { IngestCrossingItemDto } from './dto/ingest-crossings.dto';
import { formatPlate, normalizePlate } from '@app/entities/utils/plate';

const context: EnrichContext = {
  plaza_id: 1,
  timezone: 'Asia/Kolkata',
  home_state_codes: new Set(['MH', 'BH']),
  prices: TEST_PRICES,
  lane: { id: 7, name: 'Lane 3' },
};

const item = (
  overrides: Partial<IngestCrossingItemDto> = {},
): IngestCrossingItemDto => ({
  id: '872341',
  timestamp: '2026-10-20T17:58:06+05:30',
  camera_name: 'bbai-arcpl-lane3-lpr',
  license_plate: 'MH40CM9551',
  plate_bg_color: 'white',
  state_name: 'Maharashtra',
  state_code: 'MH',
  vehicle_make: 'Maruti Suzuki',
  vehicle_model: 'Ertiga',
  vehicle_class: 4,
  tag_class: 4,
  axles: 2,
  description: 'White MPV',
  is_exempt: false,
  ...overrides,
});

describe('crossing enricher', () => {
  it('maps both lane 3 camera names to lane 3', () => {
    expect(laneNumberFromCamera('bbai-arcpl-lane3-lpr')).toBe(3);
    expect(laneNumberFromCamera('lane3_lpr')).toBe(3);
    expect(laneNumberFromCamera('Lane 12 rear')).toBe(12);
    expect(laneNumberFromCamera('gate-cam')).toBeNull();
    expect(laneNumberFromCamera(null)).toBeNull();
  });

  it('normalizes plates', () => {
    expect(normalizePlate('MH 40 CM-9551')).toBe('MH40CM9551');
    expect(normalizePlate(' - ')).toBeNull();
  });

  it('formats plates for display', () => {
    expect(formatPlate('MH40CM9551')).toBe('MH 40 CM 9551');
    expect(formatPlate('22BH1234AA')).toBe('22 BH 1234 AA');
    expect(formatPlate('MH4089')).toBe('MH 4089');
    expect(formatPlate('X?12')).toBe('X?12');
  });

  it('reads a timestamp without an offset as plaza time', () => {
    expect(parseCrossedAt('2026-10-20 17:58:06', 'Asia/Kolkata')).toEqual(
      new Date('2026-10-20T12:28:06Z'),
    );
    expect(parseCrossedAt('2026-10-20T12:28:06Z', 'Asia/Kolkata')).toEqual(
      new Date('2026-10-20T12:28:06Z'),
    );
    expect(parseCrossedAt('not a date', 'Asia/Kolkata')).toBeNull();
  });

  it('prices a regular private car', () => {
    const row = enrichCrossing(item(), context)!;
    expect(row).toMatchObject({
      lane_id: 7,
      plate_normalized: 'MH40CM9551',
      is_ev: false,
      is_oos: false,
      is_commercial: false,
      is_exempt: false,
      unit_price: 65,
      amount: 65,
    });
    expect(row.search_text).toContain('mh40cm9551');
    expect(row.search_text).toContain('lane 3');
  });

  it('flags EV and out-of-state', () => {
    const row = enrichCrossing(
      item({ plate_bg_color: 'Green', state_code: 'gj' }),
      context,
    )!;
    expect(row.is_ev).toBe(true);
    expect(row.is_oos).toBe(true);
    expect(row.state_code).toBe('GJ');
  });

  it('does not flag BH-series plates as out-of-state', () => {
    expect(enrichCrossing(item({ state_code: 'BH' }), context)!.is_oos).toBe(
      false,
    );
  });

  it('flags commercial by description or vehicle class', () => {
    expect(
      enrichCrossing(item({ description: 'Blue goods carrier' }), context)!
        .is_commercial,
    ).toBe(true);
    expect(
      enrichCrossing(item({ vehicle_class: 7, tag_class: 7 }), context)!
        .is_commercial,
    ).toBe(true);
  });

  it('charges 0 for exempt but keeps the unit price', () => {
    const row = enrichCrossing(
      item({ is_exempt: true, exempt_vehicle_class: 'Ambulance' }),
      context,
    )!;
    expect(row.unit_price).toBe(65);
    expect(row.amount).toBe(0);
  });

  it('stores an unpriced class with no unit price and 0 amount', () => {
    const row = enrichCrossing(item({ vehicle_class: 99 }), context)!;
    expect(row.unit_price).toBeNull();
    expect(row.amount).toBe(0);
  });

  it('maps empty and unknown values to null', () => {
    const row = enrichCrossing(
      item({
        vehicle_make: 'unknown',
        district: '  ',
        vehicle_class: undefined,
      }),
      context,
    )!;
    expect(row.vehicle_make).toBeNull();
    expect(row.district).toBeNull();
    expect(row.vehicle_class).toBeNull();
  });

  it('strips the leading slash from relative media paths only', () => {
    const row = enrichCrossing(
      item({
        image_url: '/2026/10/20/abc.jpg',
        video_url: 'https://cdn.example.com/clip.mp4',
      }),
      context,
    )!;
    expect(row.image_path).toBe('2026/10/20/abc.jpg');
    expect(row.video_path).toBe('https://cdn.example.com/clip.mp4');
  });
});
