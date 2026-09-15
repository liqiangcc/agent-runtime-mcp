# Task — Web Console observer reattach must not strand a live viewer

## Metadata

```text
GitHub Issue: #87
Task ID: 87-web-console-observer-reattach
Task kind: implementation
Base commit: fb744a45a87634dfccc7be858a4d8566ad034cda
Candidate commit: n/a
Session bootstrap: docs/tasks/87-web-console-observer-reattach/prompt.md
Preferred worker: coordinator-authorized-devin
Environment: env:devin
Handoff profile: docs/tasks/handoffs/devin.md
Required capabilities: github-read-write, repository-code-authoring, github-actions-evidence, console-observer-tests
Hard dependencies: #62 Chat History Final Accepted; #84 Context Transfer Final Accepted and merged
```

Live Task state belongs in GitHub Issue/comments, not this file.

## Goal

Fix the accepted Web Console history observer so a viewer that reattaches while the previous bounded `wait_channel_event` is still in flight continues receiving future observed output. Preserve bounded teardown, waiter limits, and the invariant that one Channel does not acquire duplicate concurrent observer loops.

## Primary Use Case

```text
Actor: browser/Console viewer using Chat History SSE
Trigger: last viewer disconnects, then a viewer reconnects before the previous bounded wait settles
Preconditions:
- the Channel is still available;
- the old observer loop has an in-flight bounded wait;
- no product/MCP restart or Channel instance change occurred.
Main flow:
1. last viewer detaches;
2. observer state begins bounded stop/teardown while an existing wait may still be in flight;
3. a new viewer reattaches before that wait resolves;
4. the Console re-arms the Channel observation state for the newly present viewer;
5. at most one active observation loop continues/restarts;
6. later Channel output is appended and reaches the reattached viewer.
Success outcome: the reattached viewer continues observing future output without duplicate loops/waits.
Failure outcome: viewer appears live but future output never advances, or reattach creates duplicate observer loops/waiters.
Degraded outcome: genuine MCP observation errors remain explicit (`needs_reobserve`, polling fallback, unavailable, etc.) under the existing #62 contract.
Authoritative evidence: focused fail-on-base/pass-on-Candidate observer regression plus exact-SHA GitHub Actions.
```

## Separation Points

### Web Console observer | MCP observation contract

The Console owns viewer attachment/detachment and its process-local observation loop lifecycle. The MCP continues to own bounded `get_channel(observe:true)` / `wait_channel_event` semantics. Do not change public MCP tools, schemas, cursor semantics or `src/` product code.

### viewer lifecycle | observer loop lifecycle

A browser viewer joining/leaving is not itself an MCP service lifecycle event. Last-viewer teardown may stop future Console observation work, but a subsequent viewer must be able to re-arm observation safely even if an older bounded wait has not yet settled.

### stop/re-arm | concurrency safety

Re-arming must not create multiple concurrent loops for one Channel. Existing shared per-Channel state, finite waits and cancellation/teardown bounds remain authoritative.

## Single Responsibilities

```text
HistoryHub viewer lifecycle = maintain whether a Channel currently has interested viewers
HistoryHub observation loop = perform one bounded observation stream/poll path per Channel
MCP client = unchanged public observation transport
GitHub Actions = executable evidence
Coordinator = review/final acceptance authority
```

## Success / Failure / Degradation

Success proves:
- reattach during an in-flight old wait does not strand the new viewer;
- later output becomes visible;
- there is no duplicate concurrent observer loop/waiter caused by the reattach.

Hard failure:
- a newly attached viewer remains permanently stuck after receiving a snapshot;
- fix depends on unbounded polling/waits, blind loop spawning, or MCP product changes;
- last-viewer teardown no longer stops observation within the existing bounded behavior;
- duplicate loops cause duplicated output/events or waiter/resource growth.

Safe degradation remains whatever accepted #62 already defines for unsupported observation, cursor errors, backend unavailable and bounded polling fallback. Never infer Agent/Task semantics.

## Canonical / Process Sources

Read:
- `AGENTS.md`
- `docs/tasks/planning-principles.md`
- `docs/tasks/collaboration-protocol.md`
- `docs/tasks/issue-state-convention.md`
- `docs/tasks/issue-lifecycle-protocol.md`
- `docs/web-console-requirements.md`
- `console/README.md`
- `console/src/observer.ts`
- `console/test/history.test.ts`
- Issue #87 live body/comments

## Worker / Verification Route

```text
current ChatGPT conversation = Coordinator / Reviewer
arm-r / Box Devin = coordinator-authorized Devin executor
GitHub Actions = exact-Candidate verification Evidence
```

Worker claims exactly one Attempt, uses a dedicated branch, opens one PR, reports exact Candidate SHA and Actions, then returns Issue to `status:review`, owner none, and stops. No self-accept/merge.

