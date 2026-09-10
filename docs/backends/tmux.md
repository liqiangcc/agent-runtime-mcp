# Tmux Channel Backend

## 1. Role

Tmux is the first `ChannelBackend`.

It exposes already-existing tmux panes as communication Channels.

```text
MCP
→ Channel Service
→ ChannelBackend
→ TmuxBackend
→ existing tmux panes
```

It does not create project Workers, prepare task environments, or manage deployment infrastructure.

## 2. Discovery

The backend queries a configured tmux server/socket scope and returns existing panes through machine-oriented tmux format fields.

The structured discovery row includes:

```text
pane_id
session_name
window_id
window_index
pane_index
pane_title
pane_current_path
```

Do not parse human-oriented `tmux ls` prose when structured fields are available. Do not infer host tmux identity from pane title, cwd, captured terminal text, shell prompts, foreground applications, SSH text or nested tmux display text.

Normal MCP callers receive a `channel_id` and do not construct raw tmux targets.

## 3. Visibility boundary

Backend configuration defines the visible tmux namespace, for example:
- one configured socket/server;
- one OS account;
- optional exact session allowlist.

The backend must not query or control tmux servers outside configured scope.

## 4. Channel identity

Use tmux pane identity plus configured server/socket namespace for the opaque Channel locator/addressing identity. For bounded event observation, pane id alone is insufficient: a sampler must also bind the configured socket path to the tmux server pid (`#{pid}`), Linux `/proc/<pid>/stat` process starttime and `/proc/sys/kernel/random/boot_id`.

Every successfully discovered tmux Channel also publishes the backend-owned mechanical snapshot:

```text
backend_metadata.tmux
├── session_name : string
├── window_id    : string
├── window_index : integer >= 0
├── pane_id      : string
└── pane_index   : integer >= 0
```

Rules:
- `session_name`, `window_id`, and `pane_id` preserve tmux textual values exactly;
- `window_index` and `pane_index` are parsed as non-negative base-10 integers;
- malformed, missing, negative, non-integer or unsafe required identity fails closed as `BACKEND_OPERATION_FAILED`;
- session/window/pane labels and indices are mechanical backend facts, not Worker/Task/Agent/application identity;
- indices are current positions and may change with tmux layout/renumbering;
- title/cwd/terminal output are not host tmux identity authority.

A pane destroyed and recreated may become a different Channel. Persistent logical Agent/Worker/application identity is an upper-layer concern.

### Observation identity read order

For each snapshot sample, execute one structured `display-message` query for server/pane fields, parse and validate the row, read the server process starttime and boot id, and revalidate configured visibility immediately before `capture-pane`. After capture, repeat the identity/visibility query and discard the capture if any field or authorization scope changed. Session names and window/pane indices are mutable location metadata only. A server restart changes the server-generation tuple even when tmux reuses `%pane_id`; a failed query or missing `/proc` identity is an observation gap. If a pane disappears and later reappears after a gap, continuity is unprovable and the observer fails closed with an instance/gap error rather than rebinding. A pane process replacement is a new Channel instance unless continuity is explicitly proven.

All read/write/control operations continue to resolve the opaque `channel_id` through the same configured scope/visibility path. Publishing structured tmux identity does not add a session selector to mutation Tools and does not change the `channel_id` format.

## 5. Read

Use tmux pane capture to obtain bounded recent terminal text.

Requirements:
- finite line/byte maximum;
- explicit truncation;
- Unicode preserved where tmux/process encoding permits;
- no persistent full-history logging by default;
- contents never interpreted as Task/Agent/application state or host tmux structural identity.

## 5.1 Bounded snapshot observation

The `snapshot_change` observer samples at a fixed 250 ms interval with a 200-line/64 KiB capture bound plus the structural identity tuple above. A digest change is activity; no change is not proof that no bytes were emitted. Repeated identical output, high-rate output between samples and ANSI redraws are documented limitations. Sampling uses one shared observer per Channel instance, a finite lease/history, and at most two global subprocess batches. Backend unavailable is reported as `BACKEND_UNAVAILABLE`; only the confirmed same-server path—identity query succeeds, the authorized pane is absent, and the server generation remains stable—may produce `channel_closed`. Any unavailable/ambiguous server or failed before/after identity check is an explicit continuity/backend error.

## 6. Ordinary text write

Text is bounded data, not shell syntax or caller-provided tmux key grammar.

Validation:
- Unicode allowed;
- LF and TAB allowed;
- other Unicode `Cc` controls rejected;
- UTF-8 byte bound checked before mutation.

Preferred tmux mapping:

```text
validated text
→ operation-unique named paste buffer loaded from stdin/data
→ paste buffer to exact resolved pane
→ delete temporary buffer
→ optional explicit ENTER after successful paste
```

Per-operation state prevents concurrent payload/target cross-contamination. Cleanup is best effort and must not mask the primary mutation result.

The caller may use `backend_metadata.tmux.session_name` to choose a Channel, but the mutation itself still targets only the supplied opaque `channel_id`.

## 7. Control actions

Closed public enum:

```text
ENTER
INTERRUPT
ESCAPE
```

Fixed internal mapping:

```text
ENTER     → Enter
INTERRUPT → C-c
ESCAPE    → Escape
```

Do not expose arbitrary `send-keys` grammar.

`submit=true` reuses the same internal ENTER mapping.

## 8. Mutation ambiguity

Text/control mutations are non-idempotent. A timeout after input may have been accepted reports mechanically unknown delivery outcome and is not silently retried.

## 9. Health

Keep distinct:

```text
backend health = configured tmux server/socket can be queried
Channel existence = target pane currently exists
```

A healthy backend does not guarantee any pane exists or application is ready.

## 10. Lifecycle boundary

The backend does not perform:

```text
new-session
new-window
split-window
kill-session
kill-pane
respawn-pane
start/restart process
create worktree
```

If a pane disappears, report `CHANNEL_NOT_FOUND` or unavailable. Do not recreate it.

## 11. Process semantics

Do not derive semantic statuses such as:

```text
idle
working
done
waiting-review
blocked
```

A quiet pane or shell prompt has no product-level meaning. Likewise, output that mentions another tmux session is terminal data and cannot override the host identity returned by structured tmux metadata.

## 12. Operator interoperability

Humans and upper layers remain free to use native tmux to create, attach, stop and recover sessions outside this MCP.

## 13. Security constraints

- structured executable + argv + explicit stdin/data;
- no shell interpolation of Channel input;
- bounded reads/writes;
- ordinary-text control-code rejection;
- concurrent mutation isolation;
- sensitive/untrusted output handling;
- configured tmux scope enforcement;
- fail-closed required identity parsing;
- no root required for normal operation.

If the MCP process is exposed remotely, access security belongs to the external deployment layer and does not alter TmuxBackend semantics.

## 14. Verification targets

Tests cover at least:
- structured discovery including complete session/window/pane identity;
- fail-closed malformed identity parsing;
- list/get identity consistency;
- multi-session target selection without output parsing;
- misleading nested/remote-like terminal text cannot affect host identity selection;
- exact write isolation after structured selection;
- stable addressing during pane lifetime;
- bounded read/truncation;
- Unicode output;
- bounded literal text delivery;
- control-character rejection;
- ENTER/INTERRUPT/ESCAPE;
- concurrent write isolation;
- missing pane failure;
- backend-unavailable health/failure;
- visibility filters for read/mutation;
- no endpoint lifecycle API;
- no semantic Agent/Task/application parsing.
