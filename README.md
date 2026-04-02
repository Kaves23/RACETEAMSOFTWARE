# Race Team OS (Prototype)

A compact, dark-themed, front‑end prototype for managing a motorsport team’s operations. It runs fully client‑side (no backend) and stores data in the browser via localStorage. Navigation uses a responsive top tab bar; most pages use a dense tri‑pane layout for fast workflows.

> Status: Prototype. Data is local to your browser. Export regularly if you care about it.

## Highlights at a glance

- Responsive top tab navigation with horizontal scroll and edge gradients
- Grouped topnav categories (Tech, Ops, Finance, Team) with dropdowns
- Global quick search (press `/`) across local data, with a results modal
- Smart Search commands (type or prefix with `>`):
  - `add driver Lewis` — creates a driver and opens Drivers
  - `stock 54` — shows inventory results matching `54`
  - `reset` — clears local `rts.*` keys (pages reseed)
- One‑click Import/Export of all `rts.*` localStorage data
- Dense tables, single‑line rows, and compact headers for information‑rich views
- Consistent accent color and dark styling across pages

## Key modules and capabilities

### Settings
Central directory for shared data used across the app (right‑pane inspector with horizontal‑scroll tabs):
- Drivers, Staff, Roles, Suppliers, Locations, Venues, Event Types
- Setup Templates (define named fields for structured setups)
- Master Checklists (define SOP lists to spawn per Event/Task)
- Google integrations (prototype):
  - Calendar toggle + fields
  - Drive Picker toggle, keys, and test/reset buttons
- Utilities: Export JSON, Import JSON, Reset to defaults
- Fast left pane filtering + inline selection; items stored in `rts.settings.v1`

### Assets
- Normal vs Packing mode toggle for rapid pre‑event prep
- Packing modal with large action buttons for:
  - Status, Location, Custodian (custodian choices sourced from Settings → Staff)
  - Immediate active highlight on the button you click
  - History logging for changes
- Attachments & Labels sections formatted for readability
- UI polish:
  - Larger, high‑contrast modal close button
  - Custodian labels in purple with cleaner weight

### Inventory
- Inspector includes Assigned Driver dropdown (populated from Settings → Drivers)
- Driver column in the middle list; purple labels for visibility
- Left pane “Drivers” smart list filters inventory by assignment
- Stock state visuals:
  - Out‑of‑stock rows get a soft red glow
  - Low stock (≤ reorder) rows get a soft purple glow
  - Tooltips on hover explain the stock state
- Row hover emphasis:
  - Bright purple hover fill (CSS with JS fallback `inv-hover` to guarantee visibility)
- Pointer guidance:
  - Optional crosshair overlay helper tracks the mouse pointer

### Invoicing
- Simplified to left + middle panes; inspector functions moved into a modal
- Click any invoice row (or create a new one) to open the modal editor
- Inside the modal:
  - Edit core fields (status, dates, customer, event, bill‑to details)
  - Manage line items (add, edit, delete) with live totals
  - VAT rate/amount calculation and grand total
  - Actions: Save, Duplicate, Delete, Open PDF (printable view)
- Attach PO drafts to invoices (when present in local data)
- Totals and selection badges update in real‑time; data in `rts.invoices.v1`

### Expenses
- Dedicated page for cost tracking (top tab reads “Expenses”) — integrates with the shared look‑and‑feel and data patterns used across the app

### Service
- Service queue with filters and inspector
- Fuel & Mix Calculator modal: percent or ratio sliders, instant “Add X ml Oil” result

### Events
- Setups tab
  - Select a template from Settings → Setup Templates
  - Dynamic fields render from template; optional driver tagging
  - Save setups per event and compare any two — differences highlighted in yellow
- Run Plan tab
  - Time‑ordered sessions (Start, Name, Driver, Status)
  - Live countdown to the next upcoming session
  - Dynamic browser title countdown when a session is “On Track” and has a duration
  - “Log” modal for each session: Weather, Tags, Tyre pressures (Cold/Hot), Driver Feedback
- Checklists tab
  - Spawn checklists from Settings → Master Checklists
  - Tick items off, clear or remove lists; saved per event

### Tasks
- Compact tri‑pane task manager with filters, groups, attachments, and metadata
- New Checklist tab in the inspector
  - Spawn a task‑local checklist from Settings → Master Checklists
  - Tick/clear items; saved on the task

### Incidents
- Damage Map tab with an interactive top‑down kart outline
  - Click a part to set Green/Amber/Red status; fills update and persist per incident

### Events, Tasks, Drivers, Load Plan, Compliance, Service, Forecast, Strategy, Incidents, Performance, Integrations
- Pages present and wired into the top navigation
- Follow the same compact tri‑pane list/inspector pattern and styling conventions
- Persist to localStorage using the common RTS helpers (where implemented)

