# Task — Conversation projection, generic adapter and real-time observation cadence

## Metadata

```text
GitHub Issue: #121
Task ID: 121-projection-generic-realtime
Task kind: implementation
Base commit: 6094e583e54b1bd687c8aa48da963f2c4459f141 (main)
Candidate commit: n/a
Session bootstrap: docs/tasks/121-projection-generic-realtime/prompt.md
Preferred worker: coordinator-authorized-devin
Environment: env:devin
Handoff profile: docs/tasks/handoffs/devin.md
Required capabilities: github-read-write, repository-code-authoring,
  github-actions-evidence, console-unit-tests
Hard dependencies: none (parallel with T1 #120; precedes T3)
Parent: #116 · docs/web-console-reading-surface-design.md @ 6094e58
```

Live Task state belongs in GitHub Issue/comments, not this file.

Planning method: `docs/tasks/planning-principles.md`. Design authority:
`docs/web-console-reading-surface-design.md` §3 (S2 control side, S3, S4
identity), §4, §6; where this Task conflicts with the design doc, flag it in
the report instead of silently diverging.

## Goal

Implement the adapter-agnostic data path of the reading surface so that any
tmux Channel gets (a) a deterministic conversation projection, (b) the
identity `generic` adapter and adapter interface, and (c) a real-time
observation cadence where new terminal output reaches viewers in ~1 s instead
of up to 15 s — without touching `src/**`, Ring semantics, or any
Devin-specific knowledge.

## Primary Use Case

```text
Actor: operator watching any Channel through the Console UI (generic default)
Trigger: a user_turn send followed by continuous agent output
Preconditions: Channel exists; observe loop running
Main flow:
1. every Console send becomes a Turn boundary; observed output_blocks attach
   to the current Turn;
2. while output flows, viewers receive `updated` ring deltas at busy cadence;
3. at output_idle the block reaches paused → Projection reports settled.
Success outcome: Turn[] is a pure function of ring entries; SSE deltas arrive
with p95 ≈ 1 s during continuous output (asserted via injected mock MCP, not
wall-clock against real tmux in unit tests).
Failure outcome: turn attribution depends on output text; settle waits for
content; cadence changes idle semantics.
Degraded outcome: adapter returns null/unknown → caller renders generic;
timeout under WAITER_LIMIT falls back to the existing poll path unchanged.
Authoritative evidence: GitHub Actions console job (typecheck + unit tests)
on the exact Candidate SHA.
```

## Separation Points

```text
S2 control | Ring logic      cadence changes runLoop only; history.ts
                             (verbatim storage, diffTail, formatRawTranscript)
                             must not change behaviour.
S3 | S4                    Projection never reads output text content to
                             decide turn boundaries or settle; the adapter
                             interface is the only place text interpretation
                             may later live.
S4 | S5                    Adapter/projection are pure: no DOM, no fetch, no
                             Hub state. Rendering is not this Task.
S1                       unchanged: no MCP change, no new public field.
```

## Single Responsibilities

```text
projection module   = ring entries -> Turn[] (boundary, membership, settled)
adapter interface   = parse(text) -> Segment[] | null; settleHint(tail) -> idle|busy|unknown
generic adapter     = identity: parse -> null, settleHint -> unknown
HistoryHub          = observation cadence control (busy/quiet), unchanged record semantics
config.ts           = expose CONSOLE_OBSERVE_BUSY_TIMEOUT_MS
```

## Logic / Control Separation

```text
Logic/data path owns: Turn derivation, adapter identity results, Ring invariants.
Control/orchestration owns: which timeout_ms to pass to wait_channel_event,
  when to pull, when to fall back to polling — all inside HistoryHub.
```

## Success / Failure / Degradation

- Success: deterministic Turn[]; busy cadence measured by unit test via
  injected mock MCP returning scripted wait results (no real timing needed:
  assert the *requested* timeout_ms values and that a pull follows
  `activity_observed`).
- Hard failure: `history.ts` semantics altered; any `⏺ ❭ │` string, "Devin"
  identifier, or output-text condition inside projection/observer/config;
  `src/**` touched; new public MCP surface.
- Safe degradation: adapter `null`/`unknown`; `TIMEOUT` keeps existing poll
  behaviour; `output_idle` settle unchanged.
- Never inferred: agent type, task state, "answer complete" as a semantic.
- Never triggers: no lifecycle action from cadence or projection state.

## Required Capabilities

