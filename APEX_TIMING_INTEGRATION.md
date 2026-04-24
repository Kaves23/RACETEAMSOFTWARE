# Apex Timing Live Integration — Technical Reference

## Overview

Apex Timing does **not** provide a public API or WebSocket endpoint for third-party integration.
The live data feed is delivered via a proprietary raw Java WebSocket server (TooTallNate `Java-WebSocket`)
running on a per-event TCP port.

This document captures everything reverse-engineered by connecting RTS to the African Karting Cup feed.

---

## 1. Architecture

```
Browser (topnav.js + live-timing.js)
    │  HTTP polling every ~10s
    ▼
RTS Server (server/routes/apex-proxy.js)
    │  Persistent WebSocket connection
    ▼
wss://www.apex-timing.com:{port}/
    │  Raw Java WebSocket (TooTallNate)
    ▼
Apex Timing Live Server
```

The browser cannot connect to Apex Timing directly (CORS, no public WebSocket).
The RTS server maintains a persistent connection and serves parsed state via HTTP polling.

---

## 2. Discovering the WebSocket Port

Each live event has its own port. The port is embedded in the event page HTML/JS at:

```
https://live.apex-timing.com/{slug}/
```

Where `{slug}` is the last path segment of the timing URL, e.g. `african-karting-cup`.

### Port Formula

The page embeds a **display port** (e.g. `7550`). The actual WebSocket ports are:

| Port | Protocol | Use |
|------|----------|-----|
| displayPort + 3 | WSS (TLS) | Primary — use this |
| displayPort + 2 | WS (plain) | Fallback |

Example: display port `7550` → WSS on `7553`, WS on `7552`.

### Port Pattern Regex

The server scans the page HTML and linked JS files for these patterns:

