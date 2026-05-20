-- Seed: Asanda Mcgwaba – 3 Killarney MINI academy sessions (Apr 2026)
-- Guard: skips if prospect already exists
INSERT INTO academy_prospects (
  driver_name, category, status, notes,
  sessions, attachments, activities, tasks
)
SELECT
  'Asanda Mcgwaba',
  'MINI',
  'post_review',
  'Venue: Killarney | Ref IDs: ROK1191 / ROK1192 / ROK1193 | Seat: M1 | Kart: MINI',
  '[
    {
      "id": "ses-rok1191",
      "date": "2026-03-31",
      "venue": "Killarney",
      "coach": null,
      "rating": null,
      "notes": "Week 1 of course. Seat: M1, Kart: MINI. Kid very nervous, had to get going in parking area but keen to join.",
      "cloud_link": null,
      "lap_data": null
    },
    {
      "id": "ses-rok1192",
      "date": "2026-04-07",
      "venue": "Killarney",
      "coach": null,
      "rating": null,
      "notes": "Week 2 of course. Seat: M1, Kart: MINI. Still start/stop and doing the short bambino circuit but getting better.",
      "cloud_link": null,
      "lap_data": null
    },
    {
      "id": "ses-rok1193",
      "date": "2026-04-14",
      "venue": "Killarney",
      "coach": null,
      "rating": null,
      "notes": "Week 3 of course. Seat: M1, Kart: MINI. Still stop/start but keen to join.",
      "cloud_link": null,
      "lap_data": null
    }
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM academy_prospects WHERE driver_name = 'Asanda Mcgwaba'
);
