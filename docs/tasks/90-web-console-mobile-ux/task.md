# Task — Web Console mobile-first visual refresh and observation recovery UX

## Metadata

```text
GitHub Issue: #90
Task ID: 90-web-console-mobile-ux
Task kind: implementation
Base commit: ff5b4c3d0dd651a6adf2697d2735dff363c3e238
Candidate commit: n/a
Session bootstrap: docs/tasks/90-web-console-mobile-ux/prompt.md
Preferred worker: coordinator-authorized-devin
Environment: env:devin
Handoff profile: docs/tasks/handoffs/devin.md
Required capabilities: github-read-write, repository-code-authoring, github-actions-evidence, console-e2e-playwright, browser-viewport-screenshots
Hard dependencies: #62 Chat History Final Accepted; #64 Terminal Attach Final Accepted; #84 Context Transfer Final Accepted; #87 observer reattach fix merged
```

Live Task state belongs in GitHub Issue/comments, not this file.

## Goal

Restructure the Web Console chat UI to a mobile-first, Chat-first / Reading-first
information architecture with progressive disclosure, so that on a phone-width
viewport the first screen is dominated by conversation/history and the composer,
observation recovery is compact and explicit, and secondary/operator controls
are reachable but not competing for the default reading viewport — without
changing any transport, observation, mutation, lifecycle, or MCP semantics.

## Primary Use Case

```text
Actor: operator reading a Channel conversation on a phone-width browser
Trigger: open Box Web Console, select a session, read output, send text, recover interrupted observation
Preconditions:
- the Console serves an existing terminal Channel prepared outside the MCP;
- observation may be live, interrupted (needs_reobserve), polling, or error.
Main flow:
1. the default first screen shows current session identity, compact observation
   state, conversation/history, and a sticky bottom composer;
2. session navigation lives in a drawer/sheet on narrow screens;
3. ordinary Send is the single primary composer action; no-submit and
   Stop/Enter/Escape remain accessible as advanced/secondary controls;
4. when observation is interrupted (e.g. CURSOR_EXPIRED → needs_reobserve),
   a compact recovery affordance explains "channel available, observation
   continuity interrupted" and offers a prominent Re-observe action;
5. Raw transcript / Copy / Terminal / bookmarks / search stay reachable via
   overflow/secondary affordances.
Success outcome: no horizontal scrolling for the main flow at iPhone-width
(375–390px CSS) viewport; reading content dominates the first screen; recovery
is one obvious action; all existing capabilities remain functional.
Failure outcome: regression hides or auto-dismisses GAP/cursor-expiry, fakes
continuity, removes capabilities, breaks desktop layout, or introduces
horizontal scrolling in the main flow.
Degraded outcome: small-screen/desktop responsive imperfections that do not
break the main flow may be noted as known limitations; observation/transport
degradation semantics stay exactly as accepted in #62/#87.
Authoritative evidence: iPhone-width Playwright/Chromium assertions and
screenshots, plus exact-SHA GitHub Actions.
```

## Separation Points

### Console presentation | Console/MCP semantics

`console/public/**` owns layout, hierarchy, density, and disclosure of state
that already exists. `console/src/**` and root `src/` own semantics — this Task
must not touch them. If a needed state is not already exposed to the client,
that is a contract gap → BLOCKED, not a license to change `src/`.

### observation recovery UX | observation semantics

The UI may reorganize how `needs_reobserve`/`error`/`closed`/`polling` states
are displayed and how Re-observe is triggered (client-side `openStream`), but
must never auto-retry, never hide a GAP/cursor-expiry, and never claim
continuity that the observer did not establish.

### primary flow | progressive disclosure

Conversation/history and ordinary Send are primary. Everything else —
sessions list, refresh controls, raw transcript, copy, search, bookmarks,
Terminal, lifecycle, no-submit, explicit control keys — remains fully
available but must not occupy the default mobile reading viewport.

### user shortcut chips | semantic understanding

Optional plain-text shortcut chips/macros (e.g. "下一句") are allowed only as
user-configured literal text insertion into the composer. The Console must not
parse, classify, or act on reading/agent semantics.

## Single Responsibilities

```text
console/public HTML/CSS = layout, visual hierarchy, responsive disclosure
console/public app.js   = DOM wiring for disclosure/recovery affordances on existing state
tests/console-e2e       = executable mobile-viewport evidence
MCP / console/src       = unchanged semantic authority
GitHub Actions          = executable evidence
Coordinator             = review/final acceptance authority
```

## Logic / Control Separation

