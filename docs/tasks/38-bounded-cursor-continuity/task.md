# Task — bounded cursor continuity across sustained activity

## Metadata

```text
GitHub Issue: #38
Task ID: 38-bounded-cursor-continuity
Task kind: combined
Base commit: 835704614f3d7f306eae623adeb0febfcf13c734
Candidate commit: n/a
Session bootstrap: docs/tasks/38-bounded-cursor-continuity/prompt.md
Preferred worker: web-gpt-worker
Environment: env:web-gpt
Handoff profile: docs/tasks/handoffs/web-gpt.md
Required capabilities: github-read-write, repository-code-authoring, github-actions-evidence, real-tmux-host-evidence
Hard dependencies: Coordinator acceptance of this v0.2.1 contract amendment; canonical-main alignment before implementation
```

Live Task state belongs in GitHub Issue #38 and its append-only comments.

## Goal

Preserve an unexpired observation cursor's unconsumed activity across the full fixed five-minute lease at the fixed 250 ms maximum sampling rate, using finite history and the existing four-megabyte retained-observer budget. A timeout must remain resumable with the original cursor; no application-completion meaning is added.

## Primary Use Case

```text
Actor: upper-layer Coordinator using an existing terminal Channel
Trigger: a write is followed by repeated bounded waits while the Channel is active
Preconditions:
  - get_channel(observe:true) issued a cursor before the write;
  - the caller retries timeout with the unchanged cursor;
  - the endpoint remains the same instance and within scope;
Main flow:
  1. activity continues long enough to cross the old 256-record ring;
  2. one or more waits return timeout and preserve the original cursor;
  3. activity stops before the cursor's five-minute expiry;
  4. the same cursor returns output_idle after the mechanical quiet interval;
  5. the upper layer may then call read_channel and interpret text itself.
Success outcome:
  - all activity within the valid lease is retained either as bounded records or a bounded contract-approved representation;
  - output_idle advances next_cursor only after post-cursor activity and quiet;
  - event count, bytes and eight-observer state remain under explicit limits.
Failure outcome:
  - cursor expiry, real continuity loss, identity/scope uncertainty or an exceeded resource limit remains an explicit error;
  - a cursor cannot be rebound to a fresh observer or pane.
Degraded outcome:
  - after the five-minute lease expires, past activity is not recoverable;
  - fresh observe after final output establishes a new baseline and may legitimately timeout;
  - snapshot_change remains best-effort and never claims byte-level silence or completion.
Authoritative evidence:
  - exact Candidate SHA and Actions evidence;
  - deterministic ring/lease/byte-budget tests;
  - Linux/tmux sustained-activity test crossing 256 records;
  - measured retained-state budget for eight observers.
```

## Separation Points

```text
upper-layer continuation policy | observation state
```

The upper layer decides when to wait again, read, interpret, or recover. The MCP preserves the mechanical cursor and does not retry writes or poll on the caller's behalf.

```text
bounded activity history | terminal output正文
```

The observer retains only bounded snapshot-change records (or the explicitly approved bounded summary). It never stores or returns complete terminal history and never interprets completion.

```text
cursor lease | observer lifetime
```

The five-minute cursor lease is not renewed by wait. The observer may live longer, but a post-expiry cursor cannot recover earlier activity. Fresh observe never fabricates an already-seen event.

```text
ring continuity | endpoint identity
```

History capacity prevents avoidable eviction during a valid lease. Identity, scope, sampler-gap and backend failures still invalidate observation and return explicit continuity/backend errors.

```text
execution Evidence | acceptance authority
```

Actions, deterministic harnesses and Linux/tmux runs provide evidence. The Coordinator decides whether the amended Contract is accepted; an idle result is not Task acceptance.

## Single Responsibilities

```text
ObservationManager = lease-bound cursor, bounded history and mechanical wait semantics
TmuxBackend        = identity, visibility and snapshot sampling
wait_channel_event = timeout/idle/continuity result; no writes or completion semantics
upper layer        = retry after timeout, read, interpretation and workflow control
GitHub Actions/host = executable verification evidence
Coordinator        = contract publication, review and acceptance
```

## Logic / Control Separation

Logic/data path owns:

- fixed-rate snapshot-change sampling;
- finite event count/byte bounds and eviction watermark;
- cursor validation, timeout preservation and TTL expiry;
- mechanical `output_idle`, `timeout`, `OBSERVATION_GAP` and `CURSOR_EXPIRED` behavior.

