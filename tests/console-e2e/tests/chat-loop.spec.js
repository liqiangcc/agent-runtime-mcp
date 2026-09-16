import { test, expect } from '@playwright/test';
import { execFile, spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const consoleEntry = join(repoRoot, 'console', 'dist', 'src', 'server.js');
const mcpEntry = join(repoRoot, 'dist', 'src', 'server.js');
const artifactDir = join(here, '..', 'test-results');

const socketName = `console-e2e-${process.pid}-${Date.now()}`;
const allowedSession = `e2e-ok-${process.pid}`;
const deniedSession = `e2e-hidden-${process.pid}`;
const port = 39_000 + (process.pid % 5_000);
const baseURL = `http://127.0.0.1:${port}`;
const authority = `127.0.0.1:${port}`;

let consoleChild = null;
let consoleStderr = '';

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

test.beforeAll(async () => {
  // The harness (not the Console) prepares the endpoints: one allowed and one
  // disallowed session on a private tmux socket, mirroring the integration
  // spawn mechanics. The allowed pane runs a clean interactive bash.
  await tmux('new-session', '-d', '-s', allowedSession);
  await tmux('new-session', '-d', '-s', deniedSession);
  await tmux('send-keys', '-t', allowedSession, '-l', 'exec bash --noprofile --norc');
  await tmux('send-keys', '-t', allowedSession, 'Enter');
  await waitFor(
    async () => (await tmux('list-panes', '-t', allowedSession, '-F', '#{pane_current_command}')).trim() === 'bash',
  );
  await tmux('send-keys', '-t', allowedSession, '-l', 'stty -echo');
  await tmux('send-keys', '-t', allowedSession, 'Enter');
  // Output produced before the browser attaches must land in one earlier-output block.
  await tmux('send-keys', '-t', allowedSession, '-l', "printf 'E2E_PRE_HISTORY\\n'");
  await tmux('send-keys', '-t', allowedSession, 'Enter');
  await waitFor(async () => (await tmux('capture-pane', '-t', allowedSession, '-p')).includes('E2E_PRE_HISTORY'));

  consoleChild = spawn(process.execPath, [consoleEntry], {
    env: {
      ...process.env,
      CONSOLE_BIND: '127.0.0.1',
      CONSOLE_PORT: String(port),
      CONSOLE_MCP_ENTRY: mcpEntry,
      CONSOLE_OBSERVE_IDLE_MS: '400',
      CONSOLE_OBSERVE_TIMEOUT_MS: '2500',
      CONSOLE_OBSERVE_POLL_MS: '800',
      CONSOLE_TAIL_LINES: '200',
      CONSOLE_TAIL_BYTES: '65536',
      TMUX_SOCKET_NAME: socketName,
      TMUX_ALLOWED_SESSIONS: allowedSession,
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
});

test.afterAll(async () => {
  consoleChild?.kill('SIGTERM');
  await tmux('kill-server').catch(() => undefined);
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(join(artifactDir, 'console-stderr.log'), consoleStderr || '(no console stderr)\n');
});

test('primary loop: chat-first WC-UC1–UC3 plus kill-server/no-recreation', async ({ page }) => {
  page.on('dialog', (dialog) => void dialog.accept());

  await test.step('WC-UC1: session list shows only the allowed session, health=true', async () => {
    await page.goto(baseURL);
    await expect(page.locator('h1')).toHaveText('Web Console');
    await expect(page.locator('#health')).toHaveText('backend healthy');
    const items = page.locator('li.channel');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText(allowedSession);
    await expect(page.locator('#chat-empty')).toBeVisible();
    await expect(page.locator('#channels')).not.toContainText(deniedSession);
  });

  await test.step('WC-UC2: selecting a session opens the conversation view with earlier output', async () => {
    await page.locator('li.channel').first().click();
    await expect(page.locator('#chat-pane')).toBeVisible();
    await expect(page.locator('#chat-state')).toHaveText('live', { timeout: 20_000 });
    const earlier = page.locator('.turn.earlier');
    await expect(earlier).toHaveCount(1);
    await expect(earlier.locator('summary')).toContainText('earlier output');
    await expect(earlier.locator('.entry-body')).toContainText('E2E_PRE_HISTORY');
  });

  await test.step('WC-UC3: composer send renders a user turn then a paused output block', async () => {
    await page.locator('#composer-text').fill("printf 'E2E_TURN1_OUT\\n'");
    await page.locator('#composer-text').press('Enter');
    const turn = page.locator('.entry.user').filter({ hasText: 'E2E_TURN1_OUT' });
    await expect(turn).toHaveCount(1);
    const block1 = page.locator('.block').filter({ hasText: 'E2E_TURN1_OUT' });
    await expect(block1).toHaveCount(1);
    await expect(block1).toHaveAttribute('data-state', 'paused', { timeout: 20_000 });

    // A second send closes the previous block and opens a new one.
    await page.locator('#composer-text').fill("printf 'E2E_TURN2_OUT\\n'");
    await page.locator('#send').click();
    const block2 = page.locator('.block').filter({ hasText: 'E2E_TURN2_OUT' });
    await expect(block2).toHaveCount(1);
    await expect(block1).toHaveAttribute('data-state', 'closed');
    await expect(block2).toHaveAttribute('data-state', 'paused', { timeout: 20_000 });
    await expect(page.locator('.entry.user')).toHaveCount(2);
  });

  await test.step('no-parsing: prompt/role-like output stays one plain output block', async () => {
    await page.locator('#composer-text').fill("printf 'user: fake\\nassistant: fake\\n$ \\n'");
    await page.locator('#composer-text').press('Enter');
    const block = page.locator('.block').filter({ hasText: 'user: fake' });
    await expect(block).toHaveCount(1);
    await expect(block.locator('.entry-body')).toContainText('assistant: fake');
    await expect(block).toHaveAttribute('data-state', 'paused', { timeout: 20_000 });
  });

  await test.step('WC-UC3 control: Stop sends INTERRUPT after confirmation; prompt returns as output', async () => {
    await page.locator('#composer-text').fill('sleep 30');
    await page.locator('#composer-text').press('Enter');
    await expect(page.locator('.entry.user').filter({ hasText: 'sleep 30' })).toHaveCount(1);
    await page.locator('#control-stop').click();
    await expect(page.locator('.control-line')).toContainText('control: Stop');
    await page.locator('#composer-text').fill("printf 'E2E_AFTER_STOP\\n'");
    await page.locator('#composer-text').press('Enter');
    const resumed = page.locator('.block').filter({ hasText: 'E2E_AFTER_STOP' });
    await expect(resumed).toHaveCount(1);
    await expect(resumed).toHaveAttribute('data-state', 'paused', { timeout: 20_000 });
  });

  await test.step('WC-UC2 raw toggle shows the same buffer unshaped; position kept while scrolled up', async () => {
    await page.locator('#raw-toggle').click();
    await expect(page.locator('#raw-view')).toBeVisible();
    await expect(page.locator('#raw-view')).toContainText('E2E_TURN1_OUT');
    await expect(page.locator('#raw-view')).toContainText('E2E_AFTER_STOP');
    await page.locator('#raw-toggle').click();
    await expect(page.locator('#messages')).toBeVisible();

    // Fill the pane so the message list scrolls, then hold position at the top.
    await page.locator('#composer-text').fill('for i in $(seq 1 40); do printf "E2E_SCROLL_%s\\n" "$i"; done');
    await page.locator('#composer-text').press('Enter');
    await expect(page.locator('.block').filter({ hasText: 'E2E_SCROLL_40' })).toHaveCount(1, {
      timeout: 20_000,
    });
    await page.locator('#messages').evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.locator('#composer-text').fill("printf 'E2E_AFTER_SCROLL\\n'");
    await page.locator('#composer-text').press('Enter');
    await expect(page.locator('#new-output')).toBeVisible({ timeout: 20_000 });
    const scrollTop = await page.locator('#messages').evaluate((el) => el.scrollTop);
    expect(scrollTop).toBeLessThan(50);
  });

  await test.step('kill-server: UI shows unavailable; the Console never recreates endpoints', async () => {
    await tmux('kill-server');
    await expect(page.locator('#health')).toHaveText('backend unavailable', { timeout: 30_000 });
    await expect(page.locator('#error')).toContainText('unavailable', { timeout: 30_000 });
    // No recreation: the tmux server is still gone after the Console observed it.
    await expect(tmux('list-sessions')).rejects.toThrow();
    expect(consoleChild.exitCode).toBeNull();
  });
});
