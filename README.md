# Dawaa Pharmacy Automation — Production Deployment Kit

This kit adds a public website, a secure API proxy, and a **new, separate** n8n website-chat workflow around the two original Dawaa workflow exports.

## Preservation guarantee

The original exports are preserved byte-for-byte under `private/original-workflows/`:
- `dawaa-1.original.json`
- `dawaa-2.original.json`
- `preservation-audit.json` (SHA-256 hashes, node IDs/names, and connection edges)

`private/` and the n8n workflow JSON are ignored by Git. Import the new workflow from your local kit before publishing; do not commit it because it references your private spreadsheet ID. Do not publish the raw workflow exports publicly: they contain internal identifiers, phone/chat routing values, and the Google Sheets document reference. The original workflow files are not modified by this kit.

## Architecture

- `frontend/`: responsive GitHub Pages site.
- `backend/`: Node.js API proxy; browser requests never receive the n8n webhook URL or shared secret.
- `n8n/dawaa-website-chat.workflow.json`: a new read-only website-chat workflow. It reads the existing `catalog` sheet and asks Gemini to answer from that catalogue.
- `deploy/`: Docker Compose + Caddy for HTTPS, persistent n8n storage, and a private Docker network.

**Scope boundary:** website chat is catalogue Q&A only. It does not reserve products, deduct stock, approve/reject requests, or send WhatsApp messages. Those remain in the original WhatsApp/Telegram workflows. The new website workflow is intentionally separate; no original nodes or connections are imported into it.

## Before deployment

You need:
1. A GitHub account and permission to create/push a repository and enable GitHub Pages.
2. A Linux VPS or cloud VM with Docker Compose, a public IPv4 address, and two DNS records (`n8n.your-domain` and `api.your-domain`). A domain is optional if you use provider-issued HTTPS hostnames, but this Compose+Caddy example expects DNS names.
3. A Google Sheets OAuth credential with read access to the existing Dawaa spreadsheet.
4. A Google Gemini API credential in n8n.
5. The original WhatsApp/Telegram credentials in the original n8n instance if those workflows are to keep running there. Credentials are not embedded in workflow exports and cannot be migrated by JSON alone.

## Estimated hosting cost

The website frontend can be hosted on GitHub Pages at no additional hosting charge for a public repository on GitHub Free. The API and n8n need an always-on server. Railway Hobby has a **US$5/month minimum**, with usage charged by resource. As a sizing illustration, 1 GB RAM + 0.5 vCPU + 5 GB persistent storage is about **US$20.75/month** at the published rates, before any additional resource usage; this is a planning estimate, not a capacity guarantee. n8n Cloud Starter is listed at **€20/month billed annually** and includes 2,500 workflow executions/month. Domain registration and Gemini/WhatsApp usage may cost extra. No paid service is selected or activated by this kit. See provider pricing links below.

## 1. Configure the website-chat workflow

1. Import the local file `n8n/dawaa-website-chat.workflow.json` into the hosted n8n instance. This file is intentionally excluded from public Git commits.
2. Open **Dawaa Website Webhook** and create/select an **HTTP Header Auth** credential:
   - Header name: `x-dawaa-chat-key`
   - Header value: exactly the same value as `CHAT_SHARED_SECRET` in the API service environment.
3. Open **Read Dawaa Catalog** and select a Google Sheets OAuth credential that can read the existing Dawaa spreadsheet. Confirm its document and `catalog` tab are correct.
4. Open **Dawaa Gemini Chat Model** and select a Gemini credential.
5. Save, test with a real catalogue item, and activate the new workflow.
6. Copy its Production URL. It should end with `/webhook/dawaa-website-chat`. The API uses the internal Docker URL in this compose setup; do not paste the public webhook URL into frontend JavaScript.

Do not edit either original workflow to make this website flow work.

## 2. Deploy API + n8n

