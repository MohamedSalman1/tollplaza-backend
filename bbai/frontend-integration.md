# Frontend integration: moving the dashboard to the new APIs

The dashboard (the reference build is `bbai/index.html`) currently downloads every crossing from `crossing_data.php` and computes everything in the browser. The backend (`tollplaza-apihub`, NestJS) now serves all of it: paginated lists, stats, alerts, reports, a watchlist, pricing and a live stream. This document says what the frontend has to change and how to call each API.

`bbai/crossing-data-workflow.md` describes the old behaviour (Part 1) and the original API proposal (Part 2). Where it differs from this document, **this document reflects what was actually built**.

---

## 1. What to remove from the frontend

Delete these outright, with no replacement in the browser:

- **The full data dump:** `fetchData()`, the call to `crossing_data.php?token=...`, the hard-coded data token, `ingest()`, the 30-day windowing and `v26LoadFullHistory()`. The browser never holds the whole dataset again.
- **Browser-side computation:**
  - `computeAlerts`, `detectOverload` and the derived-flag helpers (`isEV`, `isOOS`, `isCommercial`, `isExempt`).
  - `laneNum`/`laneKeyOf` grouping, `getRowPrice`/`getTagPrice`/`tagCheapestPrice` and `DEFAULT_PRICING`.
  - All KPI, analytics, report, facet and lane-health aggregation code.
  - The server returns all of these values ready to display.
- **The password gate:** the hard-coded admin/client passwords and the browser-side check (around line 25104). Replace it with the login API (section 3).
- **Third-party login logging:** the `ipapi.co` and `formsubmit.co` calls (lines 25035–25080). The server now writes its own login audit.
- **Two-factor login (TOTP):** remove the UI. It isn't supported.
- **`localStorage` for shared state:** the price table (`champa-toll-pricing-v1`), reviewed alerts (`champa-alerts-reviewed-v1`) and the watchlist. These now live on the server and are shared by every operator.

These can **stay** in `localStorage` for now, since they are per-user preferences, not data: saved views, the operator shift log, KPI tile preferences, notification and audio preferences, and the selected plaza or time range.

---

## 2. Conventions for every request

- **Base URL:** `{API_ORIGIN}/api/v1` (local: `http://localhost:5000/api/v1`). Make the origin configurable.
- **Auth:** every request (except login) sends `Authorization: Bearer <token>`. **Never put the token in a URL.**
- **Response envelope:** every JSON response includes `statusCode`, and the payload fields sit alongside it (not under `data`). Example: `{ "statusCode": 200, "items": [...], "next_cursor": "..." }`.
- **Errors:** `{ "statusCode": 4xx, "message": "..." }`. For validation errors (400), `message` is an **array** of strings.
  - **401:** the token is missing, invalid or expired, or the session was logged out. Clear the session and go to login.
  - **503 "Session check unavailable":** the server couldn't check whether the session was logged out (its session store is down), so it refused the request. Keep the user signed in and retry shortly.
  - **403:** the role isn't allowed, or the user has no access to that plaza.
  - **404:** not found.
  - **409:** duplicate (watchlist).
- **Unknown query parameters are rejected with 400.** Send only the parameters documented here: no cache-busters like `_=123`, and no empty strings for unused filters. Leave a parameter out instead.
- **Plaza scoping:** almost every data endpoint needs `plaza_id` (from the header plaza selector, section 4.1).
- **Times:**
  - Every timestamp comes back as ISO 8601 with the plaza's offset, e.g. `2026-10-20T17:58:06+05:30`. Display it as is; don't convert it.
  - Day keys are `YYYY-MM-DD` strings in plaza time.
  - Hour-of-day values are 0–23 in plaza time.
- **`tz` (optional, any IANA zone):** overrides the zone used for bucketing and timestamp formatting. Send it only if the user switches the clock to their browser's zone.
- **Money:** whole rupees (integers).
- **Ids:** crossing and alert ids are **strings**. `vehicle_class` and `tag_class` are strings (`"4"`). `axles` is a number.
- **Media URLs** (`thumbnail_url`, `image_url`, `video_url`) are absolute. Use them as is; the old upload-path logic goes.

### 2.1 Roles and what each one can see or do

| Role | Sees money | Reviews alerts | Edits watchlist | Edits pricing |
|---|---|---|---|---|
| `admin` | yes | yes | yes, including all-plaza entries | yes |
| `auditor` | yes | yes | no | no |
| `supervisor` | yes | yes | yes | no |
| `operator` | **no** | yes | yes | no |
| `client_viewer` | yes | **no** | no | no |

