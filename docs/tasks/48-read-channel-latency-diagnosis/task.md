# Task 48 — read_channel end-to-end latency diagnosis

## Metadata

```text
GitHub Issue: #48
Task ID: 48-read-channel-latency-diagnosis
Task kind: read-only performance diagnosis
Base commit: 71026792b46c1606ab7d8c0f377796547ba6ba74
Candidate commit: n/a
Production release: v0.2.1
Session bootstrap: docs/tasks/48-read-channel-latency-diagnosis/prompt.md
Preferred worker: coordinator-authorized-codex-a
Environment: env:codex
Handoff profile: docs/tasks/handoffs/codex.md
Required capabilities: github-read-write-issue-state, linux-read-only-profiling, isolated-tmux, local-stdio-mcp-client, bounded-service-log-read
Hard dependencies: Issue #46 Final Acceptance; healthy v0.2.1 production bridge; Issue #38 incident evidence
```

Live Task state belongs in Issue #48 and append-only comments.

## Goal

Determine where `read_channel` latency is spent by building a layered timing model from tmux capture through backend/service execution, local stdio MCP request/response, bridge-visible correlation, and Coordinator-owned external connector timing. Do not assume the historical roughly 110-second observation is a product-server defect until the evidence localizes it.

Attempt 1 is diagnostic only. It may produce measurements and a durable report; it must not change product code, deployment configuration, production service state, tmux application state, public MCP semantics, or logging behavior.

## Incident anchor

Issue #38 recorded one real external ChatGPT MCP call after an observation wait:

```text
request: read_channel(lines=650, bytes=45000)
result: success
returned line_count: 650
returned byte_count: 20370
truncated: true
captured_at: 2026-09-10T16:32:36.577Z
observed external end-to-end call duration: approximately 110 seconds
```

The incident did not capture method-level server start/end, backend command timing, queue/lock timing, transport timing, or host wait correlation. Therefore it is authoritative evidence that a slow external call occurred, but not evidence identifying the layer responsible.

v0.2.1 fixed the separate sustained-cursor continuity bug. Issue #46 subsequently deployed v0.2.1 and externally verified wait continuation for about 130 seconds without the old capacity-driven GAP. This latency Task must not reopen or redesign that completed behavior.

## Primary Use Case

```text
Actor: diagnostic worker using existing tmux a only as executor
Trigger: Coordinator Publication Gate for Issue #48
Preconditions:
- production remains healthy on v0.2.1;
- diagnostic commands can use a disposable isolated tmux socket/session;
- no product/deployment mutation is required for baseline measurements.
Main flow:
1. establish exact runtime/host/tmux versions and current production release identity without secrets;
2. create an isolated disposable tmux endpoint with deterministic small and large output fixtures;
3. measure direct tmux capture/read command latency for both payload classes;
4. measure direct `TmuxBackend.readChannel` or equivalent backend-layer latency against the same fixture;
5. measure isolated stdio MCP client -> `read_channel` request/response latency against the same fixture;
6. inspect existing bridge/service logs and process topology for request/response or queue correlation, without changing logging;
7. compare the layers and identify the narrowest supported conclusion;
8. return a diagnostic report and stop for Coordinator external-connector timing/correlation.
Success outcome:
- timings and payload sizes are tied to explicit layers and exact environment;
- the report either localizes the dominant delay or precisely states which boundary remains unobservable and what minimal instrumentation would be required.
Failure outcome:
- inability to create isolated fixtures, invoke local backend/stdio path, or read bounded existing logs is reported as BLOCKED without changing production.
Degraded outcome:
- local layers may be demonstrably fast while external connector time remains unexplained; that is a valid diagnostic result and should lead to a separate instrumentation/connector investigation rather than a speculative server fix.
```

## Separation Points

```text
tmux capture latency | TmuxBackend/read_channel logic
```

Measure the underlying tmux operation separately from product wrapper overhead.

```text
server/backend execution | stdio MCP request/response
```

Local MCP client timing includes SDK/serialization/stdio but excludes the production tunnel and external host.

```text
local bridge evidence | external connector end-to-end time
```

