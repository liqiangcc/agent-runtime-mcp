# Task 50 — external MCP call phase correlation

## Metadata

```text
GitHub Issue: #50
Task ID: 50-external-call-phase-correlation
Task kind: implementation + isolated verification
Base commit: e57a169edc76469730abcd3ad7b4a9c68634ac56
Candidate commit: n/a
Session bootstrap: docs/tasks/50-external-call-phase-correlation/prompt.md
Preferred worker: coordinator-authorized-codex-a
Environment: env:codex
Handoff profile: docs/tasks/handoffs/codex.md
Required capabilities: github-read-write, repository-code-authoring, github-actions-evidence, isolated-stdio-mcp-verification
Hard dependencies: Issue #48 Final Acceptance; MCP SDK 2.0.0 handler-context/source audit; canonical main alignment before implementation
Deployment: explicitly out of scope
```

Live Task state belongs in GitHub Issue #50 and append-only comments.

## Goal

Implement minimal, bounded, default-off phase diagnostics that let a controlled external MCP call be aligned with server-side handler/backend timing without changing any public MCP Tool contract. The implementation must prove when a Tool callback entered, when its backend work started/ended where instrumented, and when the callback resolved/rejected. It must explicitly **not** claim that callback completion means the stdio response was written, forwarded by the tunnel, or received/consumed by ChatGPT.

This Task is for localization evidence, not a performance fix.

## Diagnostic finding carried from Issue #48

Issue #48 is finally accepted and closed. Its supported evidence is:

- direct tmux capture, production-equivalent `TmuxBackend.readChannel`, and isolated stdio `read_channel` all completed in milliseconds for small and 650-line/45-KiB-comparable workloads, with local maxima below 50 ms;
- production v0.2.1 external calls reproduced the slow class for both `read_channel` and payload-light `health`;
- external small read was approximately 111.327 s, large read approximately 71.309 s, and health approximately 44.997 s;
- read `captured_at` occurred approximately 107.146 s / 68.525 s after external invocation start, while post-capture return was only approximately 4.181 s / 2.784 s;
- therefore current evidence does not support a `read_channel`-specific backend/capture optimization or payload-size root cause;
- existing tunnel logs contain request-id-like events but no proven mapping from a specific external Tool call to one MCP method across ingress/dispatch/backend/response phases.

A later read-only correlation check in the relevant production time window found 23 `request_id` events, but no field mapped any ID to `method=read_channel`, no same-request multi-stage ingress→queue→forward→response chain existed, and the two known `captured_at` times could not be uniquely associated with a bridge request. Existing tunnel `request_id`, `cmd_request_id`, and `rpc_request_id` identities therefore remain **unproven** as equivalents of the MCP JSON-RPC request id.

## SDK / handler facts frozen by Coordinator audit

The repository currently uses `@modelcontextprotocol/server` 2.0.0 over stdio.

`registerTool` callbacks receive a `ServerContext` whose `ctx.mcpReq` exposes the protocol request context, including:

- `ctx.mcpReq.id: RequestId` — the MCP JSON-RPC request id;
- `ctx.mcpReq.method`;
- `ctx.mcpReq.signal`;
- request metadata/state fields defined by the SDK.

`requestInfo` is HTTP-specific and is not a reliable stdio identity source. The Tool callback does not receive the raw stdio transport.

The SDK request-dispatch path resolves the handler, encodes the result, and only then calls/awaits transport `send(response)`. The stdio transport's `send()` resolves after the local stdout write succeeds or its drain completes. The current Tool callback API exposes no response-written or peer-consumed hook.

Therefore the phase semantics in this Task are frozen as:

```text
method_start = Tool callback entered in product code
backend_start = selected product backend action about to be awaited
backend_end = selected product backend action settled
method_end = Tool callback result/error payload is ready and callback is about to resolve
```

`method_end` does **not** mean:

```text
SDK response encoding completed
stdio stdout write/drain completed
bridge received the response
connector posted the response
ChatGPT/tool host consumed the response
```

Any future write-completion/bridge phase requires separate instrumentation or an explicitly revised Contract.

## Primary Use Case