- **Money fields are omitted, not zeroed,** for roles that can't see money: `amount`, `collection`, `loss`, `estimated_loss`, `revenue_at_risk`, `unit_price`, `forgone`, `default_price` and the CSV money columns. `GET /plazas/{id}/pricing` returns 403 to those roles. Hide a money tile or column when its key is absent from the response (`'collection' in res`). Don't render 0.
- **Hide or disable** the review, watchlist-edit and pricing-edit controls for roles that can't use them. The server returns 403 anyway, but the UI shouldn't offer them.

---

## 3. Login and session

### `POST /auth/login`

```json
// request
{ "email_address": "ops@example.com", "password": "..." }

// response 200 (body)
{ "statusCode": 200, "message": "Sign in successful", "name": "Ops", "email": "ops@example.com", "role": "operator" }
```

**The token is in the `Authorization` response header** (`Bearer eyJ...`), not in the body. Read it with `response.headers.get('Authorization')`; CORS already exposes that header. Keep the token in memory, or in `sessionStorage` if a page reload shouldn't log the user out.

- **401:** "Invalid email or password". The same message is used for an unknown email and for a wrong password.
- **403:** the account is inactive.
- **Expiry:** tokens last **12 hours**. On any 401, clear the session and show the login screen.

### `GET /auth/me`

Returns `{ user: { sub, email, name, role, iat, exp } }`. Use it on app start to check a stored token, and use `exp` (epoch seconds) to warn before the session expires.

### Logout

**`POST /auth/logout`** (with the token) sends `{}` to end this session, or `{ "all": true }` to end every session of this user ("Sign out everywhere"). It returns `{ "message": "Signed out" }` (or "Signed out of all sessions").

- **What happens on the server:** the token stops working at once, on every app server, instead of at its 12-hour expiry. Any request made with it gets **401 "Session has ended, please sign in again"**.
- **Open live streams** for that session close at once, after an `error` event.
- **On the client,** after the call (whatever its result), delete the stored token, close the stream and show the login screen.
- **"Sign out everywhere"** ends sessions on other devices too. A login afterwards works normally.

Put the call behind one `logout()` function.

---

## 4. Screens and the APIs they call

### 4.1 Header plaza selector

**`GET /plazas`** returns `{ plazas: [{ id, code, name, timezone }] }`, the plazas this user can see. Select the first one by default and remember the choice in `localStorage`. Changing the plaza reloads every panel and **reopens the live stream** (section 5).

### 4.2 Shared filters (every crossing-based screen)

One filter state drives the table, KPIs, analytics, alerts, reports and lane health. Turn it into query parameters with one function and reuse it everywhere, so all screens agree.

| Param | Values | Notes |
|---|---|---|
| `plaza_id` | number | Required |
| `range` | `today` `1h` `3h` `7h` `15h` `24h` `7d` `15d` `30d` `all` | **Default is `today`** if you send neither `range` nor `from`/`to`. Send `range=all` explicitly for "All". |
| `from`, `to` | ISO 8601 with offset | Custom range; overrides `range`. `to` is exclusive. |
| `tz` | IANA zone | Optional; see section 2 |
| `q` | text | Search across plate (spaces ignored), state, district, location, RTO, colour, make, model, lane and description |
| `ev`, `oos`, `commercial`, `exempt`, `has_alerts`, `watchlist` | `true` / `false` | Toggles. Leave the parameter out for "any". |
| `alert_kind` | `hard` (default), `soft`, `all` | Which alerts count; see "Hard and soft alerts" below |
| `alert_type` | comma-separated alert types | Only crossings with at least one alert of these types, e.g. `alert_type=DESC_MISMATCH` |
| `lane` | lane **numbers**, comma-separated (`3,4`) | |
| `state`, `district`, `region`, `make`, `model`, `color` | comma-separated values | `state` matches the state **name** (`Maharashtra`) |
| `tag_class`, `vehicle_class`, `axles` | comma-separated numbers | |
| `plate` | plate, spaces allowed | Exact match (plate history, "show all from this plate") |

In any column filter, the value **`Unknown`** matches crossings with no value for that column.

#### Hard and soft alerts

`DESC_MISMATCH` (image description suggests a heavier vehicle than charged) is a **soft** alert. It rests only on the AI description, and on real data it's mostly false alarms; mini-trucks described as "truck" are an example. Every other alert type is **hard**.

