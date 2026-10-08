// PeopleStrong punch in/out over HTTP, triggered by hitting a URL.
//
// Flow (worked out from the HAR captures):
//   1. Log in on the plain-HTML JSF page (altLogin.jsf) with Playwright.
//   2. Grab the session headers from the first API call the Flutter app makes.
//   3. POST /api/punch/v1/inout/web/punch-attendance directly - no clicking in Flutter.
//
// Setup:   npm i playwright && npx playwright install chromium
// Env:     PS_USERNAME, PS_PASSWORD   your login (keep in env / secret store, never in the URL)
//          TRIGGER_SECRET             random string; trigger URL is /punch?key=<TRIGGER_SECRET>
//          PS_SHIFT_ID                default 22359 (from your capture)
//          PORT                       default 8080
// Usage:   node punch.mjs status      log in and print attendance status only (read-only, safe first test)
//          node punch.mjs punch       log in and punch once
//          node punch.mjs serve       run the trigger server

import http from 'node:http';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { chromium } from 'playwright';

// Load api/.env next to this file, regardless of the directory node is started from.
dotenv.config({ path: fileURLToPath(new URL('.env', import.meta.url)), quiet: true });

const LOGIN_URL = 'https://veenaworld.peoplestrong.com/altLogin.jsf';
const API = 'https://onewebapi.peoplestrong.com/api/punch/v1/inout/web';
const SHIFT_ID = Number(process.env.PS_SHIFT_ID ?? 22359);

// Headers the HTTP client sets itself; everything else (session_token, device_id, platform...) is replayed.
const DROP_HEADERS = new Set(['host', 'content-length', 'connection', 'accept-encoding', 'cookie']);

async function run(doPunch) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

    await page.locator('[id="loginForm:username12"]').fill(process.env.PS_USERNAME);
    await page.locator('[id="loginForm:password"]').fill(process.env.PS_PASSWORD);

    // The home screen calls get-attendance-v2 right after login; its headers carry a live session.
    const [req] = await Promise.all([
      page.waitForRequest(r => r.url().includes('get-attendance-v2') && r.method() === 'POST', { timeout: 60_000 }),
      page.locator('[id="loginForm:loginButton"]').click(),
    ]);
    const headers = Object.fromEntries(
      Object.entries(await req.allHeaders()).filter(([k]) => !k.startsWith(':') && !DROP_HEADERS.has(k.toLowerCase())),
    );

    const status = await context.request.post(`${API}/get-attendance-v2`, { headers, data: '{}' });
    const result = { status_before: await body(status) };

    if (doPunch) {
      const payload = { shiftId: SHIFT_ID, shiftPremiseID: 0, holiday: false, roasterId: 0, roasterSource: '' };
      const resp = await context.request.post(`${API}/punch-attendance`, { headers, data: JSON.stringify(payload) });
      result.punch = { http: resp.status(), body: await body(resp) };
    }
    return result;
  } finally {
    await browser.close();
  }
}

async function body(resp) {
  const text = await resp.text();
  try { return JSON.parse(text); } catch { return text.slice(0, 2000); }
}

function serve() {
  let busy = false; // avoid double punches from repeated hits
  const port = Number(process.env.PORT ?? 8080);
  http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const send = (code, payload) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload, null, 2));
    };
    if (req.method !== 'GET' || !['/punch', '/status'].includes(url.pathname)
        || url.searchParams.get('key') !== process.env.TRIGGER_SECRET) return send(404, { error: 'not found' });
    if (busy) return send(409, { error: 'already running' });
    busy = true;
    try {
      send(200, await run(url.pathname === '/punch'));
    } catch (e) {
      send(500, { error: String(e) });
    } finally {
      busy = false;
    }
  }).listen(port, () => console.log(`listening on :${port}  ->  /status?key=...  /punch?key=...`));
}

const cmd = process.argv[2] ?? 'status';
if (cmd === 'serve') serve();
else console.log(JSON.stringify(await run(cmd === 'punch'), null, 2));