```text
Actor: Coordinator diagnosing one controlled external MCP Tool invocation
Preconditions:
- diagnostics are explicitly enabled for a diagnostic deployment;
- normal public Tool schemas/results remain unchanged;
- external calls are serialized or otherwise externally identifiable during the probe.
Main flow:
1. Tool callback receives the request and emits method_start metadata;
2. read_channel additionally emits backend_start immediately before its existing backend/handler read action;
3. read_channel emits backend_end when that action settles;
4. wrapper emits method_end immediately before the callback returns the normal MCP payload;
5. Coordinator aligns wall_time_utc with external invocation start/end and existing tunnel evidence;
6. later analysis decides whether unexplained time is before handler entry, inside backend/handler work, or after handler completion.
Success outcome:
- enabled diagnostics provide ordered, same-correlation phase metadata without terminal/application content;
- disabled diagnostics produce no new phase records and no Tool behavior change;
- evidence is precise about the furthest observable boundary.
Failure outcome:
- any secret/content leakage, stdout logging, public Tool change, unbounded logging, misleading response-completion claim, or semantic behavior change fails the Task.
Degraded outcome:
- if bridge identity still cannot be directly joined to server identity, product-side phase evidence remains valid but the cross-bridge mapping stays explicitly unresolved for a later bridge/deployment Task.
```

## Separation Points

```text
Tool semantics | diagnostic evidence
```

Diagnostics must be observational only. They may not alter Tool names, schemas, annotations, result/error payloads, timeout behavior, cursor semantics, backend limits, or endpoint lifecycle.

```text
server-internal correlation | cross-bridge correlation
```

Each Tool invocation needs one unique server-internal `correlation_id` shared by its phase records. Separately emit a deterministic, non-reversible `rpc_id_fingerprint` derived from the MCP JSON-RPC request id. The fingerprint exists so a future trusted bridge-side diagnostic can apply the same normalization/fingerprint algorithm if it can observe the protocol id. This Task does not assert that current tunnel IDs already match it.

```text
handler completion | stdio response write | remote receipt
```

This Task measures handler completion only. Do not name `method_end` as response-written, response-sent, response-posted, or remote-received evidence.

```text
product backend phase | TmuxBackend implementation
```

`read_channel` backend timing should be wrapped at the registration/handler orchestration boundary around the existing read action. Do not inject logging concerns into `TmuxBackend` or change the `ChannelBackend` public contract solely for diagnostics.

```text
stderr diagnostics | stdout MCP framing
```

Diagnostic output must never be written to stdout. Stdio MCP framing owns stdout.

```text
default runtime | explicitly enabled diagnosis
```

Phase diagnostics are disabled by default and require one explicit bounded opt-in. Normal production behavior must remain silent with respect to the new records until a later Deployment/Diagnostic Gate explicitly enables them.

## Single Responsibilities

```text
phase diagnostic module = enablement, safe IDs, field whitelist, structured record emission, monotonic/wall clocks
MCP registration wrapper = method_start/method_end around all public Tools
read_channel orchestration = backend_start/backend_end + bounded read-shape metadata
TmuxBackend = existing terminal mechanics only; no diagnostic policy ownership
server bootstrap = construct optional diagnostic sink from explicit environment setting
security docs/tests = define and enforce redaction/default-off boundary
Coordinator = review, deployment authorization, external probe and interpretation
```

## Frozen diagnostic interface

### Enablement

Use one explicit environment flag:

```text
AGENT_RUNTIME_MCP_PHASE_DIAGNOSTICS=1
```

Rules:

- absent, empty, or any value other than exact `1` means disabled;
- disabled is the default;
- no alternate implicit debug mode enables these records;
- this Task does not change deployment configuration to set the flag.

### Sink

When enabled, emit newline-delimited structured JSON to **stderr only**. Keep the implementation internally injectable/testable so unit/integration tests do not need to scrape unrelated process logs.

Each emitted record must be finite and field-whitelisted. Do not serialize arbitrary argument/result/error objects.

### Identity

For each Tool callback invocation:

- create a fresh unpredictable bounded `correlation_id` suitable only for server-local phase grouping; recommended representation is 96–128 bits encoded as fixed-length hex/base64url;
- derive `rpc_id_fingerprint` from a canonical type-tagged representation of `ctx.mcpReq.id` using SHA-256 and expose only a fixed-length prefix of the digest (at least 96 bits); never log the raw JSON-RPC id;
- use the same `correlation_id` and `rpc_id_fingerprint` on all phase records for that invocation;
- do not infer or copy tunnel `request_id`/`cmd_request_id` into these fields.

The Task must document that `rpc_id_fingerprint` is a matching aid, not guaranteed globally unique identity, especially when clients reuse numeric/string JSON-RPC IDs.

### Common phase record fields

The allowed common fields are:

```text
schema = fixed diagnostic schema version
phase = method_start | backend_start | backend_end | method_end
correlation_id
rpc_id_fingerprint
method = one of the seven public Tool names
wall_time_utc = UTC ISO-8601
elapsed_ms = finite non-negative process-monotonic duration from this method_start
outcome = success | error       # only where the phase has settled
error_code = bounded product error code allowlist, when safely available
```

No record may include:

