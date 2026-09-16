# Task — Port accepted reading surface into console/public on real Channel data

## Metadata

```text
GitHub Issue: #128
Task ID: 128-console-reading-surface
Task kind: implementation
Base commit: 3244abb (main, post-#125)
Candidate commit: n/a
Session bootstrap: docs/tasks/128-console-reading-surface/prompt.md
Preferred worker: coordinator-authorized-devin
Environment: env:devin
Handoff profile: docs/tasks/handoffs/devin.md
Required capabilities: github-read-write, repository-code-authoring,
  github-actions-evidence, browser-viewport-screenshots, playwright
Hard dependencies: T1 merged (515b054 — frozen prototype reference),
  T2a merged (02185c2 — projection/adapter/cadence), T2b merged (3244abb —
  devin-adapter + fixtures)
Parent: #116 · docs/web-console-reading-surface-design.md @ 6094e58
```

Live Task state belongs in GitHub Issue/comments, not this file.

Planning method: `docs/tasks/planning-principles.md`. Design authority:
`docs/web-console-reading-surface-design.md` (§3 S5–S6, §4, §5, §6, §8).
Where the live Console code conflicts with the design, flag it in the report
instead of silently diverging.

## Goal

Bind the user-accepted reading surface (prototype `6f05885`, frozen on `main`
at `docs/prototypes/web-console-reading-first/`) to **real Channel data** in
`console/public`: conversation view driven by `projectConversation` +
adapters over the existing SSE stream, real-time in-place increments,
per-Channel user-chosen adapter, honest truncation labels, and the #111
standalone shell floor — so the deployed Console shows the user's own real
sessions in the accepted ChatGPT-style reading surface.

## Primary Use Case

```text
Actor: operator on phone (Home Screen standalone) or desktop
Trigger: open a Channel in the Console
Preconditions: channel exists; Console observing it
Main flow:
1. first screen shows one collapsed "earlier output" entry plus any turns;
2. on send: user bubble, activity/answer streams in-place at busy cadence;
3. on settle: devin channel collapses to one summary row + dominant answer;
   generic channel shows the answer block (Markdown attempted, monospace on
   failure);
4. raw view is always available and byte-identical to ring content.
Success outcome: real channel data renders in the accepted structure on
  375/390/420 and standalone; latency target p95 ≤ ~1.5 s observed end-to-end.
Failure outcome: any entry dropped, any fabricated structure, any regression
  of raw fidelity or send/control semantics.
Degraded outcome: devin parse null → generic render for that turn; folded
  content shows the honest truncated label; adapter unset → generic.
Authoritative evidence: CI on exact Candidate SHA + scripted DOM checks and
  screenshots driven by the committed devin fixtures (real recorded input,
  replayed through the production pipeline — not hand-authored mock).
```

## Separation Points

```text
S5 rendering | S4 adapter   UI consumes Segment[] only; grammar knowledge
                            stays in console/src/devin-adapter.ts.
S5 | S3                    UI consumes Turn[] from projectConversation;
                            it does not re-derive boundaries.
S5 | S2                    UI never decides pull cadence — cadence lives in
                            HistoryHub (T2a); UI only feeds received deltas.
S6                       adapter choice is the user's (localStorage per
                            channel_id); server supplies no hint.
S1                       unchanged: no MCP change.
```

## Single Responsibilities

```text
console/public/app.js (+ new modules) = conversation view + interactions
console/src/{projection,adapter,devin-adapter} = pure data path (reused, not
  reimplemented — see Implementation Requirements for delivery to browser)
console/src/http-app.ts = static file serving (+ the minimal endpoint only if
  strictly required, justified)
console/src/{history,observer}.ts = untouched semantics
```

## Logic / Control Separation

```text
Logic/data path owns: Turn[]/Segment[] derivation (already on main), SSE shape.
Control/orchestration owns: when to render, collapse/expand, scroll pin,
  adapter choice — all client-side presentation control.
```

## Success / Failure / Degradation

- Success: real fixtures replayed through the production pipeline render into
  the accepted visual structure; generic channels keep verbatim rendering;
  send/control semantics unchanged.
- Hard failure: any entry dropped or fabricated; raw ≠ ring; parse hint
  reaching into server-side; agent-type inference; `src/**` touched.
- Safe degradation: parse `null` → generic turn; `unknown` hint → settle by
  `settled` alone; truncated segment label + Terminal View link.
- Never inferred: agent type, task/agent semantics, "answer complete" beyond
  observed `settled`.
- Never triggers: no lifecycle actions from presentation state.

## Required Capabilities

```text
Use Case → conversation structure   → projectConversation + adapters (main)
Use Case → real-time                → busy cadence (main) + in-place deltas
Use Case → devin reading surface    → devin-adapter Segment[] → DOM (port)
Use Case → generic reading surface  → verbatim/Markdown block (port)
Use Case → per-channel adapter      → localStorage adapter chooser (port)
Use Case → honest truncation        → truncated segment label (port)
Use Case → standalone correctness   → screenExtent() floor carried verbatim
```

## Canonical / Process Sources

Read: `AGENTS.md`, `docs/tasks/{planning-principles,collaboration-protocol,
issue-state-convention,issue-lifecycle-protocol}.md`,
`docs/web-console-reading-surface-design.md` (§3 S5–S6, §4–§6, §8, §10),
frozen reference `docs/prototypes/web-console-reading-first/**` (515b054),
live code `console/src/{adapter,projection,devin-adapter,observer,history,
http-app}.ts`, `console/public/{app.js,style.css,index.html,markdown*}`
(current console UI), `console/test/*`, `tests/console-e2e/`.

## In Scope

