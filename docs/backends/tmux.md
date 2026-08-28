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

Do not parse human-oriented `tmux ls` prose when structured fields are available.

Normal MCP callers receive a `channel_id` and do not construct raw tmux targets.

## 3. Visibility boundary

Backend configuration defines the visible tmux namespace, for example:
- one configured socket/server;
- one OS account;
- optional exact session allowlist.

The backend must not query or control tmux servers outside configured scope.

## 4. Channel identity

Use tmux pane identity plus configured server/socket namespace for the backend locator.

A pane destroyed and recreated may become a different Channel. Persistent logical Agent/Worker/application identity is an upper-layer concern.

All read/write/control operations resolve the opaque `channel_id` through the same configured scope/visibility path.

## 5. Read

Use tmux pane capture to obtain bounded recent terminal text.

Requirements:
- finite line/byte maximum;
- explicit truncation;
- Unicode preserved where tmux/process encoding permits;
- no persistent full-history logging by default;
- contents never interpreted as Task/Agent/application state.

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

A quiet pane or shell prompt has no product-level meaning.

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
- no root required for normal operation.

If the MCP process is exposed remotely, access security belongs to the external deployment layer and does not alter TmuxBackend semantics.

## 14. Verification targets

Tests cover at least:
- structured discovery;
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