1. Point DNS A records for `N8N_DOMAIN` and `API_DOMAIN` to your server's public IP.
2. Copy `.env.example` to `.env` in the deployment directory and fill in:
   - `N8N_DOMAIN`, `API_DOMAIN`, `ACME_EMAIL`
   - `N8N_ENCRYPTION_KEY` (generate once; keep it safe; losing it can make stored credentials unreadable)
   - `CHAT_SHARED_SECRET` (a separate long random value)
   - `ALLOWED_ORIGINS` (the exact GitHub Pages origin, e.g. `https://username.github.io`)
3. Run from `deploy/`:
   ```bash
   docker compose --env-file ../.env up -d --build
   ```
4. Open `https://N8N_DOMAIN`, complete n8n owner setup, import the new workflow and configure its credentials.
5. The n8n volume `n8n_data` persists the database, credentials, and workflows. Configure server-level backups for this volume before production use.

For a serious production deployment, pin the n8n image to a tested version after the first successful test instead of tracking `latest`.

## 3. Publish frontend on GitHub Pages

1. Push this kit's tracked files to a repository's `main` branch. Keep `private/` excluded.
2. In repository **Settings → Secrets and variables → Actions → Variables**, add:
   - Name: `DAWAA_API_BASE_URL`
   - Value: `https://YOUR_API_DOMAIN`
3. In **Settings → Pages**, choose **GitHub Actions** as the build/deployment source.
4. Push to `main` or run the `Deploy Dawaa website to GitHub Pages` workflow manually.
5. The action fails closed if the API URL is missing or not HTTPS; this prevents publishing a site with a silently broken chat.

The public site URL will be shown in the successful GitHub Pages deployment environment. It cannot be known before the repository and Pages deployment exist.

## 4. API configuration

Required backend variables:
- `N8N_WEBHOOK_URL`: internal n8n production webhook URL.
- `CHAT_SHARED_SECRET`: same value as the n8n Header Auth credential.
- `ALLOWED_ORIGINS`: comma-separated exact website origins.
- `PORT`, `REQUEST_TIMEOUT_MS`, `CHAT_RATE_LIMIT_PER_MINUTE`, `TRUST_PROXY_HOPS`.

The API rejects unknown browser origins, limits message size and request rate, times out upstream requests, and never logs message contents or returns the upstream URL/secret to the browser.

## 5. Test plan

Local API syntax:
```bash
cd backend
npm install
node --check server.js
```

Health check:
```bash
curl https://YOUR_API_DOMAIN/api/health
```

Chat integration (use a non-sensitive test question):
```bash
curl -X POST https://YOUR_API_DOMAIN/api/chat \
  -H "Content-Type: application/json" \
  -H "Origin: https://YOUR_GITHUB_USERNAME.github.io" \
  -d '{"message":"Do you have paracetamol?","sessionId":"deployment-test"}'
```

Expected: HTTP 200 with `{"reply":"..."}` generated by the new n8n workflow from the live catalogue. A successful API health check alone does **not** prove the n8n workflow or model is working.

## Test status at handoff

- Original export parsing: passed.
- Original workflow preservation manifest generated: passed.
- New website workflow JSON syntax: passed.
- Frontend/backend files generated: passed.
- Live GitHub publication: not performed (repository and GitHub authorization not yet available).
- Live n8n webhook/Gemini/Google Sheets/WhatsApp tests: not performed (no hosted n8n endpoint or credentials available).
- WhatsApp approval, rejection, stock, expiration, restocking and low-stock behavior: not runtime-tested; original exports are preserved and untouched.

## Provider references

- GitHub plans: https://github.com/pricing
- Render pricing: https://render.com/pricing
- Railway pricing: https://railway.com/pricing
- n8n plans: https://n8n.io/pricing/

## Important operational note

The original exports show `active: true`, but this is only the exported workflow flag; it does not prove a live production instance is running. Also, exported n8n JSON does not contain the credential secrets. Reconnect credentials on the hosted instance and verify the original WhatsApp and Telegram triggers before switching traffic.