- `console/public/**` reading-surface port: conversation view, bubbles,
  summary row, activity rows, truncated label, raw toggle, adapter chooser,
  `screenExtent()` floor, Markdown rendering — matching the accepted
  `6f05885` structure, adapted to real data.
- Serving the compiled pure modules to the browser: choose ONE mechanism and
  justify it in the report (e.g. serve `dist/src/{projection,adapter,
  devin-adapter}.js` as static modules, or copy a small ES-module bundle into
  `console/public/` during `npm run build`). Do not reimplement the logic in
  the UI.
- Minimal `http-app.ts` change only if strictly required by that mechanism or
  by adapter persistence exposure — justify each route change.
- `tests/console-e2e` or equivalent scripted evidence driven by committed
  devin fixtures replayed through the real pipeline (fixture → HistoryRing →
  projectConversation → parse → DOM), plus generic-channel DOM checks.

## Out of Scope

- `src/**`, `history.ts`/`observer.ts`/`projection.ts`/`adapter.ts`/
  `devin-adapter.ts` semantic changes (a bug found in them → report, do not
  silently fix), CI workflows, deployment/cutover (T4), other agents,
  auto-detection, echo-based history splitting, folded-content recovery,
  WebSocket/new transport.

## Architecture Invariants

- Raw transcript byte-identical to ring content; nothing filtered server-side.
- `timeout` never a block boundary; `output_idle` settle semantics unchanged.
- at-most-once send; TIMEOUT ambiguity keeps "may have been delivered"; no
  auto-retry (existing Console semantics preserved).
- Markdown stays untrusted-safe (prototype already escapes; keep it).
- The console static boundary guard in `.github/workflows/ci.yml` must pass.
- Adapter selection never inferred from terminal text.

## Implementation Requirements

1. Reuse `projectConversation`, `Adapter`/`Segment` types, `genericAdapter`,
   `devinAdapter` from `console/src` — serve compiled modules or a bundled
   ES-module to the browser; no duplicate implementation.
2. Rendering is in-place incremental: per `entry.id`, feed only the appended
   text into live Markdown / adapter update; nodes reparent, never rebuild;
   scroll pin preserved.
3. Settle: `settled && settleHint != 'busy'` (design §11 decision 1 — the
   caller combines).
4. `truncated` segments render an honest label + Terminal View entry.
5. `screenExtent()` floor and `kbtest`-style HUD/diag support ported verbatim.
6. Adapter chooser: per-Channel UI control (e.g. channel header), persisted
   in `localStorage`, default `generic`; visible `raw` marking when a turn
   fell back.
7. No new server-side adapter hint, no session-name mapping (S6 hard
   exclusion).

## Claims / Verification

```text
C1: devin fixture replay → accepted structure: settled turn = one
    .trace-sum summary + dominant answer; top-level tool cards = 0.
C2: expand/collapse preserves answer node identity and scroll.
C3: running turn shows in-place activity rows; interrupted state keeps rows
    visible until re-observe + settle (fail-closed).
C4: generic channel: send → bubble; output → one answer block; verbatim or
    Markdown; raw == /api/channels/:id/raw text.
C5: real-time: during continuous fixture replay the UI receives incremental
    `updated` deltas (assert deltas, not only final snapshot).
C6: 375/390/420 no page-level horizontal scroll; standalone shell floor
    applied (screenExtent code present + exercised in standalone emulation).
C7: adapter chooser persists per channel_id across reloads; default generic.
C8: console CI job + console-e2e green on exact Candidate SHA.
```

## Security Review

```text
Security-sensitive: yes (renders untrusted terminal text; serves new statics)
Threats/controls from docs/security.md: output is untrusted data — Markdown
  rendering must stay escaped/sanitised; no credential display changes;
  new served paths must stay static/public assets only.
Remote ingress affected: no
```

## Success Criteria

1. SC1: C1–C8 all evidenced at the exact Candidate SHA with
   fixture-driven scripted checks (not manual screenshots alone).
2. SC2: every claim names the test/check that proves it; any deviation from
   the design doc is flagged explicitly in the report.
3. SC3: screenshots at 420×912 (standalone-sim) of a real-fixture devin turn
   and a generic turn are attached; before/after pairs must differ (hash
   compared — identical hashes are a mechanical REJECT).

## Failure / Blocked Rules

```text
FAIL:   dropped/fabricated entries, raw≠ring, server-side inference, or any
        unscoped file change.
BLOCKED: binding genuinely requires an out-of-scope server change (report
         the exact missing capability), or fixture replay contradicts the
         adapter interface (report, do not patch silently).
Resume: REVISE → same Issue, next Attempt.
```

## Publication Dependency / Alignment Gate

Satisfied: T1/T2a/T2b merged (`515b054`, `02185c2`, `3244abb`); Worker re-reads
live sources at claim time.

## Evidence Contract

```text
Attempt
Worker identity: coordinator-authorized-devin
Base/Candidate SHA: exact
PR: reference
GitHub Actions run/job: console + console-e2e links read
Fixture-driven checks: names + results; screenshot files + sha256
Serve mechanism chosen + justification; any route change + justification
Deviations from design doc: explicit list (none expected)
Known limitations
```

## Completion Protocol

```text
Coordinator/Publisher → status:ready + Devin entry
coordinator-authorized-devin Worker → claim → Attempt N → PR → Actions Evidence
→ [EXECUTION REPORT] | [BLOCKER REPORT]
→ status:review | status:blocked → owner:none → STOP
Coordinator → ACCEPT | REVISE | BLOCK | SPLIT | NOT_PLANNED
```

Contract change returns to draft + Publication Gate. Only Final Acceptance may
set done/close.
