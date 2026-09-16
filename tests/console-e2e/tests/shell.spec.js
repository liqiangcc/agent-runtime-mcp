// Issue #134 — frozen prototype shell on the production Console.
// Landmark parity, first-screen session discoverability, relocated-action
// reachability, compact recovery, stale-build self-heal, no h-scroll.
// Real pipeline: real tmux pane → real observer/SSE → real browser.
import { test, expect } from '@playwright/test';
import { execFile, spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const consoleEntry = join(repoRoot, 'console', 'dist', 'src', 'server.js');
const mcpEntry = join(repoRoot, 'dist', 'src', 'server.js');

const socketName = `sh-e2e-${process.pid}-${Date.now()}`;
const allowedSession = `sh-ok-${process.pid}`;
const port = 43_000 + (process.pid % 5_000);
const baseURL = `http://127.0.0.1:${port}`;

let consoleChild = null;

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

test.beforeAll(async () => {
  await tmux('new-session', '-d', '-s', allowedSession, '-x', '120', '-y', '40');
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
      TMUX_SOCKET_NAME: socketName,
      TMUX_ALLOWED_SESSIONS: allowedSession,
    },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  await waitFor(async () => {
    try { return (await fetch(`${baseURL}/api/health`)).ok; } catch { return false; }
  });
});

test.afterAll(async () => {
  consoleChild?.kill('SIGTERM');
  try { await tmux('kill-server'); } catch { /* gone */ }
});

test('SC1+SC2: minimal shell landmarks; fresh load auto-exposes sessions', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 912 });
  await page.goto(`${baseURL}/?display=standalone`, { waitUntil: 'domcontentloaded' });

  // SC1: minimal topbar = menu button + session name + status light + ⋯
  await expect(page.locator('#drawer-btn')).toBeVisible();
  await expect(page.locator('#chat-title')).toBeVisible();
  await expect(page.locator('#health')).toHaveText(/backend (healthy|unavailable|unreachable)/);
  await expect(page.locator('#overflow-btn')).toBeVisible();
  // dense old chrome is gone
  for (const gone of ['#sidebar', '#sidebar-toggle', '.chat-toolbar', 'h1', '.layout']) {
    expect(await page.locator(gone).count()).toBe(0);
  }
  // shell landmarks exist
  await expect(page.locator('#drawer')).toHaveCount(1);
  await expect(page.locator('#drawer-scrim')).toHaveCount(1);
  await expect(page.locator('#recovery')).toHaveCount(1);
  await expect(page.locator('#composer-plus')).toHaveCount(1);
  // build marker is stamped onto the document and shown in the menu
  await expect(page.locator('body')).toHaveAttribute('data-build', /[0-9a-f]/);

  // SC2: no hunting — the drawer is already open with real channels listed
  await expect(page.locator('body')).toHaveClass(/drawer-open/);
  await expect(page.locator('li.channel').first()).toBeVisible();
  await expect(page.locator('li.channel').first()).toContainText(allowedSession);

  // selecting a session closes the drawer and shows the reading surface
  await page.locator('li.channel').first().click();
  await expect(page.locator('body')).not.toHaveClass(/drawer-open/);
  await expect(page.locator('#chat-pane')).toBeVisible();
  await expect(page.locator('#chat-title')).toContainText(allowedSession);
  await expect(page.locator('#chat-state')).toHaveText(/live|polling/, { timeout: 20_000 });

  // single-row composer: +, textarea, send on one row; advanced collapsed
  await expect(page.locator('.composer-row')).toBeVisible();
  await expect(page.locator('#composer-text')).toBeVisible();
  await expect(page.locator('#send')).toBeVisible();
  await expect(page.locator('#advanced')).toBeHidden();

  // ☰ re-opens; scrim closes
  await page.locator('#drawer-btn').click();
  await expect(page.locator('body')).toHaveClass(/drawer-open/);
  await expect(page.locator('li.channel.selected')).toHaveCount(1);
  await page.locator('#drawer-scrim').click({ position: { x: 410, y: 400 } });
  await expect(page.locator('body')).not.toHaveClass(/drawer-open/);
});