```text
Logic/data path owns (unchanged, outside this Task):
- observation state machine, cursor/GAP semantics, waiter bounds
- text/control mutation semantics and ambiguity handling
- HTTP/SSE payloads and element-level state truth

Control/orchestration owns (this Task, presentation only):
- when and how existing states/capabilities are surfaced, grouped, or disclosed
- which controls are primary vs secondary per viewport
- how the user reaches an explicit action (e.g. Re-observe) — never the
  decision to perform it
```

The UI may re-present state; it may not reinterpret, synthesize, or trigger
semantic transitions on its own.

## Success / Failure / Degradation

Success proves:
- iPhone-width first screen: conversation + composer dominant; no main-flow
  horizontal scrolling;
- interrupted observation shows a compact, explicit recovery UI with a
  prominent Re-observe action that does not fake continuity;
- all existing capabilities remain reachable and functionally unchanged;
- desktop layout remains usable.

Hard failure:
- any change to channel identity, cursor continuity, GAP, wait, timeout,
  lifecycle, tmux identity, or mutation-ambiguity semantics;
- auto-hiding GAP/`needs_reobserve`, auto-retrying re-observe, or visually
  implying continuity that was not established;
- removing an existing user-facing capability;
- changes under `console/src/`, root `src/`, `.github/`, or dependencies.

Safe degradation remains whatever the accepted #62/#87 observer contract
defines; visual polish trade-offs are limitations, not failures.

## Canonical / Process Sources

Read:
- `AGENTS.md`
- `docs/tasks/planning-principles.md`
- `docs/tasks/collaboration-protocol.md`
- `docs/tasks/issue-state-convention.md`
- `docs/tasks/issue-lifecycle-protocol.md`
- `docs/web-console-requirements.md`
- `console/README.md`
- `console/public/{index.html,app.js,style.css}`
- `console/src/observer.ts` (read-only: state names the UI must render)
- `tests/console-e2e/` harness conventions
- Issue #90 live body/comments, including pinned visual evidence
  `docs/assets/issues/90/{current-mobile.svg,chatgpt-reading-reference.svg}`

## Worker / Verification Route

```text
arm-r-coord = Coordinator / Reviewer
arm-r-box Devin = coordinator-authorized Devin executor
GitHub Actions = exact-Candidate verification Evidence
```

Worker claims exactly one Attempt, uses a dedicated branch/worktree, opens one
PR, reports exact Candidate SHA and Actions, then returns Issue to
`status:review`, owner none, and stops. No self-accept/merge.

## In Scope

- Restructure `console/public/` chat UI for mobile-first Chat-first/Reading-first:
  - collapsible/drawer session navigation on narrow screens;
  - minimal header (current session + compact state + overflow);
  - sticky bottom composer with Send primary; no-submit and Stop/Enter/Escape
    grouped/collapsed as advanced but still accessible;
  - compact observation-recovery UI with prominent Re-observe for
    `needs_reobserve`/`error`/`closed`, visually distinct from backend health
    and from "live";
  - reading-first typography for conversation; monospace/card emphasis reserved
    for raw terminal/code content;
  - toolbar actions (Raw transcript, Copy, Terminal, bookmarks, search) moved
    to overflow/secondary on mobile without removing them;
  - optional user-configured plain-text shortcut chips are permitted.
- New/updated Playwright coverage at iPhone width under `tests/console-e2e/`
  (e.g. a mobile spec asserting no horizontal scroll, first-screen dominance,
  and recovery affordance visibility), plus captured screenshots as evidence.
- `console/README.md` or docs clarification only if behavior genuinely changes.

## Out of Scope

- `console/src/**`, root `src/**`, `.github/**`, dependency/lockfile changes;
- public MCP tools/schemas (surface stays exactly seven tools);
- channel identity, cursor continuity, GAP, wait/timeout, lifecycle, tmux
  identity, mutation-ambiguity semantics;
- auto re-observe, GAP suppression, continuity fabrication;
- persistence, auth, deployment architecture, Terminal protocol features;
- semantic parsing/classification of terminal content or agent roles;
- Box predeploy redeploy/restart (that belongs to Final Gate, post-merge).

## Architecture Invariants

- Web Console remains an upper layer; public MCP stays exactly seven tools.
- Observation states remain the single source of truth; UI only presents them.
- Fail-closed recovery: Re-observe is explicit user action; no auto-retry of
  interrupted observation, no hidden GAP.
