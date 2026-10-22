// End-to-end check: alerts at ingest, alerts API, hard/soft kinds, feed fields,
// pricing, reference.
// Usage (normally via run.mjs): node alerts.mjs <baseUrl> <apiKey> <adminToken> <operatorToken> <viewerNoAccessToken>
const [base, apiKey, admin, operator, viewer] = process.argv.slice(2);
let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`);
  if (!ok) failures++;
};
const req = async (method, path, token = admin, body) => {
  const res = await fetch(base + path, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body && { 'content-type': 'application/json' }) },
    body: body && JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, body: json, text, headers: res.headers };
};
const get = (path, token) => req('GET', path, token);
const ingest = (crossings) =>
  fetch(`${base}/ingest/crossings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({ plaza_code: 'nagpur-champa', crossings }),
  }).then((r) => r.json());

const now = Date.now();
const at = (minAgo) => new Date(now - minAgo * 60000).toISOString();
const base3 = { camera_name: 'bbai-arcpl-lane3-lpr', plate_bg_color: 'white', state_name: 'Maharashtra', state_code: 'MH', vehicle_class: '4', tag_class: '4', axles: '2', description: 'White car' };
const base4 = { ...base3, camera_name: 'bbai-arcpl-lane4-lpr' };
const seed = [
  { ...base3, id: 'a1', timestamp: at(60), license_plate: 'MH40TR0001', vehicle_class: '12', axles: '4', description: 'Blue vehicle' }, // TAG HIGH 235 + AXLE MED 235
  { ...base4, id: 'a2', timestamp: at(50), license_plate: 'MH40TK0002', description: 'Oil tanker' }, // DESC HIGH 110 (soft)
  { ...base3, id: 'a3', timestamp: at(40), license_plate: 'MH40EX0003', is_exempt: '1' }, // EXEMPT HIGH 105
  { ...base4, id: 'a4', timestamp: at(30), license_plate: 'MH40AM0004', is_exempt: '1', exempt_vehicle_class: 'Ambulance', description: 'White sedan' }, // EXEMPT MED 105
  { ...base4, id: 'a5', timestamp: at(20), license_plate: 'MH40LC0005', vehicle_class: '5' }, // TAG LOW 0
  { ...base3, id: 'a6', timestamp: at(10), license_plate: 'MH40OK0006' }, // none
  { ...base3, id: 'a7', timestamp: at(5), license_plate: 'GJ01AX0007', state_name: 'Gujarat', state_code: 'GJ', axles: '3' }, // AXLE MED 130
];
const r = await ingest(seed);
check('ingest 7 crossings, 7 alerts', r.inserted === 7 && r.alerts === 7, JSON.stringify(r));
const again = await ingest(seed);
check('re-push adds no alerts', again.inserted === 0 && again.alerts === 0, JSON.stringify(again));

// alert_kind=all keeps these checks' original meaning; the hard/soft
// defaults are checked further down
const P = '?plaza_id=1&alert_kind=all';
const D = '?plaza_id=1';
const total = async (path, qs = '', token) => {
  const items = [];
  let cursor = null;
  for (let i = 0; i < 20; i++) {
    const res = await get(`${path}${P}&limit=2${qs}${cursor ? `&cursor=${cursor}` : ''}`, token);
    if (res.status !== 200) return { status: res.status, body: res.body };
    items.push(...res.body.items);
    cursor = res.body.next_cursor;
    if (!cursor) break;
  }
  return { items, ids: items.map((x) => x.id) };
};

// --- crossings side
const flagged = await get(`/crossings${P}&has_alerts=true&include_total=true`);
check('crossings has_alerts=true (all) -> 6', flagged.body.total === 6, flagged.body.total);
const a1 = flagged.body.items.find((i) => i.license_plate === 'MH40TR0001');
check('a1 list summary: 2 hard alerts, HIGH, loss 470', a1.alerts.count === 2 && a1.alerts.max_severity === 'HIGH' && a1.alerts.loss === 470 && a1.alerts.soft_count === 0, JSON.stringify(a1.alerts));
const d = await get(`/crossings/${a1.id}`);
check('detail lists both alerts with reasons', d.body.crossing.alerts.items.length === 2 && d.body.crossing.alerts.items[0].type === 'TAG_MISMATCH' && d.body.crossing.alerts.items[0].kind === 'hard' && d.body.crossing.alerts.items[0].reason.includes('Truck 4-Axle'), JSON.stringify(d.body.crossing.alerts));

