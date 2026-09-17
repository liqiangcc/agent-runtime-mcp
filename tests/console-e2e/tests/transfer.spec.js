import { test, expect } from '@playwright/test';
import { execFile, spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

// Issue #84: explicit context transfer — source selection → explicit target →
// preview → explicit confirm → exactly one ordinary write_text on the target.
// The harness prepares two allowed sessions on a private tmux socket; the
// Console only observes/writes through the public MCP path.

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const consoleEntry = join(repoRoot, 'console', 'dist', 'src', 'server.js');
const mcpEntry = join(repoRoot, 'dist', 'src', 'server.js');
const artifactDir = join(here, '..', 'test-results');

const socketName = `console-e2e-tf-${process.pid}-${Date.now()}`;
const srcSession = `e2e-tf-src-${process.pid}`;
const dstSession = `e2e-tf-dst-${process.pid}`;
const port = 44_000 + (process.pid % 5_000);
const baseURL = `http://127.0.0.1:${port}`;

let consoleChild = null;
let consoleStderr = '';
let srcId = '';
let dstId = '';

async function tmux(...args) {
  const result = await execFileAsync('tmux', ['-L', socketName, ...args], { encoding: 'utf8', timeout: 5_000 });
  return result.stdout;
}

async function waitFor(predicate, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out after ${timeoutMs}ms`);
}

async function tryTmux(...args) {
  try {
    return await tmux(...args);
  } catch {
    return null;
  }
}

async function paneHas(session, needle) {
  const out = await tryTmux('capture-pane', '-t', session, '-p');
  return out !== null && out.includes(needle);
}

// scrollback variant — pasted multi-line payloads scroll the visible pane
async function scrollbackHas(session, needle) {
  const out = await tryTmux('capture-pane', '-t', session, '-p', '-S', '-');
  return out !== null && out.includes(needle);
}

async function capturePane(session) {
  return tmux('capture-pane', '-t', session, '-p');
}

// full scrollback capture — pasted multi-line payloads scroll the visible pane
async function captureAll(session) {
  return tmux('capture-pane', '-t', session, '-p', '-S', '-');
}

async function sendKeys(session, ...args) {
  await tmux('send-keys', '-t', session, ...args);
}

async function killIfExists(session) {
  try {
    await tmux('kill-session', '-t', session);
  } catch {
    /* absent */
  }
}

async function newBashSession(session) {
  // width 200 lets a single wrapped line exceed the 256 KiB transfer bound
  // within the read tail limits (lines 2000 × 200 cols ≥ 262144 bytes).
  await tmux('new-session', '-d', '-s', session, '-x', '200', '-y', '30');
  await sendKeys(session, '-l', 'exec bash --noprofile --norc');
  await sendKeys(session, 'Enter');
  await waitFor(
    async () => (await tmux('list-panes', '-t', session, '-F', '#{pane_current_command}')).trim() === 'bash',
  );
}

async function channelIdFor(sessionName) {
  const res = await fetch(`${baseURL}/api/channels`);
  const body = await res.json();
  const match = (body.channels ?? []).find(
    (c) => c.backend_metadata?.tmux?.session_name === sessionName,
  );
  if (!match) throw new Error(`channel not visible for session ${sessionName}`);
  return match.channel_id;
}

async function selectChannelById(page, channelId) {
  const item = page.locator('li.channel', { has: page.locator('.channel-id', { hasText: channelId }) });
  await expect(item).toHaveCount(1);
  // #134 shell: the drawer auto-opens on a fresh no-selection load; after a
  // selection it closes and ☰ re-opens it
  if (!(await page.evaluate(() => document.body.classList.contains('drawer-open')))) {
    await page.locator('#drawer-btn').click();
  }
  await item.click();
  await expect(page.locator('#chat-pane')).toBeVisible();
}

// Wait until the observer loop has fully exited before attaching again —
// keeps each test's attach independent of in-flight waits (Issue #87 tracks
// the underlying stale-loop re-attach race separately).
async function waitForIdle(channelId) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const h = await fetch(`${baseURL}/api/channels/${encodeURIComponent(channelId)}/history`).then((r) =>
        r.json(),
      );
      if (h.state === 'idle') return;
    } catch {
      /* keep polling */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`observer for ${channelId} did not return to idle`);
}

test.beforeAll(async () => {
  await newBashSession(srcSession);
  await newBashSession(dstSession);
  await tmux('set-option', '-t', srcSession, 'history-limit', '10000');

  consoleChild = spawn(process.execPath, [consoleEntry], {
    env: {
      ...process.env,
      CONSOLE_BIND: '127.0.0.1',
      CONSOLE_PORT: String(port),
      CONSOLE_MCP_ENTRY: mcpEntry,
      CONSOLE_OBSERVE_IDLE_MS: '400',
      CONSOLE_OBSERVE_TIMEOUT_MS: '2500',
      CONSOLE_OBSERVE_POLL_MS: '800',
      CONSOLE_TAIL_LINES: '2000',
      CONSOLE_TAIL_BYTES: '262144',
      TMUX_SOCKET_NAME: socketName,
      TMUX_ALLOWED_SESSIONS: `${srcSession},${dstSession}`,
      // widen MCP read bounds so a ≥256 KiB observed entry is reachable
      TMUX_READ_MAX_LINES: '5000',
      TMUX_READ_MAX_BYTES: '1048576',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  consoleChild.stderr?.on('data', (chunk) => (consoleStderr += chunk));
  await waitFor(async () => {
    try {
      const res = await fetch(`${baseURL}/api/health`);
      return res.ok;
    } catch {
      return false;
    }
  });
  if (consoleChild.exitCode !== null) {
    throw new Error(`console exited early: ${consoleStderr}`);
  }
  srcId = await channelIdFor(srcSession);
  dstId = await channelIdFor(dstSession);
});

test.afterAll(async () => {
  consoleChild?.kill('SIGTERM');
  await tmux('kill-server').catch(() => undefined);
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(join(artifactDir, 'transfer-console-stderr.log'), consoleStderr || '(no console stderr)\n');
});

test('explicit transfer: preview, cancel, confirm — exactly one target write', async ({ page }) => {
  // Keep the primed earlier-output small and marker-last: the transferred
  // payload is typed into the target pane and embedded newlines execute
  // line-by-line — a line like `exec bash` replacing the shell mid-paste can
  // swallow subsequent input, so the marker must be at the tail.
  await tmux('clear-history', '-t', srcSession);
  await sendKeys(srcSession, '-l', 'clear');
  await sendKeys(srcSession, 'Enter');
  await waitFor(async () => !(await tryTmux('capture-pane', '-t', srcSession, '-p'))?.includes('exec bash'));
  await sendKeys(srcSession, '-l', 'echo E2E_SRC_MARKER_77');
  await sendKeys(srcSession, 'Enter');
  await waitFor(() => paneHas(srcSession, 'E2E_SRC_MARKER_77'));

  await page.goto(baseURL);
  await expect(page.locator('li.channel')).toHaveCount(2);
  await selectChannelById(page, srcId);
  await expect(page.locator('#chat-state')).toHaveText('live', { timeout: 20_000 });
  const srcEntry = page.locator('.turn.earlier', { hasText: 'E2E_SRC_MARKER_77' }).last();
  await expect(srcEntry).toBeVisible({ timeout: 15_000 });

  const dstBefore = await captureAll(dstSession);
  const srcBefore = await captureAll(srcSession);

  await test.step('open modal: zero mutation, confirm disabled until target chosen', async () => {
    await srcEntry.locator('button.send-to').click();
    await expect(page.locator('#transfer-modal')).toBeVisible();
    await expect(page.locator('#transfer-source')).toContainText(srcSession);
    await expect(page.locator('#transfer-confirm')).toBeDisabled();
    expect(await captureAll(dstSession)).toBe(dstBefore);
  });

  await test.step('explicit target → preview shows exact payload, still zero mutation', async () => {
    await page.locator('#transfer-target').selectOption(dstId);
    await expect(page.locator('#transfer-confirm')).toBeEnabled();
    const preview = await page.locator('#transfer-preview').textContent();
    expect(preview).toContain('E2E_SRC_MARKER_77');
    expect(preview).toContain(`"${srcSession}"`);
    await expect(page.locator('#transfer-size')).toContainText('bytes');
    expect(await captureAll(dstSession)).toBe(dstBefore);
  });

  await test.step('cancel → zero writes', async () => {
    await page.locator('#transfer-cancel').click();
    await expect(page.locator('#transfer-modal')).toBeHidden();
    expect(await captureAll(dstSession)).toBe(dstBefore);
  });

  await test.step('confirm once → exactly one target send, exact payload, source untouched', async () => {
    await srcEntry.locator('button.send-to').click();
    await page.locator('#transfer-target').selectOption(dstId);
    await page.locator('#transfer-nosubmit').check();
    const preview = await page.locator('#transfer-preview').textContent();
    await page.locator('#transfer-confirm').click();
    await expect(page.locator('#transfer-modal')).toBeHidden({ timeout: 10_000 });
    // the pasted multi-line payload executes line-by-line and scrolls the
    // marker off the visible pane — match on full scrollback
    try {
      await waitFor(() => scrollbackHas(dstSession, 'E2E_SRC_MARKER_77'));
    } catch (e) {
      console.log('DST SCROLLBACK AT FAILURE:\n' + (await tryTmux('capture-pane', '-t', dstSession, '-p', '-S', '-')));
      console.log('DST ALIVE:', await tryTmux('list-panes', '-t', dstSession, '-F', '#{pane_current_command}'));
      throw e;
    }
    const dstAfter = await captureAll(dstSession);
    // the envelope header proves exactly one transfer send landed
    expect((dstAfter.match(/context transferred from/g) ?? []).length).toBe(1);
    expect(dstAfter).toContain('E2E_SRC_MARKER_77');
    expect(await captureAll(srcSession)).toBe(srcBefore);

    const history = await fetch(`${baseURL}/api/channels/${encodeURIComponent(dstId)}/history`).then((r) => r.json());
    const turns = (history.ring?.entries ?? []).filter((e) => e.kind === 'user_turn');
    expect(turns).toHaveLength(1);
    expect(turns[0].text).toBe(preview);
  });
});

test('vanished target: explicit error, no fallback, fresh re-selection required', async ({ page }) => {
  await waitForIdle(srcId);
  await sendKeys(srcSession, '-l', 'echo E2E_VANISH_11');
  await sendKeys(srcSession, 'Enter');
  await waitFor(() => paneHas(srcSession, 'E2E_VANISH_11'));

  // Count mutation POSTs at the browser boundary — deterministic proof of
  // how many write attempts the UI issued, independent of pane rendering.
  const textPosts = [];
  await page.route('**/api/channels/*/text', async (route) => {
    textPosts.push(route.request().url());
    await route.continue();
  });

  await page.goto(baseURL);
  await selectChannelById(page, srcId);
  const entry = page.locator('.turn.earlier, .block', { hasText: 'E2E_VANISH_11' }).last();
  await expect(entry).toBeVisible({ timeout: 15_000 });
  await entry.locator('button.send-to').click();
  await expect(page.locator('#transfer-modal')).toBeVisible();
  await page.locator('#transfer-target').selectOption(dstId);
  await expect(page.locator('#transfer-confirm')).toBeEnabled();

  // target disappears between selection and confirm → explicit failure
  const staleId = dstId;
  await killIfExists(dstSession);
  await page.locator('#transfer-confirm').click();
  await expect(page.locator('#transfer-error')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#transfer-modal')).toBeVisible();

  await test.step('stale target cannot be re-confirmed; selection reset to live list', async () => {
    // the failed target choice is invalidated: selection cleared, confirm
    // disabled, and the vanished channel no longer offered as a target
    await expect(page.locator('#transfer-target')).toHaveValue('');
    await expect(page.locator('#transfer-confirm')).toBeDisabled();
    await expect(page.locator(`#transfer-target option[value="${staleId}"]`)).toHaveCount(0);
    // exactly one POST was attempted and it failed — no fallback, no retry,
    // and no second mutation is possible while Confirm stays disabled
    expect(textPosts).toHaveLength(1);
    expect(textPosts[0]).toContain(encodeURIComponent(staleId));
  });

  await test.step('fresh explicit re-selection of a visible target sends exactly once', async () => {
    await newBashSession(dstSession);
    dstId = await channelIdFor(dstSession);
    expect(dstId).not.toBe(staleId);
    // reopen the flow → target list rebuilt against currently visible Channels
    await page.locator('#transfer-cancel').click();
    await entry.locator('button.send-to').click();
    await expect(page.locator('#transfer-modal')).toBeVisible();
    await page.locator('#transfer-target').selectOption(dstId);
    await expect(page.locator('#transfer-confirm')).toBeEnabled();
    await page.locator('#transfer-confirm').click();
    await expect(page.locator('#transfer-modal')).toBeHidden({ timeout: 10_000 });
    expect(textPosts).toHaveLength(2);
    await waitFor(() => scrollbackHas(dstSession, 'E2E_VANISH_11'));
    // the target recorded exactly one user_turn for the single delivered write
    const history = await fetch(`${baseURL}/api/channels/${encodeURIComponent(dstId)}/history`).then((r) => r.json());
    expect((history.ring?.entries ?? []).filter((e) => e.kind === 'user_turn')).toHaveLength(1);
  });
});