Control/orchestration owns:

- when to call observe, write, wait again or read;
- whether to recover after a true gap or expiry;
- application meaning, completion decisions and any mutation retry policy.

## Success / Failure / Degradation

Success proves only that a post-cursor snapshot change was observed and then remained quiet for `idle_ms`. It does not prove process completion, command success or absence of bytes between samples.

Hard failures are identity/scope uncertainty, sampler overrun, true history discontinuity, expired cursor and explicit resource limits. They must not be converted to `channel_closed` or `output_idle`.

Safe degradation is an explicit timeout or continuity error. Fresh observe after expiry/gap is allowed only as a new baseline; it cannot acknowledge prior activity.

No implementation may add application completion heuristics, automatic write replay, caller-transparent polling, or an unbounded event log.

## Required Capabilities

```text
full valid-lease continuity
→ bounded retention sized from lease × maximum sampling rate
→ ring/byte/state accounting and expiry semantics
→ wait continuation tests and Linux/tmux evidence
→ existing seven-tool MCP mapping unchanged
```

### Selected bounded-retention design

Coordinator decision for v0.2.1 is a capacity-derived history, not per-token aggregation:

```text
cursor lease:          300 s
maximum sample rate:   4 samples/s (250 ms fixed period)
maximum changes/lease:  1200
record capacity:       1536 records (28% count margin)
byte capacity:         256 KiB per observer (not 64 KiB)
observers:             8 global
ring payload ceiling:  8 × 256 KiB = 2 MiB
retained observer budget: 4 MiB total
```

The 1,200-event calculation is an upper bound: a fixed 250 ms cadence cannot produce more than four sample starts per second. The 336-record (28%) count margin covers the baseline/lease-edge boundary and measured scheduler jitter; a test must record monotonic sample-start deltas and fail if the sampler ever starts faster than 250 ms. Positive completion jitter can reduce coverage or trigger the existing >1,000 ms continuity-gap rule, but cannot legitimately increase the maximum event count. The implementation must test both lease-edge placements and injected callback jitter rather than treating `setInterval` timing as exact.

The byte figure is a logical serialized-payload accounting unit, not a claim about JavaScript heap usage. A sizing probe using the production event shape measured 125,275 JSON bytes for 1,536 worst-field records (76 bytes for one record), below the 256 KiB per-observer logical byte ceiling and 1,002,200 bytes for eight serialized rings. The logical budget is 2 MiB for eight ring payloads plus at most 2 MiB for observer/token/waiter metadata, timer objects and allocator/runtime overhead, for a 4 MiB retained-state ceiling. A deterministic `--expose-gc` heap probe must measure baseline-to-peak retained heap for eight observers at the maximum count/byte limits (with existing metadata and without unrelated workload) and prove the 4 MiB ceiling; JSON size alone is insufficient. `MAX_TOKENS` is not expanded by this Task. The implementation must enforce count and bytes independently; changing only `MAX_HISTORY` is insufficient.

If the measured eight-observer retained-state delta cannot stay below 4 MiB with these ceilings, implementation is blocked pending Coordinator choice of a bounded per-valid-cursor aggregate. Aggregation is not a license for unbounded token memory and must retain only first/last sequence/time (and an explicitly bounded count) until token expiry.

## Canonical / Process Sources

Read before implementation:

- `AGENTS.md`
- `docs/tasks/README.md`
- `docs/tasks/planning-principles.md`
- `docs/tasks/collaboration-protocol.md`
- `docs/tasks/issue-state-convention.md`
- `docs/tasks/issue-lifecycle-protocol.md`
- `docs/requirements.md`
- `docs/channel-architecture.md`
- `docs/channel-model.md`
- `docs/mcp-contract.md`
- `docs/backends/tmux.md`
- `docs/security.md`
- `docs/technology-stack.md`
- `docs/mvp-plan.md`
- live Issue #38 and all relevant comments

## Worker / Verification Route

The default route is a separate Web GPT Worker using `@GitHub`; GitHub Actions is the verification Runner. A Worker claims exactly one Attempt only after Publication Gate and executes this frozen Contract.

## In Scope

- amend the canonical observation contract for v0.2.1 continuity across the five-minute lease;
- implement/test capacity-derived count and byte ceilings if the budget proof passes;
- preserve timeout's input cursor, TTL expiry and true-gap errors;
- deterministic unit tests for >256 activity changes, timeout continuation, count/byte boundaries, eight-observer budget and fresh-observe-after-expiry;
- real Linux/tmux evidence crossing the former 256-record window;
- keep seven-tool discovery and `snapshot_change` semantics unchanged.

