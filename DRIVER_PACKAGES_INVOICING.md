# Driver Packages ↔ Invoicing Integration

This document explains how Driver Packages link to the Invoicing system so included items are automatically discounted. Keep it trackside for quick reference.

## What it does

- Per driver, you can mark package items as either:
  - INCLUDED (green) — driver’s package covers it
  - INVOICE (red) — driver must pay
- When a driver is selected on an invoice, any line matching an INCLUDED item is set to a 100% discount (rate = 0) and tagged as “Included via Package.”
- If a package later changes from INCLUDED to INVOICE, the line’s original rate is restored automatically.

## Where to find it

- Finance → Driver Packages (`packages.html`)
- Finance → Invoicing (`invoice.html`)

## Data storage

- Driver Packages states (per driver): `rts.driver.packages.v1`
- Invoices: `rts.invoices.v1`
- Settings (drivers list): `rts.settings.v1`

All are stored in localStorage in the browser; this allows offline usage. If you run a backend later, this can be synced server-side without changing the workflow.

## Package items supported

- Tyres
- Fuel
- Race Entry
- Transport
- Setup
- Coaching
- Spares
- Damage Cover
- Telemetry
- Seat Fitting
- Pit Crew
- Accommodation

These appear as squares in Driver Packages. Click to toggle INCLUDED/INVOICE.

## How the invoicing link works

1. Select the driver in the Invoice form (Driver dropdown).
2. On Save (and whenever the driver changes), the system scans invoice lines.
3. Each line is categorized by keywords (case-insensitive):
   - tyres: `tyre`, `tyres`
   - fuel: `fuel`, `petrol`, `gasoline`
   - entry: `entry`, `race entry`, `registration`
   - transport: `transport`, `shipping`, `logistics`, `haul`
   - setup: `setup`, `prep`, `mechanic`, `support fee`, `race support`
   - coaching: `coach`, `coaching`, `training`
   - spares: `spare`, `spares`, `parts`, `inv out`
   - damage: `damage`, `repair`
   - telemetry: `telemetry`, `data`
   - seat fitting: `seat`, `fitting`
   - pit crew: `pit`, `crew`
   - accommodation: `hotel`, `accommodation`, `lodging`
4. If the driver’s package marks that category as INCLUDED:
   - The line’s original rate is preserved in `baseRate` (once) and the current `rate` becomes `0`.
   - The line is flagged `pkgIncluded = true`.
   - The description gains `"(Included via Package)"` if it isn’t already present.
   - A green “Included” badge appears in the invoice lines UI.
5. If the category is INVOICE (or no match), any prior inclusion is undone and the line’s `rate` is restored from `baseRate`.

## UI cues

- Included lines show a green “Included” badge next to the description.
- Totals automatically reflect discounts.

## Inventory interaction

- Inventory-linked items (added via the “Add Inventory Item” button) still deduct stock when the invoice status becomes **Sent** or **Paid**.
- Discounts do not change stock deductions; they only affect the rate/total.

## Typical workflow

1. Go to Driver Packages:
   - Toggle the driver’s items to INCLUDED/INVOICE for the event.
2. Create an invoice:
   - Pick Customer, Driver, and Event.
   - Add lines (e.g., “Tyre set allocation”, “Fuel”, “Race support – day rate”).
3. Save the invoice:
   - The system applies package logic and marks INCLUDED lines at 100% discount.
   - Review totals and status.
4. Issue invoice:
   - Set status to Sent/Paid to trigger inventory deductions for inventory-linked lines.

## Manual overrides and tips

- You can edit a line’s description and rate at any time.
- If keyword detection doesn’t match what you expect, either:
  - Adjust the description to include a matching keyword, or
  - Ask for an explicit per-line Category dropdown (optional feature; easy to add) so you can force the category.

## Troubleshooting

- No “Included” badge appears:
  - Ensure the Driver is selected on the invoice.
  - Ensure the Driver’s package marks the category as INCLUDED.
  - Check the line description contains a keyword recognized for categorization.
- Totals don’t reflect discount:
  - Click Save to re-run the discount sweep.
- Inventory doesn’t deduct:
  - Only deducts when status becomes Sent or Paid.

## Optional enhancements (available on request)

- Per-line Category dropdown with a small “Apply Package Discounts Now” button.
- Batch sweep across all invoices for an event.
- Server sync of Driver Packages and Invoices for multi-device consistency.

## Quick start commands (optional)

To serve locally on macOS (zsh):

```zsh
# Frontend (static site)
cd "/Users/John/Dropbox/RACE TEAM SOFTWARE V5"
python3 -m http.server 8081

# Backend (if needed)
cd "/Users/John/Dropbox/RACE TEAM SOFTWARE V5/server"
npm install
npm start

# Health check
curl --silent --show-error http://localhost:9090/api/health
```

Open:
- Driver Packages: http://localhost:8081/packages.html
- Invoicing: http://localhost:8081/invoice.html
