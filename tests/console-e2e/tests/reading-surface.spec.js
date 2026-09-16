// Issue #128 — reading surface on REAL Channel data.
// A committed devin-tui fixture is printed into a real tmux pane; the
// Console's real observer/ring/SSE pipeline delivers it; the browser renders
// through the compiled projectConversation + devinAdapter. No mock DOM data.
import { test, expect } from '@playwright/test';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const consoleEntry = join(repoRoot, 'console', 'dist', 'src', 'server.js');
const mcpEntry = join(repoRoot, 'dist', 'src', 'server.js');
const artifactDir = join(here, '..', 'test-results');
const fixtureDir = join(repoRoot, 'tests', 'fixtures', 'devin-tui');

const socketName = `rs-e2e-${process.pid}-${Date.now()}`;
const allowedSession = `rs-ok-${process.pid}`;
const port = 41_000 + (process.pid % 5_000);
const baseURL = `http://127.0.0.1:${port}`;

let consoleChild = null;
let consoleStderr = '';

async function tmux(...args) {
  const result = await execFileAsync('tmux', ['-L', socketName, ...args], { encoding: 'utf8', timeout: 10_000 });
  return result.stdout;
}
async function waitFor(predicate, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('timed out');
}
function lastFixtureText(name) {
  const lines = readFileSync(join(fixtureDir, name), 'utf8').split('\n').filter(Boolean);
  const samples = lines.map((l) => JSON.parse(l)).filter((r) => r.text);
  return samples[samples.length - 1].text;
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('BCONSOLE:', m.text()); });
});

test.beforeAll(async () => {
  await tmux('new-session', '-d', '-s', allowedSession, '-x', '200', '-y', '50');
  await tmux('send-keys', '-t', allowedSession, '-l', 'exec bash --noprofile --norc');
  await tmux('send-keys', '-t', allowedSession, 'Enter');
  await waitFor(async () => (await tmux('list-panes', '-t', allowedSession, '-F', '#{pane_current_command}')).trim() === 'bash');

  consoleChild = spawn(process.execPath, [consoleEntry], {
    env: {
      ...process.env,
      CONSOLE_BIND: '127.0.0.1',
      CONSOLE_PORT: String(port),
      CONSOLE_MCP_ENTRY: mcpEntry,
      CONSOLE_OBSERVE_IDLE_MS: '400',
      CONSOLE_OBSERVE_TIMEOUT_MS: '2500',
      CONSOLE_OBSERVE_POLL_MS: '500',
      CONSOLE_OBSERVE_BUSY_TIMEOUT_MS: '200',
      CONSOLE_TAIL_LINES: '400',
      CONSOLE_TAIL_BYTES: '262144',
      TMUX_SOCKET_NAME: socketName,
      TMUX_ALLOWED_SESSIONS: allowedSession,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  consoleChild.stderr?.on('data', (c) => (consoleStderr += c));
  await waitFor(async () => {
    try { return (await fetch(`${baseURL}/api/health`)).ok; } catch { return false; }
  });
});

test.afterAll(async () => {
  consoleChild?.kill('SIGTERM');
  try { await tmux('kill-server'); } catch { /* gone */ }
});

async function shot(page, name) {
  mkdirSync(artifactDir, { recursive: true });
  const file = join(artifactDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  const sha = createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 16);
  return `${name}.png sha256:${sha}`;
}

async function selectChannel(page, query = '/') {
  await page.goto(`${baseURL}${query}`, { waitUntil: 'domcontentloaded' });
  // narrow layout: sessions live in a drawer — open it first
  await page.locator('#sidebar-toggle').click();
  await page.locator('.channel').first().click();
  await expect(page.locator('#chat-state')).toContainText(/live|polling/, { timeout: 15_000 });
}

test('reading surface: devin fixture replays into accepted structure (C1–C5)', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 912 });
  // standalone-sim: the SC3 screenshot is the phone form factor
  await selectChannel(page, '/?display=standalone');

  // choose the devin adapter explicitly — user choice, never inferred
  await page.locator('#adapter-sel').selectOption('devin');

  // a user turn opens the turn; then the real recorded pane tail streams in
  await page.locator('#composer-text').fill('true');
  await page.locator('#send').click();
  await expect(page.locator('.entry.user')).toBeVisible({ timeout: 10_000 });
  // the write must reach the pane before we inject the replay command —
  // 'delivered' means the transport completed
  await expect(page.locator('.entry.user .turn-status')).toContainText('delivered', { timeout: 10_000 });
  await waitFor(async () => (await tmux('capture-pane', '-t', allowedSession, '-p')).includes('true'));

  const text = lastFixtureText('devin-interrupted.jsonl');
  const script = join(artifactDir, `replay-${process.pid}.py`);
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(script, `import sys,time\nfor l in ${JSON.stringify(text)}.split('\\n'):\n print(l); sys.stdout.flush(); time.sleep(0.02)\n`);
  await tmux('send-keys', '-t', allowedSession, '-l', `python3 ${script}`);
  await tmux('send-keys', '-t', allowedSession, 'Enter');

  // running structure: activity rows render in place before settle
  await expect(page.locator('.tool-card, .seg-chrome, .seg-text').first()).toBeVisible({ timeout: 30_000 });

  // settled: real fixture ends with '❭ Ask Devin' → idle hint → collapse
  await expect(page.locator('.trace-sum')).toBeVisible({ timeout: 30_000 });

  // C1: top-level tool cards collapse away; answer text is dominant
  const topCards = await page.locator('.turn-body > .tool-card').count();
  expect(topCards).toBe(0);
  const steps = await page.locator('.trace-sum .trace-steps .tool-card').count();
  expect(steps).toBeGreaterThan(0);
  await expect(page.locator('.seg-text').last()).toBeVisible();
  // interrupt evidence preserved verbatim in the reading surface
  await expect(page.locator('.turn').last()).toContainText('Canceled');

  // C2: expand → tool rows reappear; answer node identity + scroll preserved
  const answerHandle = await page.locator('.seg-text').last().elementHandle();
  const scrollBefore = await page.locator('#messages').evaluate((el) => el.scrollTop);
  await page.locator('.trace-sum > summary').click();
  expect(await page.locator('.trace-sum[open] .tool-card').count()).toBe(steps);
  const answerAfter = await page.locator('.seg-text').last().elementHandle();
  expect(await page.evaluate(([a, b]) => a === b, [answerHandle, answerAfter])).toBe(true);
  const scrollAfter = await page.locator('#messages').evaluate((el) => el.scrollTop);
  expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThanOrEqual(4);

  // C5: deltas really streamed incrementally (updated mutations observed)
  const diag = await page.evaluate(() => window.__consoleDiag);
  expect(diag.deltas).toBeGreaterThan(1);
  expect(diag.updated).toBeGreaterThan(0);

  // C4: raw view byte-identical to /history?format=raw
  const channelId = await page.locator('.channel').first().getAttribute('data-channel-id');
  const apiRaw = await (await fetch(`${baseURL}/api/channels/${encodeURIComponent(channelId)}/history?format=raw`)).text();
  await page.locator('#raw-toggle').click();
  // raw view populates via an async fetch — wait for it before comparing
  await expect(page.locator('#raw-view')).toContainText('Canceled', { timeout: 10_000 });
  const domRaw = await page.locator('#raw-view').textContent();
  expect(domRaw).toBe(apiRaw);
  await page.locator('#raw-toggle').click();

  console.log('shot:', await shot(page, 'rs-128-devin-turn-420'));
});

