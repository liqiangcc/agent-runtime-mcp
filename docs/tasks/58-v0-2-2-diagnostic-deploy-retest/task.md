# Task 58 — v0.2.2 diagnostic deployment and external latency retest

## Metadata

```text
GitHub Issue: #58
Task ID: 58-v0-2-2-diagnostic-deploy-retest
Task kind: reversible production deployment + temporary opt-in diagnostics + Coordinator external probe rendezvous + cleanup
Base commit: 87e601d5dd6e890d00809be8fd66f3c1f887cdee
Release: v0.2.2
Release archive SHA-256: ea418353392588bcc8c9ecbc229763cc8b7757cad64e79ecffaae7428cbc5db6
Rollback release: v0.2.1
Rollback archive SHA-256: ee60aad9f842915b142eca0c461e7050d048a3fc3953097a99e003cd2f56d2e0
Session bootstrap: docs/tasks/58-v0-2-2-diagnostic-deploy-retest/prompt.md
Preferred worker: coordinator-authorized-codex-a
Environment: env:codex
Hard dependencies: Issues #48, #50, #56 Final Acceptance; formal v0.2.1 rollback + v0.2.2 release assets
```

Live Task state belongs in Issue #58 and append-only comments.

## Goal

Reversibly move the production bridge from formal v0.2.1 to formal v0.2.2, temporarily enable the accepted phase diagnostics, perform serialized external ChatGPT connector probes against a safe generated tmux fixture, correlate external wall time with server phases, then disable diagnostics and leave production healthy on v0.2.2 default-off.

The diagnostic objective is to classify the dominant unexplained latency from Issue #48 into one of these supported boundaries:

```text
external invocation start -> server method_start     = before Tool callback entry
method_start -> method_end                            = server Tool callback / product handling
read backend_start -> backend_end                     = selected read action
method_end -> external invocation return              = after Tool callback completion
```

This Task does not claim it can uniquely separate ChatGPT tool-host scheduling, connector transport, tunnel queueing and bridge forwarding when current bridge identities cannot be joined to the MCP request identity.

## Frozen prior evidence

Issue #48 established:

- direct tmux, production-equivalent TmuxBackend and isolated stdio MCP reads all had local maxima below 50 ms for comparable workloads;
- production v0.2.1 external small read was ~111.327 s, large read ~71.309 s and health ~44.997 s;
- read `captured_at` occurred ~107.146 s / 68.525 s after external invocation start;
- current bridge logs do not provide a proven method-specific request-id chain.

Issue #50 implemented default-off `AGENT_RUNTIME_MCP_PHASE_DIAGNOSTICS=1` evidence:

- all seven Tools: `method_start` / `method_end`;
- `read_channel`: `backend_start` / `backend_end` around the actual read action;
- `backend_end` occurs before result/error shaping and JSON serialization;
- `method_end` is handler completion only, not stdio write/drain or remote receipt;
- records are bounded/whitelisted/stderr-only and exclude sensitive content/raw IDs.

Issue #56 formally published v0.2.2 from `87e601d5dd6e890d00809be8fd66f3c1f887cdee` with archive digest `ea418353392588bcc8c9ecbc229763cc8b7757cad64e79ecffaae7428cbc5db6`.

## Fresh read-only host inventory carried into the gate

At Task preparation time:

- `agent-runtime-mcp-tunnel.service` was active/running and enabled;
- current WorkingDirectory and profile MCP command pointed to `/root/agent-runtime-mcp-runtime/agent-runtime-mcp-v0.2.1`;
- bridge `/healthz` was live and `/readyz` ready;
- `AGENT_RUNTIME_MCP_PHASE_DIAGNOSTICS` was absent from unit/profile and the current MCP child did not have value `1`;
- v0.2.1 runtime and local formal archive/checksum existed and checksum verified to `ee60aad9f842915b142eca0c461e7050d048a3fc3953097a99e003cd2f56d2e0`;
- v0.2.2 runtime/local release dir did not yet exist;
- service cgroup contained tunnel-client/node/codex processes but no tmux executable;
- 12 existing tmux panes were present; a fresh pre-cutover canonical identity capture is still required at execution time;
- `/root/agent-runtime-mcp-runtime` had ~2.65 GB available, enough for another versioned runtime but overall filesystem usage was ~94%;
- existing `.pre-v0.2.1` backups were present; new `.pre-v0.2.2` backups do not yet exist.

