/**
 * drive-watcher.gs — Ella NLP Dashboard auto-ingest
 * ================================================================
 * When a new test-results file lands in the Drive results folder, this script
 * commits it into the dashboard repo under data/, adds it to data/manifest.json,
 * and THEN emails the recipients — so by the time they open the link the data is
 * already live.
 *
 * Full setup steps: see scripts/SETUP.md in the repo.
 *
 * Script Properties required (Apps Script → Project Settings → Script Properties):
 *   GITHUB_TOKEN       fine-grained PAT, scoped to the dashboard repo,
 *                      Repository permissions → Contents: Read and write
 *   GITHUB_REPO        "MartirosyanMariam/ella-nlp-dashboard"
 *   GITHUB_BRANCH      branch GitHub Pages serves (usually "main")
 *   RESULTS_FOLDER_ID  Drive folder ID of the results folder (from its URL)
 *   NOTIFY_EMAILS      comma-separated recipients, e.g. "ziv@…,mariam@…"
 *   DASHBOARD_URL      "https://martirosyanmariam.github.io/ella-nlp-dashboard/"
 *
 * One-time: run initBaseline() once, then add a time-driven trigger on
 * onNewResultFile (every 15 min). Run checkConfig() anytime to sanity-check.
 *
 * TODO (PRD §5, unresolved): no retention policy — manifest.json and data/ grow
 * forever. Add pruning here once a policy is decided.
 */

var PROPS = PropertiesService.getScriptProperties();

function cfg(key) {
  var v = PROPS.getProperty(key);
  if (!v) throw new Error('Missing Script Property: ' + key);
  return v;
}

/* ─────────────────────────── one-time helpers ─────────────────────────── */

/**
 * Run ONCE before enabling the trigger. Marks every file currently in the folder
 * as "already seen" so the first real run only ingests genuinely new files.
 * (Skip this if you WANT the existing backlog ingested — run backfillAll instead.)
 */
function initBaseline() {
  PROPS.setProperty('LAST_SEEN_MS', String(Date.now()));
  Logger.log('Baseline set. New files created from now on will be ingested.');
}

/** Verify configuration + GitHub token + Drive folder without changing anything. */
function checkConfig() {
  ['GITHUB_TOKEN', 'GITHUB_REPO', 'GITHUB_BRANCH', 'RESULTS_FOLDER_ID', 'NOTIFY_EMAILS', 'DASHBOARD_URL']
    .forEach(function (k) { cfg(k); });

  var folder = DriveApp.getFolderById(cfg('RESULTS_FOLDER_ID'));
  Logger.log('Drive folder OK: "' + folder.getName() + '"');

  var res = UrlFetchApp.fetch(
    'https://api.github.com/repos/' + cfg('GITHUB_REPO'),
    { headers: ghHeaders(), muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    throw new Error('GitHub check failed (' + res.getResponseCode() + '): ' + res.getContentText());
  }
  Logger.log('GitHub repo + token OK.');
  Logger.log('Recipients: ' + cfg('NOTIFY_EMAILS'));
  Logger.log('All good. Add the time-driven trigger on onNewResultFile.');
}

/** Optional: ingest EVERY file already in the folder (one-off catch-up). */
function backfillAll() {
  PROPS.deleteProperty('LAST_SEEN_MS');
  onNewResultFile();
}

/* ─────────────────────────── main entry point ─────────────────────────── */

/** Call from a time-driven trigger (every ~15 min). */
function onNewResultFile() {
  var folder = DriveApp.getFolderById(cfg('RESULTS_FOLDER_ID'));
  var lastSeen = Number(PROPS.getProperty('LAST_SEEN_MS') || 0);
  var newestSeen = lastSeen;

  // Files created since we last ran, oldest first.
  var pending = [];
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    var created = f.getDateCreated().getTime();
    if (created > lastSeen) {
      pending.push(f);
      if (created > newestSeen) newestSeen = created;
    }
  }
  pending.sort(function (a, b) {
    return a.getDateCreated().getTime() - b.getDateCreated().getTime();
  });
  if (!pending.length) return;

  var ingested = [], failed = [];
  for (var i = 0; i < pending.length; i++) {
    try {
      ingested.push(ingestFile(pending[i]));
    } catch (err) {
      // Roll the watermark back before this file so a later run retries it.
      Logger.log('Ingest failed for ' + pending[i].getName() + ': ' + err);
      failed.push(pending[i].getName());
      newestSeen = Math.min(newestSeen, pending[i].getDateCreated().getTime() - 1);
    }
  }

  PROPS.setProperty('LAST_SEEN_MS', String(newestSeen));

  if (ingested.length) notifyRecipients(ingested);
  if (failed.length) {
    MailApp.sendEmail(cfg('NOTIFY_EMAILS'),
      'Ella NLP auto-ingest: ' + failed.length + ' file(s) failed',
      'These files could not be pushed and will be retried next run:\n\n' + failed.join('\n'));
  }
}

/* ─────────────────────────── ingest one file ─────────────────────────── */

