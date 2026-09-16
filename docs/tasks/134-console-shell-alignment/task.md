# Task — Port accepted prototype app shell into console/public

## Metadata

```text
GitHub Issue: #134
Task ID: 134-console-shell-alignment
Task kind: implementation
Base commit: ea2bc71 (main, post-#132 task package)
Candidate commit: n/a
Session bootstrap: docs/tasks/134-console-shell-alignment/prompt.md
Preferred worker: coordinator-authorized-devin
Environment: env:devin
Handoff profile: docs/tasks/handoffs/devin.md
Required capabilities: github-read-write, repository-code-authoring,
  github-actions-evidence, browser-viewport-screenshots, playwright
Hard dependencies: T3 merged (a0b2adf — reading surface on real data);
  frozen prototype reference on main (docs/prototypes/web-console-reading-first/)
Parent: #116 · docs/web-console-reading-surface-design.md @ 6094e58
```

Live Task state belongs in GitHub Issue/comments, not this file.

Planning method: `docs/tasks/planning-principles.md`. Design authority:
the frozen accepted prototype `docs/prototypes/web-console-reading-first/`
(reference SHA `6f05885`, landed via #120) and
`docs/web-console-reading-surface-design.md` §8/§9/§10. Where live Console
code conflicts with the design, flag it in the report instead of silently
diverging.

## Context

User on-device review of the T3 deployment (:8080) accepted the in-channel
conversation surface but BLOCKED Final Acceptance on shell gaps:

1. The production app shell is still the old console chrome: a "Sessions"
   sidebar tab, a dense metadata/action header row (bookmarks, Raw, Copy,
   adapter select, Terminal link, overflow), and a multi-control composer
   (target row + textarea + Send + no-submit checkbox + Stop). The accepted
   prototype defines a minimal shell instead.
2. Session-list discoverability: mobile first screen shows an empty
   "Select a session" pane; the session list is hidden behind the Sessions
   tab. The user could not find it unaided.
3. iOS standalone/PWA resumed a stale snapshot of the OLD build until a
   fresh Safari load — the shell needs a build-identity marker so a stale
   resume is detectable.

T3 (#128) deliberately scoped to the in-channel surface; this Task is the
shell completion of the same accepted design.

## Goal

Make the production Console's app shell match the frozen accepted prototype
at first glance — minimal topbar, drawer-based session list reachable on
first screen, compact recovery strip, single-row composer with secondary
actions in overflow/advanced — while preserving every frozen transport,
recovery, and reading-surface semantic and every existing API/route.

## Primary Use Case

```text
Actor: operator on phone (Home Screen standalone) or desktop
Trigger: open the Console root URL
Preconditions: :8080 serving post-a0b2adf build; channels exist in scope
Main flow:
1. first screen presents the shell as in the prototype: minimal topbar
   (☰ / channel name / status light / ⋯) and — when no channel is selected
   — the session list is visible or one obvious tap away (drawer auto-open
   or a first-run list view; NOT an empty pane behind a hidden tab);
2. selecting a channel shows the reading surface (unchanged from T3);
3. composer is a single row (+ / textarea / send) — advanced controls
   (send-without-Enter, Stop/control, Raw transcript, Copy, bookmarks,
   adapter select, Terminal link, viewport HUD/diagnostics) live in the +
   popover or the ⋯ overflow, reachable but not chrome-dense;
4. recovery state shows the compact strip with a single Re-observe action;
5. a resumed standalone instance detects a build-version mismatch and
   self-heals (reload or explicit notice) instead of silently showing the
   stale snapshot.
Success outcome: first-glance shell parity with the prototype on
  375/390/420 and standalone-sim; all frozen semantics verified; stale-build
  resume self-heals.
Failure outcome: regression of send/control/recovery/raw semantics; lost
  capability (any previously reachable action removed rather than moved);
  fabricated session data.
Degraded outcome: older browsers without localStorage still work with
  generic defaults; standalone marker unsupported → no crash, normal load.
Authoritative evidence: CI on the exact Candidate SHA + e2e DOM assertions
  (existing reading-surface/chat-loop/transfer specs must still pass,
  updated selectors allowed) + new spec covering first-screen
  discoverability, shell landmarks, and the stale-build marker + 375/390/420
  + standalone-sim screenshots.
```

## Separation Points

```text
S5 shell | S4/S3 data     shell chrome (drawer/topbar/composer/recovery/
                         overflow) consumes existing SSE/ring/projection —
                         it must not redefine turns, boundaries, or adapters.
chrome | capability        actions may be MOVED into overflow/+ popover but
                         none may be REMOVED: send, no-submit option, Stop,
                         raw toggle, copy, bookmarks, adapter select,
                         Terminal link, observe state, viewport diagnostics.
version marker | content   the build marker is metadata for staleness
                         detection; it must not gate, filter, or alter
                         Channel data.
mock | real               session names/states come from /api/channels
                         only; the prototype's mock session list is a
                         structure reference, never a data source.
```

## Single Responsibilities

```text
index.html/style.css  = shell landmarks + layout (topbar, drawer, scrim,
                        recovery strip, composer row, overflow menu)
app.js/viewport.js    = shell state (drawer open/close, overflow, first-run
                        discoverability, build-version check) + the frozen
                        screenExtent/kb-inset model, unchanged semantics
reading.js/markdown.js = in-channel surface (T3, unchanged except selectors
                        the shell contract requires)
```

## Logic / Control Separation

```text
Logic (unchanged, under test): projection, adapters, history/observer,
  SSE payload, all server-side semantics.
Control (this Task): shell presentation, discoverability defaults, menu
  grouping, build-marker handshake. No server-side change except the
  minimal static allowlist/build-stamp route if strictly required — justify.
```

## In Scope

- `console/public/**`: topbar/drawer/composer/recovery/overflow shell per
  the frozen prototype; session list bound to `/api/channels` (name, state
  light); first-screen discoverability (drawer auto-open on first visit or
  equivalent list-first layout); compact recovery strip; single-row
  composer with + popover/overflow relocation of secondary controls.
- Build-version marker: e.g. a `data-build`/`meta` stamp in index.html plus
  a lightweight check (served `/api/health` or a static marker) that
  reloads or notifies on mismatch after a standalone resume.
- `console/src/http-app.ts` allowlist/stamp change ONLY if required —
  justify each added route/field.
- `tests/console-e2e` additions/updates + any selector migration in
  existing specs.
- `console/scripts/*` build wiring if a build stamp needs generating.

## Out of Scope

- `src/**`, `console/src` semantics (history/observer/projection/adapter/
  devin-adapter), MCP surface, CI workflows, deployment/cutover (T4 owns
  redeploy), other agents, auto-detection of adapter, folded-content
  recovery, WebSocket/new transports, theming/redesign beyond the frozen
  prototype.

## Architecture Invariants

- Raw transcript byte-identical to ring content; nothing filtered.
- At-most-once send; no auto-retry on ambiguous/failed; TIMEOUT stays
  ambiguous; GAP/CURSOR_EXPIRED stays fail-closed.
- IME composition safe; draft/caret/focus preserved across drawer/overflow/
  recovery/viewport reconciliation.
- No agent-type inference from output text; adapter stays user-chosen.
- No page-level horizontal scroll at 375/390/420; `--app-vh` asymmetric
  commit + `--kb-inset` model and `screenExtent()` floor unchanged.
- Session/channel data only from the real API; nothing hardcoded.

## Success Criteria

- SC1: shell landmark parity — topbar (☰/name/status/⋯), drawer+scrim,
  compact recovery, single-row composer present on 375/390/420 and
  standalone-sim; dense old chrome gone.
- SC2: discoverability — fresh load with no channel selected exposes the
  session list without hunting (auto-opened drawer or list-first view).
- SC3: capability preservation — every pre-existing action remains
  reachable (enumerated in report); send path at-most-once intact.
- SC4: recovery — needs_reobserve shows compact strip; Re-observe resumes.
- SC5: stale-build resume — marker check demonstrably triggers
  reload/notice when served build differs (scripted).
- SC6: no regression — existing e2e specs pass (selectors may migrate);
  no page h-scroll at 375/390/420.
- SC7: evidence — e2e assertions + screenshots tied to Candidate SHA.

## Evidence Contract

- GitHub Actions console + console-e2e jobs green on the Candidate SHA.
- New/updated e2e covering SC1–SC6 on the real pipeline (real tmux pane
  where applicable).
- Screenshots `v134-*-<sha7>.png`: first screen (discoverability), channel
  view shell, expanded overflow, recovery strip, composer focus —
  420×912 standalone-sim plus 375/390 width checks.
- Standing evidence item (this and future UI tasks): **full-page mobile
  screenshots compared side-by-side against the frozen prototype reference**
  (`docs/prototypes/web-console-reading-first/screenshots/` or a live
  capture of the prototype build) — a Reviewer must be able to confirm
  first-glance parity without running the app.
- Report must list every action's new home (moved vs unchanged) proving
  SC3.
