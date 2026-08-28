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

It is not responsible for creating project Workers or preparing task environments.

## 2. Discovery

The backend queries a configured tmux server/socket scope and returns existing panes through machine-oriented tmux format fields.

Do not parse human-oriented `tmux ls` prose when structured fields are available.

Conceptual locator fields may include:

```text
server/socket scope
session identity/name
window identity/index
pane id
pane title
pane cwd
```

Normal MCP callers receive a `channel_id` and do not need to construct tmux target syntax.

## 3. Visibility boundary

Deployment decides which tmux namespace is visible, for example:

- one configured socket/server;
- one OS account;
- optional allowed session-name patterns.

The backend must not query or control tmux servers outside configured scope.

There is no separate managed-Worker registry in MVP.

## 4. Channel identity

Prefer tmux pane identity plus configured server/socket namespace for the backend locator.

A pane destroyed and recreated may become a different Channel. Preserving logical Agent/Worker identity across recreation is an upper-layer responsibility.

All read/write/control operations for a normal caller resolve the opaque `channel_id` through the same configured scope/visibility path. Raw pane ids are not an alternate public authority path.

## 5. Read

Use tmux pane capture to obtain bounded recent terminal text.

Requirements:

- finite line/byte maximum;
- explicit truncation;
- Unicode preserved where tmux/process encoding permits;
- no persistent full-history logging by default;
- contents never interpreted as Task/Agent state.

## 6. Ordinary text write

Text is transported as bounded data, not interpolated into a shell command and not parsed as caller-provided tmux key syntax.

The Channel layer validates ordinary text before backend mutation:

- Unicode text is allowed;
- LF and TAB are allowed;
- other Unicode `Cc` control characters are rejected so ESC/interrupt-like input must use `send_control`;
- the UTF-8 byte bound is checked before tmux mutation.

For tmux, the preferred literal-data mapping is:

```text
validated text
→ operation-unique named tmux paste buffer loaded from stdin/data
→ paste buffer to exact resolved pane
→ delete temporary buffer
→ optional explicit ENTER only after successful paste
```

The implementation should preserve caller LF instead of silently converting it into an MCP-added Enter and should use tmux bracketed-paste behavior when supported by the foreground application. Application interpretation of pasted LF is not a Channel guarantee.

A shared/default mutable paste buffer is not sufficient for concurrent callers unless equivalent isolation is proven. Per-operation transport state must prevent payload/target cross-contamination.

Temporary paste buffers are internal transport resources, not endpoint lifecycle authority. Clean them after successful use and best-effort after failure without masking the primary mutation result.

The backend does not inspect whether the pane currently contains Codex, bash, a REPL or another program.

## 7. Control actions

MVP maps a closed public enum:

```text
ENTER
INTERRUPT
ESCAPE
```

to fixed tmux key operations internally, equivalent to:

```text
ENTER     → Enter
INTERRUPT → C-c
ESCAPE    → Escape
```

Do not expose arbitrary `send-keys` grammar or caller-provided key names.

`submit=true` in `write_text` must reuse the same internal ENTER mapping after text transport succeeds rather than create a second Enter semantic.

## 8. Mutation ambiguity

Text/control mutations are non-idempotent.

If a tmux command times out after input may have been accepted, the backend reports a mechanically honest timeout/unknown delivery outcome. It does not silently retry.

Retry/recovery belongs to the upper layer.

## 9. Health

Keep distinct:

```text
backend health
= configured tmux server/socket can be queried

channel existence
= target pane currently exists
```

A healthy backend does not guarantee any particular pane exists.

## 10. Lifecycle boundary

Core backend does not perform endpoint lifecycle actions:

```text
new-session
new-window
split-window
kill-session
kill-pane
respawn-pane
start Codex
restart process
create worktree
```

If a pane disappears, report `CHANNEL_NOT_FOUND` or unavailable. Do not recreate it.

Project-specific operator/upper-layer code can use native tmux or another lifecycle mechanism outside this MCP.

## 11. Process semantics

The backend may return non-sensitive mechanical metadata when directly observable, but it must not derive semantic statuses such as:

```text
idle
working
done
waiting-review
blocked
```

A quiet pane or a shell prompt has no product-level meaning.

## 12. Operator interoperability

Humans and upper-layer automation remain free to use native tmux to create, name, attach, stop and recover sessions.

The MCP is an additional communication interface, not tmux ownership authority.

## 13. Security constraints

- invoke tmux through structured executable + argv + explicit stdin/data paths;
- never interpolate channel input into shell command strings;
- bound reads and writes;
- reject ordinary-text control-code bypasses before mutation;
- isolate concurrent mutation transport state;
- treat output as sensitive/untrusted;
- write/control only within configured tmux scope;
- normal operation requires no root;
- remote MCP write access must be authenticated.

## 14. Verification targets

Tests should cover at least:

- discover existing panes through structured fields;
- stable addressing of a discovered pane during its lifetime;
- bounded read and truncation;
- Unicode output handling;
- bounded multi-line/metacharacter text delivery as data;
- rejection of non-LF/TAB control characters from ordinary text;
- explicit Enter/interrupt/escape;
- concurrent write payload/target isolation;
- missing pane returns structured failure;
- tmux unavailable returns backend failure;
- configured visibility filters are enforced for read and mutation;
- no session/pane lifecycle commands are exposed by the MCP implementation;
- no semantic Agent/Task state parsing.
