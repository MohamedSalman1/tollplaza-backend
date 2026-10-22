// End-to-end check: watchlist, lanes, stream, updates, adjacent, export,
// plazas, login audit.
// Usage (normally via run.mjs): node live.mjs <baseUrl> <apiKey> <adminToken> <operatorToken> <loginEmail>
const [base, apiKey, admin, operator, loginEmail] = process.argv.slice(2);
let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`);
  if (!ok) failures++;
};
const req = async (method, path, token = admin, body) => {
  const res = await fetch(base + path, {
    method,
    headers: { ...(token && { authorization: `Bearer ${token}` }), ...(body && { 'content-type': 'application/json' }) },
    body: body && JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, body: json, text };
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
const c = (id, minAgo, plate, extra = {}) => ({
  id, timestamp: at(minAgo), camera_name: 'bbai-arcpl-lane3-lpr', license_plate: plate,
  plate_bg_color: 'white', state_name: 'Maharashtra', state_code: 'MH',
  vehicle_class: '4', tag_class: '4', axles: '2', description: 'car', ...extra,
});
const P = '?plaza_id=1';

const seed = [
  c('w1', 50, 'MH40ST0001', { vehicle_make: 'Tata' }),
  c('w2', 40, 'MH40ST0001', { vehicle_make: 'Honda' }),
  c('w3', 30, 'MH40VP0002', { vehicle_make: 'Maruti' }),
  c('w4', 20, 'MH40ZZ0003', { vehicle_make: 'Audi' }),
  c('w5', 10, 'MH40ZZ0004', { vehicle_make: 'BMW' }),
];
check('seed 5', (await ingest(seed)).inserted === 5);

const pl = await get('/plazas');
check('GET /plazas (admin)', pl.status === 200 && pl.body.plazas.some((p) => p.code === 'nagpur-champa'), JSON.stringify(pl.body));
check('GET /plazas (operator sees own)', (await get('/plazas', operator)).body.plazas.length === 1);

const add = (token, body) => req('POST', '/watchlist', token, body);
const e1 = await add(operator, { plaza_id: 1, plate: 'MH 40 ST 0001', category: 'stolen', note: 'FIR 123' });
check('operator adds plaza entry', e1.status === 201 && e1.body.entry.plate === 'MH 40 ST 0001' && e1.body.entry.added_by?.name === 'e2e op', JSON.stringify(e1.body));
check('duplicate -> 409', (await add(operator, { plaza_id: 1, plate: 'mh40st0001', category: 'bolo' })).status === 409);
check('operator cannot add all-plaza -> 403', (await add(operator, { plate: 'MH40VP0002', category: 'vip' })).status === 403);
const g1 = await add(admin, { plaza_id: null, plate: 'MH40VP0002', category: 'vip' });
check('admin adds all-plaza entry', g1.status === 201 && g1.body.entry.plaza_id === null, JSON.stringify(g1.body));
check('duplicate all-plaza -> 409', (await add(admin, { plate: 'MH40VP0002', category: 'vip' })).status === 409);
const g2 = await add(admin, { plate: 'MH40ST0001', category: 'vip' });
check('bad category 400', (await add(admin, { plaza_id: 1, plate: 'MH40AA1111', category: 'nope' })).status === 400);
check('short plate 400', (await add(admin, { plaza_id: 1, plate: '1', category: 'custom' })).status === 400);
const wl = await get(`/watchlist${P}`);
check('list shows plaza + global entries', wl.body.items.length === 3, JSON.stringify(wl.body.items?.map((i) => i.plate)));
check('list category filter', (await get(`/watchlist${P}&category=vip`)).body.items.length === 2);
check('list q filter', (await get(`/watchlist${P}&q=st 0001`)).body.items.length === 2);

const hits = await get(`/crossings${P}&watchlist=true&include_total=true`);
check('crossings watchlist=true -> 3', hits.body.total === 3, hits.body.total);
check('crossings watchlist=false -> 2', (await get(`/crossings${P}&watchlist=false&include_total=true`)).body.total === 2);
const st = hits.body.items.find((i) => i.license_plate === 'MH40ST0001');
check('plaza entry wins over global for item.watchlist', st.watchlist?.category === 'stolen' && st.watchlist.note === 'FIR 123', JSON.stringify(st.watchlist));
check('non-watched item has null', (await get(`/crossings${P}&plate=MH40ZZ0003`)).body.items[0].watchlist === null);
const ws = (await get(`/watchlist/summary${P}`)).body;
check('watchlist summary', ws.entries === 3 && ws.hits === 3 && ws.plates_seen === 2 && ws.by_category.find((x) => x.category === 'stolen').hits === 2 && ws.by_category.find((x) => x.category === 'vip').hits === 1, JSON.stringify(ws));
const up = await req('PATCH', `/watchlist/${e1.body.entry.id}`, operator, { note: 'Recovered?' });
check('patch note', up.status === 200 && up.body.entry.note === 'Recovered?');
check('operator cannot delete global -> 403', (await req('DELETE', `/watchlist/${g2.body.entry.id}`, operator)).status === 403);
check('admin deletes global', (await req('DELETE', `/watchlist/${g2.body.entry.id}`)).status === 200);
check('404 after delete', (await req('PATCH', `/watchlist/${g2.body.entry.id}`, admin, { note: 'x' })).status === 404);

const lh = (await get(`/lanes/health${P}`)).body;
const l3 = lh.lanes?.find((l) => l.number === 3), l4 = lh.lanes?.find((l) => l.number === 4);
check('lane 3 ok/stale', l3?.status === 'stale' || l3?.status === 'ok', JSON.stringify(l3));
check('lane 3 counts', l3.crossings_last_hour === 5 && l3.crossings_in_range === 5 && l3.watchlist_hits === 3 && l3.cameras.includes('bbai-arcpl-lane3-lpr') && l3.last_crossing_at.endsWith('+05:30'), JSON.stringify(l3));
check('lane 4 down (never seen)', l4?.status === 'down' && l4.last_crossing_at === null, JSON.stringify(l4));

const list = (await get(`/crossings${P}`)).body.items.map((i) => i.id);
const adj = (await get(`/crossings/${list[2]}/adjacent${P}`)).body;
check('adjacent default sort', adj.prev_id === list[1] && adj.next_id === list[3] && adj.position === 3 && adj.total === 5, JSON.stringify(adj));
const first = (await get(`/crossings/${list[0]}/adjacent${P}`)).body;
check('adjacent at the top', first.prev_id === null && first.position === 1);
const byMake = (await get(`/crossings${P}&sort=make&dir=asc`)).body.items.map((i) => i.id);
const am = (await get(`/crossings/${byMake[1]}/adjacent${P}&sort=make&dir=asc`)).body;
check('adjacent with sort=make', am.prev_id === byMake[0] && am.next_id === byMake[2] && am.position === 2, JSON.stringify({ am, byMake }));
const af = (await get(`/crossings/${list[0]}/adjacent${P}&watchlist=true`)).body;
check('adjacent: not in filter -> position null', af.position === null && af.total === 3, JSON.stringify(af));

const csv = await get(`/crossings/export.csv${P}`);
const lines = csv.text.replace(/^﻿/, '').trim().split('\n');
check('crossings csv', lines.length === 6 && lines[0].includes('amount') && lines[1].includes('Lane 3'), lines.slice(0, 2).join(' | '));
check('operator csv has no amount', !(await get(`/crossings/export.csv${P}`, operator)).text.split('\n')[0].includes('amount'));

const boot = (await get(`/crossings/updates${P}`)).body;
check('updates bootstrap', boot.items.length === 0 && typeof boot.next_cursor === 'string');

const events = [];
const ac = new AbortController();
const streamRes = await fetch(`${base}/stream${P}`, { headers: { authorization: `Bearer ${operator}` }, signal: ac.signal });
check('stream 200 text/event-stream', streamRes.status === 200 && streamRes.headers.get('content-type').startsWith('text/event-stream'), streamRes.status);
const reader = streamRes.body.getReader();
const dec = new TextDecoder();
let buf = '';
const pump = (async () => {
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const type = /^event: (.*)$/m.exec(block)?.[1];
        const data = /^data: (.*)$/m.exec(block)?.[1];
        events.push({ type, data: data && JSON.parse(data) });
      }
    }
  } catch {}
})();
const waitFor = async (pred, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (events.some(pred)) return true; await new Promise((r) => setTimeout(r, 100)); }
  return false;
};
check('stream sends lane.health on connect', await waitFor((e) => e.type === 'lane.health'), JSON.stringify(events));
const live = await ingest([
  c('w6', 0, 'MH40ST0001', { vehicle_class: '12' }),
  c('w7', 0, 'MH40QQ0009', { description: 'blue truck' }), // soft DESC_MISMATCH
]);
check('live ingest', live.inserted === 2 && live.alerts === 2, JSON.stringify(live));
check('stream crossing.created x2', await waitFor(() => events.filter((e) => e.type === 'crossing.created').length === 2), JSON.stringify(events.map((e) => e.type)));
check('stream alert.created (hard)', await waitFor((e) => e.type === 'alert.created' && e.data.type === 'TAG_MISMATCH' && e.data.kind === 'hard'));
check('stream alert.created (soft)', await waitFor((e) => e.type === 'alert.created' && e.data.type === 'DESC_MISMATCH' && e.data.kind === 'soft'));
check('stream watchlist.hit', await waitFor((e) => e.type === 'watchlist.hit' && e.data.watchlist.category === 'stolen' && e.data.crossing.license_plate === 'MH40ST0001'));
const created = events.find((e) => e.type === 'crossing.created' && e.data.license_plate === 'MH40QQ0009');
check('stream item: soft alert counted apart, no money', created && !('amount' in created.data) && created.data.alerts.count === 0 && created.data.alerts.soft_count === 1, JSON.stringify(created?.data?.alerts));
ac.abort();
await pump;

const upd = (await get(`/crossings/updates${P}&since=${boot.next_cursor}`)).body;
check('updates since bootstrap -> 2, oldest first', upd.count === 2 && upd.items[0].license_plate === 'MH40ST0001' && upd.has_more === false, JSON.stringify(upd).slice(0, 200));
check('updates again -> 0', (await get(`/crossings/updates${P}&since=${upd.next_cursor}`)).body.count === 0);
check('updates bad cursor 400', (await get(`/crossings/updates${P}&since=junk`)).status === 400);

check('login ok', (await req('POST', '/auth/login', null, { email_address: loginEmail, password: 'secret123' })).status === 200);
check('login wrong password 401', (await req('POST', '/auth/login', null, { email_address: loginEmail, password: 'wrong-pass' })).status === 401);
check('login unknown email 401', (await req('POST', '/auth/login', null, { email_address: 'nobody@test.local', password: 'whatever1' })).status === 401);

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