A locally fast server does not prove the external path is fast; an externally slow call does not prove the server is slow. Coordinator owns the final external tool timing.

```text
measurement | instrumentation
```

Attempt 1 may inspect existing logs only. Adding timestamps, request IDs, tracing or other instrumentation is a code/deployment change and requires a new reviewed Task if the baseline evidence is insufficient.

```text
payload volume | semantic completion
```

This Task measures bounded `read_channel`; it does not infer application completion and does not alter observation/wait behavior.

## Single Responsibilities

```text
tmux CLI probe            = underlying capture/process timing
TmuxBackend direct probe  = backend identity + capture + bounded transformation timing
isolated stdio MCP client = SDK/serialization/stdio request-response timing
existing bridge/logs      = currently available production correlation only
worker                     = local/host measurements and evidence report
Coordinator                = external connector wall-time probe and final diagnosis decision
```

## Canonical / Process Sources

Read before execution:

- `AGENTS.md`
- `docs/tasks/README.md`
- `docs/tasks/planning-principles.md`
- `docs/tasks/collaboration-protocol.md`
- `docs/tasks/issue-state-convention.md`
- `docs/tasks/issue-lifecycle-protocol.md`
- `docs/channel-architecture.md`
- `docs/channel-model.md`
- `docs/mcp-contract.md`
- `docs/backends/tmux.md`
- `docs/deployment.md`
- `docs/security.md`
- `docs/tasks/38-bounded-cursor-continuity/task.md`
- `docs/tasks/46-v0-2-1-production-cutover/task.md`
- live Issues #38, #46 and #48

## In Scope

- exact environment identity: production release/path, Node version, tmux version, relevant fixed read bounds;
- isolated tmux fixture generation outside production application sessions;
- repeated direct tmux capture timing;
- repeated direct backend-layer read timing;
- repeated isolated stdio MCP `read_channel` timing;
- small and large payload classes, including a large class comparable to the historical `650 lines / 45 KiB request limit` case;
- payload/result byte and line counts, truncation state and wall/monotonic timing;
- bounded read-only inspection of current service/tunnel logs and process topology for method/queue/forward/response timestamps;
- comparison table/distribution summary (minimum, median, maximum or individual bounded sample list);
- a concrete statement of which latency layers are ruled in, ruled out, or still unknown;
- if necessary, a minimal proposed instrumentation boundary for a separate follow-up Task.

## Out of Scope

- product code changes, logging/instrumentation changes or new tracing;
- deployment/service/profile changes or restart;
- tunnel/network/provider/auth changes;
- observation/history/token changes;
- application completion detection, polling or automatic retry;
- writes or controls to production d/j/i;
- reading/persisting production pane contents for benchmarking;
- using production application panes as the generated benchmark fixture;
- claiming a universal performance SLA from one host;
- fixing any diagnosed cause in this Attempt.

## Measurement Requirements

1. Confirm Issue #48 is `status:ready / owner:none`, claim exactly one Attempt, then read back ownership before diagnostics.
2. Record exact main/release identity, production runtime path, Node version and tmux version. Do not output credentials, tunnel URLs or full environments.
3. Create a unique isolated tmux socket/session for the fixture; clean it up in `finally`/equivalent even on failure.
4. Prepare two deterministic payload classes:
   - small: enough output to exercise normal bounded read without truncation;
   - large: at least 650 lines and enough content to exercise a `lines=650, bytes=45000` request shape. Exact fixture bytes must be reported, but fixture text itself need not be persisted.