This inventory is preparation evidence only. Worker must re-check live state immediately before mutation.

## Separation points

```text
formal release asset | staged runtime | selected production runtime
```

Only formal GitHub Release assets may be staged.

```text
v0.2.2 runtime deployment | temporary diagnostic enablement
```

The runtime path and one explicit diagnostics environment setting are separate reviewed changes. Final steady state after the Task is v0.2.2 with diagnostics disabled.

```text
pre-existing application panes | temporary diagnostic fixture
```

All pre-existing panes are immutable deployment evidence. This Task may create/delete exactly one dedicated safe fixture session owned by this Task; it must never write/control d/j/i or other existing application panes.

```text
server phase timing | external connector timing | bridge identity
```

Server phases are authoritative for server-local intervals. Coordinator external wall time is authoritative for observed call duration. Existing tunnel request IDs are not assumed to equal MCP JSON-RPC IDs.

```text
diagnostic evidence | product performance fix
```

This Task only localizes latency. It does not change product performance code.

## Allowed production changes

Before first restart, create protected backups:

```text
/etc/systemd/system/agent-runtime-mcp-tunnel.service.pre-v0.2.2
/root/.config/tunnel-client/agent-runtime-mcp.yaml.pre-v0.2.2
```

Preserve ownership/mode; profile backup must remain mode 600.

The diagnostic cutover may change exactly:

1. systemd unit `WorkingDirectory`: v0.2.1 runtime path -> v0.2.2 runtime path;
2. profile MCP command server path: v0.2.1 -> v0.2.2;
3. add one systemd service environment setting:

```text
Environment=AGENT_RUNTIME_MCP_PHASE_DIAGNOSTICS=1
```

No tunnel endpoint, credential, port, allowlist, tmux backend configuration or other environment value may change.

After probes, diagnostic cleanup must remove only that exact Environment setting, keep both v0.2.2 runtime paths, daemon-reload/restart once, and prove the new MCP child no longer has the opt-in.

## Rollback boundary

Current formal v0.2.1 runtime + verified release archive/checksum are the rollback source.

If forward deployment or mandatory post-cutover gates fail before diagnostic-ready state, restore `.pre-v0.2.2` unit/profile, daemon-reload/restart once, verify v0.2.1/live/ready/pre-existing tmux identities, report rollback, and stop. Do not automatically attempt v0.2.2 again.

If the diagnostic probe itself reproduces latency but production remains healthy, that is evidence, not a rollback trigger. After evidence capture, disable diagnostics and leave healthy v0.2.2 default-off.

If disabling diagnostics fails to restore a healthy default-off v0.2.2 steady state, perform the frozen v0.2.1 rollback once and stop.

## Temporary safe diagnostic fixture

After recording all pre-existing pane identities, the worker may create exactly one temporary default-tmux session with a unique Task-owned name such as:

```text
agent-runtime-mcp-diag-v022-<unique-suffix>
```

Requirements:

- generated content only, no application/user data;
- at least 800 lines and ~48 KiB total to support the Issue #48 comparable request class;
- output becomes stable and then the session stays alive long enough for Coordinator probes;
- worker records its exact public `channel_id` after v0.2.2 cutover;
- it is excluded from the pre-existing pane identity equality requirement;
- worker deletes only this Task-owned fixture during cleanup.

No production d/j/i/a/etc pane content is used as the benchmark fixture.

## Execution phase A — asset and pre-cutover gate

Before any service/config mutation:

