// End-to-end check: reports.
// Usage (normally via run.mjs): node reports.mjs <baseUrl> <apiKey> <adminToken> <operatorToken>
const [base, apiKey, admin, operator] = process.argv.slice(2);
let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`);
  if (!ok) failures++;
};
const get = async (path, token = admin) => {
  const res = await fetch(base + path, { headers: { authorization: `Bearer ${token}` } });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch {}
  return { status: res.status, body, text, type: res.headers.get('content-type') };
};

const c = (id, day, hhmm, extra) => ({
  id, timestamp: `2026-10-${day}T${hhmm}:00+05:30`, camera_name: 'bbai-arcpl-lane3-lpr',
  license_plate: `MH40RP${id.slice(1).padStart(4, '0')}`, plate_bg_color: 'white', state_name: 'Maharashtra', state_code: 'MH',
  vehicle_class: '4', tag_class: '4', axles: '2', description: 'car', ...extra,
});
const lane4 = { camera_name: 'bbai-arcpl-lane4-lpr' };
const crossings = [
  c('r1', 18, '10:00', { vehicle_make: 'Tata' }),
  c('r2', 18, '10:30', { vehicle_make: 'Tata', plate_bg_color: 'green' }),
  c('r3', 18, '11:00', { vehicle_class: '7', tag_class: '7' }),
  c('r4', 18, '11:30', { is_exempt: '1', exempt_vehicle_class: 'Ambulance', description: 'ambulance' }),
  c('r5', 19, '09:00', { vehicle_class: '12', tag_class: '12', axles: '4' }),
  c('r6', 19, '09:30', { ...lane4, axles: '5', vehicle_make: 'Tata' }),
  c('r7', 19, '10:00', { ...lane4, vehicle_class: '20', axles: '3' }),
  c('r8', 19, '10:30', { is_exempt: '1', axles: '4' }),
  c('r9', 19, '11:00', { vehicle_class: '5', tag_class: null, state_name: 'Gujarat', state_code: 'GJ' }),
  c('r10', 19, '23:50', { vehicle_make: 'Maruti' }),
  c('r11', 19, '00:10', { vehicle_make: 'Maruti' }),
];
const ing = await fetch(`${base}/ingest/crossings`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
  body: JSON.stringify({ plaza_code: 'nagpur-champa', crossings }),
}).then((r) => r.json());
check('ingest 11 crossings, 4 alerts', ing.inserted === 11 && ing.alerts === 4, JSON.stringify(ing));

const W = `?plaza_id=1&from=${encodeURIComponent('2026-10-18T00:00:00+05:30')}&to=${encodeURIComponent('2026-10-20T00:00:00+05:30')}`;

const s = (await get(`/reports/summary${W}`)).body;
check('summary totals', s.crossings === 11 && s.days === 2 && s.collection === 1090 && s.avg_per_crossing === 99.09 && s.exempt === 2, JSON.stringify(s));
check('summary revenue at risk', s.revenue_at_risk?.amount === 705 && s.revenue_at_risk.pct_of_collection === 64.7, JSON.stringify(s.revenue_at_risk));
check('summary daily', JSON.stringify(s.daily) === JSON.stringify([{ day: '2026-10-18', count: 4, collection: 345 }, { day: '2026-10-19', count: 7, collection: 745 }]), JSON.stringify(s.daily));
check('summary tag share (tag5 from vehicle class)', s.tag_share[0].tag_class === '4' && s.tag_share[0].count === 8 && s.tag_share.some((t) => t.tag_class === '5' && t.count === 1), JSON.stringify(s.tag_share));
check('summary top days by collection', s.top_days[0].day === '2026-10-19', JSON.stringify(s.top_days));
check('summary ops mix', s.ops_mix.commercial.count === 2 && s.ops_mix.ev.count === 1 && s.ops_mix.oos.count === 1 && s.ops_mix.exempt.pct === 18.2, JSON.stringify(s.ops_mix));
check('summary badges', JSON.stringify(s.badges) === JSON.stringify({ days: 2, active_tags: 4, exempt: 2, overload: 2 }), JSON.stringify(s.badges));
const kpi = (await get(`/crossings/stats/summary${W}`)).body;
check('report collection matches KPI strip', kpi.collection === s.collection && kpi.total_crossings === s.crossings, `${kpi.collection} vs ${s.collection}`);
const so = (await get(`/reports/summary${W}`, operator)).body;
check('operator summary: no money', !('collection' in so) && !('revenue_at_risk' in so) && !('collection' in so.daily[0]) && !('collection' in so.tag_share[0]), JSON.stringify(so).slice(0, 200));

const d = (await get(`/reports/daily${W}`)).body;
const d18 = d.days?.[0], d19 = d.days?.[1];
check('daily day 1', d18?.day === '2026-10-18' && d18.count === 4 && d18.collection === 345 && d18.ev === 1 && d18.exempt === 1 && d18.commercial === 1 && d18.hours[10] === 2 && d18.hours[11] === 2, JSON.stringify(d18));
check('daily day 2 (00:10 and 23:50 stay on the 19th)', d19?.count === 7 && d19.collection === 745 && d19.oos === 1 && d19.hours[0] === 1 && d19.hours[23] === 1 && d19.hours[9] === 2, JSON.stringify(d19));
check('daily totals', d.totals.count === 11 && d.totals.collection === 1090 && d.totals.hours.reduce((a, b) => a + b, 0) === 11, JSON.stringify(d.totals));
const dop = (await get(`/reports/daily${W}`, operator)).body;
check('operator daily: no collection', !('collection' in dop.days[0]) && !('collection' in dop.totals));

const t = (await get(`/reports/tag-classes${W}`)).body;
const tag4 = t.tags?.find((x) => x.tag_class === '4');
check('tag classes: all 7 tags', t.tags?.length === 7 && t.tags.find((x) => x.tag_class === '16').count === 0, JSON.stringify(t.tags?.map((x) => x.tag_class)));
check('tag 4 row', tag4.count === 8 && tag4.collection === 430 && tag4.active_days === 2 && tag4.share === 72.7 && tag4.top_makes[0].make === 'Tata' && tag4.top_makes[0].count === 3, JSON.stringify(tag4));
const vc = (k) => t.by_vehicle_class.find((x) => `${x.tag_class}|${x.vehicle_class}` === k);
check('tag x vehicle class', vc('4|4')?.count === 7 && vc('4|4').collection === 325 && vc('4|20')?.collection === 105 && vc('5|5')?.count === 1 && t.by_vehicle_class.length === 5, JSON.stringify(t.by_vehicle_class));
check('tag collections add up', t.tags.reduce((a, x) => a + x.collection, 0) === 1090);

const e = (await get(`/reports/exempt${W}`)).body;
check('exempt report', e.total === 2 && e.pct_of_crossings === 18.2 && e.forgone_revenue === 130 && e.suspicious === 1, JSON.stringify(e));
check('exempt categories', e.categories.some((x) => x.class === 'Ambulance' && x.forgone === 65) && e.categories.some((x) => x.class === 'Unverified / no class' && x.count === 1), JSON.stringify(e.categories));
check('operator exempt: no forgone', !('forgone_revenue' in (await get(`/reports/exempt${W}`, operator)).body));

const o = (await get(`/reports/overload${W}`)).body;
check('overload totals (exempt excluded)', o.total === 2 && o.estimated_loss === 365 && o.high === 1, JSON.stringify(o).slice(0, 300));
check('overload worst lane + by axle', o.worst_lane?.lane?.number === 4 && o.worst_lane.count === 2 && JSON.stringify(o.by_axle) === JSON.stringify([{ axles: 3, count: 1, loss: 130 }, { axles: 5, count: 1, loss: 235 }]), JSON.stringify({ w: o.worst_lane, a: o.by_axle }));
check('overload log', o.log.length === 2 && o.log[0].type === 'AXLE_MISMATCH' && o.log[0].severity === 'HIGH' && o.log[0].crossing.axles === 5 && o.next_cursor === null, JSON.stringify(o.log?.[0]).slice(0, 200));
const o1 = (await get(`/reports/overload${W}&limit=1`)).body;
const o2 = (await get(`/reports/overload${W}&limit=1&cursor=${o1.next_cursor}`)).body;
check('overload log pages', o1.log.length === 1 && o1.total === 2 && o2.log.length === 1 && o2.log[0].id !== o1.log[0].id && o2.next_cursor === null);
check('overload with lane=3 filter -> 0', (await get(`/reports/overload${W}&lane=3`)).body.total === 0);

const lines = (text) => text.replace(/^﻿/, '').trim().split('\n');
const sc = await get(`/reports/summary/export.csv${W}`);
check('summary csv', sc.type?.startsWith('text/csv') && lines(sc.text).includes('collection,1090'), sc.text.slice(0, 200));
const dc = lines((await get(`/reports/daily/export.csv${W}`)).text);
check('daily csv: 2 days + TOTAL', dc.length === 4 && dc[3].startsWith('TOTAL,11,1090') && dc[0].endsWith('h23'), dc.join(' | ').slice(0, 300));
const tc = lines((await get(`/reports/tag-classes/export.csv${W}`)).text);
check('tag classes csv', tc.length === 6 && tc[0] === 'tag_class,vehicle_class,vehicle_class_name,count,collection', tc.join(' | '));
const ec = lines((await get(`/reports/exempt/export.csv${W}`)).text);
check('exempt csv: 2 entries', ec.length === 3 && ec[0].includes('forgone_toll'), ec.join(' | '));
const ecOp = lines((await get(`/reports/exempt/export.csv${W}`, operator)).text);
check('operator exempt csv: no money column', !ecOp[0].includes('forgone_toll'));
const oc = lines((await get(`/reports/overload/export.csv${W}`)).text);
check('overload csv: 2 rows', oc.length === 3 && oc[1].includes('AXLE_MISMATCH'), oc.join(' | ').slice(0, 300));
check('report unknown param 400', (await get(`/reports/daily${W}&bogus=1`)).status === 400);

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