**Everywhere alerts are counted or filtered, the default is hard only:**
- the list item's `alerts` summary and `has_alerts`;
- the alerts list, summary and CSV;
- the report's revenue at risk.

Pass `alert_kind=soft` or `alert_kind=all` to include soft alerts. In the UI:
- Show soft alerts behind a toggle, e.g. "Include description-only alerts (1,881)". The count comes from `by_kind.soft.count` in `/alerts/summary`.
- Show soft alerts with a muted style. Each alert has `kind: "hard" | "soft"`.

### 4.3 KPI strip

**`GET /crossings/stats/summary?<filters>`**

```json
{
  "total_crossings": 340, "total_unfiltered": 1250,
  "collection": 41250,
  "by_tag": [{ "tag_class": "4", "count": 300, "collection": 19500, "share": 88.2 }],
  "unique_states": 12, "unique_districts": 40,
  "oos": { "count": 51, "pct": 15 }, "ev": 9, "exempt": 4,
  "top_make": { "value": "Tata", "count": 80 }, "top_color": { "value": "White", "count": 120 },
  "last_crossing_at": "2026-10-20T17:58:06+05:30"
}
```

`total_unfiltered` is the same plaza and time range with no other filters. Use it for the table's "showing X of Y", where X is `total_crossings`.

### 4.4 Crossings table

**`GET /crossings?<filters>&limit=50&sort=timestamp&dir=desc[&cursor=...][&include_total=true]`**

- **`sort`:** `timestamp` (default), `lane`, `plate`, `state`, `district`, `region`, `make`, `model`, `tag_class`, `vehicle_class`, `axles` or `color`. **`dir`:** `asc` or `desc` (default `desc`).
- **Pagination uses a cursor**, not page numbers. The response is `{ items, next_cursor, total? }`.
  - For infinite scroll, pass `next_cursor` back as `cursor` until it's `null`.
  - A cursor only works with the sort it was made for. **When sort, dir or any filter changes, drop the cursor and start again**, otherwise the server returns 400.
- `limit` is 1–200 (default 50). Ask for `include_total=true` only when you need it, because counting costs extra. The KPI summary already gives the totals.
- Keep the virtualized table and render rows from `items`.

**List item shape** (the same object appears in alerts, reports, the stream and updates):

```json
{
  "id": "872341",
  "timestamp": "2026-10-20T17:58:06+05:30",
  "lane": { "id": 1, "number": 3, "name": "Lane 3", "camera": "bbai-arcpl-lane3-lpr" },
  "license_plate": "MH40CM9551", "plate_formatted": "MH 40 CM 9551",
  "plate_bg_color": "white",
  "state_name": "Maharashtra", "state_code": "MH", "district": "Nagpur", "region": "West",
  "vehicle_make": "Maruti Suzuki", "vehicle_model": "Ertiga", "vehicle_color": "White",
  "vehicle_class": "4", "tag_class": "4", "axles": 2,
  "description": "White MPV ...",
  "flags": { "ev": false, "oos": false, "commercial": false, "exempt": false },
  "exempt_vehicle_class": null,
  "amount": 65,
  "alerts": { "count": 0, "max_severity": null, "loss": 0, "soft_count": 1 },
  "watchlist": null,
  "thumbnail_url": "https://.../2026/10/20/abc.jpg"
}
```

- `lane` can be `null` when a camera isn't mapped to a lane.
- `alerts.count`, `max_severity` and `loss` cover **hard alerts only**. `soft_count` is the number of soft (description-only) alerts on the crossing; show it as a muted marker.
- `alerts.max_severity` is `HIGH`, `MED`, `LOW` or `null`.
- `watchlist` is `{ category, note }` when the plate is on the watchlist.
- Empty or unknown values come back as `null`. Show "Unknown" or "—" for them.

### 4.5 Column filter dropdowns

**`GET /crossings/facets?<filters>&field=state,make&limit=50`**

- **`field`:** one or more of `lane`, `state`, `district`, `region`, `make`, `model`, `color`, `tag_class`, `vehicle_class` or `axles`.
- **Response:** `{ facets: [{ field, total, values: [{ value, label, count }] }] }`.
- **Counts** for each field use every filter **except that field's own**, as in the old `fpComputeCounts`.
- **`value` vs `label`:** send `value` back as the filter, and show `label`. For a lane, `value` is the lane number and `label` is "Lane 3". Missing values come back as `Unknown`.
- **When to call it:** when a dropdown opens, not on page load.