```text
terminal text / pane capture
write_text text
raw channel output
raw cursor/token
raw JSON-RPC id
full Tool arguments
full Tool result/error payload
credential/auth header/tunnel URL
process environment
arbitrary exception message/stack
```

### Read-only shape metadata

For `read_channel` only, safe bounded shape fields may be added at the relevant phase:

```text
requested_lines
requested_bytes
returned_line_count
returned_byte_count
truncated
```

Do not emit `channel_id` unless separately justified by existing canonical logging policy; it is not required for this Task's success criteria.

### Event volume

Bound event count per Tool invocation:

- ordinary Tools including `health`: exactly one `method_start` plus one `method_end` when the callback reaches its normal completion/error conversion path;
- `read_channel`: additionally one `backend_start` plus one `backend_end` around the existing read action;
- no polling, heartbeats, progress spam, stack dumps, or per-line/per-byte logging.

## In Scope

- add a small internal phase-diagnostics module with default-off enablement, safe ID generation/fingerprinting, monotonic/wall timing and a structured stderr sink;
- allow `createMcpServer`/server bootstrap to use the diagnostics module without changing public MCP surface;
- wrap all seven public Tool callbacks with common `method_start` / `method_end` evidence;
- wrap only the existing `read_channel` read action with `backend_start` / `backend_end` evidence and safe request/result shape metadata;
- preserve `wait_channel_event` cancellation via `ctx.mcpReq.signal`;
- classify errors with an existing bounded product error code where safely available; otherwise use a generic bounded category without arbitrary message text;
- tests for default-off silence, enabled ordered phase records, same correlation across phases, safe fingerprint behavior, error path, stderr/stdout separation and unchanged Tool outputs;
- isolated stdio evidence for `health` and `read_channel` with diagnostics enabled;
- canonical security/diagnostic documentation sufficient to define enablement, safe fields and the handler-vs-response boundary;
- exact-Candidate CI/security/static/discovery/dogfood evidence.

## Out of Scope

- production deployment or enabling the flag in the live service;
- changes to tunnel-client/bridge/ChatGPT connector;
- proving or assuming current tunnel `request_id`, `cmd_request_id`, or `rpc_request_id` equals the MCP request id;
- transport monkey-patching, replacing the MCP SDK, wrapping `process.stdout`, or claiming remote response receipt;
- public MCP Tool/schema/result/error changes;
- changes to observation/history/token/read/write limits or timeout/cursor semantics;
- terminal application completion detection, retries or polling;
- logging terminal content, write payloads, raw cursor/token/IDs, full args/results/errors or credentials;
- TmuxBackend logging-policy changes;
- fixing the latency itself.

## Implementation Requirements

1. Re-read canonical main, live #48/#50, `AGENTS.md`, security/contract sources and installed SDK version/types before coding. If SDK/source facts differ materially from the frozen audit, BLOCK for Coordinator review.
2. Keep the default runtime identical when `AGENT_RUNTIME_MCP_PHASE_DIAGNOSTICS` is not exactly `1`.
3. Write diagnostic JSONL to stderr only. No diagnostic record may reach stdout or MCP result payloads.
4. Keep phase records schema/field-whitelisted and bounded; never stringify arbitrary Tool args/results/errors into the record.
5. Generate a fresh per-invocation server-local `correlation_id`; derive a stable truncated SHA-256 `rpc_id_fingerprint` from the type-tagged MCP request id without persisting the raw id.
6. Wrap all seven registered Tools through one common method-phase mechanism rather than seven divergent handwritten logging implementations.
7. `read_channel` adds backend phases at the orchestration boundary only; do not alter `ChannelBackend`/`TmuxBackend` solely to log phases.
8. `method_end` must be emitted at callback completion and be documented/tested as **handler completion only**. Do not label it stdio write completion.
9. Preserve normal error conversion (`toStructuredError`), Tool results and cancellation behavior. Diagnostic failures must not cause a Tool operation to fail; sink errors should fail safely/quietly according to a bounded internal policy and must not leak data.
10. Tests must prove disabled silence and enabled behavior through both direct/internal and isolated stdio paths. The isolated stdio test must verify MCP protocol stdout remains parseable while diagnostic records are emitted on stderr.
11. Security tests/evidence must include representative sensitive sentinel values in inputs/results and prove those values do not appear in diagnostic records.
12. No deployment, service restart, production config edit, or d/j/i operation in this Task.

## Claims / Verification

