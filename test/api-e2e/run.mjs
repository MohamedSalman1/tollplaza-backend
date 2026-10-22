// Runs every API end-to-end suite against a throwaway database.
//
//   pnpm test:api        (builds, then runs this)
//
// What it does, in order:
//   1. Reads config/tollplaza.test.yaml and refuses to go on unless the
//      database name ends in "_test" (the suites delete every crossing).
//   2. Drops and recreates that database, runs all migrations and seeders.
//   3. Deletes the Redis keys under the test key_prefix.
//   4. Creates test users and signs their tokens with JWT_SECRET from .env.
//   5. Starts two app servers (dist/main) on E2E_PORT and E2E_PORT + 1,
//      sharing that database and Redis.
//   6. Runs each suite, clearing crossing data in between, and stops the
//      servers. Exits non-zero if anything failed.
import { spawn, spawnSync } from 'child_process';
import { createRequire } from 'module';
import { readFileSync, mkdtempSync, openSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const require = createRequire(path.join(root, 'package.json'));
const yaml = require('js-yaml');
const mysql = require('mysql2/promise');
const Redis = require('ioredis');
const argon2 = require('argon2');
const { JwtService } = require('@nestjs/jwt');

const NODE_ENV = 'tollplaza.test';
const PORT = Number(process.env.E2E_PORT ?? 5055);
const LOGIN_PASSWORD = 'secret123';

const env = Object.fromEntries(
  readFileSync(path.join(root, '.env'), 'utf8')
    .split('\n')
    .map((line) => /^\s*([A-Z0-9_]+)=(.*)$/.exec(line))
    .filter(Boolean)
    .map(([, key, value]) => [key, value.trim()]),
);
const config = yaml.load(readFileSync(path.join(root, `config/${NODE_ENV}.yaml`), 'utf8'));
const db = config.databases.tollplaza_db;
if (!/_test$/.test(db.database)) {
  console.error(`Refusing to run: database "${db.database}" doesn't end in _test`);
  process.exit(2);
}

// 2. Fresh database
const admin = await mysql.createConnection({ host: db.host, port: db.port, user: db.username, password: db.password });
await admin.query(`DROP DATABASE IF EXISTS \`${db.database}\``);
await admin.query(`CREATE DATABASE \`${db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
await admin.end();
for (const command of ['db:migrate', 'db:seed:all']) {
  const result = spawnSync('npx', ['sequelize-cli', command], {
    cwd: root,
    env: { ...process.env, NODE_ENV },
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.error(`sequelize-cli ${command} failed:\n${result.stdout}\n${result.stderr}`);
    process.exit(1);
  }
}

// 3. Clean Redis namespace
if (config.redis?.url) {
  const redis = new Redis(config.redis.url);
  const prefix = config.redis.key_prefix;
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 500);
    if (keys.length) await redis.del(...keys);
    cursor = next;
  } while (cursor !== '0');
  await redis.quit();
}

// 4. Users and tokens
const conn = await mysql.createConnection({ host: db.host, port: db.port, user: db.username, password: db.password, database: db.database });
const hash = await argon2.hash(LOGIN_PASSWORD, { type: argon2.argon2id });
const users = [
  ['e2e admin', 'e2e-admin@test.local', 'x', 'admin'],
  ['e2e op', 'e2e-op@test.local', 'x', 'operator'],
  ['e2e none', 'e2e-none@test.local', 'x', 'client_viewer'],
  ['e2e login', 'e2e-login@test.local', hash, 'operator'],
];
await conn.query('INSERT INTO users (name, email_address, password, role, status) VALUES ?', [users.map((u) => [...u, 1])]);
await conn.query(
  `INSERT INTO user_plazas (user_id, plaza_id)
   SELECT id, 1 FROM users WHERE email_address IN ('e2e-op@test.local', 'e2e-login@test.local')`,
);
const [rows] = await conn.query('SELECT id, email_address, role FROM users');
const jwt = new JwtService({ secret: env.JWT_SECRET });
const tokenFor = (email) => {
  const user = rows.find((row) => row.email_address === email);
  return jwt.sign({ sub: user.id, email, name: email, role: user.role }, { expiresIn: '30m' });
};
const tokens = {
  admin: tokenFor('e2e-admin@test.local'),
  operator: tokenFor('e2e-op@test.local'),
  none: tokenFor('e2e-none@test.local'),
};

// 5. Two app servers
const logDir = mkdtempSync(path.join(tmpdir(), 'tollplaza-e2e-'));
const servers = [PORT, PORT + 1].map((port) =>
  spawn('node', ['dist/main'], {
    cwd: root,
    env: { ...process.env, NODE_ENV, PORT: String(port) },
    stdio: ['ignore', openSync(path.join(logDir, `app-${port}.log`), 'w'), openSync(path.join(logDir, `app-${port}.log`), 'a')],
  }),
);
const stopServers = () => servers.forEach((server) => server.kill());
process.on('exit', stopServers);
for (const port of [PORT, PORT + 1]) {
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    up = await fetch(`http://localhost:${port}/api`).then(() => true, () => false);
    if (!up) await new Promise((r) => setTimeout(r, 500));
  }
  if (!up) {
    console.error(`App on port ${port} didn't start; see ${logDir}`);
    process.exit(1);
  }
}

// 6. Suites
const base = `http://localhost:${PORT}/api/v1`;
const base2 = `http://localhost:${PORT + 1}/api/v1`;
const key = env.STATIC_API_KEY;
const suites = [
  ['crossings', [base, key, tokens.admin, tokens.operator, tokens.none]],
  ['alerts', [base, key, tokens.admin, tokens.operator, tokens.none]],
  ['analytics', [base, key, tokens.admin]],
  ['reports', [base, key, tokens.admin, tokens.operator]],
  ['live', [base, key, tokens.admin, tokens.operator, 'e2e-login@test.local']],
  ['auth', [base, base2, key, 'e2e-login@test.local', LOGIN_PASSWORD]],
];
const only = process.argv.slice(2);
let failed = 0;
for (const [name, args] of suites) {
  if (only.length && !only.includes(name)) continue;
  // lane_cameras is left alone: the app caches camera mappings for a minute
  await conn.query('DELETE FROM crossing_alerts');
  await conn.query('DELETE FROM crossings');
  await conn.query('DELETE FROM watchlist_entries');
  console.log(`\n=== ${name}`);
  const result = spawnSync('node', [path.join(here, `${name}.mjs`), ...args], { encoding: 'utf8' });
  process.stdout.write(process.env.E2E_VERBOSE ? result.stdout : result.stdout.split('\n').filter((line) => !line.startsWith('PASS')).join('\n'));
  if (result.stderr) process.stdout.write(result.stderr);
  if (result.status !== 0) failed++;
}
await conn.end();
stopServers();
console.log(`\n${failed ? `${failed} suite(s) FAILED` : 'All suites passed'} (app logs: ${logDir})`);
process.exit(failed ? 1 : 0);