```js
/wsPort\s*[=:]\s*(\d{4,5})/i
/ws_port\s*[=:]\s*(\d{4,5})/i
/"port"\s*:\s*(\d{4,5})/i
/port\s*=\s*(\d{4,5})/i
/apex-timing\.com['":\s,+]*(\d{4,5})/i
/wss?:\/\/[^:'"]+:(\d{4,5})/i
/connect\s*\([^)]*,\s*(\d{4,5})\s*\)/i
/new\s+WebSocket\s*\(\s*["'`][^"'`]*:(\d{4,5})/i
```

---

## 3. WebSocket Connection

### URL

```
wss://www.apex-timing.com:{displayPort + 3}/
```

### Required Headers

```
Origin: https://live.apex-timing.com
Host:   www.apex-timing.com:{port}
User-Agent: Mozilla/5.0 (compatible; RaceTeamOS/5.0)
```

### Critical Rules

- **Do NOT send any message on open.** The server streams data unprompted.
  Sending even an empty string (`""`) causes the Java WebSocket server to close the connection immediately.
- TLS certificate validation should be disabled (`rejectUnauthorized: false`) as the cert may not match.
- The server sends a full state dump immediately on connect, then incremental updates.

---

## 4. Message Format

Each WebSocket frame contains one or more newline-separated tokens.

### Token Structure

```
ELEMENT_ID|CSS_CLASS|VALUE
```

Multiple tokens in one frame are separated by newlines (and sometimes spaces).

### Special Elements

| Element ID | CSS Class | Value | Meaning |
|------------|-----------|-------|---------|
| `init` | `r` / `n` | — | Session start (`r`) / end (`n`) |
| `light` | see below | — | Current flag/race status |
| `title1` | — | e.g. `Mini ROK` | Class on track |
| `title2` | — | e.g. `Race 4` | Session name |
| `dyn1` | `text` | e.g. `Lap 101/200` | Lap counter display |
| `dyn2` | `count` | milliseconds | Countdown timer |
| `grid` | — | HTML `<table>` | **Full leaderboard** (see section 5) |
| `gridb` | — | HTML `<table>` | Best lap results table |
| `wth1`–`wth3` | — | weather strings | Weather info |
| `track` | — | e.g. `GT Raceway - 1.140 km` | Track name |
| `comments` | — | text | Commentary |
| `r{N}` | `*` | milliseconds | Row timestamp |

### Flag / Status CSS Classes

| CSS Class | Status |
|-----------|--------|
| `lg` / `gr` / `wf` | Racing (green flag) |
| `ly` / `yf` / `lr` / `rf` | Paused (yellow flag) |
| `lc` / `ch` | Finished (chequered flag) |
| `lo` / `no` | Waiting |
| `ls` / `sc` / `bf` | Safety car / paused |

### Grid Cell Updates (Incremental)

After the initial dump, individual cell updates arrive as:

```
r{ROW}c{COL}|{cssClass}|{value}
```

Example:
```
r3c11|ti|31.420
r3c9|in|201
r5c13|in|4.750
```

---

## 5. HTML Grid (Driver Names)

**Driver names, kart numbers, and positions are NOT sent as `r{N}c{N}` tokens.**

They are only delivered in the `grid||<table>…</table>` element sent in the initial state dump on connect.

### Table Structure

The HTML table uses `data-id` attributes on `<th>` (headers) and some `<td>` (data cells):

```html
<thead>
  <th data-id="c3">Rnk</th>
  <th data-id="c4">No.</th>
  <th data-id="c5">Driver</th>
  <th data-id="c6">Team/Sponsor</th>
  <th data-id="c7">Class</th>
  ...
</thead>
<tbody>
  <tr>
    <td>1</td>          <!-- c3: rank — NO data-id -->
    <td>17</td>         <!-- c4: kart — NO data-id -->
    <td data-id="r1c5">Cornofsky Kayde</td>
    <td data-id="r1c6">Xtreme Racing</td>
    <td data-id="r1c7">MINI ROK</td>
    <td data-id="r1c9">200</td>
    <td data-id="r1c10">31.749</td>
    <td data-id="r1c12">…</td>
  </tr>
```

**Important:** The rank and kart number cells (`c3`, `c4`) have NO `data-id`. They must be extracted by
anchoring from the first cell that does have one and counting backwards.

### Parsing Algorithm

1. For each `<tr>`, find the first `<td data-id="r{N}c{M}">` — this is the **anchor**.
2. `anchorRow = N`, `anchorCol = M`, `anchorIdx = cell's 0-based index in the row`
3. For each cell at index `i`: `columnNumber = anchorCol - anchorIdx + i`
4. Cells with explicit `data-id` always take priority.
5. Strip inner HTML tags (kart numbers are often `<b>17</b>`) and decode HTML entities.

---

## 6. Confirmed Column Mapping

From the African Karting Cup feed (Mini ROK class):

| Column | Field | Delivery method |
|--------|-------|-----------------|
| c3 | Race rank / position | HTML grid (initial) + incremental |
| c4 | Kart number | HTML grid (initial) |
| c5 | Driver full name | HTML grid (initial) |
| c6 | Team / Sponsor | HTML grid (initial) |
| c7 | Class | HTML grid (initial) |
| c9 | Laps completed | HTML grid + incremental |
| c10 | Best lap time (seconds) | HTML grid + incremental |
| c11 | Last lap time (seconds) | Incremental only |
| c12 | Interval to car ahead | Incremental |
| c13 | Gap to race leader | Incremental |

Column mapping may differ across different Apex Timing event configurations.
Names/kart numbers are only in the initial HTML dump — never as `r{N}c{N}` incremental tokens.

---

## 7. Connecting Mid-Race

Because names only arrive in the initial dump:

- **Any time you connect** (race start, mid-race, end), Apex Timing sends the full current leaderboard as an HTML table immediately.
- The `grid||<html>` element is always the first meaningful message.
- Incremental updates then keep cells current from that point forward.

**You will always get accurate data within ~3 seconds of connecting**, regardless of where in the race you are.

---

## 8. Session Lifecycle

The RTS server maintains one session per slug in memory:

```
startSession(slug)
  → discoverPort(slug)     — fetch event page, scan for display port
  → connectWs(session)     — connect wss://{host}:{displayPort+3}/
  → on message: parseMessages → parseHtmlGrid (for grid||) or grid cell update
  → on close (non-1000): rotate wss↔ws, retry after delay
  → evict after 30 min of no updates
```

Session is shared — all browser clients polling the same slug get the same parsed state.

---

## 9. Tokeniser Edge Cases

Multi-word values (e.g. `"1 Lap"`, `"Cornofsky Kayde"`) must not be split on spaces.
The frame tokeniser splits on `\s+` only when followed by an `IDENTIFIER|` pattern:

```js
raw.trim().split(/\s+(?=\S+\|)/)
```

The `grid||<html>` element is extracted before general splitting because it contains
spaces, `|` characters, and newlines inside the HTML that would break the splitter.

---

## 10. Driver Matching

The `live-timing.js` client matches Apex Timing names to RTS database drivers using:

1. **Exact normalised match** — `"CORNOFSKY KAYDE"` matches `"Cornofsky Kayde"` in DB
2. **Reversed name** — `"Boshoff Zac"` (Apex Timing surname-first) matches `"Zac Boshoff"` in DB
3. **Kart number** — definitive match if kart numbers are stored on driver records
4. **Surname match** — partial match if full name doesn't resolve
5. **Levenshtein (≤2)** — fuzzy fallback for typos

Driver records are fetched from `/api/collections/drivers` (the RTS database) on load.

---

## 11. API Endpoints

All routes under `/api/apex-proxy` (auth required):

| Method | Path | Description |
|--------|------|-------------|
| GET | `/?slug=…` | Start/poll session. Returns parsed state. |
| GET | `/messages?slug=…&last=20` | Raw message queue (last N frames) |
| GET | `/grid?slug=…` | Raw grid Map as JSON (for debugging column mapping) |
| GET | `/discover?slug=…` | Port discovery diagnostics |
| GET | `/test-port?host=…&port=…` | TCP reachability test |
| GET | `/scan-ports?host=…&base=…&range=…` | Scan port range for open sockets |
| DELETE | `/session?slug=…` | Force-close session for fresh reconnect |

---

## 12. Debugging

### Check what's in the grid

```javascript
fetch('/api/apex-proxy/grid?slug=african-karting-cup').then(r=>r.json()).then(d=>{
  Object.entries(d.grid).slice(0,5).forEach(([r,c])=>
    console.log(r, `pos=${c.c3?.value} kart=${c.c4?.value} name=${c.c5?.value} laps=${c.c9?.value}`)
  )
})
```

### See raw messages

```javascript
fetch('/api/apex-proxy/messages?slug=african-karting-cup&last=5').then(r=>r.json()).then(d=>{
  console.log('connected:', d.connected, 'msgs:', d.messages.length);
  d.messages.slice(0,2).forEach((m,i)=>console.log(`msg[${i}]:`,m.slice(0,400)));
})
```

### Force a fresh connection

```javascript
fetch('/api/apex-proxy/session?slug=african-karting-cup', {method:'DELETE'}).then(r=>r.json()).then(console.log)
```

The browser's live-timing.js polling will automatically trigger a new session within 10 seconds.

### Check TCP reachability from Render

```javascript
fetch('/api/apex-proxy/test-port?host=www.apex-timing.com&port=7553').then(r=>r.json()).then(console.log)
```

---

## 13. Known Limitations

- **Port changes per event** — each new event at a venue gets a new port. The slug in settings must match the live event slug.
- **Render cold start** — Render's free tier sleeps after inactivity. First connection after sleep may take 30–60s while port discovery runs.
- **Race complete** — after `light|lc|` (chequered flag), the server reconnects after 4s to fetch final standings.
- **Column mapping may vary** — tested on Mini ROK class at African Karting Cup. Other events/classes may use different column indices. Use the `/grid` endpoint to verify.