1. re-read Issues #48/#50/#56/#58 and frozen Task;
2. verify formal v0.2.2 Release is public/non-prerelease and archive digest matches frozen value;
3. verify local formal v0.2.1 rollback archive/checksum still match frozen digest;
4. download v0.2.2 archive/checksum into `/root/agent-runtime-mcp-runtime/releases/v0.2.2/` only if absent; verify exact two assets + checksum;
5. stage `/root/agent-runtime-mcp-runtime/agent-runtime-mcp-v0.2.2` beside v0.2.1, install `npm ci --omit=dev --ignore-scripts`, verify packaged runtime 0.2.2 + exactly seven Tools;
6. verify service active/enabled, current paths still v0.2.1, health live/ready and diagnostic flag absent;
7. verify server host time synchronization status and record it; if wall-clock synchronization is not trustworthy, report that external-to-server phase decomposition will be degraded;
8. capture deterministic sorted full pre-existing tmux identity tuples and digest;
9. verify service cgroup contains no tmux server/application process;
10. create the single safe fixture and verify its generated shape;
11. create `.pre-v0.2.2` backups and verify allowed future diff before mutation.

## Execution phase B — diagnostic cutover

Apply only the three allowed changes and execute one bounded:

```text
systemctl daemon-reload
systemctl restart agent-runtime-mcp-tunnel.service
```

Post-cutover gates:

- service active/running/enabled;
- WorkingDirectory and MCP child script are v0.2.2;
- healthz live / readyz ready;
- MCP child environment contains exact diagnostics opt-in = 1, without outputting other environment entries;
- cgroup still has no tmux server/application process;
- all pre-existing tmux identity tuples still exist unchanged;
- safe fixture remains alive/visible;
- isolated/local staged runtime verification remains seven Tools/version 0.2.2.

If these pass, post durable Issue comment:

```text
[DIAGNOSTIC READY]
```

including only:

- production runtime version/path identity;
- diagnostics enabled=yes;
- service health/readiness;
- pre-existing pane identity count/digest;
- safe fixture public `channel_id` and generated safe shape;
- server time synchronization status;
- statement that no d/j/i/application mutation occurred.

Remain `status:in-progress / owner:coordinator-authorized-codex-a`. Stop at the terminal prompt and wait for Coordinator probes. Do not self-complete.

## Execution phase C — Coordinator external probes

Coordinator owns these calls through the actual ChatGPT connector. Do not substitute a local client.

Use the exact safe fixture `channel_id` from `[DIAGNOSTIC READY]` and perform sequentially, with no unrelated agent-runtime MCP calls inside each timing window:

1. `health`;
2. `read_channel(lines=20, bytes=4096)`;
3. `read_channel(lines=650, bytes=45000)`.

For each call Coordinator records external wall-time start/end and outcome. For reads record returned `captured_at`, `line_count`, `byte_count`, `truncated`; do not persist returned fixture text because its content is irrelevant.

Calls are intentionally serialized. If a call errors/times out, record that outcome and continue only if the connector/service remains usable.

After all three calls, Coordinator sends the probe timing summary back to the existing worker session. That coordination write is not part of the probe windows.

## Execution phase D — phase extraction and localization

Worker reads only bounded journal windows covering the probes. Parse only accepted `agent-runtime-mcp.phase.v1` diagnostic JSON fields; do not reproduce unrelated raw journal bodies.

Identify probe records using:

- method;
- read `requested_lines` / `requested_bytes` shape;
- Coordinator probe wall-time window;
- phase order/correlation_id.

Do not invent an identity join. If multiple candidates are ambiguous, mark matching as `unknown`.

For each uniquely matched probe report:

- `method_start.wall_time_utc`;
- `method_start -> method_end` elapsed;
- for reads, `backend_start -> backend_end` elapsed;
- external elapsed wall time;
- approximate external-start -> method_start interval;
- approximate method_end -> external-return interval;
- safe outcome/read-shape metadata only.

Cross-host wall-clock comparisons are approximate and depend on synchronized clocks; server-internal `elapsed_ms` is authoritative for handler/backend intervals.

Supported classifications:

```text
before-handler dominant
server-handler dominant
post-handler dominant
mixed
insufficient/ambiguous evidence
```

Do not claim which external subcomponent is responsible unless independently proven.

Existing tunnel logs may be summarized for broad events in the same window, but tunnel `request_id/cmd_request_id/rpc_request_id` must remain unjoined/unknown unless a proven identity mapping emerges. Never output credentials/URLs/raw request IDs.