### 4.6 Detail drawer

- **`GET /crossings/{id}[?tz=]`** returns `{ crossing }`. This is the list item plus:
  - `location`, `rto_code`, `plate_text_color`, `unit_price` (money roles only), `image_url`, `video_url`;
  - `plate_crossing_count`, the total crossings by this plate at this plaza, for "show all from this plate" (then open the table with `plate=<plate>`);
  - `alerts.items`: every alert on the crossing, hard and soft (the alert shape in section 4.8, without `crossing`);
  - `feed`: raw fields from the camera feed, as sent: `{ government_class, special_class, clean, clean2, clean3 }`. `special_class` is "ambulance", "police" or "transport" on exempt vehicles. Show these in a "Raw feed data" section, if at all.
- **`GET /crossings/{id}/adjacent?<the table's filters, sort and dir>`** returns `{ prev_id, next_id, position, total }`. Use it for previous/next and "12 / 340". `position` is `null` if the crossing doesn't match the current filters.

### 4.7 Analytics tab

Fire these in parallel for one view. They all take the shared filters.

| Panel | Call | Response |
|---|---|---|
| Overview tiles | `GET /crossings/stats/overview` | `{ total, unique_states, unique_districts, unique_makes, peak_hour (0–23 or null), peak_count, top_state: { value, count, pct } \| null, active_hours, avg_per_hour }` |
| 15-minute timeline | `GET /crossings/stats/timeline?bucket=15m` | `{ bucket, buckets: [{ start, count }], mean, std_dev, anomalies: [bucket indexes] }`. `bucket` is `5m`, `15m` (default), `1h` or `1d`. Empty buckets are already filled in. A range with more than 3,000 buckets returns 400, so use a larger bucket for long ranges (e.g. `1d` for `all` and `30d`). **The rolling average stays in the browser.** |
| Hour-of-day stack and heatmaps | `GET /crossings/stats/hourly?group_by=region` (and `plate_type`, `commercial`) | `{ group_by, groups: [{ key, label, hours: [24 counts] }] }`. `group_by` is `none`, `region`, `plate_type`, `commercial`, `lane` or `tag_class`. Groups are sorted by total. |
| Every top-N, share and bar chart | `GET /crossings/stats/breakdown?field=state&limit=10` | `{ field, total, distinct, items: [{ key, label, count, pct }] }`. `field` is one of `state`, `district`, `rto`, `region`, `make`, `model`, `color`, `plate_type`, `lane`, `axles`, `tag_class`, `vehicle_class`, `exempt_class` (exempt crossings only), `oos`, `ev` or `commercial`. Booleans return keys `"true"`/`"false"` with labels such as "EV"/"Non-EV". Unknown values are left out; `pct` is of all matching crossings. `limit` is 1–100. |
| Make × model heatmap | `GET /crossings/stats/matrix?rows=make&cols=model&row_limit=8&col_limit=10` | `{ rows: [{ key, label, count }], cols: [...], cells: [[counts]] }`, where `cells[row][col]` follows the order of `rows` and `cols` |

Old panel → breakdown `field`:
- Top states, districts and RTOs: `state`, `district`, `rto`.
- Region share: `region`.
- In-state vs out-of-state: `oos`.
- Top makes and models: `make`, `model`.
- Colour share: `color`.
- Plate types: `plate_type`.
- Axles, tags and vehicle classes: `axles`, `tag_class`, `vehicle_class`.
- EV share: `ev`.
- Commercial share: `commercial`.
- Top exempt classes: `exempt_class`.

### 4.8 Alerts tab

Alerts are computed on the server when each crossing is stored, and the review state is shared by all operators.

