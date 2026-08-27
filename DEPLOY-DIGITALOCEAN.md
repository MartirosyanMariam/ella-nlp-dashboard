# Deploying the dashboard on DigitalOcean

The dashboard is a fully static site: `index.html` + the `data/` folder it reads
on load. Nothing to build, no server code. Three ways to host it on DO, easiest
first.

Whichever you pick, the app keeps auto-ingesting: the Drive-watcher Apps Script
commits new runs to `data/` on GitHub, and DO redeploys from that repo.

---

## Option A — App Platform static site (recommended)

Free, HTTPS included, auto-deploys on every push to `main`.

### Via the DO web console

1. **Apps → Create App → GitHub**, authorize DigitalOcean, pick
   `MartirosyanMariam/ella-nlp-dashboard`, branch `main`, **Autodeploy** on.
2. DO detects a Dockerfile — **ignore it**. Click **Edit** on the component and
   change **Resource Type** to **Static Site**.
   - Build command: *(leave empty)*
   - Output directory: `/`
   - Index document: `index.html`
3. **Next** through plan (Starter / $0) → **Create Resources**.
4. ~2 min later you get `https://ella-nlp-dashboard-xxxxx.ondigitalocean.app`.
5. Optional custom domain: **Settings → Domains → Add Domain**, then add the
   `CNAME` it shows you at your DNS provider.

### Via `doctl` (reproducible, uses `.do/app.yaml` in this repo)

```bash
brew install doctl
doctl auth init                      # paste an API token from DO → API
doctl apps create --spec .do/app.yaml
```
Later changes to the spec:
```bash
doctl apps list                      # note the App ID
doctl apps update <APP_ID> --spec .do/app.yaml
```

**Note:** `.do/app.yaml` points at `MartirosyanMariam/ella-nlp-dashboard`. DO
needs GitHub access to that repo — do the one-time GitHub authorization in the
console (step 1 above) before `doctl apps create`, or the create call fails.

---

## Option B — App Platform from the Dockerfile

Use this if you specifically want the nginx container (custom headers, etc.).
The repo's `Dockerfile` + `nginx.conf` copy `index.html` and `data/` into
`nginx:alpine` and set sane cache headers (`manifest.json` never cached, `.out`
files cached forever).

1. **Apps → Create App → GitHub → this repo → `main`**, autodeploy on.
2. Keep **Resource Type: Web Service**, Dockerfile detected automatically.
3. **HTTP Port: 80**.
4. Smallest instance ($5/mo — no free tier for web services).
5. Create. Same `*.ondigitalocean.app` URL + optional custom domain.

Test the image locally first:
```bash
docker build -t ella-dash .
docker run --rm -p 8080:80 ella-dash
# open http://localhost:8080
```

---

## Option C — Droplet + nginx (full control, most work)

1. Create a Droplet (Ubuntu, smallest $4–6/mo).
2. On the Droplet:
   ```bash
   apt update && apt install -y nginx git
   git clone https://github.com/MartirosyanMariam/ella-nlp-dashboard /var/www/ella-dash
   cp /var/www/ella-dash/nginx.conf /etc/nginx/sites-available/ella-dash
   # edit: change `root` to /var/www/ella-dash and set server_name to your domain
   ln -s /etc/nginx/sites-available/ella-dash /etc/nginx/sites-enabled/
   rm /etc/nginx/sites-enabled/default
   nginx -t && systemctl reload nginx
   ```
3. HTTPS: `apt install -y certbot python3-certbot-nginx && certbot --nginx`.
4. Auto-update on new runs — a cron job pulling the repo:
   ```bash
   echo '*/5 * * * * cd /var/www/ella-dash && git pull -q' | crontab -
   ```
   (App Platform does this for you; on a Droplet you wire it yourself.)

---

## After deploying

- Point the Apps Script `DASHBOARD_URL` property (see `scripts/SETUP.md`) at the
  new URL so the emails to Ziv/Mariam link to the right place.
- GitHub Pages can stay on as a mirror or be turned off in the repo settings —
  they serve the same content from the same branch.
- `?run=<date>` and `?tab=comparison` deep links work identically on any host.