## Execution phase E — mandatory diagnostic disable and cleanup

After phase extraction, regardless of localization result:

1. remove only `Environment=AGENT_RUNTIME_MCP_PHASE_DIAGNOSTICS=1` from the production unit;
2. keep v0.2.2 WorkingDirectory/profile command paths;
3. daemon-reload/restart once;
4. prove service active/live/ready and child runtime path v0.2.2;
5. prove child diagnostic opt-in is absent;
6. delete only the Task-owned fixture session;
7. repeat the exact canonical pre-existing tmux identity capture and require equality of all pre-existing tuples/digest;
8. verify cgroup still has no tmux server/application process;
9. preserve v0.2.1 runtime/assets and `.pre-v0.2.2` rollback backups.

Final steady state on success:

```text
production runtime = v0.2.2
diagnostics = disabled
service = active/live/ready
pre-existing tmux identities = unchanged
```

## In scope

- formal asset verification/staging;
- protected backups;
- two reviewed version path changes;
- temporary exact diagnostics environment opt-in;
- at most two normal forward restarts: enable/cutover, then disable diagnostics;
- one Task-owned safe tmux fixture create/delete;
- Coordinator actual external health/small-read/large-read probe;
- bounded phase-record extraction/classification;
- rollback once if required by frozen gates.

## Out of scope

- product/source/test/workflow changes;
- modifying phase diagnostic schema/security rules;
- permanent diagnostics enablement;
- tunnel credential/endpoint/auth/port changes;
- bridge code/instrumentation changes;
- raw journal export;
- production application pane benchmarks;
- d/j/i write/control;
- stopping/restarting/destroying existing tmux sessions/panes;
- claiming a latency fix;
- repeated automatic forward retries after rollback.

## Success criteria

1. `SC1`: v0.2.1 rollback and v0.2.2 formal assets are verified against accepted digests before mutation; staged v0.2.2 passes clean install + seven-tool/version verification.
2. `SC2`: fresh pre-cutover service/health/cgroup/tmux evidence passes; protected `.pre-v0.2.2` backups exist before edits.
3. `SC3`: diagnostic cutover changes only the two version paths + exact diagnostics flag; service becomes v0.2.2 active/live/ready, flag reaches MCP child and all pre-existing panes survive.
4. `SC4`: Coordinator actual connector executes serialized health, 20/4096 read and 650/45000 read against the safe fixture, with external timing recorded.
5. `SC5`: server phase records for the controlled calls are extracted without sensitive data; each probe is classified at the supported boundary or explicitly `insufficient/ambiguous`.
6. `SC6`: diagnostics are disabled after evidence collection; final v0.2.2 service is active/live/ready with flag absent.
7. `SC7`: Task-owned fixture is deleted; all pre-existing tmux identity tuples remain unchanged; v0.2.1 rollback runtime/assets/backups remain available.
8. `SC8`: no d/j/i/application write/control/lifecycle mutation and no product/tunnel code/config expansion occurs.

## Failure / blocked rules

BLOCK before mutation if formal asset identity/rollback material/service baseline/tmux isolation cannot be established or if authorized config diff would exceed this Contract.

ROLLBACK once to v0.2.1 if forward cutover mandatory gates fail or final diagnostic-disable steady state cannot be made healthy. Preserve evidence and stop; do not auto-forward again.

If external probes/phase matching are unavailable or ambiguous while the v0.2.2 service itself is healthy, still perform mandatory diagnostic disable/cleanup and report degraded diagnostic outcome rather than inventing a root cause.

## Evidence contract

Persist to Issue #58 only bounded safe evidence: formal digests, runtime paths/version, service states, exact pre/post pane identity digest/count, safe fixture identifier/shape, Coordinator external elapsed timings, accepted phase names/timestamps/elapsed/read shapes/outcomes, classification, restart/rollback outcome and diagnostics final-off proof.

Do not persist terminal fixture text, production pane output, raw journal bodies, raw request IDs/fingerprints unless needed for local grouping (prefer omit from durable report), cursors/tokens, credentials, tunnel URLs, full environments or unrelated application data.