// --- alerts list
const all = await total('/alerts');
check('alerts list walks 7 unique', all.ids?.length === 7 && new Set(all.ids).size === 7, JSON.stringify(all).slice(0, 300));
const sev = all.items.map((a) => a.severity);
check('sorted HIGH, MED, LOW', sev.join(',') === 'HIGH,HIGH,HIGH,MED,MED,MED,LOW', sev.join(','));
check('HIGH sorted newest first', all.items[0].crossing.license_plate === 'MH40EX0003' && all.items[2].crossing.license_plate === 'MH40TR0001');
check('alert item shape', all.items[0].status === 'open' && all.items[0].loss === 105 && all.items[0].crossing.lane.number === 3, JSON.stringify(all.items[0]).slice(0, 300));
const n = async (qs) => (await total('/alerts', qs)).ids?.length;
check('severity=HIGH -> 3', (await n('&severity=HIGH')) === 3);
check('severity=MED,LOW -> 4', (await n('&severity=MED,LOW')) === 4);
check('type=EXEMPT_ANOMALY -> 2', (await n('&type=EXEMPT_ANOMALY')) === 2);
check('focus=12 -> 2', (await n('&focus=12')) === 2);
check('focus=7 -> 1 (7+)', (await n('&focus=7')) === 1);
check('focus=6 -> 1 (not 16)', (await n('&focus=6')) === 1);
check('focus=exempt -> 2', (await n('&focus=exempt')) === 2);
check('state=Gujarat -> 1 (crossing filter join)', (await n('&state=Gujarat')) === 1);
check('lane=4 -> 3', (await n('&lane=4')) === 3);
check('q=tanker -> 1', (await n('&q=tanker')) === 1);
check('bad severity 400', (await get(`/alerts${P}&severity=HUGE`)).status === 400);

// --- summary
const s = (await get(`/alerts/summary${P}`)).body;
check('summary counts', s.open === 7 && s.total_alerts === 7 && s.total_flagged === 6 && s.critical_open === 3 && s.exempt_anomalies === 2 && s.crossings_scanned === 7, JSON.stringify(s));
check('summary loss 920', s.estimated_loss === 920, s.estimated_loss);
check('summary worst lane 3 (4 open)', s.worst_lane?.lane?.number === 3 && s.worst_lane.open === 4, JSON.stringify(s.worst_lane));
check('summary by_severity', JSON.stringify(s.by_severity.map((x) => x.count)) === '[3,3,1]', JSON.stringify(s.by_severity));
check('summary by_type', s.by_type.find((t) => t.type === 'TAG_MISMATCH').count === 2 && s.by_type.find((t) => t.type === 'AXLE_MISMATCH').loss === 365, JSON.stringify(s.by_type));
const sg = (await get(`/alerts/summary${P}&state=Gujarat`)).body;
check('summary with crossing filter', sg.total_alerts === 1 && sg.crossings_scanned === 1, JSON.stringify(sg));

// --- review
const rv = await req('POST', '/alerts/review', operator, { crossing_ids: [Number(a1.id)], reviewed: true, note: 'Checked footage' });
check('operator reviews a1 -> 2 updated', rv.status === 200 && rv.body.updated === 2, JSON.stringify(rv.body));
const rv2 = await req('POST', '/alerts/review', operator, { crossing_ids: [Number(a1.id)], reviewed: true });
check('re-review is a no-op', rv2.body.updated === 0, JSON.stringify(rv2.body));
const s2 = (await get(`/alerts/summary${P}`)).body;
check('summary after review', s2.open === 5 && s2.reviewed.count === 2 && s2.reviewed.pct === 28.6 && s2.critical_open === 2, JSON.stringify(s2.reviewed));
const reviewed = await get(`/alerts${P}&status=reviewed`);
check('status=reviewed shows reviewer', reviewed.body.items.length === 2 && reviewed.body.items[0].reviewed_by?.name === 'e2e op' && reviewed.body.items[0].review_note === 'Checked footage' && reviewed.body.items[0].reviewed_at?.endsWith('+05:30'), JSON.stringify(reviewed.body.items?.[0]).slice(0, 300));
check('default list hides reviewed -> 5', (await n('')) === 5);
check('status=all -> 7', (await n('&status=all')) === 7);
const reopen = await req('POST', '/alerts/review', admin, { alert_ids: reviewed.body.items.map((x) => Number(x.id)), reviewed: false });
check('re-open by alert_ids', reopen.body.updated === 2, JSON.stringify(reopen.body));
check('review with no ids 400', (await req('POST', '/alerts/review', admin, { reviewed: true })).status === 400);
check('viewer cannot review 403', (await req('POST', '/alerts/review', viewer, { alert_ids: [1], reviewed: true })).status === 403);