## Out of Scope

- application completion/success detection;
- automatic write retry or transparent active polling;
- exact byte-stream observation;
- increasing token capacity or changing token lease renewal;
- deployment/tunnel changes or d-session operations;
- attributing the Issue #38 read latency without method-level evidence (track separately if evidence becomes available).

## Architecture Invariants

- Channel remains the product domain object; Worker/Task/Issue semantics stay outside the MCP.
- `wait_channel_event` reports mechanical observation only.
- Existing endpoint lifecycle and tmux scope remain external/explicit.
- Cursors remain opaque, service/observer/scope/endpoint-generation bound and fail closed.
- `timeout` preserves the supplied cursor; `output_idle` advances only after activity and quiet.
- Expiry or a real continuity gap requires fresh observe; fresh observe cannot claim past activity.
- All history, captures, waiters and sampling state remain finite.

## Implementation Requirements

1. Derive and enforce the 1,536-record / 256 KiB per-observer history ceilings; enforce count and bytes independently.
2. Prove eight-observer retained state, including existing metadata and runtime overhead, remains below 4 MiB with a forced-GC heap measurement and no token-capacity expansion; do not substitute JSON/string size for heap evidence. If the proof fails, block for a separate Coordinator decision rather than switching designs in this Attempt.
3. Keep `evicted_through` boundary semantics (`c >= E` valid, `c < E` is `OBSERVATION_GAP`) and ensure valid cursors are not evicted solely by maximum-rate activity within their lease.
4. Preserve timeout/cancellation/expiry behavior and snapshot mechanical semantics.
5. Do not touch deployment configuration or the d endpoint.

## Claims / Verification

```text
C1: A valid pre-write cursor survives sustained snapshot changes crossing 256 records and can continue after timeout until activity stops within the five-minute lease.
C2: Count and byte ceilings are both enforced; 1,536 worst-field records fit under 256 KiB and eight observer rings fit within the 4 MiB retained-state budget with measured metadata overhead.
C3: After TTL expiry or a true continuity gap, the cursor fails explicitly and fresh observe cannot acknowledge past activity.
C4: Seven-tool discovery and snapshot_change mechanical semantics remain unchanged; no completion/write-retry/polling behavior is added.
```

## Success Criteria

1. `SC1`: deterministic tests generate more than 256 changes, perform multiple timeout continuations with the unchanged cursor, stop activity before TTL expiry, and obtain `output_idle` with an advancing `next_cursor`.
2. `SC2`: deterministic count/byte boundary and eight-observer memory tests pass under the stated 4 MiB budget; count-only expansion is rejected if bytes evict early.
3. `SC3`: expiry and genuine continuity-gap tests return explicit errors; fresh observe after final output returns timeout unless a later change occurs.
4. `SC4`: Linux/tmux evidence crosses the old 64-second/256-change window without touching production d/j/i sessions; existing seven-tool/discovery/security gates pass.
5. `SC5`: exact Candidate SHA is attached to all code-dependent evidence; no deployment is performed by this Task.

## Failure / Blocked Rules

FAIL if any valid-lease continuation reports a false idle, loses activity without an explicit gap, exceeds count/byte/state ceilings, or changes tool/identity semantics. BLOCKED if the 4 MiB budget cannot be proven, required Linux/tmux evidence is unavailable, or the contract conflicts with Coordinator direction. Resume only after a Coordinator decision; do not silently lower limits.

## Publication Dependency / Alignment Gate

Before Publication Gate, Coordinator must approve the v0.2.1 target and the capacity-derived ceilings above. Before implementation, the Worker must re-read live Issue #38 and canonical main at the accepted upstream SHA, confirm no contract change, and confirm Actions plus isolated Linux/tmux evidence are available. A fallback per-cursor aggregate requires a fresh contract review if selected.

## Evidence Contract

Record:

- exact Candidate SHA;
- deterministic test names/results for count, bytes, timeout continuation, expiry/gap and memory budget;
- measured maximum event bytes and eight-observer retained-state delta;
- real Linux/tmux run crossing 256 changes with isolated endpoints only;
- seven-tool discovery result and unchanged snapshot_change result shape;
- explicit read-latency limitation if no per-method correlation is available.

Do not persist terminal正文, credentials, tokens, complete URLs or unnecessary environment dumps.