## In Scope

- minimal Console observer-state fix for detach→reattach while prior wait is in flight;
- focused deterministic regression reproducing the race;
- assertions that future output resumes after reattach;
- evidence that normal last-viewer stop behavior remains bounded;
- evidence that reattach does not create duplicate concurrent loops/waiters/events;
- relevant Console docs only if behavior needs clarification.

## Out of Scope

- changes under root `src/` or public MCP tools/schemas;
- redesigning #62 history/event model;
- changing MCP cursor lease/history semantics;
- persistence, auth, lifecycle or Terminal work;
- Context Transfer behavior (#84 is already complete);
- generalized observer refactor unrelated to the reproduced race.

## Architecture Invariants

- Web Console remains an upper layer; public MCP stays exactly seven tools.
- one Channel has at most one Console observation loop at a time.
- waits remain finite and existing waiter/resource bounds remain intact.
- last-viewer detach can stop observation; new-viewer attach can safely re-arm it.
- no terminal output is interpreted as Agent/Task state.
- no endpoint is created/restarted/destroyed as recovery.

## Implementation Requirements

1. Add a focused regression that deterministically reaches: active viewer → in-flight wait → last viewer detach → new viewer reattach before wait settles → old wait settles → later output/event. It must fail on accepted base and pass on Candidate.
2. The fix must be minimal and local to Console observer/viewer state; no `src/` changes.
3. Reattach must leave the Channel in an observing state when at least one viewer exists.
4. The old/stale loop settling must not permanently stop a newly re-armed viewer.
5. Do not spawn duplicate loops. Add instrumentation/test assertions sufficient to prove a single logical loop/wait path for the Channel during the race, or otherwise prove no duplicate event/output delivery and no waiter multiplication.
6. Preserve accepted last-viewer teardown behavior and bounded wait timeout/cancellation semantics.
7. Run Console unit/typecheck and existing Console/true-browser regression suites justified by this change; public discovery/static boundary must remain green.

## Claims / Verification

```text
C1: focused regression fails on base and passes on Candidate.
C2: reattached viewer receives output produced after the race window; it is not stranded after its snapshot.
C3: reattach does not create duplicate concurrent observer loops/waiters or duplicate output/event delivery.
C4: last-viewer detach still stops observation within existing bounded behavior.
C5: existing observation degradation/cursor-error behavior remains unchanged.
C6: no root src/ or public MCP surface change; discovery remains exactly seven tools.
C7: exact Candidate SHA push + pull_request GitHub Actions are green.
```

## Security / Reliability Review

```text
Security-sensitive: indirectly (terminal observations may contain sensitive data)
Primary reliability risk: leaked/duplicate observers and waiters, or false live state with no future output
Remote ingress affected: no
MCP public contract affected: no
```

Do not log/persist additional terminal payloads merely to test the race.

## Success Criteria

1. SC1: deterministic detach/reattach-during-in-flight-wait regression is red on base and green on Candidate.
2. SC2: after reattach and old wait settlement, subsequent output reaches the viewer/history.
3. SC3: no duplicate observer loop/waiter/event delivery is introduced.
4. SC4: existing last-viewer bounded stop semantics still pass.
5. SC5: Console unit/typecheck and relevant integration/E2E regressions pass.
6. SC6: no `src/` changes; public MCP remains exactly seven tools.
7. SC7: exact-SHA push and PR Actions are fully green.

Do not lower these criteria after results are observed.

## Failure / Blocked Rules

FAIL if the solution merely hides the race with sleeps/test ordering, creates duplicate loops, removes bounded teardown, or changes the MCP product contract.

BLOCKED if the race cannot be reproduced deterministically enough to prove fail→pass, or if fixing it requires a contract/architecture change outside this Task. Return to Coordinator rather than broadening scope.

## Evidence Contract

```text
Attempt: 1
Worker identity: coordinator-authorized-devin
Base SHA: fb744a45a87634dfccc7be858a4d8566ad034cda or later main containing #84
Candidate SHA: required
PR / branch: required
Focused base fail + Candidate pass: required
GitHub Actions: exact Candidate push + PR results required
Claims C1-C7: explicit PASS/FAIL
Known limitations: explicit
```

## Completion Protocol

```text
Coordinator/Publisher → status:ready
arm-r / coordinator-authorized Devin → claim → Attempt 1 → branch/PR → evidence
→ [EXECUTION REPORT] | [BLOCKER REPORT]
→ status:review | status:blocked → owner:none → STOP
current ChatGPT Coordinator → ACCEPT | REVISE | BLOCK | SPLIT | NOT_PLANNED
```

Only Final Acceptance may close #87.