test('SC3: every existing action is reachable in + popover or overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await page.locator('li.channel').first().click();
  await expect(page.locator('#chat-state')).toHaveText(/live|polling/, { timeout: 20_000 });

  // "+" popover: send-without-Enter, Stop/Enter/Escape, byte hint, target/clear
  await page.locator('#composer-plus').click();
  await expect(page.locator('#advanced')).toBeVisible();
  await expect(page.locator('#no-submit')).toBeVisible();
  await expect(page.locator('#control-stop')).toBeVisible();
  await expect(page.locator('#control-enter')).toBeVisible();
  await expect(page.locator('#control-escape')).toBeVisible();
  await expect(page.locator('#composer-target')).toBeVisible();
  await expect(page.locator('#composer-close')).toBeVisible();
  await expect(page.locator('#size-hint')).toBeAttached();
  await page.locator('#composer-plus').click();
  await expect(page.locator('#advanced')).toBeHidden();

  // overflow: search, bookmarks, raw, copy, adapter, terminal, refresh group, debug
  await page.locator('#overflow-btn').click();
  await expect(page.locator('#overflow-menu')).toBeVisible();
  for (const id of ['#search', '#bookmarks-btn', '#raw-toggle', '#copy-all', '#adapter-sel', '#terminal-link', '#auto', '#interval', '#refresh', '#build-id']) {
    await expect(page.locator(id)).toBeVisible();
  }
  await expect(page.locator('#overflow-menu button[data-act="hud"]')).toBeVisible();
  await expect(page.locator('#overflow-menu button[data-act="diag-copy"]')).toBeVisible();
  // clicking a menu action closes the menu
  await page.locator('#copy-all').click();
  await expect(page.locator('#overflow-menu')).toBeHidden();
});

test('SC4: needs_reobserve shows a compact strip; Re-observe resumes', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 912 });
  // hold the event stream at needs_reobserve so the strip is observable
  await page.route('**/api/channels/*/events', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'event: snapshot\ndata: {"entries":[],"state":"needs_reobserve","detail":"CURSOR_EXPIRED e2e","dropped_entries":0,"dropped_lines":0}\n\n',
    });
  });
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await page.locator('li.channel').first().click();

  await expect(page.locator('#recovery')).toBeVisible({ timeout: 10_000 });
  // EventSource retries between fulfilled snapshots also surface as 'error' —
  // either way the strip must show a degraded state with the single action
  await expect(page.locator('#recovery .rec-title')).toContainText(/interrupted|error/, { timeout: 15_000 });
  await expect(page.locator('#reobserve-btn')).toBeVisible();
  // compact: the strip is a single short row
  const box = await page.locator('#recovery').boundingBox();
  expect(box.height).toBeLessThanOrEqual(60);
  // detail stays behind the ⓘ disclosure
  await page.locator('#rec-more').click();
  await expect(page.locator('#rec-detail')).toBeVisible();

  await page.unroute('**/api/channels/*/events');
  await page.locator('#reobserve-btn').click();
  await expect(page.locator('#chat-state')).toHaveText(/live|polling/, { timeout: 20_000 });
  await expect(page.locator('#recovery')).toBeHidden({ timeout: 20_000 });
});

test('SC5: served build-stamp mismatch triggers reload (stale self-heal)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  const liveBuild = await page.evaluate(() => document.body.dataset.build);
  expect(liveBuild).toBeTruthy();

  // a resumed stale page still imports the old BUILD_ID but the server now
  // serves a different stamp — the self-heal check must reload the document
  await page.route('**/modules/build-stamp.js', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body: 'export const BUILD_ID = "e2e-stale-deadbeef";\n',
    });
  });
  await page.evaluate(() => { window.__probe = 'alive'; });
  const navigated = page.waitForEvent('framenavigated');
  // the check triggers location.reload() — the evaluate context may be
  // destroyed as navigation starts, which is success not failure
  await page.evaluate(() => window.__checkBuildStamp()).catch(() => undefined);
  await navigated;
  await page.waitForLoadState('domcontentloaded');
  await expect.poll(async () => page.evaluate(() => window.__probe)).toBeUndefined();
  await expect(page.locator('body')).toHaveAttribute('data-build', 'e2e-stale-deadbeef');
  // restore the real stamp and return to the genuine build
  await page.unroute('**/modules/build-stamp.js');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toHaveAttribute('data-build', liveBuild);
});

test('SC6: no page-level horizontal scroll at 375/390/420', async ({ page }) => {
  for (const w of [375, 390, 420]) {
    await page.setViewportSize({ width: w, height: 912 });
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    await page.locator('li.channel').first().click();
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }));
    expect(m.sw).toBeLessThanOrEqual(m.cw);
  }
});