function ingestFile(file) {
  var name = sanitizeName(file.getName());
  var path = 'data/' + name;
  var bytes = file.getBlob().getBytes();
  var date = parseDateFromFilename(name);

  putRepoFile(path, bytes, 'auto-ingest: add ' + name);
  addToManifest({ file: path, name: name, date: date, bytes: bytes.length });

  return { name: name, date: date };
}

/** GitHub Contents API: create or update a file (binary-safe via base64). */
function putRepoFile(path, bytes, message) {
  var api = 'https://api.github.com/repos/' + cfg('GITHUB_REPO') + '/contents/' + path;
  var branch = cfg('GITHUB_BRANCH');

  var sha = getRepoFileSha(api, branch);
  var payload = { message: message, branch: branch, content: Utilities.base64Encode(bytes) };
  if (sha) payload.sha = sha;

  var res = UrlFetchApp.fetch(api, {
    method: 'put', contentType: 'application/json', headers: ghHeaders(),
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 300) {
    throw new Error('PUT ' + path + ' → ' + res.getResponseCode() + ' ' + res.getContentText());
  }
}

function getRepoFileSha(api, branch) {
  var res = UrlFetchApp.fetch(api + '?ref=' + encodeURIComponent(branch), {
    method: 'get', headers: ghHeaders(), muteHttpExceptions: true
  });
  return res.getResponseCode() === 200 ? JSON.parse(res.getContentText()).sha : null;
}

/** Read manifest.json, append an entry (dedupe by file path), write it back. */
function addToManifest(entry) {
  var api = 'https://api.github.com/repos/' + cfg('GITHUB_REPO') + '/contents/data/manifest.json';
  var branch = cfg('GITHUB_BRANCH');

  var manifest = { generated: null, runs: [] };
  var sha = null;
  var res = UrlFetchApp.fetch(api + '?ref=' + encodeURIComponent(branch), {
    method: 'get', headers: ghHeaders(), muteHttpExceptions: true
  });
  if (res.getResponseCode() === 200) {
    var body = JSON.parse(res.getContentText());
    sha = body.sha;
    manifest = JSON.parse(Utilities.newBlob(Utilities.base64Decode(body.content)).getDataAsString());
    if (!Array.isArray(manifest.runs)) manifest.runs = [];
  }

  manifest.runs = manifest.runs.filter(function (r) { return r.file !== entry.file; });
  manifest.runs.push(entry);
  manifest.generated = new Date().toISOString();

  var payload = {
    message: 'auto-ingest: manifest += ' + entry.name,
    branch: branch,
    content: Utilities.base64Encode(Utilities.newBlob(JSON.stringify(manifest, null, 2)).getBytes())
  };
  if (sha) payload.sha = sha;

  var put = UrlFetchApp.fetch(api, {
    method: 'put', contentType: 'application/json', headers: ghHeaders(),
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  if (put.getResponseCode() >= 300) {
    throw new Error('manifest PUT → ' + put.getResponseCode() + ' ' + put.getContentText());
  }
}

function ghHeaders() {
  return {
    Authorization: 'Bearer ' + cfg('GITHUB_TOKEN'),
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

/* ─────────────────────────── helpers ─────────────────────────── */

/**
 * MUST stay in sync with parseDateFromFilename() in index.html.
 * Tries ISO (YYYY-MM-DD), then DD.MM.YYYY, then bare DD.MM (current year).
 * Returns "YYYY-MM-DD" or null.
 */
function parseDateFromFilename(filename) {
  if (!filename) return null;
  var m = filename.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return iso(y, mo, d);
  }
  m = filename.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) {
    var d2 = +m[1], mo2 = +m[2], y2 = +m[3];
    if (mo2 >= 1 && mo2 <= 12 && d2 >= 1 && d2 <= 31) return iso(y2, mo2, d2);
  }
  m = filename.match(/(?:^|[^\d])(\d{1,2})\.(\d{1,2})(?!\d)/);
  if (m) {
    var d3 = +m[1], mo3 = +m[2];
    if (mo3 >= 1 && mo3 <= 12 && d3 >= 1 && d3 <= 31) return iso(new Date().getFullYear(), mo3, d3);
  }
  return null;
}
function iso(y, mo, d) {
  return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

function sanitizeName(name) {
  return name.replace(/[^A-Za-z0-9._-]/g, '_');
}

function notifyRecipients(ingested) {
  var url = cfg('DASHBOARD_URL');
  var lines = ingested.map(function (r) {
    var link = r.date ? url + '?run=' + r.date : url;
    return '• ' + r.name + (r.date ? '  (' + r.date + ')' : '  (date not detected)') + '\n  ' + link;
  });
  var subject = ingested.length === 1
    ? 'Ella NLP: new test run available — ' + ingested[0].name
    : 'Ella NLP: ' + ingested.length + ' new test runs available';
  MailApp.sendEmail(cfg('NOTIFY_EMAILS'), subject,
    'The dashboard now has the following run(s) loaded and ready:\n\n' +
    lines.join('\n\n') +
    '\n\nOpen the dashboard — it shows the latest run automatically, or use the links above.\n' +
    '(GitHub Pages can take a minute to publish after the file is pushed.)');
}
