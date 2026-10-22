// Login, logout (one session / all sessions) and the live stream across two
// app servers sharing Redis.
// Usage (normally via run.mjs): node auth.mjs <baseUrl> <baseUrl2> <apiKey> <loginEmail> <password>
const [base, base2, apiKey, email, password] = process.argv.slice(2);
let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`);
  if (!ok) failures++;
};
const call = async (url, method = 'GET', token, body) => {
  const res = await fetch(url, {
    method,
    headers: {
      ...(token && { authorization: `Bearer ${token}` }),
      ...(body && { 'content-type': 'application/json' }),
    },
    body: body && JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json, headers: res.headers };
};
const login = async () => {
  const res = await call(`${base}/auth/login`, 'POST', null, { email_address: email, password });
  return { status: res.status, token: res.headers.get('authorization')?.replace(/^Bearer /, '') };
};
const ingest = (crossings) =>
  fetch(`${base}/ingest/crossings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({ plaza_code: 'nagpur-champa', crossings }),
  }).then((r) => r.json());

// Opens /stream and collects events until closed
const openStream = async (url, token) => {
  const events = [];
  const state = { closed: false, status: 0 };
  const ac = new AbortController();
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: ac.signal });
  state.status = res.status;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const done = (async () => {
    try {
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const type = /^event: (.*)$/m.exec(block)?.[1];
          const raw = /^data: (.*)$/m.exec(block)?.[1];
          let data = raw;
          try { data = raw && JSON.parse(raw); } catch {}
          events.push({ type, data });
        }
      }
    } catch {}
    state.closed = true;
  })();
  return { events, state, close: () => ac.abort(), done };
};
const waitFor = async (pred, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (pred()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
};

// --- login gives a token with a session id
const a = await login();
check('login returns token in Authorization header', a.status === 200 && !!a.token, JSON.stringify(a));
const b = await login();
const corsLogin = await fetch(`${base}/auth/login`, {
  method: 'POST',
  headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
  body: JSON.stringify({ email_address: email, password }),
});
check('login still exposes Authorization to the browser', (corsLogin.headers.get('access-control-expose-headers') ?? '').toLowerCase().includes('authorization') && !!corsLogin.headers.get('authorization'), corsLogin.headers.get('access-control-expose-headers'));
await call(`${base}/auth/logout`, 'POST', corsLogin.headers.get('authorization').replace(/^Bearer /, ''), {});
const me = await call(`${base}/auth/me`, 'GET', a.token);
check('token has jti and iat_ms', me.status === 200 && typeof me.body.user.jti === 'string' && typeof me.body.user.iat_ms === 'number', JSON.stringify(me.body));
check('two logins = two sessions', me.body.user.jti !== (await call(`${base}/auth/me`, 'GET', b.token)).body.user.jti);

// --- live stream across servers: connect to server 2, ingest on server 1
const P = '?plaza_id=1';
const stream = await openStream(`${base2}/stream${P}`, a.token);
check('stream on server 2 opens', stream.state.status === 200);
check('server 2 sends lane.health', await waitFor(() => stream.events.some((e) => e.type === 'lane.health')));
const ing = await ingest([{ id: 'x1', timestamp: new Date().toISOString(), camera_name: 'bbai-arcpl-lane3-lpr', license_plate: 'MH40XS0001', vehicle_class: '4', tag_class: '4', axles: '2', description: 'car' }]);
check('ingest on server 1', ing.inserted === 1, JSON.stringify(ing));
check('crossing reaches server 2 stream via Redis', await waitFor(() => stream.events.some((e) => e.type === 'crossing.created' && e.data.license_plate === 'MH40XS0001')), JSON.stringify(stream.events.map((e) => e.type)));
const item = stream.events.find((e) => e.type === 'crossing.created')?.data;
check('streamed item has IST timestamp (dates survive Redis)', item?.timestamp?.endsWith('+05:30'), item?.timestamp);

// --- logout one session (on server 1); the stream on server 2 closes
const out = await call(`${base}/auth/logout`, 'POST', a.token, {});
check('logout 200', out.status === 200 && out.body.message === 'Signed out', JSON.stringify(out.body));
const after = await call(`${base}/auth/me`, 'GET', a.token);
check('logged-out token rejected on server 1', after.status === 401 && String(after.body.message).includes('Session has ended'), JSON.stringify(after.body));
check('logged-out token rejected on server 2 (shared store)', (await call(`${base2}/auth/me`, 'GET', a.token)).status === 401);
check('stream on server 2 closes at once on logout', await waitFor(() => stream.state.closed, 5000), JSON.stringify(stream.events.slice(-2)));
check('stream sent an error event before closing', stream.events.some((e) => e.type === 'error'), JSON.stringify(stream.events.slice(-2)));
check('other session still works', (await call(`${base}/auth/me`, 'GET', b.token)).status === 200);
check('reconnecting with the logged-out token is refused', (await fetch(`${base2}/stream${P}`, { headers: { authorization: `Bearer ${a.token}` } })).status === 401);
check('logout again with it -> 401', (await call(`${base}/auth/logout`, 'POST', a.token, {})).status === 401);

// --- logout everywhere
const c = await login();
const all = await call(`${base}/auth/logout`, 'POST', b.token, { all: true });
check('logout all 200', all.status === 200 && all.body.message === 'Signed out of all sessions', JSON.stringify(all.body));
check('every older session ended', (await call(`${base}/auth/me`, 'GET', b.token)).status === 401 && (await call(`${base}/auth/me`, 'GET', c.token)).status === 401);
const d = await login();
check('a login after logout-all works', d.status === 200 && (await call(`${base}/auth/me`, 'GET', d.token)).status === 200);

// --- validation
check('logout without token 401', (await call(`${base}/auth/logout`, 'POST', null, {})).status === 401);
check('logout bad body 400', (await call(`${base}/auth/logout`, 'POST', d.token, { all: 'yes' })).status === 400);
await call(`${base}/auth/logout`, 'POST', d.token, {});

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