test('reading surface: truncated fixture shows honest label (idle)', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 912 });
  await selectChannel(page);
  await page.locator('#adapter-sel').selectOption('devin');
  await page.locator('#composer-text').fill('true');
  await page.locator('#send').click();
  await expect(page.locator('.entry.user')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.entry.user .turn-status').last()).toContainText('delivered', { timeout: 10_000 });
  await waitFor(async () => {
    const pane = await tmux('capture-pane', '-t', allowedSession, '-p');
    return /\$ true\n/.test(pane) || /\$ true\s*$/.test(pane);
  });

  const text = lastFixtureText('devin-idle-truncated.jsonl');
  const script = join(artifactDir, `replay2-${process.pid}.py`);
  writeFileSync(script, `import sys,time\nfor l in ${JSON.stringify(text)}.split('\\n'):\n print(l); sys.stdout.flush(); time.sleep(0.02)\n`);
  await tmux('send-keys', '-t', allowedSession, '-l', `python3 ${script}`);
  await tmux('send-keys', '-t', allowedSession, 'Enter');

  await expect(page.locator('.seg-trunc').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.seg-trunc').first()).toContainText('lines folded by the TUI');
});

test('reading surface: generic adapter verbatim + adapter persists (C4,C7)', async ({ page }) => {
  // 420×912 standalone-sim — the SC3 generic-turn screenshot form factor
  await page.setViewportSize({ width: 420, height: 912 });
  await selectChannel(page, '/?display=standalone');
  // default is generic; set devin, reload, verify persistence
  await page.locator('#adapter-sel').selectOption('devin');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#sidebar-toggle').click();
  await page.locator('.channel').first().click();
  await expect(page.locator('#adapter-sel')).toHaveValue('devin', { timeout: 10_000 });
  // switch back to generic: verbatim surface, no markdown transform
  await page.locator('#adapter-sel').selectOption('generic');
  await expect(page.locator('#adapter-sel')).toHaveValue('generic');
  // .turn.earlier also carries seg-raw inside a closed <details> — scope to
  // a real turn body so the assertion is about the generic verbatim surface
  const segRaw = page.locator('.turn-body .seg-raw').first();
  await expect(segRaw).toBeVisible({ timeout: 15_000 });
  expect(await page.locator('.turn-body .seg-raw .md').count()).toBe(0);
  console.log('shot:', await shot(page, 'rs-128-generic-390'));
});

test('reading surface: no h-scroll at 375/390/420 + standalone floor (C6)', async ({ page }) => {
  for (const w of [375, 390, 420]) {
    await page.setViewportSize({ width: w, height: 912 });
    await page.goto(`${baseURL}/?display=standalone`, { waitUntil: 'domcontentloaded' });
    await page.locator('#sidebar-toggle').click();
    await page.locator('.channel').first().click();
    await page.waitForTimeout(400);
    const metrics = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
      appVh: document.documentElement.style.getPropertyValue('--app-vh'),
      standalone: document.body.classList.contains('standalone-sim'),
      ih: window.innerHeight,
      screenH: window.screen.height,
    }));
    expect(metrics.sw).toBeLessThanOrEqual(metrics.cw);
    expect(metrics.standalone).toBe(true);
    // standalone shell floor: --app-vh commits at least the layout viewport,
    // and adopts the screen extent when it is the plausible larger truth
    const vh = Number(metrics.appVh.replace('px', ''));
    expect(vh).toBeGreaterThanOrEqual(metrics.ih);
    if (metrics.screenH > metrics.ih && metrics.screenH - metrics.ih <= 160) {
      expect(vh).toBeGreaterThanOrEqual(metrics.screenH);
    }
  }
});
