// End-to-end check of ingest + crossings read APIs against a running app.
// Usage (normally via run.mjs): node crossings.mjs <baseUrl> <apiKey> <adminToken> <operatorToken> <noAccessToken>
const [base, apiKey, admin, operator, noAccess] = process.argv.slice(2);
let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`);
  if (!ok) failures++;
};
const get = async (path, token = admin) => {
  const res = await fetch(base + path, { headers: { authorization: `Bearer ${token}` } });
  return { status: res.status, body: await res.json() };
};

const now = Date.now();
const at = (minAgo) => new Date(now - minAgo * 60000).toISOString();
const crossings = [
  { id: 'e1', timestamp: at(50), camera_name: 'bbai-arcpl-lane3-lpr', license_plate: 'MH40CM9551', plate_bg_color: 'white', state_name: 'Maharashtra', state_code: 'MH', district: 'Nagpur', vehicle_make: 'Maruti Suzuki', vehicle_color: 'White', vehicle_class: '4', tag_class: '4', axles: '2' },
  { id: 'e2', timestamp: at(45), camera_name: 'lane3_lpr', license_plate: 'GJ01AB1234', plate_bg_color: 'green', state_name: 'Gujarat', state_code: 'GJ', district: 'Ahmedabad', vehicle_make: 'Tata', vehicle_color: 'Blue', vehicle_class: '4', tag_class: '4', axles: '2' },
  { id: 'e3', timestamp: at(40), camera_name: 'bbai-arcpl-lane4-lpr', license_plate: 'MH31XY0001', plate_bg_color: 'yellow', state_name: 'Maharashtra', state_code: 'MH', district: 'Nagpur', vehicle_make: 'Tata', vehicle_color: 'White', vehicle_class: '7', tag_class: '7', axles: '2', description: 'goods truck' },
  { id: 'e4', timestamp: at(30), camera_name: 'bbai-arcpl-lane4-lpr', license_plate: 'MH40CM9551', plate_bg_color: 'white', state_name: 'Maharashtra', state_code: 'MH', district: 'Nagpur', vehicle_make: 'unknown', vehicle_color: 'White', vehicle_class: '4', tag_class: '4', axles: '2' },
  { id: 'e5', timestamp: at(30), camera_name: 'bbai-arcpl-lane3-lpr', license_plate: 'KA01MN4321', plate_bg_color: 'white', state_name: 'Karnataka', state_code: 'KA', district: 'Bengaluru', vehicle_make: 'Honda', vehicle_color: 'Red', vehicle_class: '4', tag_class: '4', axles: '2', is_exempt: '1', exempt_vehicle_class: 'Ambulance' },
  { id: 'e6', timestamp: at(20), camera_name: 'bbai-arcpl-lane4-lpr', license_plate: 'MH49QQ7777', plate_bg_color: 'white', state_name: 'Maharashtra', state_code: 'MH', vehicle_make: 'Tata', vehicle_color: 'Black', vehicle_class: '12', tag_class: '12', axles: '4' },
  { id: 'e7', timestamp: at(10), camera_name: 'bbai-arcpl-lane3-lpr', license_plate: '22BH1234AA', plate_bg_color: 'white', state_name: 'Bharat', state_code: 'BH', vehicle_make: 'Hyundai', vehicle_color: 'White', vehicle_class: '4', tag_class: '4', axles: '2' },
  { id: 'e8', timestamp: at(5), camera_name: 'bbai-arcpl-lane4-lpr', license_plate: 'MP09ZZ1111', plate_bg_color: 'white', state_name: 'Madhya Pradesh', state_code: 'MP', vehicle_make: 'Tata', vehicle_color: 'White', vehicle_class: '5', tag_class: '5', axles: '2' },
  { id: 'e9', timestamp: at(1), camera_name: 'bbai-arcpl-lane3-lpr', license_plate: 'MH40AA0002', plate_bg_color: 'white', state_name: 'Maharashtra', state_code: 'MH', district: 'Nagpur', vehicle_color: 'Silver', vehicle_class: '4', tag_class: '4', axles: '2', image_url: '/2026/x.jpg' },
];
const ing = await fetch(`${base}/ingest/crossings`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
  body: JSON.stringify({ plaza_code: 'nagpur-champa', crossings }),
}).then((r) => r.json());
check('ingest inserts 9', ing.inserted === 9, JSON.stringify(ing));

const P = '?plaza_id=1';
const all = await get(`/crossings${P}&include_total=true`);
check('list 200 + total 9', all.status === 200 && all.body.total === 9, JSON.stringify(all.body).slice(0, 300));
check('newest first', all.body.items[0].license_plate === 'MH40AA0002');
const first = all.body.items[0];
check('item shape', first.plate_formatted === 'MH 40 AA 0002' && first.lane?.number === 3 && first.amount === 65 && first.timestamp.endsWith('+05:30') && first.thumbnail_url?.startsWith('https://') && first.vehicle_class === '4', JSON.stringify(first));

for (const [sort, dir] of [['timestamp', 'desc'], ['make', 'asc'], ['make', 'desc'], ['district', 'asc'], ['lane', 'desc']]) {
  const seen = [];
  let cursor = null;
  let pages = 0;
  do {
    const r = await get(`/crossings${P}&limit=2&sort=${sort}&dir=${dir}${cursor ? `&cursor=${cursor}` : ''}`);
    seen.push(...r.body.items.map((i) => i.id));
    cursor = r.body.next_cursor;
    pages++;
  } while (cursor && pages < 20);
  check(`paging sort=${sort} ${dir}: 9 unique rows`, seen.length === 9 && new Set(seen).size === 9, seen.join(','));
}

const count = async (qs) => (await get(`/crossings${P}&include_total=true&${qs}`)).body.total;
check('ev=true -> 1', (await count('ev=true')) === 1);
check('oos=true -> 3 (GJ, KA, MP; BH is home)', (await count('oos=true')) === 3);
check('commercial=true -> 2 (class 7, class 5)', (await count('commercial=true')) === 2);
check('exempt=true -> 1', (await count('exempt=true')) === 1);
check('lane=3 -> 5', (await count('lane=3')) === 5);
check('state=Gujarat,Karnataka -> 2', (await count('state=Gujarat,Karnataka')) === 2);
check('make=Unknown -> 2', (await count('make=Unknown')) === 2);
check('district=Unknown -> 3', (await count('district=Unknown')) === 3);
check('q=mh 40 -> 3 (plate with spaces)', (await count('q=mh%2040')) === 3);
check('q=bengaluru -> 1', (await count('q=bengaluru')) === 1);
check('q=100% (escaped) -> 0', (await count('q=100%25')) === 0);
check('plate=MH 40 CM 9551 -> 2', (await count('plate=MH%2040%20CM%209551')) === 2);
check('tag_class=4&lane=4 -> 1', (await count('tag_class=4&lane=4')) === 1);
check('lane=99 -> 0', (await count('lane=99')) === 0);
check('range=1h -> 9', (await count('range=1h')) === 9);
check('from/to window', (await count(`from=${encodeURIComponent(at(35))}&to=${encodeURIComponent(at(15))}`)) === 3);

const f = await get(`/crossings/facets${P}&field=state,lane,make&state=Gujarat`);
const facet = (name) => f.body.facets?.find((x) => x.field === name);
check('facets 200', f.status === 200, JSON.stringify(f.body).slice(0, 300));
check('state facet ignores its own filter', facet('state')?.total === 9 && facet('state').values[0].value === 'Maharashtra' && facet('state').values[0].count === 5, JSON.stringify(facet('state')));
check('lane facet uses others (state=Gujarat)', facet('lane')?.total === 1 && facet('lane').values[0].value === '3', JSON.stringify(facet('lane')));
const mk = await get(`/crossings/facets${P}&field=make`);
check('make facet has Unknown', mk.body.facets[0].values.some((v) => v.value === 'Unknown' && v.count === 2), JSON.stringify(mk.body));

const s = (await get(`/crossings/stats/summary${P}`)).body;
check('summary totals', s.total_crossings === 9 && s.total_unfiltered === 9 && s.ev === 1 && s.exempt === 1 && s.oos.count === 3, JSON.stringify(s));
check('summary collection 985', s.collection === 985, s.collection);
check('summary by_tag sums to total', s.by_tag.reduce((a, t) => a + t.count, 0) === 9);
check('summary top_make Tata (4)', s.top_make?.value === 'Tata' && s.top_make.count === 4, JSON.stringify(s.top_make));
check('summary last_crossing_at', typeof s.last_crossing_at === 'string' && s.last_crossing_at.endsWith('+05:30'), s.last_crossing_at);
const sf = (await get(`/crossings/stats/summary${P}&lane=4`)).body;
const lf = await count('lane=4');
check('summary agrees with list for lane=4', sf.total_crossings === lf && sf.total_unfiltered === 9, `${sf.total_crossings} vs ${lf}`);

const d = await get(`/crossings/${all.body.items.find((i) => i.license_plate === 'MH40CM9551').id}`);
check('detail 200 + plate count 2', d.status === 200 && d.body.crossing.plate_crossing_count === 2 && d.body.crossing.unit_price === 65, JSON.stringify(d.body).slice(0, 300));
check('detail 404', (await get('/crossings/999999999')).status === 404);
check('detail non-numeric 400', (await get('/crossings/abc')).status === 400);

const op = await get(`/crossings${P}`, operator);
check('operator with access: 200, no money', op.status === 200 && !('amount' in op.body.items[0]) && !('loss' in op.body.items[0].alerts), JSON.stringify(op.body.items?.[0]).slice(0, 200));
const ops = (await get(`/crossings/stats/summary${P}`, operator)).body;
check('operator summary hides collection', !('collection' in ops) && !('collection' in ops.by_tag[0]));
check('no plaza access: 403', (await get(`/crossings${P}`, noAccess)).status === 403);
check('unknown plaza: 404', (await get(`/crossings?plaza_id=999`)).status === 404);
check('no token: 401', (await fetch(`${base}/crossings${P}`)).status === 401);

check('bad cursor 400', (await get(`/crossings${P}&cursor=nonsense`)).status === 400);
const c1 = (await get(`/crossings${P}&limit=2`)).body.next_cursor;
check('cursor for other sort 400', (await get(`/crossings${P}&limit=2&sort=make&cursor=${c1}`)).status === 400);
check('unknown param 400', (await get(`/crossings${P}&bogus=1`)).status === 400);
check('bad range 400', (await get(`/crossings${P}&range=2y`)).status === 400);
check('missing plaza_id 400', (await get(`/crossings`)).status === 400);

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
