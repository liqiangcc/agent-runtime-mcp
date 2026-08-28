# Task — stale pre-initialize stdio lifecycle compatibility

## Metadata

```text
GitHub Issue: #22
Task kind: compatibility regression / validation
Environment: env:web-gpt
Preferred worker: web-gpt-worker
Handoff profile: docs/tasks/handoffs/web-gpt.md
Accepted product baseline: v0.1.0 Channel MCP + deployment bundle complete
```

Planning method: `docs/tasks/planning-principles.md`.

## Goal

Freeze and prove that a stale MCP request arriving before `initialize` cannot kill or wedge the real `agent-runtime-mcp` stdio server, and that the **same stdio connection** can subsequently complete the legacy initialize flow and use the accepted public Tool surface.

This is a compatibility regression Task. It is not a new MCP capability and it does not attempt to reproduce or own ChatGPT conversation binding, Tunnel lifecycle, or process supervision.

## Historical Comparator

The motivating historical failure is `liqiangcc/reading-mcp` PR #15:

```text
fix: preserve stdio lifecycle across stale tunnel calls
```

That bug allowed a stale tool call before initialization to terminate the stdio MCP process. Its regression required the process/connection to remain usable for a later `initialize`.

The current project differs technically:

- `agent-runtime-mcp` uses `@modelcontextprotocol/server` `2.0.0`;
- `src/server.ts` uses the SDK `serveStdio(...)` entry;
- upstream SDK coverage says a claim-less non-`initialize` opening such as `tools/list` is tolerated;
- this repository does not yet freeze the historical stale-call lifecycle as its own executable regression.

## Primary Use Case

```text
Actor: stale MCP client/conversation binding
Trigger: sends MCP traffic before completing initialize
Preconditions: real built agent-runtime-mcp stdio process is freshly launched
Main flow:
  raw claim-less tools/list before initialize
  → receive bounded JSON-RPC response
  → prove child process remains alive
  → on the SAME stdio connection send initialize
  → receive initialize result
  → send notifications/initialized
  → tools/list again
  → prove exact accepted six Tool names
  → tools/call health
  → prove connection remains operational
Success: stale pre-init traffic cannot make later initialization/use impossible on that process/connection
Failure: process exits, stdio closes, request wedges indefinitely, later initialize fails, or post-init public Tool use fails
Degradation: the stale request itself may either succeed or return a protocol error, but it must be bounded and non-fatal; however current SDK behavior is expected to serve claim-less tools/list successfully
Evidence: real child-process stdio transcript assertions + process exit state + exact-Candidate CI
```

## Frozen Scenario

Primary row, required:

```text
spawn: node dist/src/server.js
→ DO NOT initialize
→ send {jsonrpc:"2.0", id:1, method:"tools/list", params:{}}
→ bounded response
→ child still alive
→ send legacy initialize on same stdin/stdout
→ bounded initialize result
→ send notifications/initialized
→ send tools/list
→ result contains exactly:
   list_channels
   get_channel
   read_channel
   write_text
   send_control
   health
→ send tools/call for health
→ bounded successful MCP response
→ child still alive
→ close cleanly
```

Optional second row only if it stays simple and deterministic:

```text
pre-initialize tools/call(name=health)
→ bounded response/error
→ same-connection initialize remains possible
```

The optional row must not replace or weaken the primary `tools/list → initialize` row.

## Raw JSON-RPC Harness Is Intentional

The official MCP `Client` normally owns a valid connect/initialize sequence, so it is the wrong tool for injecting the intentionally stale ordering.

A small test-only raw stdio JSON-RPC harness is authorized solely to reproduce the lifecycle edge. It is not a new public transport/API and must not be shipped in the runtime deployment bundle.

## Separation Points

### Stdio lifecycle compatibility | ChatGPT conversation binding

This Task proves only what happens after bytes reach the MCP stdio process. It cannot prove that a stale ChatGPT conversation retains/reacquires its Developer MCP binding.

### Process survival | process supervision

The server must not exit because of the stale request. The product still does not own restart/systemd/supervisor behavior.

### Compatibility regression | product capability

No seventh Tool, schema field, lifecycle API, retry API or reconnect API is authorized.

### Test injection | product protocol surface

Raw JSON-RPC is test instrumentation for an invalid/edge ordering. Normal consumers continue to use MCP SDK clients.

### MCP capability | deployment mechanism

Tunnel/provider/network/auth behavior remains outside this Task.

## Logic / Control Separation

```text
server / SDK entry
= mechanically process the incoming stdio sequence without fatal lifecycle failure

test harness
= choose the intentionally stale ordering and assert bounded outcomes

upper platform (ChatGPT/Tunnel)
= conversation binding, reconnect and runtime management outside this Task
```

## Expected Change Gate

This Task is expected to add **test/CI Evidence only**, for example:

```text
tests/compat/** or tests/integration/**
CI job/step or existing test script wiring
focused compatibility documentation if useful
```

Do not change product `src/` behavior merely to make the test convenient.

If the frozen scenario fails on current accepted main and fixing it requires any `src/`/runtime behavior change:

```text
record exact failing Evidence
→ [BLOCKER REPORT]
→ status:blocked + owner:none
→ STOP
```

Coordinator will decide whether to split a separate product defect Task. The Worker must not silently turn this validation Task into a bugfix.

## Verification Claims

- **C1 Stale-call response:** pre-initialize claim-less `tools/list` receives a bounded JSON-RPC response on the real stdio child.
- **C2 Process survival:** the child process remains alive after that stale call.
- **C3 Same-connection recovery:** a valid legacy `initialize` succeeds afterward on the same stdin/stdout connection.
- **C4 Initialization completion:** `notifications/initialized` can be sent and normal post-init traffic continues.
- **C5 Public surface preservation:** post-init `tools/list` returns exactly the six accepted Tool names.
- **C6 Normal call usability:** post-init `tools/call` of `health` receives a bounded non-fatal response through the real MCP server.
- **C7 No lifecycle expansion:** no restart/reconnect/endpoint/process-supervision capability is added.
- **C8 No platform coupling:** no ChatGPT/Tunnel/provider-specific behavior is added to product code.
- **C9 Regression:** existing typecheck/unit/tmux/public-discovery/public-dogfood/runtime-deployment-bundle/static-boundary gates remain green.

## Evidence Contract

Worker report must record:

```text
Attempt
Base SHA
Candidate SHA
Node/npm runtime
@modelcontextprotocol/server resolved version
exact stale request method
stale response shape summary
child alive after stale call: yes/no
same-connection initialize result
post-init exact Tool list
post-init health call result summary
changed files
Actions run/jobs
Claims C1-C9
```

Do not include secrets or unnecessary full transcripts.

## Out of Scope

- diagnosing ChatGPT internal conversation binding;
- Tunnel/client runtime implementation;
- process supervisor/restart policy;
- reconnect API;
- new MCP Tool/schema;
- tmux endpoint lifecycle;
- deployment/network/auth changes;
- SDK upgrade unless separately justified by a blocked defect Task.

## Publication Gate

Coordinator may publish after:

1. live main and SDK version are re-read;
2. historical reading-mcp PR #15 failure shape is recorded;
3. exact same-connection stale-call scenario is frozen;
4. current canonical-main baseline CI is green;
5. validation-only source-change gate is explicit.

## Completion Protocol

```text
status:ready/env:web-gpt
→ separate Web GPT Worker claims one Attempt
→ implement regression Evidence only
→ [EXECUTION REPORT] or [BLOCKER REPORT]
→ status:review or status:blocked + owner:none
→ STOP
→ Coordinator Review
```
