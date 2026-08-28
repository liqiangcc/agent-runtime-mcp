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

## 5. Read

Use tmux pane capture to obtain bounded recent terminal text.

Requirements:

- finite line/byte maximum;
- explicit truncation;
- Unicode preserved where tmux/process encoding permits;
- no persistent full-history logging by default;
- contents never interpreted as Task/Agent state.

## 6. Ordinary text write

Text must be transported as data, not interpolated into a shell command and not parsed as tmux key syntax.

Preferred conceptual path:

```text
text bytes
→ safe tmux buffer/input path
→ paste to target pane
→ optional explicit ENTER
```

Implementation must preserve newlines, quotes, backticks, `$` and other shell-sensitive characters as terminal input data.

The backend does not inspect whether the pane currently contains Codex, bash, a REPL or another program.

## 7. Control actions

MVP maps a closed public enum:

```text
ENTER
INTERRUPT
ESCAPE
```

to fixed tmux control/key operations internally.

Do not expose arbitrary `send-keys` grammar.

## 8. Health

Keep distinct:

```text
backend health
= configured tmux server/socket can be queried

channel existence
= target pane currently exists
```

A healthy backend does not guarantee any particular pane exists.

## 9. Lifecycle boundary

Core backend does not perform:

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

Project-specific Dispatcher/operator code can use native tmux or another lifecycle mechanism outside this MCP.

## 10. Process semantics

The backend may return non-sensitive mechanical metadata when directly observable, but it must not derive semantic statuses such as:

```text
idle
working
done
waiting-review
blocked
```

A quiet pane or a shell prompt has no product-level meaning.

## 11. Operator interoperability

Humans and upper-layer automation remain free to use native tmux to create, name, attach, stop and recover sessions.

The MCP is an additional communication interface, not tmux ownership authority.

## 12. Security constraints

- invoke tmux through structured executable + argv/process APIs;
- never interpolate channel input into shell command strings;
- bound reads;
- treat output as sensitive/untrusted;
- write/control only within configured tmux scope;
- normal operation requires no root;
- remote MCP write access must be authenticated.

## 13. Verification targets

Tests should cover at least:

- discover existing panes through structured fields;
- stable addressing of a discovered pane during its lifetime;
- bounded read and truncation;
- Unicode output handling;
- multi-line/metacharacter text delivery as data;
- explicit Enter/interrupt/escape;
- missing pane returns structured failure;
- tmux unavailable returns backend failure;
- configured visibility filters are enforced;
- no session/pane lifecycle commands are exposed by the MCP implementation;
- no semantic Agent/Task state parsing.
