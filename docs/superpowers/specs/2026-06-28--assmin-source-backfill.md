# Assmin Source Warning Cleanup

## Context

The assmin report shows 3 critical and 6 warning statuses. Admin details point to:

- Critical: `daklak_sct`, `customs`, `customs-crawl`.
- Warning: `kinhtenongthon`, `bhx`, export registry entries, and related scheduler rows.

Supabase audit from June 1, 2026 shows:

- `daklak_sct` observations are present through June 23, then raw crawl logs fail from June 24 onward.
- `customs` observations exist for the latest discovered report period (`2026-t5-k2`) on June 4 and June 12; later runs fail because the JS PDF parser sees the table but the row detector skips it.
- `bhx` observations and export registry runs last synced on June 12.
- `kinhtenongthon` had repeated 403 failures after June 12, but a manual run on June 28 succeeded and inserted 17 articles.

## Design

- Patch Dak Lak SCT durian parsing to detect current labels such as `Sầu Thái` and `Ri6`, while keeping old `Sầu riêng` tables working.
- When current Dak Lak tables contain explicit region labels, only ingest rows tagged as Dak Lak to avoid mislabeling other regional prices.
- Patch customs PDF parsing so lines beginning with formatted numeric columns from `pdf-parse` are considered candidate rows, instead of requiring digits followed immediately by whitespace.
- Add regression tests for both live failure shapes.

## Backfill

- Run safe current-data sync jobs after parser fixes:
  - `crawler:bhx`
  - `crawler:export-registry`
  - `crawler:customs`
  - direct `crawlDaklakSctDurian` sync if no standalone script exists.
- Re-run the assmin report and confirm no warning/critical statuses remain for these sources.

## Limits

Historical daily prices cannot be reconstructed for live retail/news pages if the upstream source no longer exposes historical pages. For those sources, backfill means refreshing the latest available source data and recording the exact missing window.
