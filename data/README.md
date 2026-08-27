# `data/` — ingested test runs

Every `.out` test-results file that has landed in the Drive results folder is
committed here by the Drive-watcher Apps Script (`scripts/drive-watcher.gs`),
alongside an entry in [`manifest.json`](manifest.json).

The dashboard (`../index.html`) fetches `manifest.json` on load and uses it to
populate the date-based run picker. It never needs a manual upload when this
folder is populated.

## `manifest.json` shape

```json
{
  "generated": "<ISO 8601 timestamp of the last update>",
  "runs": [
    {
      "file": "data/backend-remote-results-2026-08-25-data-001.out",
      "name": "backend-remote-results-2026-08-25-data-001.out",
      "date": "2026-08-25",
      "bytes": 2039131
    }
  ]
}
```

- `date` is parsed from the filename using the same logic as
  `parseDateFromFilename()` in `index.html` — keep the two in sync.
- Order does not matter; the dashboard sorts by `date` (newest first).
- A run whose file fails to fetch or parse is skipped by the dashboard and shown
  as a "N runs failed to load" notice — it does not block other runs.

## Retention

Unresolved (see PRD §5). Today the script appends indefinitely. If/when a
retention policy is decided, prune old files here and drop their `runs` entries.
