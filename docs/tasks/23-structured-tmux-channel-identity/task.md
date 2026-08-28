# Task — structured tmux Channel identity

## Metadata

```text
GitHub Issue: #23
Task kind: Channel discovery correctness / additive contract bugfix
Environment: env:web-gpt
Preferred worker: web-gpt-worker
Handoff profile: docs/tasks/handoffs/web-gpt.md
Parent: accepted Channel MCP v0.1.0
Severity: Medium-High
```

Planning method: `docs/tasks/planning-principles.md`.

## Goal

Expose enough **backend-owned mechanical tmux identity** through `list_channels` and `get_channel` for an upper layer to select the intended host tmux pane without parsing terminal output, while preserving the Channel-only architecture and existing mutation addressing.

This fixes target identification before mutation. It does not change `write_text` routing semantics.

## Primary Use Case

```text
Actor: upper-layer MCP caller
Trigger: needs to choose one host tmux session among multiple visible Channels
Preconditions:
  host tmux scope contains sessions p1 and s2
  their panes have indistinguishable title/cwd
  s2 terminal text misleadingly contains "p1" (e.g. nested/remote tmux UI)
Main flow:
  list_channels
  → inspect structured backend-owned identity only
  → choose the Channel whose tmux session_name == "p1"
  → optionally confirm with get_channel
  → write_text(selected channel_id)
Success:
  only host p1's pane receives the mutation
  no read_channel/output parsing is required for identity
Failure:
  caller cannot distinguish p1 from s2 structurally, list/get disagree, or selection can be influenced by terminal text
Degradation:
  session/window/pane labels/indices are current tmux snapshots and may change when tmux itself renames/reindexes; channel_id remains the mutation address
Authoritative Evidence:
  public MCP list/get structured identity + real tmux target-isolation integration
```

## Problem Statement

Current `TmuxBackend` already asks tmux for:

```text
pane_id
session_name
window_id
window_index
pane_index
pane_title
pane_current_path
```

`TmuxPane` retains those values internally, but `toChannel()` currently publishes only the opaque ids plus `title` and `cwd`. The public `Channel` contract has no structured tmux identity field.

Therefore callers can be forced toward non-authoritative observations such as title/cwd/terminal output when selecting a target. SSH and nested tmux make that unsafe because terminal content can describe a remote tmux session rather than the host pane being controlled.

## Architecture Classification

```text
Channel discovery / metadata inspection
= product responsibility

terminal output interpretation
= upper-layer observation only, NOT identity authority

write_text(channel_id)
= existing exact mutation routing, unchanged

Worker / Task / Issue / application identity
= outside product
```

This is an information-loss defect at the `TmuxPane → Channel` boundary.

## Frozen Public Contract

### Generic Channel addition

Add one backend-owned structured metadata field to Channel summaries:

```text
backend_metadata?
```

It is additive on the wire. Existing consumers that ignore unknown response fields remain compatible.

Preferred TypeScript shape:

```ts
interface TmuxChannelMetadata {
  session_name: string;
  window_id: string;
  window_index: number;
  pane_id: string;
  pane_index: number;
}

interface ChannelBackendMetadata {
  tmux?: TmuxChannelMetadata;
}

interface Channel {
  channel_id: string;
  backend_kind: BackendKind;
  backend_locator?: string;
  state: ChannelState;
  capabilities: ChannelCapability[];
  title?: string;
  cwd?: string;
  last_activity?: string;
  backend_metadata?: ChannelBackendMetadata;
}
```

The generic field may remain optional for forward backend compatibility, but **every successfully discovered `backend_kind: "tmux"` Channel MUST publish a complete `backend_metadata.tmux` object** with all five frozen fields.

### Tmux wire shape

```text
backend_metadata:
  tmux:
    session_name: string
    window_id: string
    window_index: integer >= 0
    pane_id: string
    pane_index: integer >= 0
```

Example:

```json
{
  "channel_id": "tmux:abcd1234ef56:10",
  "backend_kind": "tmux",
  "backend_locator": "tmux:abcd1234ef56:10",
  "state": "available",
  "capabilities": ["read", "write-text", "control"],
  "title": "root",
  "cwd": "/root",
  "backend_metadata": {
    "tmux": {
      "session_name": "p1",
      "window_id": "@3",
      "window_index": 0,
      "pane_id": "%10",
      "pane_index": 0
    }
  }
}
```

