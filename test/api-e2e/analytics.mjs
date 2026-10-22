// End-to-end check: analytics.
// Usage (normally via run.mjs): node analytics.mjs <baseUrl> <apiKey> <adminToken>
const [base, apiKey, admin] = process.argv.slice(2);
let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`);
  if (!ok) failures++;
};
const get = async (path) => {
  const res = await fetch(base + path, { headers: { authorization: `Bearer ${admin}` } });
  return { status: res.status, body: await res.json() };
};

const t = (hhmm) => `2026-10-19T${hhmm}:00+05:30`;
const c = (id, hhmm, lane, extra) => ({
  id, timestamp: t(hhmm), camera_name: `bbai-arcpl-lane${lane}-lpr`, license_plate: `MH40AN${id.slice(1).padStart(4, '0')}`,
  plate_bg_color: 'white', state_name: 'Maharashtra', state_code: 'MH', region: 'West',
  vehicle_class: '4', tag_class: '4', axles: '2', description: 'car', ...extra,
});
const crossings = [
  c('n1', '08:05', 3, { vehicle_make: 'Tata', vehicle_model: 'Nexon' }),
  c('n2', '08:20', 3, { vehicle_make: 'Tata', vehicle_model: 'Nexon', plate_bg_color: 'green' }),
  c('n3', '08:40', 4, { vehicle_make: 'Maruti', vehicle_model: 'Swift' }),
  c('n4', '09:10', 4, { vehicle_make: 'Maruti', vehicle_model: 'Swift', state_name: 'Gujarat', state_code: 'GJ' }),
  c('n5', '13:00', 3, { vehicle_make: 'Tata', vehicle_model: 'Punch', region: 'Central', is_exempt: '1', exempt_vehicle_class: 'Ambulance', description: 'ambulance' }),
  c('n6', '13:05', 3, { vehicle_make: 'Maruti', vehicle_model: 'Swift', region: 'Central', plate_bg_color: 'green' }),
  c('n7', '13:10', 4, { vehicle_make: 'Tata', vehicle_model: 'Ace', vehicle_class: '20', state_name: 'Gujarat', state_code: 'GJ', description: 'goods carrier' }),
  c('n8', '13:15', 4, { vehicle_make: 'Honda', vehicle_model: 'City', region: 'Central', is_exempt: '1', exempt_vehicle_class: 'Police', description: 'police patrol' }),
  c('n9', '13:20', 3, { vehicle_make: 'unknown' }),
  c('n10', '22:30', 3, { vehicle_make: 'Hyundai', vehicle_model: 'Creta', state_name: null, state_code: null, region: null, vehicle_class: '7', tag_class: '7' }),
];
const ing = await fetch(`${base}/ingest/crossings`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
  body: JSON.stringify({ plaza_code: 'nagpur-champa', crossings }),
}).then((r) => r.json());
check('ingest 10', ing.inserted === 10, JSON.stringify(ing));

const W = `?plaza_id=1&from=${encodeURIComponent(t('00:00'))}&to=${encodeURIComponent('2026-10-20T00:00:00+05:30')}`;

const o = (await get(`/crossings/stats/overview${W}`)).body;
check('overview counts', o.total === 10 && o.unique_states === 2 && o.unique_makes === 4 && o.unique_districts === 0, JSON.stringify(o));
check('overview peak 13:00 (5), 4 active hours, 2.5/hr', o.peak_hour === 13 && o.peak_count === 5 && o.active_hours === 4 && o.avg_per_hour === 2.5, JSON.stringify(o));
check('overview top state', o.top_state?.value === 'Maharashtra' && o.top_state.count === 7 && o.top_state.pct === 70, JSON.stringify(o.top_state));

const tl = (await get(`/crossings/stats/timeline${W}&bucket=1h`)).body;
check('timeline 1h: 24 buckets in IST', tl.buckets?.length === 24 && tl.buckets[0].start === '2026-10-19T00:00:00+05:30' && tl.buckets[13].count === 5 && tl.buckets[8].count === 3, JSON.stringify(tl).slice(0, 300));
check('timeline mean/std/anomalies', tl.mean === 0.42 && tl.std_dev === 1.15 && JSON.stringify(tl.anomalies) === '[8,13]', `${tl.mean} ${tl.std_dev} ${JSON.stringify(tl.anomalies)}`);
const td = (await get(`/crossings/stats/timeline${W}&bucket=1d`)).body;
check('timeline 1d: one local day', td.buckets.length === 1 && td.buckets[0].count === 10 && td.buckets[0].start === '2026-10-19T00:00:00+05:30', JSON.stringify(td.buckets));
const t15 = (await get(`/crossings/stats/timeline${W}`)).body;
check('timeline default 15m: 96 buckets, sums to 10', t15.bucket === '15m' && t15.buckets.length === 96 && t15.buckets.reduce((a, b) => a + b.count, 0) === 10);
check('timeline too many buckets 400', (await get(`/crossings/stats/timeline?plaza_id=1&from=2026-01-01T00:00:00Z&bucket=5m`)).status === 400);
check('timeline bad bucket 400', (await get(`/crossings/stats/timeline${W}&bucket=2h`)).status === 400);

const hr = (await get(`/crossings/stats/hourly${W}&group_by=region`)).body;
const west = hr.groups?.find((g) => g.key === 'West');
check('hourly by region', hr.groups?.length === 3 && hr.groups[0].key === 'West' && west.hours.reduce((a, b) => a + b, 0) === 6 && west.hours[8] === 3 && hr.groups.some((g) => g.key === 'Unknown'), JSON.stringify(hr.groups));
const hc = (await get(`/crossings/stats/hourly${W}&group_by=commercial`)).body;
const com = hc.groups.find((g) => g.label === 'Commercial');
check('hourly commercial vs private', com && com.hours[13] === 1 && com.hours[22] === 1 && hc.groups.find((g) => g.label === 'Private').hours[8] === 3, JSON.stringify(hc.groups));
const hn = (await get(`/crossings/stats/hourly${W}`)).body;
check('hourly none', hn.groups.length === 1 && hn.groups[0].hours[13] === 5);
const hl = (await get(`/crossings/stats/hourly${W}&group_by=lane`)).body;
check('hourly by lane labels', hl.groups.map((g) => g.label).sort().join(',') === 'Lane 3,Lane 4', JSON.stringify(hl.groups.map((g) => g.label)));

const bs = (await get(`/crossings/stats/breakdown${W}&field=state`)).body;
check('breakdown state (unknown left out)', bs.total === 10 && bs.distinct === 2 && bs.items[0].key === 'Maharashtra' && bs.items[0].pct === 70 && bs.items.length === 2, JSON.stringify(bs));
const be = (await get(`/crossings/stats/breakdown${W}&field=ev`)).body;
check('breakdown ev true/false', be.items.find((i) => i.key === 'true')?.count === 2 && be.items.find((i) => i.key === 'false')?.label === 'Non-EV', JSON.stringify(be.items));
const bv = (await get(`/crossings/stats/breakdown${W}&field=vehicle_class`)).body;
check('breakdown vehicle_class labels', bv.items[0].key === '4' && bv.items[0].label === 'Car / Jeep / Van', JSON.stringify(bv.items));
const bx = (await get(`/crossings/stats/breakdown${W}&field=exempt_class`)).body;
check('breakdown exempt_class over exempt only', bx.total === 2 && bx.items.length === 2, JSON.stringify(bx));
const bm = (await get(`/crossings/stats/breakdown${W}&field=make&limit=1`)).body;
check('breakdown limit + distinct before limit', bm.items.length === 1 && bm.items[0].key === 'Tata' && bm.distinct === 4, JSON.stringify(bm));
const bl = (await get(`/crossings/stats/breakdown${W}&field=state&lane=4`)).body;
const list4 = (await get(`/crossings${W}&lane=4&include_total=true`)).body.total;
check('breakdown honours filters (lane=4)', bl.total === list4 && list4 === 4, `${bl.total} vs ${list4}`);
const bt = (await get(`/crossings/stats/breakdown${W}&field=tag_class`)).body;
check('breakdown tag label', bt.items[0].label.startsWith('Tag 4 · Car'), bt.items[0].label);
check('breakdown bad field 400', (await get(`/crossings/stats/breakdown${W}&field=price`)).status === 400);

const mx = (await get(`/crossings/stats/matrix${W}&rows=make&cols=model&row_limit=2&col_limit=2`)).body;
check('matrix make x model', mx.rows?.map((r) => r.key).join() === 'Tata,Maruti' && mx.cols.map((c) => c.key).join() === 'Swift,Nexon' && JSON.stringify(mx.cells) === '[[0,2],[3,0]]', JSON.stringify(mx));
check('matrix same field 400', (await get(`/crossings/stats/matrix${W}&rows=make&cols=make`)).status === 400);
check('matrix boolean field 400', (await get(`/crossings/stats/matrix${W}&rows=ev&cols=make`)).status === 400);

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