// --- CSV
const csv = await get(`/alerts/export.csv${P}`);
const lines = csv.text.replace(/^﻿/, '').trim().split('\n');
check('csv 200, text/csv, 7 rows', csv.status === 200 && csv.headers.get('content-type').startsWith('text/csv') && lines.length === 8, `${csv.status} ${lines.length}`);
check('csv admin has loss column', lines[0].includes('est_loss_inr') && lines[1].includes('Lane 3'), lines.slice(0, 2).join(' | '));
check('csv operator: no loss column', !(await get(`/alerts/export.csv${P}`, operator)).text.includes('est_loss_inr'));
check('operator alert items hide loss', !('loss' in (await get(`/alerts${P}`, operator)).body.items[0]));

// --- hard vs soft (DESC_MISMATCH is soft). a2 has only a DESC alert.
const kindCount = async (qs) => {
  const ids = [];
  let cursor = null;
  for (let i = 0; i < 20; i++) {
    const res = (await get(`/alerts${D}&limit=50${qs}${cursor ? `&cursor=${cursor}` : ''}`)).body;
    ids.push(...res.items.map((x) => x.id));
    cursor = res.next_cursor;
    if (!cursor) break;
  }
  return ids.length;
};
check('default alerts list is hard only -> 6', (await kindCount('')) === 6);
check('alert_kind=soft -> 1', (await kindCount('&alert_kind=soft')) === 1);
check('alert_kind=all -> 7', (await kindCount('&alert_kind=all')) === 7);
const sk = (await get(`/alerts/summary${D}`)).body;
check('summary default hard + by_kind', sk.alert_kind === 'hard' && sk.total_alerts === 6 && sk.by_kind.hard.count === 6 && sk.by_kind.soft.count === 1 && sk.estimated_loss === 810 && sk.total_flagged === 5, JSON.stringify(sk));
const ss = (await get(`/alerts/summary${D}&alert_kind=soft`)).body;
check('summary soft', ss.total_alerts === 1 && ss.total_flagged === 1 && ss.by_type.find((t) => t.type === 'DESC_MISMATCH').count === 1, JSON.stringify(ss));
const cnt = async (qs) => (await get(`/crossings${D}&include_total=true${qs}`)).body.total;
check('has_alerts default hard -> 5', (await cnt('&has_alerts=true')) === 5);
check('has_alerts soft -> 1', (await cnt('&has_alerts=true&alert_kind=soft')) === 1);
check('has_alerts all -> 6', (await cnt('&has_alerts=true&alert_kind=all')) === 6);
check('has_alerts=false default -> 2 (a2 soft-only, a6 none)', (await cnt('&has_alerts=false')) === 2);
check('alert_type=DESC_MISMATCH -> 1', (await cnt('&alert_type=DESC_MISMATCH')) === 1);
check('alert_type=TAG_MISMATCH,EXEMPT_ANOMALY -> 4', (await cnt('&alert_type=TAG_MISMATCH,EXEMPT_ANOMALY')) === 4);
check('bad alert_kind 400', (await get(`/alerts${D}&alert_kind=maybe`)).status === 400);
const a2 = (await get(`/crossings${D}&plate=MH40TK0002`)).body.items[0];
check('a2 item: no hard alerts, 1 soft', a2.alerts.count === 0 && a2.alerts.max_severity === null && a2.alerts.loss === 0 && a2.alerts.soft_count === 1, JSON.stringify(a2.alerts));
const a2d = (await get(`/crossings/${a2.id}`)).body.crossing;
check('a2 detail: alert kind soft', a2d.alerts.items[0].kind === 'soft' && a2d.alerts.items[0].type === 'DESC_MISMATCH', JSON.stringify(a2d.alerts));
const csvSoft = (await get(`/crossings/export.csv${D}&plate=MH40TK0002`)).text.replace(/^﻿/, '').trim().split('\n');
check('crossings csv has soft_alerts column', csvSoft[0].includes('soft_alerts') && csvSoft.length === 2 && csvSoft[1].includes(',0,,0,1,'), csvSoft.join(' | '));