- **`GET /alerts?<filters>[&severity=HIGH,MED][&type=TAG_MISMATCH][&status=open|reviewed|all][&focus=12|exempt]&limit=50[&cursor=]`**
  - Sorted most severe first, then newest. `status` defaults to `open`, and `alert_kind` defaults to `hard` (pass `alert_kind=all` to include description-only alerts).
  - `focus` is an expected tag (`4`, `5`, `6`, `7`, `12`, `15`, `16`) or `exempt`.
  - Response: `{ items, next_cursor }`. Page through it like the table, replacing the old 200-row cap.

  ```json
  {
    "id": "91", "type": "TAG_MISMATCH", "kind": "hard", "severity": "HIGH",
    "charged_tag": "4", "expected_tag": "12", "loss": 235,
    "reason": "AI detected class 12 (Truck 4-Axle) → expected Tag 12, charged Tag 4",
    "status": "open", "reviewed_by": null, "reviewed_at": null, "review_note": null,
    "crossing": { ...list item... }
  }
  ```
  - `type` is `TAG_MISMATCH`, `AXLE_MISMATCH`, `DESC_MISMATCH`, `EXEMPT_ANOMALY` or `HIGH_VALUE`.
  - `expected_tag` can be `"7+"` (description mismatch) or `null` (exempt anomaly).
  - `reviewed_by` is `{ id, name }` once reviewed.

- **`GET /alerts/summary?<filters and alert filters>`** gives the KPIs, the tab badge and the side panels. It covers open and reviewed alerts together (`status` is ignored).

  ```json
  {
    "alert_kind": "hard",
    "open": 7, "total_alerts": 9, "total_flagged": 8, "critical_open": 3,
    "estimated_loss": 920,
    "worst_lane": { "lane": { "id": 1, "number": 3, "name": "Lane 3" }, "open": 4, "count": 5 },
    "exempt_anomalies": 2, "reviewed": { "count": 2, "pct": 22.2 }, "crossings_scanned": 340,
    "by_severity": [{ "severity": "HIGH", "count": 3, "open": 3 }],
    "by_lane": [{ "lane": {...}, "open": 4, "count": 5 }],
    "by_type": [{ "type": "TAG_MISMATCH", "count": 2, "open": 2, "loss": 470 }]
  }
  ```
  Use `open` for the tab badge, and mark the badge critical when `critical_open > 0`.

  Every count is for `alert_kind` (hard by default), except **`by_kind`**: `{ "hard": { "count", "open" }, "soft": { "count", "open" } }`. It always covers both kinds, so the toggle can show how many soft alerts are hidden.

- **`POST /alerts/review`** sends `{ "alert_ids": [91, 92], "reviewed": true, "note": "Checked footage" }`.
  - Send `crossing_ids` instead to review every alert on those crossings (the old per-row "mark reviewed"). Use `reviewed: false` to re-open.
  - At most 500 ids per call. "Mark all visible" sends the visible ids.
  - Response: `{ message, updated }`, where `updated` counts only alerts whose status actually changed.
  - Refetch the list and summary afterwards.
  - Not available to `client_viewer`.

- **`GET /alerts/export.csv?<same filters>`** downloads the CSV (see section 6). It has the same columns as the old export.

### 4.9 Reports tab

All of these take the shared filters. Each has `GET /reports/<name>/export.csv` with the same parameters.

| Report | Call | Response |
|---|---|---|
| Summary | `GET /reports/summary` | `{ crossings, days, collection, avg_per_crossing, revenue_at_risk: { amount, pct_of_collection }, exempt, daily: [{ day, count, collection }], tag_share: [{ tag_class, count, collection, share }], top_days: [...5], ops_mix: { commercial, ev, oos, exempt }, badges: { days, active_tags, exempt, overload } }`. Each `ops_mix` entry is `{ count, pct }`. `badges` replaces `updateReportsBadges`. `revenue_at_risk` sums hard alerts unless you pass `alert_kind`. |
| Day-wise | `GET /reports/daily` | `{ days: [{ day, count, collection, ev, oos, commercial, exempt, hours: [24] }], totals: { same fields, hours } }` |
| Tag class | `GET /reports/tag-classes` | `{ total, tags: [{ tag_class, description, count, collection, share, active_days, top_makes: [{ make, count }] }], by_vehicle_class: [{ tag_class, vehicle_class, name, count, collection }] }`. Always all seven tags, including empty ones. |
| Exempt | `GET /reports/exempt` | `{ total, pct_of_crossings, categories: [{ class, count, forgone }], forgone_revenue, suspicious }`. The entry list is `GET /crossings?exempt=true`, and its CSV is `/reports/exempt/export.csv`. |
| Overload | `GET /reports/overload[&limit=&cursor=]` | `{ total, estimated_loss, high, worst_lane, by_axle: [{ axles, count, loss }], by_lane: [{ lane, count, loss }], log: [alert items], next_cursor }`. The totals cover the whole range, and `log` is one page (follow `next_cursor`). |

