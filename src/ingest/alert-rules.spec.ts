import { tagPrice } from '@app/entities/utils/pricing';
import {
  TEST_PRICES as prices,
  TEST_REFERENCE as reference,
} from '../testing/reference.fixture';
import { computeAlerts, summarizeAlerts } from './alert-rules';

const row = (overrides = {}) => ({
  tag_class: 4,
  vehicle_class: 4,
  axles: 2,
  description: 'White hatchback car',
  is_exempt: false,
  exempt_vehicle_class: null,
  ...overrides,
});

const types = (overrides = {}) =>
  computeAlerts(row(overrides), prices, reference).map(
    (a) => `${a.type}:${a.severity}`,
  );

describe('alert rules', () => {
  it('maps classes to tags from the reference data', () => {
    const custom = {
      ...reference,
      classes: new Map(reference.classes).set(20, {
        vehicle_class: 20,
        name: 'Mini truck',
        tag_class: 5,
        default_price: 105,
      }),
    };
    // Class 20 moved to tag 5 in the table: tag 4 charged is now a mismatch
    const [alert] = computeAlerts(row({ vehicle_class: 20 }), prices, custom);
    expect(alert).toMatchObject({ type: 'TAG_MISMATCH', expected_tag: '5' });
    expect(alert.reason).toContain('Mini truck');
  });

  it('prices a tag at its most expensive vehicle class', () => {
    expect(tagPrice(4, prices, reference)).toBe(105); // class 4 = 65, class 20 = 105
    expect(tagPrice(12, prices, reference)).toBe(340);
    expect(tagPrice(null, prices, reference)).toBe(0);
    expect(tagPrice(99, prices, reference)).toBe(0);
  });

  it('raises nothing for a correctly charged car', () => {
    expect(computeAlerts(row(), prices, reference)).toEqual([]);
  });

  describe('TAG_MISMATCH', () => {
    it('is HIGH for a heavy class charged tag 4, with the price difference as loss', () => {
      const [alert] = computeAlerts(
        row({ vehicle_class: 12 }),
        prices,
        reference,
      );
      expect(alert).toMatchObject({
        type: 'TAG_MISMATCH',
        severity: 'HIGH',
        severity_rank: 3,
        charged_tag: 4,
        expected_tag: '12',
        loss: 235,
      });
      expect(alert.reason).toContain('Truck 4-Axle');
    });

    it('is HIGH when the loss is 100 or more', () => {
      expect(types({ vehicle_class: 7 })).toEqual(['TAG_MISMATCH:HIGH']); // 215 - 105
    });

    it('is LOW when the expected tag costs the same', () => {
      expect(types({ vehicle_class: 5 })).toEqual(['TAG_MISMATCH:LOW']);
    });

    it('is LOW when the expected tag is lower', () => {
      const [alert] = computeAlerts(
        row({ vehicle_class: 4, tag_class: 5 }),
        prices,
        reference,
      );
      expect(alert).toMatchObject({ severity: 'LOW', loss: 0 });
    });

    it('needs both classes', () => {
      expect(types({ vehicle_class: null })).toEqual([]);
      expect(types({ tag_class: null })).toEqual([]);
    });
  });

  describe('AXLE_MISMATCH', () => {
    it('expects tag 12 for 4 to 6 axles', () => {
      expect(types({ axles: 5, vehicle_class: 20 })).toEqual([
        'AXLE_MISMATCH:HIGH',
      ]);
      expect(types({ axles: 4, vehicle_class: 7, tag_class: 7 })).toEqual([
        'AXLE_MISMATCH:MED',
      ]);
    });

    it('expects tag 6 for 3 axles', () => {
      const [alert] = computeAlerts(
        row({ axles: 3, vehicle_class: 20 }),
        prices,
        reference,
      );
      expect(alert).toMatchObject({
        type: 'AXLE_MISMATCH',
        severity: 'MED',
        expected_tag: '6',
        loss: 130,
      });
    });

    it('expects tag 15 for 7 or more axles', () => {
      expect(types({ axles: 8, vehicle_class: 15, tag_class: 15 })).toEqual([]);
      expect(types({ axles: 7, vehicle_class: 12, tag_class: 12 })).toEqual([
        'AXLE_MISMATCH:HIGH',
      ]);
    });
  });

  describe('DESC_MISMATCH', () => {
    it('flags a heavy description charged tag 4', () => {
      const [alert] = computeAlerts(
        row({ description: 'Blue goods carrier truck' }),
        prices,
        reference,
      );
      expect(alert).toMatchObject({
        type: 'DESC_MISMATCH',
        severity: 'MED',
        expected_tag: '7+',
        loss: 110,
      });
    });

    it('is HIGH for trailers, tankers and similar', () => {
      expect(types({ description: 'Oil tanker' })).toEqual([
        'DESC_MISMATCH:HIGH',
      ]);
    });

    it('ignores light commercial descriptions', () => {
      expect(types({ description: 'Tata Ace pickup goods carrier' })).toEqual(
        [],
      );
    });

    it('only applies to tag 4', () => {
      expect(
        types({ description: 'truck', tag_class: 7, vehicle_class: 7 }),
      ).toEqual([]);
    });
  });

  describe('EXEMPT_ANOMALY', () => {
    it('is HIGH when the exempt class is missing or "Not exempt"', () => {
      const [alert] = computeAlerts(
        row({ is_exempt: true }),
        prices,
        reference,
      );
      expect(alert).toMatchObject({
        type: 'EXEMPT_ANOMALY',
        severity: 'HIGH',
        expected_tag: null,
        loss: 105,
      });
      expect(
        types({ is_exempt: true, exempt_vehicle_class: 'Not exempt' }),
      ).toEqual(['EXEMPT_ANOMALY:HIGH']);
    });

    it('is MED when an official class has a private-looking description', () => {
      expect(
        types({ is_exempt: true, exempt_vehicle_class: 'Ambulance' }),
      ).toEqual(['EXEMPT_ANOMALY:MED']);
    });

    it('accepts an official description', () => {
      expect(
        types({
          is_exempt: true,
          exempt_vehicle_class: 'Ambulance',
          description: 'White ambulance with siren',
        }),
      ).toEqual([]);
      expect(
        types({
          is_exempt: true,
          exempt_vehicle_class: 'Police',
          description: 'patrol jeep',
        }),
      ).toEqual([]);
    });
  });

  it('does not repeat a heavy undercharge as HIGH_VALUE when TAG_MISMATCH covers it', () => {
    expect(types({ vehicle_class: 13 })).toEqual(['TAG_MISMATCH:HIGH']);
  });

  it('can raise several alerts for one crossing', () => {
    const alerts = computeAlerts(
      row({ vehicle_class: 12, axles: 4, description: 'Container trailer' }),
      prices,
      reference,
    );
    expect(alerts.map((a) => a.type)).toEqual([
      'TAG_MISMATCH',
      'AXLE_MISMATCH',
      'DESC_MISMATCH',
    ]);
    expect(summarizeAlerts(alerts)).toEqual({
      alert_count: 3,
      alert_max_severity: 3,
      alert_loss: 235 + 235 + 110,
      // DESC_MISMATCH is soft, so left out of the hard summary
      hard_alert_count: 2,
      hard_alert_max_severity: 3,
      hard_alert_loss: 235 + 235,
    });
  });

  it('summarizes no alerts as zeros', () => {
    expect(summarizeAlerts([])).toEqual({
      alert_count: 0,
      alert_max_severity: 0,
      alert_loss: 0,
      hard_alert_count: 0,
      hard_alert_max_severity: 0,
      hard_alert_loss: 0,
    });
  });

  it('keeps a crossing with only a description mismatch out of the hard summary', () => {
    const alerts = computeAlerts(
      row({ description: 'Oil tanker' }),
      prices,
      reference,
    );
    expect(summarizeAlerts(alerts)).toMatchObject({
      alert_count: 1,
      alert_max_severity: 3,
      hard_alert_count: 0,
      hard_alert_max_severity: 0,
      hard_alert_loss: 0,
    });
  });
});