- Ordinary text and explicit control remain separate actions.
- Terminal stays an Advanced/debugging entry, not the default mobile surface.
- No terminal output is interpreted as Agent/Task state.
- No endpoint is created/restarted/destroyed as recovery.

## Implementation Requirements

1. Use a single coherent CSS/DOM-level restructure under `console/public/`;
   prefer `index.html`/`app.js`/`style.css` changes over new frameworks or
   dependencies (none are allowed anyway).
2. Keep every existing element id/handler contract that app.js, tests, and
   e2e rely on, or update all consumers in the same diff — no orphaned markup.
3. Add iPhone-width (375–390px CSS) Playwright assertions covering:
   no horizontal scrolling on the main flow; conversation+composer dominance
   of the first screen; collapsed session navigation; recovery affordance
   with prominent Re-observe when observation is interrupted.
4. Preserve all existing e2e/unit/integration behavior: chat loop, context
   transfer (#84), observer/history (#62/#87), terminal attach (#64),
   lifecycle (#65).
5. Attach before/after mobile-viewport screenshots to the PR as review
   evidence (existing "before" asset: `docs/assets/issues/90/current-mobile.svg`).
6. Run Console unit/typecheck, root unit/discovery, console real-tmux
   integration, static boundary guards, and the console-e2e suite locally where
   the harness supports it; GitHub Actions on the exact Candidate is
   authoritative.

## Claims / Verification

```text
C1: iPhone-width viewport has no horizontal scrolling on the main flow and
    conversation+composer dominate the first screen.
C2: sessions/refresh/raw/copy/search/bookmarks/terminal/lifecycle/no-submit/
    control-key controls remain reachable but are not in the default reading
    viewport on mobile.
C3: needs_reobserve/error/closed show compact explicit recovery UI with a
    prominent Re-observe action; no auto-retry, no hidden GAP, no fabricated
    continuity; visually distinguishable from backend health and "live".
C4: reading-first typography applied to conversation; monospace reserved for
    raw terminal/code.
C5: no console/src, root src, .github, or dependency changes; public MCP
    remains exactly seven tools.
C6: existing unit/integration/e2e suites stay green (chat, transfer,
    observer/history, terminal, lifecycle, discovery, static boundary).
C7: exact Candidate SHA push + pull_request GitHub Actions are green.
```

## Security / Reliability Review

```text
Security-sensitive: indirectly (terminal output may contain sensitive data)
Primary reliability risk: hiding/softening observation-failure states, or
  auto-mutation masquerading as user action
Remote ingress affected: no
MCP public contract affected: no
```

Do not log/persist terminal payloads for UX evidence; screenshots must avoid
sensitive pane content where feasible.

## Success Criteria

1. SC1: mobile main flow has no horizontal scrolling; first screen is
   conversation+composer dominant.
2. SC2: secondary/operator controls reachable via overflow/drawer on mobile
   and unchanged on desktop.
3. SC3: interrupted-observation recovery is compact, explicit, prominent, and
   fail-closed.
4. SC4: all C-claims hold with executable evidence.
5. SC5: only `console/public/**`, `tests/console-e2e/**`, and (if needed)
   console docs changed.
6. SC6: exact-SHA push and PR Actions fully green.

Do not lower these criteria after results are observed.

## Failure / Blocked Rules

FAIL if the result hides GAP/interrupted states, auto-retries recovery,
removes capabilities, breaks desktop or existing e2e, or touches forbidden
modules.

BLOCKED if a required piece of observer/lifecycle state is not already exposed
to `console/public` consumers, or the goal cannot be met without contract or
`src/` changes. Return to Coordinator rather than broadening scope.

## Evidence Contract

```text
Attempt: 1
Worker identity: coordinator-authorized-devin
Base SHA: ff5b4c3d0dd651a6adf2697d2735dff363c3e238 or later main
Candidate SHA: required
PR / branch: required
iPhone-width Playwright assertions + before/after screenshots: required
GitHub Actions: exact Candidate push + PR results required
Claims C1-C7: explicit PASS/FAIL
Known limitations: explicit
Box predeploy real-device dogfood: post-merge Final Gate step, not part of
this Attempt's merge evidence.
```

## Completion Protocol

```text
Coordinator/Publisher → status:ready
arm-r-box / coordinator-authorized Devin → claim → Attempt 1 → branch/PR → evidence
→ [EXECUTION REPORT] | [BLOCKER REPORT]
→ status:review | status:blocked → owner:none → STOP
arm-r-coord Coordinator → ACCEPT | REVISE | BLOCK | SPLIT | NOT_PLANNED
```

Only Final Acceptance may close #90.