5. For each payload class, run at least 5 bounded direct tmux capture/read measurements using a monotonic or high-resolution timer. Report individual or min/median/max wall times and output size.
6. Against the same isolated endpoint and bounds, run at least 5 direct backend-layer `readChannel` measurements. Include identity/capture work actually used by production code; do not replace it with an unrelated parser microbenchmark.
7. Against the same endpoint, run at least 5 isolated stdio MCP client `read_channel` measurements using the built v0.2.1-equivalent/current-main server. Confirm returned line/byte/truncation metadata matches expectations.
8. Avoid concurrent benchmark runs that would create artificial CPU/subprocess contention unless concurrency is intentionally measured and clearly labeled.
9. Inspect current `agent-runtime-mcp-tunnel.service`/tunnel-client logs only within a bounded recent window. Determine whether logs contain method-level request start, backend start/end, response completion, queue/lock timing or a request correlation ID. Do not change log level or restart service.
10. Inspect service cgroup/process topology read-only to identify the bridge/MCP process chain relevant to latency. Do not inspect full process environments.
11. If existing production logs cannot correlate an external `read_channel` request through response, state that explicitly; do not infer hidden timing.
12. Do not run generated benchmark output inside production d/j/i/a application panes. The worker executor a is only the command shell; fixture traffic stays on the isolated socket/session.
13. Produce an `[EXECUTION REPORT]` with exact commands/probe descriptions, layer timing results, payload sizes, conclusions and limitations. Return Issue to `status:review / owner:none` and stop.

## Coordinator external probe after worker report

Coordinator will independently exercise the actual external ChatGPT connector on v0.2.1 with bounded `read_channel` calls and measure wall time around the tool invocation. Prefer one small and one larger safe read target; do not persist unnecessary pane正文. Correlate those observations with worker local-layer results and any available bridge timestamps.

If the external call is slow while direct tmux/backend/stdio are fast and existing logs lack response correlation, Final Review should choose SPLIT/BLOCK for minimal instrumentation or external connector diagnosis rather than changing `read_channel` logic speculatively.

## Claims / Verification

```text
C1: direct tmux capture latency is measured independently for small and large bounded reads.
C2: production-equivalent backend-layer read latency is measured independently on the same fixture.
C3: isolated stdio MCP read_channel latency is measured independently on the same fixture.
C4: returned size/line/truncation metadata is recorded so timing comparisons use comparable work.
C5: existing bridge/service observability is explicitly characterized; unavailable correlation is reported as unknown, not inferred.
C6: production is not mutated and production application panes are not used as benchmark fixtures.
C7: the report identifies the narrowest evidence-supported latency conclusion and, if needed, the exact missing instrumentation boundary.
```

## Success Criteria

1. `SC1`: small and large isolated fixture measurements exist for tmux CLI, backend direct and stdio MCP layers with at least 5 samples each.
2. `SC2`: large-class request is comparable to the historical 650-line / 45-KiB bound and result size/truncation metadata is reported.
3. `SC3`: exact environment/runtime context and timing method are recorded.
4. `SC4`: existing production bridge/log correlation capability is established without configuration changes.
5. `SC5`: no product/deployment/tmux-application mutation occurs; d/j/i receive no write/control.
6. `SC6`: report distinguishes proven fast/slow layers from unknown layers and does not attribute the 110-second incident beyond evidence.
7. `SC7`: if evidence is insufficient, the proposed next instrumentation is minimal and separate, not implemented in this Attempt.

## Failure / Blocked Rules

BLOCK if isolated tmux cannot be created, production-equivalent backend/stdio path cannot be invoked, required environment identity cannot be established, or diagnostics would require secrets/production mutation. Do not lower sample counts silently or benchmark production application panes to bypass a blocker.

A result of `local layers fast; external boundary unobservable` is not a failed Task if supported by evidence. It is a valid diagnosis requiring a Coordinator decision about the next instrumentation/external-connector Task.

## Publication Dependency / Alignment Gate

Before `status:ready`, Coordinator must confirm:

- #46 remains completed and production v0.2.1 is healthy;
- this Task package is merged into canonical main;
- existing a remains the authorized executor;
- isolated tmux and local Node/npm tooling are available;
- no existing Issue already owns the same read latency diagnosis.

No production instrumentation or restart is authorized by Publication Gate for this Task.

## Evidence Contract

Record:

- exact release/main/Node/tmux identity;
- probe layer and timing method;
- sample counts and individual or min/median/max times;
- fixture byte/line sizes and returned bounded metadata;
- existing log/correlation fields available or absent;
- process-chain identities without environment secrets;
- narrowest supported conclusion and unverified boundary;
- explicit confirmation of no production mutation and no d/j/i write/control.

Do not persist generated fixture正文 unless necessary, production pane output, tunnel URLs, credentials/tokens, full process environments, or unrelated application logs.
