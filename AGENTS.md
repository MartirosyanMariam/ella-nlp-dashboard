# AGENTS.md — Ella NLP Dashboard

## What this repo is

A static, client-side test-results dashboard served via GitHub Pages
(https://martirosyanmariam.github.io/ella-nlp-dashboard/). There is no backend —
every result file is parsed and rendered entirely in-browser. The whole app is a
single file: `index.html` (inline CSS + inline JS, no build step).

## Conventions

- **One file.** All markup, styles, and script live in `index.html`. Keep it that
  way unless there's a strong reason not to.
- Keep the `.out`/`.txt`/`.log` parsing logic shared and reusable — do not fork it
  per view. `parseRunResults(txt)` is the single pure parser used by the manual
  drop, the Detailed Results tab, and the Comparison tab.
- Run dates are parsed from filenames (`parseDateFromFilename`, e.g.
  `backend-remote-results-YYYY-MM-DD-*.out`). Reuse that function; don't rewrite
  the detection. If you change it, update the mirrored regex in
  `scripts/drive-watcher.gs` and `data/README.md`.
- New run files live under `data/`, tracked in `data/manifest.json`. The dashboard
  reads these as the primary path on load (`bootstrapFromManifest`). A manual file
  drop remains as a fallback/dev tool ("load a file manually" in the tab bar) — not
  the default experience.
- Snapshot export (`shareRun` / `shareCompare`) bakes data into a self-contained
  HTML via `window.__SNAPSHOT__` / `window.__COMPARE_SNAPSHOT__`. Those code paths
  must keep working and must take precedence over the manifest on load.
- Keep the site fully static — no server-side dependencies, no build-time secrets
  in the repo. The GitHub token the Apps Script uses lives in Apps Script Script
  Properties, never here.

## Layout

- `index.html` — the entire app.
- `data/manifest.json` + `data/*.out` — ingested runs (committed by the watcher).
- `scripts/drive-watcher.gs` — Google Apps Script that pushes new Drive files into
  `data/` and updates the manifest. Setup steps in `scripts/SETUP.md`; the GitHub
  token lives in Apps Script Script Properties, never in this repo.
- The dashboard also polls `data/manifest.json` every 3 min and shows a
  "New run available · Refresh" toast so an already-open tab isn't stuck on stale
  data (`startManifestPolling` in `index.html`).
- `Dockerfile` — local static-serve convenience only.

## Build & deploy

GitHub Pages serves this repo's default branch directly — there is no build step.
To preview locally: `python3 -m http.server` from the repo root, then open
`http://localhost:8000/` (a `file://` open works too, but `fetch('data/manifest.json')`
is blocked there, so the manifest flow only shows over http).