// --- feed fields stored and shown in detail
const fr = await ingest([{ ...base3, id: 'f1', timestamp: at(0), license_plate: 'MH40FF0001', is_exempt: '1', exempt_vehicle_class: 'Ambulance', description: 'ambulance with siren', government_class: '', special_class: 'ambulance', clean: 'Y', clean2: null, clean3: 'Y' }]);
check('ingest with feed fields', fr.inserted === 1, JSON.stringify(fr));
const fid = (await get(`/crossings${D}&plate=MH40FF0001`)).body.items[0].id;
const fd = (await get(`/crossings/${fid}`)).body.crossing;
check('detail.feed', JSON.stringify(fd.feed) === JSON.stringify({ government_class: null, special_class: 'ambulance', clean: 'Y', clean2: null, clean3: 'Y' }), JSON.stringify(fd.feed));

// --- reference + pricing
const ref = (await get('/reference/vehicle-classes')).body;
check('reference: 7 tag classes from tables', ref.tag_classes.length === 7 && ref.tag_classes[0].vehicle_classes.some((v) => v.name.includes('TATA Ace') && v.default_price === 105), JSON.stringify(ref.tag_classes[0]));
const pr = (await get('/plazas/1/pricing')).body;
check('pricing: 15 classes, class 4 = 65, default 65', pr.prices.length === 15 && pr.prices.find((p) => p.vehicle_class === '4').price === 65 && pr.prices.find((p) => p.vehicle_class === '4').default_price === 65, JSON.stringify(pr.prices?.[0]));
check('operator cannot change pricing 403', (await req('PUT', '/plazas/1/pricing', operator, { prices: [{ vehicle_class: 4, price: 1 }] })).status === 403);
const bad = await req('PUT', '/plazas/1/pricing', admin, { prices: [{ vehicle_class: 3, price: 1 }] });
check('unknown vehicle class 400 (checked against table)', bad.status === 400 && String(bad.body.message).includes('Unknown vehicle_class: 3'), JSON.stringify(bad.body));
const up = await req('PUT', '/plazas/1/pricing', admin, { prices: [{ vehicle_class: 4, price: 80 }] });
check('admin sets class 4 = 80', up.status === 200 && up.body.prices.find((p) => p.vehicle_class === '4').price === 80 && up.body.prices.find((p) => p.vehicle_class === '4').updated_by !== null, JSON.stringify(up.body).slice(0, 200));
await ingest([{ ...base3, id: 'a8', timestamp: at(1), license_plate: 'MH40NP0008' }]);
const after = await get(`${'/crossings'}${D}&plate=MH40NP0008`);
const old = await get(`${'/crossings'}${D}&plate=MH40OK0006`);
check('new crossing charged new price, old keeps 65', after.body.items[0].amount === 80 && old.body.items[0].amount === 65, `${after.body.items[0]?.amount} / ${old.body.items[0]?.amount}`);
await req('PUT', '/plazas/1/pricing', admin, { prices: [{ vehicle_class: 4, price: 65 }] });
check('no plaza access on pricing 403', (await get('/plazas/1/pricing', viewer)).status === 403);
check('operator cannot read pricing 403', (await get('/plazas/1/pricing', operator)).status === 403);
const refOp = (await get('/reference/vehicle-classes', operator)).body;
check('operator reference has no default_price', refOp.tag_classes.length === 7 && refOp.tag_classes.every((t) => t.vehicle_classes.every((v) => !('default_price' in v) && v.name)), JSON.stringify(refOp.tag_classes[0]));

// --- CORS: what a browser on another origin may read
const origin = { origin: 'http://localhost:3000', authorization: `Bearer ${admin}` };
const csvCors = await fetch(`${base}/alerts/export.csv${P}`, { headers: origin });
const exposed = (csvCors.headers.get('access-control-expose-headers') ?? '').toLowerCase();
check('CSV exposes Content-Disposition to the browser', exposed.includes('content-disposition') && /filename="alerts-1-\d+\.csv"/.test(csvCors.headers.get('content-disposition') ?? ''), `${exposed} | ${csvCors.headers.get('content-disposition')}`);
await csvCors.text();

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
