# Auto-ingest setup

Goal: a new `.out` file dropped in the Drive results folder → committed to this
repo under `data/` + added to `data/manifest.json` → the dashboard shows it → an
email goes to Ziv and Mariam.

There are two moving parts:

1. **`scripts/drive-watcher.gs`** — a Google Apps Script that watches Drive and
   pushes files into the repo via the GitHub API.
2. **The dashboard** (`index.html`) — already reads `data/manifest.json` on load,
   and polls it every 3 min so an open tab shows a "New run available · Refresh"
   toast.

Only step 1 needs setting up.

---

## 1. Create a GitHub token (Mariam)

1. GitHub → **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**.
2. **Resource owner:** the account/org that owns `ella-nlp-dashboard`.
3. **Repository access:** Only select repositories → `ella-nlp-dashboard`.
4. **Permissions → Repository permissions → Contents:** Read and write.
5. Expiration: 90 days or "no expiration" (set a calendar reminder to rotate).
6. Generate, copy the `github_pat_…` string. You'll paste it in step 3.

The token lives only in Apps Script Script Properties — never in this repo.

## 2. Get the Drive folder ID

Open the results folder in Drive. The URL looks like
`https://drive.google.com/drive/folders/1AbC…XyZ` — the `1AbC…XyZ` part is the
folder ID.

## 3. Create the Apps Script project

1. Go to <https://script.google.com> → **New project**. Name it
   "Ella NLP dashboard ingest".
2. Delete the default `Code.gs` contents and paste the full contents of
   `scripts/drive-watcher.gs` from this repo.
3. **Project Settings (gear icon) → Script Properties → Add script property**,
   add these six:

   | Property | Value |
   |---|---|
   | `GITHUB_TOKEN` | the `github_pat_…` from step 1 |
   | `GITHUB_REPO` | `MartirosyanMariam/ella-nlp-dashboard` |
   | `GITHUB_BRANCH` | `main` (whatever branch GitHub Pages serves) |
   | `RESULTS_FOLDER_ID` | the folder ID from step 2 |
   | `NOTIFY_EMAILS` | `ziv@example.com,mariam@example.com` (comma-separated, no spaces) |
   | `DASHBOARD_URL` | `https://martirosyanmariam.github.io/ella-nlp-dashboard/` |

## 4. Authorize + sanity-check

1. In the editor, pick the function **`checkConfig`** from the dropdown → **Run**.
2. Google will prompt for authorization (Drive read, external requests, send
   email). Approve — it's your own script.
3. Open **Execution log** (`View → Logs`). You want:
   ```
   Drive folder OK: "…"
   GitHub repo + token OK.
   Recipients: ziv@…,mariam@…
   All good. Add the time-driven trigger on onNewResultFile.
   ```
   If it errors, the message names the bad property.

## 5. Set the baseline

Pick **`initBaseline`** → **Run** once. This marks everything currently in the
folder as "already seen", so the automation only ingests files added *from now
on*.

*(If you instead want every existing file ingested right now, run `backfillAll`
once — it can be slow and will send one summary email.)*

## 6. Add the trigger

1. Left sidebar → **Triggers** (clock icon) → **Add Trigger**.
2. Function: `onNewResultFile`
   Event source: **Time-driven**
   Type: **Minutes timer** → **Every 15 minutes**.
3. Save.

Done. Drop a test file in the Drive folder, wait for the next run (or run
`onNewResultFile` manually), and check:

- a commit `auto-ingest: add <file>` appears on the repo
- `data/manifest.json` has the new entry
- Ziv and Mariam get the email (~1 min later the Pages site is live)
- an open dashboard tab shows the "New run available" toast within 3 min;
  a fresh load shows the run selected by default

---

## Operating notes

- **Email but no data / stale link:** GitHub Pages build lag. The email says so;
  wait ~1–2 min.
- **Filename dates:** the date in the picker comes from the filename
  (`…-YYYY-MM-DD-…`). Files without a parseable date still ingest but sort last
  and show as "undated". Keep the run export naming consistent.
- **A file failed:** you get a "N file(s) failed" email; the script retries it on
  the next tick. Check the Apps Script execution log for the GitHub API response.
- **Rotating the token:** update `GITHUB_TOKEN` in Script Properties; nothing else
  changes.
- **Retention:** not implemented — `data/` and `manifest.json` grow forever.
  When you decide a policy, prune old files + their manifest entries (a
  `pruneOlderThan(days)` function is the natural place to add it).
- **Watcher already emails Ziv today:** if the existing "new data" script stays
  on, you'll get two emails per run until you turn the old one off. Disable the
  old trigger once this one is verified.
