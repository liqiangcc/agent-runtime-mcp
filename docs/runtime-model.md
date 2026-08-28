# Runtime Model

## 1. Purpose

This document defines the backend-neutral domain model used by `agent-runtime-mcp`.

The model describes **runtime reality**, not GitHub Task semantics.

## 2. Core entities

### Worker

A logical persistent AI execution endpoint managed by the runtime.

```text
Worker
├── worker_id
├── backend_kind
├── backend_locator
├── runtime_state
├── cwd?
├── process?
├── capabilities[]
├── created_at?
├── last_activity?
├── external_reference?
└── diagnostics?
```

#### `worker_id`

Stable API identity used by MCP callers. Callers should not need to know tmux target syntax.

#### `backend_kind`

Examples:

```text
tmux
pty
ssh
docker
```

Only `tmux` is in MVP scope.

#### `backend_locator`

Opaque backend-owned locator. It is returned only as diagnostic metadata when appropriate and should not be the primary API identity.

#### `external_reference`

Optional correlation value such as:

```text
github:liqiangcc/agent-runtime-mcp#12
```

It is not authoritative Task state.

## 3. Runtime state

Normalized states:

### `starting`

The Worker has been created/restarted but the backend has not yet established a normal steady state.

### `running`

The runtime observes an active process/runtime and has evidence of recent execution/activity or a backend-specific active state.

### `idle`

The runtime appears available for input and has no recent observable activity according to a bounded backend heuristic.

Important:

> `idle` never means Task complete, Issue ready for review, or Codex success.

### `exited`

The Worker identity exists but its intended interactive process/runtime has terminated or the backend records it as exited.

### `unavailable`

The backend or concrete runtime cannot currently be contacted/used.

### `unknown`

The runtime exists or may exist, but available evidence is insufficient to classify it safely.

## 4. State confidence

Runtime status may include an optional confidence/evidence field:

```text
state_source:
- backend-process
- terminal-activity
- registry-only
- backend-unreachable
- unknown
```

MVP implementations should prefer conservative classification. If `idle` cannot be proven reliably, return `running` or `unknown` rather than parsing Codex prose for phrases such as “done”.

## 5. Runtime activity

`last_activity` records a runtime observation timestamp, for example terminal output or accepted input.

It does not mean:

- last code change;
- last GitHub update;
- Task progress percentage;
- completion time.

## 6. Process observation

Where the backend can expose process information safely:

```text
ProcessInfo
├── command_name?
├── pid?
├── alive?
└── started_at?
```

Do not dump full environment variables or command lines by default because they may contain secrets.

## 7. Capabilities

Each Worker/backend exposes explicit capabilities instead of assuming all operations are supported.

Initial capability vocabulary:

```text
observe-output
send-text
send-control
interrupt
restart
destroy
set-external-reference
```

Create capability belongs to the backend/runtime service rather than an existing Worker.

A future backend can omit unsupported capabilities while remaining usable for observation.

## 8. Output capture

Output is a bounded observation:

```text
OutputCapture
├── worker_id
├── captured_at
├── text
├── truncated
├── line_count?
├── byte_count?
└── cursor/token?   # optional future incremental model
```

MVP requirements:

- require or default a finite line/byte limit;
- report truncation explicitly;
- do not treat captured text as durable project history;
- do not infer Task status from captured prose.

## 9. Input model

Ordinary text and control actions are different types.

### Text input

```text
TextInput
├── worker_id
├── text
└── submit: true | false
```

`submit=true` may be implemented as safe text paste followed by an explicit Enter action, but backend implementation must not reinterpret arbitrary text as special keys.

### Control input

MVP control actions are intentionally narrow:

```text
ENTER
INTERRUPT
ESCAPE
```

Additional control actions require explicit contract review. The public API should not expose arbitrary tmux `send-keys` grammar by default.

## 10. Worker creation

```text
CreateWorkerRequest
├── worker_id?          # optional caller-provided stable id
├── cwd
├── startup_profile?   # preferred reusable configuration
├── command?           # bounded explicit command form
├── backend_kind       # tmux in MVP
└── external_reference?
```

Creation result must identify the actual `worker_id` and initial runtime state.

The exact policy for allowed commands/cwd belongs to `security.md` and deployment configuration.

## 11. Restart semantics

Restart is explicit and targets one Worker.

Desired invariant:

```text
same logical worker_id
→ backend process/runtime replaced or relaunched
```

A restart must not silently mutate GitHub Issue status or external Task ownership.

## 12. Destroy semantics

Destroy removes the backend runtime and managed registry binding for one Worker.

It must:

- be explicit;
- be idempotent where practical;
- return a structured not-found/already-gone result when applicable;
- never be triggered as an automatic consequence of capture/input failure.

## 13. Registry semantics

The registry records managed identity; the backend records runtime reality.

On server restart/reconciliation:

```text
registry record + backend exists
→ managed Worker restored

registry record + backend missing
→ Worker exited/unavailable/stale; do not invent liveness

backend exists + no registry record
→ unmanaged backend runtime; policy decides whether it is discoverable/adoptable
```

MVP should distinguish managed and unmanaged tmux entities rather than automatically controlling every terminal owned by the OS user.

## 14. Error model

Public operations should use structured categories such as:

```text
WORKER_NOT_FOUND
WORKER_ALREADY_EXISTS
BACKEND_UNAVAILABLE
BACKEND_OPERATION_FAILED
PERMISSION_DENIED
INVALID_ARGUMENT
INVALID_CWD
CAPABILITY_UNSUPPORTED
INPUT_FAILED
TIMEOUT
REGISTRY_CONFLICT
```

Error details should help diagnosis without returning unnecessary environment or secret-bearing terminal data.

## 15. Deliberately absent Task fields

The Worker model does not include authoritative:

```text
issue_status
task_status
review_status
verification_result
accepted
next_task
priority
```

Those belong to the GitHub/Coordinator control plane.