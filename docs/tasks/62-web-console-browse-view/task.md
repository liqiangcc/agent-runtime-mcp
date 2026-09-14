# Task 62 — Web Console Browse View: bounded read, observe/wait refresh, Console-owned bounded history

> **Draft.** Non-claimable until Issue #61 is accepted and the Publication Dependency / Alignment Gate below is re-read by the Coordinator.

## Metadata

```text
GitHub Issue: #62
Task ID: 62-web-console-browse-view
Task kind: implementation + verification
Parent: Issue #60 (Web Console Goal)
Base commit: to be recorded at publication (must contain accepted #61 Candidate)
Candidate commit: n/a
Session bootstrap: docs/tasks/62-web-console-browse-view/prompt.md
Preferred worker: coordinator-authorized-devin
Environment: env:devin
Handoff profile: docs/tasks/handoffs/devin.md
Required capabilities: github-read-write, repository-code-authoring, github-actions-evidence, local-node-tmux-execution
Hard dependencies: Issue #61 Final Acceptance (console/ skeleton, bind guard, MCP client adapter)
```

Requirement authority: `docs/web-console-requirements.md` (WC-UC2).

## Goal

Let a human on the tailnet browse the recent output of one Channel in the browser as a
scrollable page that keeps its reading position when new output arrives, with client-side search
and copy, using only `read_channel` + `get_channel(observe:true)` + `wait_channel_event` and a
**Console-owned, finite, memory-only** history ring.

## Primary Use Case (WC-UC2)

```text
Actor: human on the tailnet
Trigger: opens one session from the list to follow what an agent is printing
Preconditions: #61 Console running; Channel available
Main flow:
  1. Console reads a bounded snapshot (read_channel) and shows it
  2. Console calls get_channel(observe:true) and loops wait_channel_event with finite idle/timeout
  3. on output_idle it re-reads bounded output, appends new tail lines to the ring, pushes to the browser (WS/SSE)
  4. browser appends; if the user has scrolled up, the position is preserved and a "new output" marker appears
  5. search/copy operate on what the browser holds; bookmarks are browser-local
Success outcome: human follows output without manual refresh; truncation/ring limits are visible
Failure outcome: CHANNEL_NOT_FOUND/UNAVAILABLE, CURSOR_EXPIRED/OBSERVATION_GAP → explicit state + "re-observe" action; no auto-recovery of the endpoint
Degraded outcome: timeout is normal and silent; wait limit errors (WAITER_LIMIT/RESOURCE_EXHAUSTED) degrade to periodic bounded read with a visible "polling" badge
Authoritative evidence: Actions integration test against real tmux producing output bursts
```

## Separation Points

```text
MCP bounded read/observe | Console-owned history ring   → MCP never stores history; Console ring is finite and memory-only
observation (output_idle) | interpretation               → Console shows "output paused", never "done"
server ring | browser view state                         → reading position, bookmarks, search are browser-local
read path | mutation paths                               → this Task adds no mutation path
```

## Single Responsibilities

```text
console/history-ring  = per-Channel finite ring (line + byte ceilings), dedupe of overlapping tail, drop marker
console/observer-loop = one observe/wait loop per open Channel with finite lifetime and cancellation on last viewer leaving
console/ui/browse     = rendering, position keeping, search, copy, bookmarks
```

## Logic / Control Separation

Logic: snapshot diffing against the ring tail, ring bounds, cursor handling, structured error mapping.
Control (operator/human): which session to open, how long to keep a view open, whether to enable disk persistence (out of scope here; off).

## Success / Failure / Degradation

Success proves: a live-following browse view exists without MCP surface change and without unbounded memory.
Hard failure: unbounded ring; history persisted to disk; observe loops outliving viewers; misusing `output_idle` as completion; reading outside scope.
Degradation: cursor expiry → explicit re-observe; waiter limits → bounded polling badge; backend unavailable → frozen view with banner.
Never inferred: agent/task semantics.

## In Scope

- history ring with configurable ceilings (defaults documented; e.g. 5,000 lines / 2 MiB per Channel, max N open Channels) and a visible drop marker;
- observer loop respecting server bounds from `docs/mcp-contract.md §7` (idle_ms/timeout_ms ranges, 2 waiters per Channel) and stopping when no viewer remains;
- WS/SSE push with `Origin`/`Host` verification against the bound address;
- browse UI: position keeping, "new output" marker, search, copy, browser-local bookmarks;
- structured error surfaces for `CURSOR_*`, `OBSERVATION_GAP`, `CHANNEL_*`, `WAITER_LIMIT`;
- tests: ring bounds, tail dedupe, loop cancellation, integration with output bursts on real tmux.

## Out of Scope

- writes/controls (#63), terminal attach (#64), lifecycle (#65);
- disk persistence of history (Future/operator opt-in, separately reviewed);
- Chat View / markdown turn rendering (Future);
- changes to `src/` or MCP bounds.

## Architecture Invariants

- `read_channel` truncation metadata is surfaced, never hidden.
- `output_idle` is displayed as a pause, never completion.
- Ring, loops and connections are finite; last viewer leaving cancels the loop.
- Terminal output is rendered escaped; never executed or used as Console policy.

## Claims / Verification

```text
C1: ring never exceeds configured line/byte ceilings under a synthetic 10× overflow; drop marker present. (unit)
C2: overlapping read tails are deduped; no duplicated or lost lines for a deterministic tmux output script. (integration)
C3: observer loop stops within one timeout after the last viewer disconnects; no waiters remain (health/limits). (integration)
C4: CURSOR_EXPIRED / OBSERVATION_GAP produce the explicit re-observe state and no automatic tmux action. (integration/unit)
C5: WS/SSE rejects mismatched Origin. (unit)
C6: no src/ diff; console static guard passes; runtime bundle excludes console/. (CI)
```

## Security Review

```text
Security-sensitive: yes (T5 sensitive output in browser memory; T8 no semantic authority; T10 bounded loops)
Remote ingress affected: no mutation path added; tailnet is the access boundary
```

## Success Criteria

1. SC1: C1–C6 PASS on the exact Candidate SHA in Actions.
2. SC2: Browse View usable on desktop and a phone-width viewport.
3. SC3: no history on disk; no `src/` change.

## Failure / Blocked Rules

BLOCK if MCP wait bounds make live following impossible without product change → report to Coordinator (a product Task would be separate). Never widen product bounds from `console/`.

## Publication Dependency / Alignment Gate

Before `status:ready`, the Coordinator must re-read the accepted #61 Candidate and align: adapter API names, bind guard/Origin helpers, UI stack chosen in #61, CI job layout. Update this file, then run the Publication Gate.

## Evidence Contract

As in `docs/tasks/task.template.md`; worker identity `coordinator-authorized-devin`; no terminal transcripts persisted.