## Global helpers and UX patterns

- Top tabs
  - Tight spacing to fit more tabs, horizontal scroll when needed
  - Active tab updated immediately on click
- Quick search modal
  - Press `/` to focus the search input
  - Searches across `rts.*` keys in localStorage and links to relevant pages
- Import/Export
  - Export all RTS data to a single JSON file
  - Import an RTS JSON file to restore data (overwrites existing keys)
- Tri‑pane resizers
  - Drag separators to resize left/right panes; sizes are remembered per page
- RTS utility facade (in `core.js`)
  - `safeLoadJSON`, `safeSaveJSON`, `deepMerge`, `moneyZAR`, `confirmPrompt`, etc.
  - Crosshair overlay: `RTS.enableCrosshair(opts)`, `RTS.disableCrosshair()`

## Persistence

All data is stored in localStorage under `rts.*` keys, for example:
- `rts.settings.v1` (directories, Google config)
- `rts.inventory.v4`, `rts.inventory.ui.v4`
- `rts.assets.v4`, `rts.assets.ui.v4`
- `rts.invoices.v1`, `rts.invoice.customers.v1`, `rts.invoice.ui.v1`
- `rts.podrafts.v1` (PO Drafts)

Use the top bar Export/Import to back up or restore data.

## How to run

- Open any of the HTML files directly in a modern browser (file:// works)
- Prefer starting at `index.html` to get the full top navigation
- Enable/disable features in Settings as needed (e.g., Drive Picker testing)

## PITWALL backend (optional)

The front‑end works offline, but a lightweight backend improves IDs and lifecycle history.

- Location: `server/`
- Tech: Node.js (Express) with SQLite by default, Postgres via `DATABASE_URL`
- Default port: `9090`

### Start the server (macOS, zsh)

```bash
cd "server"
npm start
```

Verify health:

```bash
curl http://localhost:9090/api/health
```

Background start:

```bash
nohup node index.js >/tmp/pitwall.log 2>&1 &
tail -n 50 /tmp/pitwall.log
```

Stop background process (replace PID):

```bash
kill -TERM <PID>
```

### Key endpoints

- GET `/api/health` — server health
- GET `/api/:collection` — list items (e.g., `inventory`, `assets`, `events`)
- POST `/api/:collection/sync` — upsert array of items
- POST `/api/:collection/create` — create one item with a sequential ID
  - inventory IDs: `1, 2, 3, …`
  - asset IDs: `AS-0001, AS-0002, …`
- POST `/api/history` — append lifecycle entries
  - body: `{ kind, id, action, by='admin', eventId?, note?, tsMs? }`

### Front‑end integration

- Inventory
  - Add/Duplicate uses backend IDs when available; falls back to local sequence offline.
  - Delete is disabled; policy enforces removal via Invoicing.
- Invoicing
  - “Add Inventory Item” picker adds a linked line.
  - Saving invoice with status Sent/Paid deducts on‑hand stock and updates lastUsedTs.
- Forecasting & Replenishment
  - Lists Inventory and Assets, burn rate slider (slow→rapid), estimates need and rough reorder ETA.
- Load Plan
  - Placements store `itemKind` (`inventory`|`assets`) and `itemId`.
  - Packing/Unpacking logs history (`Packed` / `Unpacked`) via `/api/history`.

### Offline behavior

- If the server isn’t reachable, the app continues with localStorage.
- ID assignment falls back to a local sequence per collection.
- History logs are appended into the local item object.

### Troubleshooting

- Health check fails (curl exit code 7): ensure the server is running and port 9090 is free.
- If using Postgres, set `DATABASE_URL` before starting. Otherwise SQLite file `pitwall.sqlite` will be used.
- API base is auto‑detected: when running on `localhost`, front‑end tries `http://localhost:9090`; otherwise it stays offline.

## Shortcuts

- `/` — focus the global quick search in the top bar

## Known limitations

- Client‑only prototype (no multi‑user sync, auth, or server persistence)
- PDF is a printable window view, not a branded export yet
- Some modules are placeholders or minimal until further iteration

## Recent improvements

- Inventory: bright hover highlight, stock state glows, tooltips, driver assignment and filtering
- Assets: packing workflow with custodian buttons from Settings, larger close button, purple custodian labels
- Invoicing: refactored to modal‑based editing; click row to edit; live totals and PDF
- Events: Setups (template‑based) with comparison, Run Plan with live countdown, per‑session logging, event checklists spawned from Master Checklists
- Tasks: Checklist tab to spawn task‑local checklists from Master Checklists
- Global: crosshair overlay helper; top tabs spacing/scroll with edge gradients; “Finance” renamed to “Expenses”; grouped topnav categories