**Overload is not the old `detectOverload`.** It's the `AXLE_MISMATCH` alerts on non-exempt crossings, so it agrees with the alerts tab: the severity and loss come from the alert. Show the alert's `severity` and `loss`, and the crossing's `amount` as the charged amount.

### 4.10 Lane health strip

**`GET /lanes/health?<filters>`** returns `{ lanes: [{ id, number, name, cameras: [...], last_crossing_at, seconds_since_last, status, crossings_last_hour, crossings_in_range, watchlist_hits }] }`.

- **`status`:** `ok` if the last crossing was under 10 minutes ago, `stale` under 60 minutes, `down` otherwise (or never seen).
- **What the filters affect:** only `crossings_in_range` and `watchlist_hits`. `last_crossing_at` and `crossings_last_hour` ignore them.
- **Updates:** the live stream pushes a fresh `lane.health` every minute (section 5). Between pushes, tick `seconds_since_last` up locally.

### 4.11 Live wall

1. Initial load: `GET /crossings?<filters>&limit=36` (60 in full screen). The toggles map to `has_alerts=true`, `watchlist=true` and `commercial=true`.
2. Then follow the live stream (section 5).
   - Prepend each `crossing.created` item that passes the wall's toggles (check `item.alerts.count > 0`, which is hard alerts only, like `has_alerts=true`; `item.watchlist`; and `item.flags.commercial`).
   - Trim the list back to 36 or 60.

### 4.12 Watchlist

- **`GET /watchlist?plaza_id=1[&category=stolen][&q=MH40]`** returns `{ items: [entry] }`, the plaza's entries plus all-plaza ones.

  ```json
  { "id": 4, "plaza_id": 1, "plate": "MH 40 ST 0001", "plate_normalized": "MH40ST0001",
    "category": "stolen", "note": "FIR 123", "added_by": { "id": 6, "name": "Admin" },
    "created_at": "...", "updated_at": "..." }
  ```
  `category` is `stolen`, `bolo`, `blacklisted`, `vip` or `custom`. `plaza_id: null` means an all-plaza entry.

- **`POST /watchlist`** sends `{ "plaza_id": 1, "plate": "MH 40 ST 0001", "category": "stolen", "note": "..." }` and returns 201 `{ entry }`.
  - `plaza_id: null` (or leaving it out) makes an **all-plaza entry, which is admin only**.
  - A plate that's already listed returns 409; show "already on the watchlist".
  - Plates are normalized on the server, so spaces and dashes are fine.
- **`PATCH /watchlist/{id}`** takes `{ plate?, category?, note? }`. **`DELETE /watchlist/{id}`** removes the entry permanently.
- **`GET /watchlist/summary?<filters>`** returns `{ entries, hits, plates_seen, by_category: [{ category, entries, hits }] }`. The hit list is `GET /crossings?watchlist=true`.
- **Precedence:** when a plate has both a plaza entry and an all-plaza entry, the plaza's own entry is the one shown in `item.watchlist`.
- **Who can edit:** admin, supervisor and operator. The UI is read-only for auditors and client viewers.
- **Live hits:** the old pop-up and sound for new hits now come from the stream's `watchlist.hit` event (section 5), not from client-side matching.

### 4.13 Pricing settings (admin)

- **`GET /reference/vehicle-classes`** returns `{ tag_classes: [{ tag_class, description, vehicle_classes: [{ vehicle_class, name, default_price }] }] }`. `default_price` is only included for roles that can see money. Use it in place of the hard-coded `TAG_CLASS_INFO` and `VEHICLE_CLASS_NAME`, and fetch it once at startup.
- **`GET /plazas/{id}/pricing`** (roles that can see money only; others get 403, so don't show the pricing page to them) returns `{ plaza_id, prices: [{ vehicle_class, name, tag_class, default_price, price, updated_by, updated_at }] }`, one row per vehicle class (15 today). `price: null` means not set; `default_price` is the standard tariff, which a "reset to default" button can use.
- **`PUT /plazas/{id}/pricing`** (admin only) sends `{ "prices": [{ "vehicle_class": 4, "price": 70 }] }`. Numbers, not strings. Send only the classes that changed.
  - **A price change affects future crossings only**; stored crossings keep the price they were charged. Say so in the UI, e.g. "Applies to new crossings only".

---

## 5. Live updates: the stream (`GET /stream`)

This replaces both the manual Refresh button and polling. It drives the live wall, the "N new" pill, new-alert notices, the watchlist pop-up and sound, and the lane health strip.

### 5.1 How to connect

`GET /api/v1/stream?plaza_id=1[&tz=...]` is a **Server-Sent Events** stream that needs the `Authorization: Bearer <token>` header.

**Don't use the browser's `EventSource`:** it can't send headers, and the server never accepts the token in the URL (that's what made the old dashboard insecure). Use a fetch-based SSE client instead, such as **`@microsoft/fetch-event-source`**:

