# Implementation log

Decisions made while building the APIs in `crossing-data-workflow.md`, and work still to do. Newest entries at the top of each section.

---

## Pending

### `DESC_MISMATCH` raises false positives on mini-trucks

Found when the live dump (`response.json`, 56,221 crossings from 2026-08-21 to 2026-10-20) was ingested: 1,881 of the 1,884 alerts are `DESC_MISMATCH`.

- **Where they come from:** 1,869 are MED, on vehicle class 20 ("TATA Ace and similar mini LCV") or class 4, charged tag 4. For class 20, tag 4 is the correct charge.
- **Why:** the descriptions are mini-trucks ("Tata Intra", "Ashok Leyland Dost", "mini-truck … goods carrier"). They match the heavy-vehicle words in the rule (`truck` 1,052 times, `goods carrier` 314, `bus` 241, `cargo` 240), but the rule's light-vehicle exceptions only list pickup, Bolero, TATA Ace, Eeco, Omni and Tempo.

**Done so far: hard vs soft alerts.**
- `DESC_MISMATCH` is now a *soft* alert (`SOFT_ALERT_TYPES` in `constants.ts`). Crossings store a second summary over hard alerts only: `hard_alert_count`, `hard_alert_max_severity`, `hard_alert_loss`.
- Alert counts, `has_alerts`, the alerts list, summary and CSV, and the report's revenue at risk all default to hard alerts. `alert_kind=soft|all` includes the others, and `alert_type=...` filters crossings by alert type.
- On the live data: 3 hard alerts (₹365), with 1,881 soft alerts available on request.

**Still open (the rule itself).** Make it raise fewer false alarms:
1. Skip it when `vehicle_class` is 20.
2. Add `mini[\s-]*truck`, `intra`, `dost`, `super\s*carry` and similar to the light-vehicle exceptions.

The rules are in `src/ingest/alert-rules.ts`. Alerts are stored at ingest, so after changing the rule the existing alerts must be recomputed with a one-off script: delete them, rerun `computeAlerts` on the stored rows, and update both alert summaries on the crossings. Reviewed alerts would lose their review state.

### Feed fields: stored, not used yet

`government_class`, `special_class` and `clean`/`clean2`/`clean3` are now stored on `crossings` as sent and shown in the detail view under `feed`. The 56,221 rows ingested earlier were backfilled from the dump.

In the dump:
- `government_class` is always empty.
- `clean` and `clean3` are always "Y", and `clean2` is "Y" on 199 rows.
- `special_class` is "ambulance", "transport" or "police" on 12 rows, exactly the exempt ones, and agrees with `exempt_vehicle_class`.

No rule uses them yet. `special_class` could back up the exempt-anomaly check, and the `clean*` flags might mark rows the camera service considers trustworthy; their meaning needs to be confirmed with the camera team.

### Vehicle classes outside the table