```text
C1: Diagnostics are default-off, explicit opt-in, bounded, structured and stderr-only.
C2: Every public Tool produces correctly paired method_start/method_end records when enabled without changing Tool semantics.
C3: read_channel additionally produces backend_start/backend_end around its existing backend/handler read action with safe shape metadata only.
C4: One invocation's phase records share a unique server-local correlation_id and stable non-raw rpc_id_fingerprint.
C5: Diagnostic records exclude terminal/write content, raw cursor/token/request IDs, credentials, full arguments/results and arbitrary errors.
C6: method_end is explicitly handler-completion evidence only; no code/docs claim stdio-write or remote-receipt completion.
C7: Existing seven-tool surface, observation/cursor behavior, limits, error conversion and cancellation remain unchanged.
C8: Exact-Candidate isolated stdio + CI/security/static evidence passes; no production deployment occurs.
```

## Success Criteria

1. `SC1`: with diagnostics disabled, existing tests/output behavior remain unchanged and no new phase JSONL is emitted.
2. `SC2`: with diagnostics enabled, isolated stdio `health` yields exactly ordered `method_start → method_end` for that invocation with the same correlation/fingerprint; stdout MCP call succeeds unchanged.
3. `SC3`: with diagnostics enabled, isolated stdio `read_channel` yields `method_start → backend_start → backend_end → method_end`, non-decreasing elapsed times, same correlation/fingerprint, and bounded read shape fields matching the Tool result.
4. `SC4`: success and error-path tests prove outcome/error categorization without arbitrary error text or sensitive sentinel leakage.
5. `SC5`: fingerprint tests prove raw request ids are not emitted and deterministic matching for the same type/value works; server-local correlation IDs remain fresh across invocations.
6. `SC6`: public discovery remains exactly seven Tools; representative Tool results/errors/cancellation behavior are unchanged.
7. `SC7`: docs/security text explicitly states default-off enablement and the handler-completion vs stdio-write/bridge/remote-receipt separation.
8. `SC8`: exact Candidate CI is fully successful; worker reports exact SHA/PR/test evidence and confirms no deployment/config/service/tmux mutation.

## Failure / Blocked Rules

FAIL if diagnostics alter Tool semantics, appear on stdout, log prohibited content/IDs/secrets, become enabled by default, are unbounded, break cancellation/error conversion, or overclaim response completion. BLOCK if the installed SDK no longer supplies the audited request context, if safe request-id fingerprinting cannot be implemented without exposing raw IDs, or if implementation would require transport/bridge changes outside this frozen Contract.

Do not lower the security boundary or add transport monkey-patching merely to make the evidence more complete. An explicit handler-to-transport observability gap is an acceptable known limitation.

## Canonical / Process Sources

Read before implementation:

- `AGENTS.md`
- `docs/tasks/README.md`
- `docs/tasks/planning-principles.md`
- `docs/tasks/collaboration-protocol.md`
- `docs/tasks/issue-state-convention.md`
- `docs/tasks/issue-lifecycle-protocol.md`
- `docs/security.md`
- `docs/requirements.md`
- `docs/mcp-contract.md`
- `docs/deployment.md`
- `src/mcp.ts`
- `src/server.ts`
- `src/handlers.ts`
- live Issues #48 and #50
- installed `@modelcontextprotocol/server` 2.0.0 callback/context and stdio transport source/types used by the implementation

## Worker / Verification Route

The explicitly authorized implementation route is `coordinator-authorized-codex-a` in `env:codex`. GitHub Actions is executable verification evidence. The worker claims exactly one Attempt only after Publication Gate, opens one implementation PR, records exact Candidate evidence, returns `status:review / owner:none`, and stops. Worker does not deploy, self-accept or close the Issue.

## Publication Dependency / Alignment Gate

Before `status:ready`, Coordinator must merge this Task package, re-read canonical main and live #50, confirm #48 remains accepted, confirm no duplicate active implementation, and verify the required SDK 2.0.0 context facts still hold. Publication Gate authorizes code/tests/docs only. It does not authorize enabling diagnostics in production or performing the external latency retest.

## Evidence Contract

Record:

- exact base, Candidate SHA, branch and PR;
- installed MCP SDK version and exact request-context boundary used;
- diagnostic enablement/default-off behavior;
- exact phase schemas emitted for controlled tests, with IDs redacted/fingerprinted rather than raw;
- disabled-silence and sensitive-sentinel negative evidence;
- isolated stdio `health` and `read_channel` ordered phase evidence;
- unchanged seven-tool discovery/results/cancellation/error behavior;
- exact GitHub Actions run/jobs;
- explicit limitation that `method_end` is handler completion and does not prove stdio write/bridge/connector receipt;
- explicit confirmation of no production deployment/config/restart/tmux application mutation.

Do not persist credentials, tunnel URLs, production terminal output, raw MCP request ids, raw opaque cursors/tokens, full environment dumps, or unrelated application logs.
