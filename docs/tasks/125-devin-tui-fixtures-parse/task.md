# Task — Devin TUI fixtures, recorder, and pure parse adapter

## Metadata

```text
GitHub Issue: #125
Task ID: 125-devin-tui-fixtures-parse
Task kind: implementation
Base commit: 02185c2 (main, post-#121)
Candidate commit: n/a
Session bootstrap: docs/tasks/125-devin-tui-fixtures-parse/prompt.md
Preferred worker: coordinator-authorized-devin
Environment: env:devin
Handoff profile: docs/tasks/handoffs/devin.md
Required capabilities: github-read-write, repository-code-authoring,
  github-actions-evidence, tmux-pane-recording, fixture-scrubbing
Hard dependencies: T2a merged (02185c2 — projection/adapter interfaces and
  diffTail+HistoryRing replay pipeline available on main)
Parent: #116 · docs/web-console-reading-surface-design.md @ 6094e58 (§5, §7)
```

Live Task state belongs in GitHub Issue/comments, not this file.

Planning method: `docs/tasks/planning-principles.md`. Design authority:
`docs/web-console-reading-surface-design.md` §3 (S4), §5 (grammar), §7
(recorder/fixtures); where this Task conflicts with the design doc, flag it in
the report instead of silently diverging.

## Goal

Build the real-data Devin adapter's data path: record genuine `arm-*` Devin
TUI output as scrubbed fixtures, replay them through the production
`diffTail` + `HistoryRing` pipeline, and implement a pure `parse` function
matching the design §5 grammar — so T3 renders Devin turns from recorded
reality, not mock markers.

## Primary Use Case

```text
Actor: T3 implementer / reviewer of the Devin adapter
Trigger: a Devin Channel's observed output needs structure
Preconditions: real recordings of arm-* Devin panes exist and are scrubbed
Main flow:
1. recorder samples a live pane tail into JSONL {t, text};
2. replay feeds samples through diffTail + HistoryRing → ring entries;
3. parseDevinTurn(turn text) → Segment[] | null;
4. unit tests assert segments against fixture expectations.
Success outcome: parser correctly segments real recorded turns; bash Channel
  fixture → null (fail-open); chrome/spinner/truncation handled per §5.
Failure outcome: parser throws, fabricates structure, or depends on DOM/IO.
Degraded outcome: unrecognised turn → null → caller renders generic; folded
  content stays a `truncated` segment (never recovered, never invented).
Authoritative evidence: console CI job on exact Candidate SHA + committed
  fixtures + test names in the Execution Report.
```

## Separation Points

```text
S4 logic | S5 rendering   parser is pure: no DOM, no fetch, no Hub state,
                          no timing assumptions; returns data, never pixels.
S4 | S3                  parser consumes turn text produced by projection;
                          it must not redefine turn boundaries.
S4 | S2                  parser never asks Ring/Hub to change data for it.
S1                      unchanged: fixtures come from tmux capture / MCP
                          reads already available; no new product surface.
fixture truth | code     fixtures are recordings of real panes, scrubbed;
                          never hand-authored markers (that is what made the
                          mock loop fail).
```

## Single Responsibilities

```text
record-pane-tail.mjs   = mechanical pane sampling -> JSONL
fixtures/*.jsonl       = frozen real input (scrubbed, version-labelled)
devin parse module     = text -> Segment[] | null per §5 grammar
console/test           = replay + segment assertions
```

## Logic / Control Separation

```text
Logic/data path owns: sampling mechanics, replay mechanics, segment grammar.
Control/orchestration owns: when to record, which session, scrubbing review —
  exercised by the Worker, not encoded in product code.
```

## Success / Failure / Degradation

- Success: parser segments real fixture turns; bash → null; `truncated`,
  chrome, open tool blocks handled; tests pass on Candidate SHA.
- Hard failure: any DOM/IO/Hub dependency in parser; fixture hand-authored or
  containing secrets; `src/**` touched; projection/history semantics changed.
- Safe degradation: `null` (caller falls back); `settleHint` may return
  `unknown` when tail evidence is ambiguous — never guessed.
- Never inferred: agent identity beyond what the recorded format anchors
  (`⏺ │ └ ❭`) justify; task/agent semantics.
- Never triggers: lifecycle actions.

## Required Capabilities

```text
Use Case → real input               → recorder + fixtures        → committed JSONL
Use Case → replay-faithful testing  → diffTail + HistoryRing      → console/test
Use Case → structure extraction     → pure parse                  → adapter module
Use Case → settle hint              → settleHint(tail)            → idle|busy|unknown
```