```ts
import { fetchEventSource } from '@microsoft/fetch-event-source';

let controller: AbortController | null = null;

export function openStream(plazaId: number, token: string, handlers: StreamHandlers) {
  controller?.abort();
  controller = new AbortController();

  fetchEventSource(`${API}/stream?plaza_id=${plazaId}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: controller.signal,
    openWhenHidden: true, // keep the live wall updating in background tabs
    async onopen(res) {
      if (res.status === 401) throw new AuthError(); // go to login, don't retry
      if (res.status === 403 || res.status === 404) throw new FatalError(); // no access to the plaza
      if (!res.ok) throw new RetriableError();
    },
    onmessage(msg) {
      if (!msg.event || msg.event === 'ping') return;
      if (msg.event === 'error') return; // the server is about to close; onclose/onerror follows
      const data = JSON.parse(msg.data);
      switch (msg.event) {
        case 'crossing.created': handlers.crossing(data); break;
        case 'alert.created':    handlers.alert(data); break;
        case 'watchlist.hit':    handlers.watchlistHit(data); break;
        case 'lane.health':      handlers.laneHealth(data.lanes); break;
      }
    },
    onclose() {
      // The server ends the stream when the token expires or plaza access is
      // revoked. Throwing makes the library retry: reconnect if the token is
      // still valid, otherwise show the login screen.
      if (tokenExpired()) throw new AuthError();
      throw new RetriableError();
    },
    onerror(err) {
      if (err instanceof AuthError || err instanceof FatalError) throw err; // stop
      return 2000; // retry after 2s (the library keeps retrying)
    },
  });
}