## Field Semantics

### `session_name`

Current host tmux session label from `#{session_name}`.

- mechanical backend metadata;
- unique within the queried tmux server at that moment;
- may change if tmux session is renamed;
- NOT Worker/Task/Agent identity.

### `window_id`

Tmux window identity from `#{window_id}` such as `@3`.

- preserve tmux textual identity exactly;
- mechanical snapshot;
- not used as public mutation syntax.

### `window_index`

Non-negative integer parsed from `#{window_index}`.

- current session-local position;
- may change under tmux renumbering/layout operations;
- not a stable Channel identity component.

### `pane_id`

Tmux pane identity from `#{pane_id}` such as `%10`.

- preserve tmux textual identity exactly;
- stable for the pane lifetime under tmux semantics;
- diagnostic/mechanical identity only;
- normal mutation callers still pass opaque `channel_id`.

### `pane_index`

Non-negative integer parsed from `#{pane_index}`.

- current window-local position;
- may change with pane layout;
- not a stable Channel identity component.

## Deliberately Unchanged

```text
channel_id format
backend_locator behavior
write_text input/schema
send_control input/schema
read_channel output
health semantics
configured tmux scope / allowlist
six public Tool names
endpoint lifecycle boundary
```

`backend_locator` remains opaque/diagnostic. Callers MUST NOT be required to parse it to recover session/window/pane identity.

## Validation / Parsing Rules

The backend already uses a strict seven-field tmux format row. Preserve fail-closed parsing.

Additional requirements:

- `session_name`, `window_id`, `pane_id` must be non-empty;
- `window_index` and `pane_index` must parse as non-negative base-10 integers;
- malformed required identity metadata remains `BACKEND_OPERATION_FAILED` rather than being silently omitted;
- do not derive identity from `title`, `cwd`, shell prompts, captured output, status lines, foreground application or environment heuristics.

No need to add new tmux commands if the existing `PANE_FORMAT` already provides the frozen fields.

## Required Acceptance Scenario

Create two externally managed host sessions inside one isolated tmux server:

```text
session p1 -> pane %A
session s2 -> pane %B
```

Fixture requirements:

```text
same pane title: root
same cwd: /root (or the same deterministic temp cwd)
%B terminal display contains misleading text mentioning p1,
for example "[p1] 0:codex*"
```

A real SSH dependency is NOT required; deterministic terminal text is sufficient to prove output is non-authoritative.

Required proof:

1. public `list_channels` returns two Channels with distinct structured tmux identity;
2. caller selects host p1 solely using `backend_metadata.tmux.session_name`, without `read_channel`;
3. `get_channel(selected channel_id)` returns the same five tmux identity fields as the corresponding list result;
4. `write_text` to the selected `channel_id` mutates only host p1/%A;
5. host s2/%B receives no mutation even though its displayed text contains `p1`;
6. `channel_id` still maps to the same exact pane as before;
7. exact six public Tools remain unchanged.

## Separation Points

### Mechanical identity | semantic identity

```text
tmux session/window/pane metadata = backend fact
Worker / Task / Agent / application identity = upper-layer meaning
```

### Discovery | terminal observation

```text
backend_metadata = identity source for backend structure
read_channel text = untrusted terminal observation, never host tmux identity authority
```

### Target selection | mutation routing

```text
caller selects channel from structured metadata
write_text routes exactly to supplied channel_id
```

The bug is in the first step, not the second.

### Metadata | lifecycle

Publishing session/window/pane identity does not authorize creation, rename, restart, kill or recovery operations.

## Single Responsibilities

```text
TmuxBackend
= acquire/validate tmux mechanical identity and map it into Channel metadata

Channel model / MCP response
= carry backend-owned structured identity without interpretation

upper-layer caller
= choose which session name it wants and decide application meaning

write/control path
= continue using opaque channel_id exactly as today
```

## Expected Change Scope

Expected product changes are narrow and additive:

```text
src/types.ts
src/tmux-backend.ts
focused unit/integration/public-MCP tests
canonical Channel/MCP/tmux docs
```

No seventh Tool. No new mutation API. No endpoint lifecycle behavior.

## Verification Claims