```text
Use Case → deterministic turn grouping → pure projection → unit test
Use Case → opt-in structure hook       → adapter interface + generic → unit test
Use Case → real-time tail              → adaptive timeout_ms        → unit test (mock MCP)
Use Case → operator knob               → CONSOLE_OBSERVE_BUSY_TIMEOUT_MS (default 600, 100..5000)
```

Module placement is an implementation detail, but must satisfy:
- projection + adapter code is importable by `node --test` inside the console
  test suite (console/test/*.test.ts compiled by `npm run build`); and
- deliverable unchanged to the browser later by T3 (plain ES module, no
  Node-only APIs).

## Canonical / Process Sources

Read: `AGENTS.md`, `docs/tasks/{planning-principles,collaboration-protocol,
issue-state-convention,issue-lifecycle-protocol}.md`,
`docs/web-console-reading-surface-design.md` (§3 S2–S4, §4, §5 interface, §6,
§10 leak checklist), `console/src/{observer,history,config,mcp-client}.ts`.

## In Scope

- New projection + adapter modules (pure) under `console/` with unit tests.
- `console/src/observer.ts`: busy/quiet `timeout_ms` selection in `runLoop`,
  pulling whenever `activity_observed` (existing `timeout`+activity branch may
  be generalised, never weakened).
- `console/src/config.ts`: `CONSOLE_OBSERVE_BUSY_TIMEOUT_MS` (bounded
  100..5000, default 600).
- Explicit sub-decision in the Execution Report: `CONSOLE_TAIL_LINES` value
  kept or changed, with rationale (design §11 decision 2 — must be recorded,
  bounded by `TMUX_READ_MAX_LINES`).

## Out of Scope

- `src/**`, `tests/dogfood/**`, CI workflow files, deployment.
- Devin parser/fixtures (T2b), any UI/`console/public` rendering change (T3).
- WebSocket/new transport; MCP parameter or surface changes.

## Architecture Invariants

- Ring stores verbatim; raw transcript stays byte-identical to ring content.
- `timeout` is never a block boundary; `output_idle` settle semantics unchanged.
- Waiter limits unchanged (still ≤1 logical wait per Channel in the loop).
- No agent-type inference; no output-text condition in projection/observer.
- Backend execution stays structured argv; no shell; the console static
  boundary guard in `.github/workflows/ci.yml` must keep passing.

## Implementation Requirements

1. Projection: `Turn { id; user?: user_turn entry; blocks[]; controls[];
   settled }` derived only from entry kinds/order/state; `earlier_output`
   before the first `user_turn` maps to one synthetic "earlier" turn.
2. Adapter interface exported for later adapters; generic = identity.
3. Cadence: busy when previous wait had `activity_observed` or current block
   is `open`; quiet otherwise → timeout_ms = busy/quiet values respectively.
4. All new env config bounded via the existing `boundedInt` pattern.
5. Unit tests cover: multi-turn attribution, earlier turn, control entries,
   paused→settled, closed at next user_turn; busy/quiet timeout selection;
   pull-on-activity; fail-open adapter contract.

## Claims / Verification

```text
C1: Turn[] derivation is deterministic and depends only on entry kinds/order/state (tests).
C2: generic adapter returns null/unknown and cannot throw (tests).
C3: during activity the loop requests timeout_ms = busy value and pulls;
    during quiet it requests the heartbeat value (tests via mock MCP).
C4: output_idle / paused / closed semantics unchanged (regression tests).
C5: no Devin-format knowledge outside the adapter interface definition —
    mechanical grep evidence in the report.
C6: console CI job green on exact Candidate SHA (typecheck + unit tests +
    boundary guard).
```

## Security Review

```text
Security-sensitive: no new surface (reads stay bounded; no new public API)
Threats/controls from docs/security.md: unchanged
Remote ingress affected: no
```

## Success Criteria

1. SC1: C1–C6 all evidenced at the exact Candidate SHA.
2. SC2: Execution Report records the CONSOLE_TAIL_LINES sub-decision with rationale.

## Failure / Blocked Rules

```text
FAIL:   boundary leak (leak checklist §10), semantics change, or untested claim.
BLOCKED: design doc contradicts live code in a way requiring contract change.
Resume: REVISE → same Issue, next Attempt.
```

## Publication Dependency / Alignment Gate

None — design is merged at `6094e58`; current console sources re-read by the
Worker at claim time per Start Protocol.

## Evidence Contract

```text
Attempt
Worker identity: coordinator-authorized-devin
Base/Candidate SHA: exact
PR: reference
GitHub Actions run/job: console job link read
Unit test names + results; grep evidence for C5; CONSOLE_TAIL_LINES sub-decision
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