export const closeStream = () => controller?.abort();
```

- **One stream per tab,** for the selected plaza. **Reopen it when the plaza changes** or after a new login, and close it on logout.
- **Reconnects:** after a reconnect, catch up with `GET /crossings/updates` (section 5.4) so nothing is missed while disconnected.

### 5.2 Events

| `event` | When | `data` |
|---|---|---|
| `lane.health` | On connect, then every 60 s | `{ lanes: [...] }`, the same shape as `GET /lanes/health` (with `range=today`) |
| `crossing.created` | Each newly stored crossing | A **list item** (the section 4.4 shape), with money fields only for roles that can see money. The SSE `id` is the crossing id. |
| `alert.created` | Each alert raised on a new crossing, hard **and** soft | The section 4.8 alert fields (`status: "open"`, with `kind`) plus `crossing_id`, without `crossing`. Skip `kind: "soft"` for toasts and badges unless the user has turned soft alerts on. |
| `watchlist.hit` | A new crossing's plate is on the watchlist | `{ crossing: <list item>, watchlist: { id, category, note } }` |
| `ping` | Every 25 s | `{}`. Keep-alive; ignore it. |
| `error` | Just before the server closes the stream | A message: the session was logged out, the token expired, or the user has no access to this plaza. **A missing plaza access arrives this way, after a 200 response, not as an HTTP 403**, so treat an `error` right after connecting as fatal for that plaza rather than retrying. |

Events arrive in batches: the camera service pushes several crossings at once, and the events for one batch come together. Events are filtered by plaza only. **Applying the screen's other filters is the client's job** (see below).

### 5.3 What each screen does with the events

- **Crossings table:**
  - Don't insert rows directly (they may not match the filters or the sort).
  - Count `crossing.created` events into the **"N new" pill**. On click, reset the cursor and reload page 1 together with the KPI summary.
  - Briefly highlight rows from that reload whose ids arrived in the stream.
- **Live wall:** prepend matching items (section 4.11).
- **KPI strip:** refetch `/crossings/stats/summary` at most every few seconds while events arrive (debounce), or show the pill and refresh on click. Don't add numbers up in the browser.
- **Alerts tab:**
  - On `alert.created`, bump the open badge and show a toast for `HIGH`.
  - Refetch `/alerts/summary` (debounced) and offer "N new alerts, refresh".
- **Watchlist:** on `watchlist.hit`, show the pop-up and play the sound (respecting the user's notification preferences in `localStorage`), and append to a "recent hits" list.
- **Lane health:** replace the strip with each `lane.health` payload.
- **Analytics and reports:** don't live-update. They refresh when filters change or on demand.

### 5.4 Fallback and catch-up: `GET /crossings/updates`

`GET /crossings/updates?<filters>[&since=<cursor>][&limit=200]` returns `{ items, count, has_more, next_cursor }`.

- **First call (no `since`):** returns no items and a starting `next_cursor`. Store it when the screen loads.
- **Later calls:** pass the stored cursor as `since`. You get crossings stored after it, **oldest first** (by insertion order, so late-arriving crossings aren't missed), up to `limit`. Store the new `next_cursor`. If `has_more` is true, call again.
- **Use it:**
  - after the stream reconnects, to catch up;
  - as a polling fallback (every 15 s) if the stream can't connect, for example on a network that blocks streaming.

---

## 6. Downloads (CSV)

These endpoints need the auth header, so **a plain `<a href>` won't work**. Fetch the file with the header and save the blob:

```ts
async function download(path: string, fallbackName: string) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw await res.json();
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}
```

| Download | Path |
|---|---|
| Crossings (filtered and sorted, all pages) | `/crossings/export.csv?<filters>&sort=&dir=` |
| Alerts | `/alerts/export.csv?<filters and alert filters>` |
| Reports | `/reports/summary/export.csv`, `/reports/daily/export.csv`, `/reports/tag-classes/export.csv`, `/reports/exempt/export.csv`, `/reports/overload/export.csv`, each with the shared filters |

The server exposes `Content-Disposition` to the browser, so the helper above gets the real filename (e.g. `alerts-1-1729591200000.csv`); `fallbackName` is only a backstop. The files are UTF-8 with a BOM, so Excel opens them correctly. Money columns are left out for roles that can't see money. The crossings CSV's `alerts`, `max_severity` and `alert_loss` columns are hard alerts; `soft_alerts` counts the description-only ones.

---

## 7. Screen → API checklist

| Screen | Calls |
|---|---|
| Login | `POST /auth/login`, `GET /auth/me` |
| Header plaza selector | `GET /plazas` |
| App start | `GET /reference/vehicle-classes` |
| KPI strip | `GET /crossings/stats/summary` |
| Crossings table | `GET /crossings` (infinite scroll on `next_cursor`), `GET /crossings/facets` when a dropdown opens, the summary for "X of Y", the stream for the "N new" pill, `GET /crossings/export.csv` |
| Detail drawer | `GET /crossings/{id}`, `GET /crossings/{id}/adjacent` |
| Live wall | `GET /crossings?limit=36`, the stream |
| Lane health strip | `GET /lanes/health`, the stream (`lane.health`) |
| Analytics | `GET /crossings/stats/overview`, `/timeline`, `/hourly` (×3), `/breakdown` (about 12 fields), `/matrix`, all in parallel |
| Alerts | `GET /alerts/summary`, `GET /alerts`, `POST /alerts/review`, `GET /alerts/export.csv`, the stream (`alert.created`) |
| Reports | `GET /reports/summary`, `/daily`, `/tag-classes`, `/exempt`, `/overload`, plus each `/export.csv` |
| Watchlist | `GET /watchlist`, `POST /watchlist`, `PATCH`/`DELETE /watchlist/{id}`, `GET /watchlist/summary`, `GET /crossings?watchlist=true`, the stream (`watchlist.hit`) |
| Pricing settings | `GET /reference/vehicle-classes`, `GET`/`PUT /plazas/{id}/pricing` |
| Stream fallback | `GET /crossings/updates` |

**Don't call:** `POST /ingest/crossings` (machine-to-machine, camera service only) or `POST /auth/hash-password` (an admin utility).

## 8. Suggested order

1. **Foundation:** the API client (base URL, auth header, 401 handling, error shape), login and session, the plaza selector, and the shared filter serializer.
2. **First screens:** the crossings table, KPI strip and detail drawer. This replaces the full-dump boot.
3. **Live:** the stream (section 5), live wall, "N new" pill, lane health and the `/crossings/updates` fallback.
4. **Alerts tab,** with server-side review.
5. **Analytics,** then **reports**, then CSV downloads.
6. **Watchlist,** then **pricing settings.**
7. **Cleanup:** delete the code and `localStorage` keys listed in section 1.