- **C1 Metadata preservation:** existing tmux `session_name/window_id/window_index/pane_id/pane_index` survive `TmuxPane → Channel` conversion.
- **C2 Tmux completeness:** every successful tmux Channel exposes a complete `backend_metadata.tmux` object.
- **C3 Field typing:** ids/names remain strings; indices are non-negative integers; malformed required identity fails closed.
- **C4 List/get consistency:** `list_channels` and `get_channel` report identical identity for the same current pane.
- **C5 No output inference:** the acceptance selector never calls `read_channel` and never parses terminal text/title/cwd to decide the host session.
- **C6 Nested/remote resistance:** misleading `p1` text in s2/%B cannot affect host session identification.
- **C7 Mutation correctness:** structured selection of `session_name == p1` leads to write only into p1/%A; s2/%B remains untouched.
- **C8 Address compatibility:** `channel_id` format and exact pane routing are unchanged.
- **C9 Public surface compatibility:** Tool set remains exactly `list_channels`, `get_channel`, `read_channel`, `write_text`, `send_control`, `health`.
- **C10 Boundary preservation:** no Worker/Task/application/lifecycle/deployment semantics added.
- **C11 Regression:** typecheck/unit/real-tmux/public-discovery/public-dogfood/runtime-deployment-bundle/static-boundary remain green on exact Candidate.

## Evidence Plan

### J1 — unit metadata mapping

Prove a valid seven-field tmux row maps to the frozen structured metadata and numeric indices; malformed/negative/non-integer indices fail closed.

### J2 — real tmux multi-session identity

Create p1 and s2 in an isolated tmux server with same title/cwd and verify backend list/get identity.

### J3 — public MCP identity

Use the official MCP client over the real stdio server to prove `list_channels` and `get_channel` expose the structured metadata and exact six Tool names.

### J4 — misleading-output target safety

Populate s2/%B display with remote/nested-like text containing `p1`; select p1 only from structured metadata; write through public `write_text`; prove only p1/%A receives the mutation.

### J5 — full regression

Exact Candidate must pass all existing CI jobs, including deployment-bundle clean-room verification and public dogfood.

## Evidence Contract

Worker report must record:

```text
Attempt
Base SHA
Candidate SHA
Node/npm/tmux identity
changed files
public list_channels identity sample (sanitized)
public get_channel consistency result
p1/s2 pane identity summary
selector source = backend_metadata only
misleading-output fixture summary
write target-isolation result
exact six Tool result
Actions run/jobs
Claims C1-C11
```

Do not include sensitive terminal content beyond deterministic fixture markers.

## Backward Compatibility

This is an additive response field:

- existing inputs unchanged;
- existing Channel fields unchanged;
- existing `channel_id` unchanged;
- clients ignoring unknown response fields remain compatible;
- no consumer is required to parse `backend_locator`;
- new clients may rely on `backend_metadata.tmux` for tmux target identification.

Because this changes the public Channel response contract, canonical docs must be updated in the same Candidate and Review must verify wire output through public MCP, not only direct backend tests.

## Out of Scope

- session rename/create/kill APIs;
- tmux window/pane lifecycle;
- raw tmux command exposure;
- Worker/Task/Issue mapping;
- detecting Codex/shell/SSH foreground applications;
- parsing nested/remote tmux output;
- inferring host identity from title/cwd/output;
- changing `channel_id` format;
- adding session selector arguments to `write_text`;
- deployment/tunnel/network/auth changes.

## Publication Gate

PASS.

Publication basis:

```text
implementation evidence: current TmuxBackend already acquires all five identity facts but drops them at toChannel()
architecture evidence: Channel discovery + metadata inspection are inside product; terminal output is not identity authority
frozen additive shape: backend_metadata.tmux with five fields above
backward compatibility: existing inputs/fields/channel_id/write routing unchanged
acceptance: two host sessions with identical title/cwd + misleading p1 text in s2; structured selection/write isolation through public MCP
publication head: 32e77aa90e32c8288c04314d09524866c953ca8e
publication CI: 33160648761 SUCCESS
```

Live Issue must be `status:ready`, `owner:none`, `env:web-gpt`, `Blocker:none` before Worker claim.

## Completion Protocol

```text
status:ready/env:web-gpt
→ separate Web GPT Worker claims one Attempt
→ implement frozen additive metadata contract
→ exact-Candidate Evidence
→ [EXECUTION REPORT] | [BLOCKER REPORT]
→ status:review | status:blocked + owner:none
→ STOP
→ Coordinator Review / Integration Gate / Final Acceptance
```