The dump has vehicle classes 1 (47 rows), 3 (2) and 18 (1), none of which are in `vehicle_classes`. Those crossings are stored with no unit price and a ₹0 amount, as in the dashboard. Add them to `vehicle_classes` (and to each plaza's pricing) if they should be charged.

### One ingest API key for every plaza

`POST /ingest/crossings` checks a single `STATIC_API_KEY`, and the plaza comes from `plaza_code` in the body. Anyone with the key can push crossings for any plaza. With more than one plaza, give each one its own key: store a hash on `plazas` and check that the key matches `plaza_code`.

### No admin API for users or plaza access

Users and `user_plazas` rows (which plazas a non-admin can see) can only be created with SQL today, with the password hashed via `POST /auth/hash-password`. An admin screen would need `GET/POST/PATCH /users`, plus endpoints to grant and revoke plaza access.

### `/crossings/updates` can miss a row under concurrent ingest

`/crossings/updates` returns rows with `id` greater than the cursor. If two ingest requests overlap, the one that took the lower ids can commit after the other, and a poll in between moves the cursor past rows that aren't visible yet. Those rows are then never returned by `/updates`, though they still show in the list and the stream.

This is rare with one camera service pushing batches in sequence. To fix it, re-read a small overlap (e.g. the last 50 ids, or 10 seconds) on each poll and drop duplicates on the client.

### `sort=lane` orders by lane id, not lane number

It's the same order as long as lanes are created in number order. Sorting by the number needs a join on `lanes`, or a stored lane number on `crossings`.

### Smaller notes

- `HIGH_VALUE` can never fire, because `TAG_MISMATCH` always catches the same case first. This is the reference app's behaviour, kept as it is.
- Hour and day buckets use the plaza's current UTC offset, which is exact for IST. A plaza in a zone with daylight saving would need per-row conversion.
- Saved views, the operator shift log and notification preferences stay in the browser's `localStorage`; there's no server API for them yet.
- `src/main.ts` has a lint warning (`bootstrap()` isn't awaited) that predates this work.
- Nothing is committed to git yet. The branch `master` has no commits.

## Done

### `POST /auth/logout`

- **One session or all:** `{}` ends this session, and `{ "all": true }` ends every session of the user. Tokens now carry a session id (`jti`) and the login time in ms (`iat_ms`).
- **Revocations live in Redis** (`SessionService`), under keys that expire with the tokens. `JwtTokenValidationMiddleware` checks them on every request, and **fails closed**: if Redis can't be read, the request gets a 503.
- **Open live streams close at once:** revocations are broadcast over pub/sub, so it works across servers. The stream's one-minute tick rechecks as a backstop.
- **Older tokens without `jti`** can only be ended with "all".

### Redis for the live stream and sessions

`RedisService` (`libs/entities/src/redis`) provides pub/sub and expiring keys under `redis.key_prefix`.
- `IngestEventsService` publishes each ingest batch through it, so a crossing ingested on one app server reaches stream clients on every server.
- With `redis.url` empty it falls back to in-memory versions, for one server or local development.
- Configure `redis.url` in `config/tollplaza.production.yaml` (it's `CHANGE_ME` today).

### Reference data comes only from the tables

`tag_classes` and `vehicle_classes` are now the only source of the mapping. The hard-coded copies in `constants.ts` are gone.
- **What reads them:** the alert rules, tag pricing, the report SQL (`resolvedTag()`), the analytics and report labels, the alerts CSV and pricing all go through `ReferenceService`, cached for 60 s.
- **Effect of a change:** editing the tables (SQL for now; there's no admin API yet) applies within a minute, without a deploy. Alerts already stored keep the mapping they were raised with.

### API end-to-end tests are in the repo

`pnpm test:api` builds the app and runs `test/api-e2e/run.mjs`. It:
- **refuses to run** unless `config/tollplaza.test.yaml` points at a database ending in `_test`;
- **sets up** a fresh database (migrations and seeds), clears the test Redis prefix, creates test users, and starts two app servers;
- **runs six suites:** crossings, alerts, analytics, reports, live and auth;
- **checks the two-server path,** so it covers the Redis fan-out and logout across servers.

`node test/api-e2e/run.mjs auth live` runs only some suites, after a build. `E2E_PORT` changes the ports (default 5055 and 5056).

### Duplicate captures from several cameras on one lane

The planning question was whether two cameras on one lane send separate records for the same vehicle. In the 56,221-row dump, only 4 pairs have the same plate on the same lane within 30 seconds, and every pair is the **same** camera reading twice. There were no cross-camera duplicates, so the `crossing_captures` table isn't needed. Ingest still logs possible duplicates; check the logs again if more cameras are added to a lane.

### Two-factor login (`POST /auth/totp`): dropped

Not required, and it's being removed from the frontend. Already removed from #29 in `crossing-data-workflow.md`.

---

## Decisions to revisit

### Overload report reuses `AXLE_MISMATCH` alerts

`GET /reports/overload` reads the stored `AXLE_MISMATCH` alerts on non-exempt crossings. It doesn't keep the reference app's separate copy of the axle check (`detectOverload`), which had its own severity scale and priced tags at their cheapest class. Reusing the alerts keeps the report in agreement with the alerts tab.

### Watchlist: hard delete, all-plaza entries admin only

- Entries are deleted outright, not soft-deleted, so a removed plate can be added again (a soft-deleted row would collide with the unique key).
- Entries with `plaza_id` NULL apply to every plaza, and only admins can add, change or remove them.
- When a plate has both a plaza entry and an all-plaza entry, the plaza's own entry is the one shown.

### Live stream auth: header only, fetch-based client needed

- `GET /stream` (Server-Sent Events) uses the `Authorization` header, never a token in the URL.
- The frontend therefore needs a fetch-based SSE client, for example `@microsoft/fetch-event-source`, because the browser's built-in `EventSource` can't send headers.
- The stream closes when the token expires or plaza access is revoked, and the client then reconnects with a fresh token.

**Why.** The live wall and the "new crossings" pill get updates through `GET /stream`. The server holds that connection open and pushes events as crossings arrive (Server-Sent Events, SSE).

Every API call proves who the user is with the `Authorization: Bearer <token>` header. The browser's built-in SSE client, `EventSource`, can't send custom headers, so it can't send the token.

The usual workaround is putting the token in the URL (`/stream?token=...`). That's what made the old dashboard insecure: URLs end up in server logs, proxy logs and browser history, and anyone who sees the URL has the token. So the server only accepts the header.

A fetch-based library opens the same kind of stream with ordinary `fetch`, which can send headers. It's a drop-in replacement and also handles reconnecting.

The server rechecks the token and plaza access once a minute. When the token expires (after 12h) or a user loses access to a plaza, the stream closes. The client reconnects with a fresh token, and new crossings keep arriving without a page reload.

### `trust_proxy`: true in production, false locally

`http.trust_proxy` in `config/<env>.yaml` controls whether the client IP comes from `X-Forwarded-For`. Check that the production server really sits behind a proxy or load balancer, otherwise the IPs in `login_audit` and in the request logs will be wrong.

**Why.** In production, users usually connect to a proxy or load balancer (Nginx, a cloud load balancer), which forwards each request to the Node app. From the app's side, every request then seems to come from the proxy's own IP, often something like `10.0.0.5`.

The proxy adds the real user's IP in an `X-Forwarded-For` header, and `trust_proxy: true` tells the app to read it. Without it, every login in `login_audit` would show the proxy's IP, and the ipapi location lookup would be useless.

The risk is the other direction. If production has no proxy and `trust_proxy` is `true`, anyone can send a fake `X-Forwarded-For` header and the login audit will record whatever IP they choose. So set it to `true` only if a proxy really sits in front of the app. Locally it's `false`, because there's no proxy.

### Several app servers: Redis is required

The live stream's event bus and the logout store run on Redis (see "Redis for the live stream and sessions" above), so several app servers behind a load balancer work, as long as they all point at the same Redis. Without `redis.url`, only one server may run. Its in-memory bus and session store aren't shared, so a logout or a crossing on one server wouldn't reach the others.