test('oversize selection: visible rejection, confirm disabled, no send', async ({ page }) => {
  // A single tail read is bounded at 256 KiB, so an oversize entry can only be
  // built incrementally: attach first, then let one open output_block
  // accumulate three ~200 KB observable output bursts → ~600 KB > UI bound.
  await waitForIdle(srcId);
  await page.goto(baseURL);
  await selectChannelById(page, srcId);
  await expect(page.locator('#chat-state')).toHaveText('live', { timeout: 20_000 });

  await sendKeys(
    srcSession,
    '-l',
    "printf 'Z%.0s' {1..200000}; echo; sleep 1; printf 'Y%.0s' {1..200000}; echo; sleep 1; printf 'X%.0s' {1..200000}; echo; echo E2E_BIG_DONE",
  );
  await sendKeys(srcSession, 'Enter');
  const bigEntry = page.locator('.block').filter({ hasText: 'E2E_BIG_DONE' }).last();
  await expect(bigEntry).toBeVisible({ timeout: 30_000 });
  // the block accumulates across pulls — wait until it genuinely exceeds the bound
  await expect
    .poll(
      () =>
        bigEntry
          .locator('.entry-body')
          .evaluate((el) => new TextEncoder().encode(el.textContent).length),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(256 * 1024);

  const dstBefore = await capturePane(dstSession);
  await bigEntry.locator('button.send-to').click();
  await expect(page.locator('#transfer-modal')).toBeVisible();
  await page.locator('#transfer-target').selectOption(dstId);
  await expect(page.locator('#transfer-error')).toBeVisible();
  await expect(page.locator('#transfer-error')).toContainText('transfer limit');
  await expect(page.locator('#transfer-confirm')).toBeDisabled();
  await page.locator('#transfer-cancel').click();
  expect(await capturePane(dstSession)).toBe(dstBefore);
});