Module placement follows the same constraint as T2a: importable by
`node --test` under the console suite and deliverable unchanged to the
browser (plain ES module, no Node-only APIs). Extending `console/src/adapter.ts`
or adding `console/src/devin-adapter.ts` are both acceptable.

## Canonical / Process Sources

Read: `AGENTS.md`, `docs/tasks/{planning-principles,collaboration-protocol,
issue-state-convention,issue-lifecycle-protocol}.md`,
`docs/web-console-reading-surface-design.md` (§3 S4, §5, §7, §10),
`console/src/{adapter,projection,history,observer}.ts` (live, post-02185c2),
`tests/fixtures/terminal-recorder.mjs` (existing stdin recorder — note it is
NOT the right tool; the new recorder samples pane tails).

## In Scope

- `tests/fixtures/record-pane-tail.mjs` (or equivalent) — pane tail sampling
  to JSONL `{t, text}`; may use `tmux capture-pane -p -J` or `read_channel`.
- `tests/fixtures/devin-tui/*.jsonl` — ≥3 real recordings, scrubbed
  (paths/tokens/URLs/hostnames), each labelled with devin version + date.
- Devin `parse` + `settleHint` implementation per design §5 grammar.
- `console/test/` replay tests: fixture → diffTail → HistoryRing → Turn →
  parse → segment assertions; bash fixture → null; adversarial inputs →
  null/unknown, never throw.

## Out of Scope

- `src/**`, `history.ts`/`observer.ts`/`projection.ts` semantics, CI workflows.
- `console/public` rendering, adapter selection UI (T3), deployments (T4).
- Codex/Claude/other agents; echo-based history splitting (A3 stays);
  recovering folded TUI content.

## Architecture Invariants

- Raw transcript remains byte-identical to ring content.
- Parser output is data; fail-open `null` / `unknown` on any uncertainty.
- No secrets, credentials, or unnecessary terminal transcripts persisted
  (AGENTS §9): fixtures are minimal excerpts, scrubbed, and the Worker must
  state the scrub method + review in the report.
- Backend execution stays structured argv; no shell interpolation.

## Implementation Requirements

1. Grammar per design §5 (`⏺ │ └`, TRUNCATED, CHROME_*, TEXT fallback);
   consecutive duplicate chrome merged; unterminated `⏺` = open activity row;
   zero TOOL/CHROME → `null`.
2. `settleHint`: `idle` iff latest chrome prompt is `❭ Ask Devin`; `busy` on
   `❭ Guide Devin`/spinner; otherwise `unknown`.
3. Parser is idempotent and deterministic; segments carry the design §5 union
   (text / tool / truncated / chrome).
4. Replay helper builds a real HistoryRing from fixture samples so tests
   exercise diffTail overlap behaviour, not idealised screens.
5. Fixture files small (target ≤ 100 KB each) and minimal for the asserted
   segments.

## Claims / Verification

```text
C1: complete Devin turn fixture → expected Segment[] (tool blocks, truncated,
    chrome classified, text preserved verbatim) — test names + fixture files.
C2: INTERRUPT turn fixture → open/unsettled structure preserved; no fabricated
    closure.
C3: bash Channel fixture → parse returns null; settleHint → unknown.
C4: parser never throws on malformed/adversarial input — fuzz-ish cases in
    tests (partial ⏺ line, orphan └, mixed chrome).
C5: fixtures contain no secrets — Worker states scrub method and files
    inspected.
C6: console CI job green on exact Candidate SHA.
```

## Security Review

```text
Security-sensitive: yes (fixture hygiene only)
Threats/controls from docs/security.md: terminal transcripts are sensitive —
  fixtures must be scrubbed excerpts; no auth payloads, tokens, hostnames.
Remote ingress affected: no
```

## Success Criteria

1. SC1: C1–C6 all evidenced at the exact Candidate SHA.
2. SC2: report states fixture provenance (session, devin version, date) and
   scrub method.

## Failure / Blocked Rules

```text
FAIL:   leak-checklist violation (S2/S3/S5), hand-authored fixtures, secrets
        in fixtures, or parser that cannot run without DOM/Node APIs.
BLOCKED: no recordable Devin pane, or grammar anchors unstable in practice —
         report with fixture excerpts and return to Coordinator.
Resume: REVISE → same Issue, next Attempt.
```

## Publication Dependency / Alignment Gate

Satisfied: T2a merged at `02185c2`; Worker re-reads live `console/src` at
claim time.

## Evidence Contract

```text
Attempt
Worker identity: coordinator-authorized-devin
Base/Candidate SHA: exact
PR: reference
GitHub Actions run/job: console job link read
Fixture provenance: session id, devin version, date, scrub method
Test names + results
Known limitations (e.g. folded content, alternate screen)
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
