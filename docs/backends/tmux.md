# Tmux Backend

## 1. Role

Tmux is the first `RuntimeBackend` for `agent-runtime-mcp`.

It provides persistent terminal/process execution while remaining an implementation detail behind the backend-neutral Worker model.

```text
MCP
→ Runtime Service
→ RuntimeBackend
→ TmuxBackend
→ tmux
→ Codex
```

## 2. MVP mapping

The MVP should prefer one managed Worker mapping to one dedicated tmux pane.

```text
worker_id
→ TmuxLocator
   ├── server/socket identity
   ├── session
   ├── window
   └── pane
```

A dedicated session-per-Worker is acceptable for the first implementation if it substantially simplifies lifecycle and recovery, but the public MCP model must not depend on that choice.

## 3. Managed vs unmanaged tmux entities

The backend must distinguish:

```text
managed Worker
= runtime registry record + resolvable tmux locator

unmanaged tmux pane/session
= exists in tmux but is not adopted by agent-runtime-mcp
```

MVP should not automatically gain control over every tmux session owned by the OS account.

A future explicit adoption flow can be designed separately.

## 4. Discovery and reconciliation

On startup/reconciliation:

1. read managed Worker registry;
2. query tmux using structured commands/formats;
3. resolve each registered locator;
4. classify missing/stale runtimes conservatively;
5. optionally report unmanaged tmux entities only through diagnostics, not as normal managed Workers.

Do not parse human-oriented `tmux ls` prose when tmux provides structured format fields for the needed data.

## 5. Output capture

Use tmux pane capture functionality to retrieve a bounded amount of recent terminal text.

Requirements:

- always apply a finite server-side bound;
- normalize result to text;
- expose truncation/bounds in the runtime result;
- do not use capture contents to infer Issue state or Codex success;
- do not persist full capture history by default.

ANSI/control normalization policy should be explicit in implementation tests.

## 6. Safe ordinary text input

Ordinary prompt text must not be sent by interpolating it into a shell command or treating it as a sequence of tmux keys.

Preferred conceptual flow:

```text
text bytes
→ safe tmux buffer/stdin data path
→ paste into target pane
→ optional explicit ENTER control
```

The implementation should use process stdin/argv mechanisms that preserve arbitrary Unicode, newlines, quotes, `$`, backticks and other shell-sensitive characters as data.

`send_text` and `send_control` remain separate public operations.

## 7. Control input

MVP control actions map to a small explicit backend set:

```text
ENTER
INTERRUPT   # typically terminal Ctrl-C semantics
ESCAPE
```

The public API does not accept arbitrary `send-keys` strings.

Backend code may internally map enum values to tmux key names using a fixed table.

## 8. Worker creation

Creation conceptually performs:

```text
validate request
→ allocate worker_id
→ validate cwd/startup profile/command policy
→ create tmux runtime
→ resolve exact pane locator
→ persist registry binding
→ inspect launch state
→ return Worker
```

If tmux creation succeeds but registry persistence fails, implementation must preserve enough information for cleanup/reconciliation and must not silently report full success.

If registry persistence succeeds but the tmux runtime disappears, reconciliation must report the Worker as exited/unavailable rather than alive.

## 9. Startup command

The runtime should prefer named startup profiles for common Workers, for example a configured Codex profile, while permitting a bounded explicit argv command if the deployment policy allows it.

The MCP server must not concatenate an arbitrary caller string into `sh -c` as its normal process-launch mechanism.

The exact Codex startup flags are deployment configuration, not part of the backend architecture contract.

## 10. Working directory

`cwd` must be validated before Worker creation.

Deployment may define:

- allowed root directories;
- whether the directory must already exist;
- symlink/canonical-path policy;
- whether arbitrary user-home paths are permitted.

Do not use `cd <untrusted-string> && ...` shell concatenation when tmux/process APIs can set the working directory directly or safely.

## 11. Restart

Restart should preserve logical `worker_id` while replacing the intended runtime process/pane/session according to implementation strategy.

Desired sequence:

```text
inspect existing locator
→ explicitly terminate/replace target runtime
→ create replacement
→ update registry locator atomically where practical
→ verify backend existence
→ return new runtime state
```

A restart does not mutate the Worker's GitHub Issue or external reference unless explicitly requested by separate correlation metadata operations.

## 12. Destroy

Destroy targets only the managed runtime represented by `worker_id`.

Do not kill an entire tmux server or unrelated sessions as a convenience side effect.

If the chosen MVP mapping uses one dedicated session per Worker, destroying that session is acceptable only after verifying it is the registered Worker-owned session.

## 13. Health checks

Tmux backend health and Worker health are separate:

```text
backend_health
= can the service invoke/query the expected tmux server?

worker_health
= does the registered locator exist and represent an accessible runtime?
```

A healthy tmux server does not prove a Codex process is healthy.

## 14. Idle/running classification

Tmux does not provide authoritative Codex semantic status.

MVP should use conservative signals such as process existence plus bounded recent terminal activity. If reliable idle classification is not available, prefer `running` or `unknown`.

Explicitly forbidden inference examples:

```text
pane contains "$" → idle
pane contains "done" → Task complete
no output for N seconds → Issue review
```

These are not valid project semantics.

## 15. Multiple tmux servers/sockets

The domain model should not assume only the default tmux server forever.

MVP may initially support one configured server/socket, but `TmuxLocator` and configuration should leave room for a server/socket identity so future expansion does not redefine `worker_id`.

## 16. Operator interoperability

A human must remain able to use native tmux to inspect/attach/recover the managed sessions.

`agent-runtime-mcp` should not require a private terminal protocol that makes sessions opaque to normal tmux tooling.

## 17. Security constraints

The backend must obey `docs/security.md`, especially:

- no shell string concatenation for backend commands;
- no unauthenticated remote exposure;
- explicit destructive actions;
- bounded capture;
- treat terminal output as sensitive;
- operate as the configured low-privilege account;
- never require root for normal Worker lifecycle.

## 18. Verification targets

Backend tests should eventually cover at least:

- discover managed Worker;
- stale registry record;
- unmanaged tmux session not auto-adopted;
- multiline Unicode text delivery;
- text containing quotes/backticks/`$`/newlines is preserved as data;
- explicit Enter;
- explicit interrupt;
- bounded capture/truncation;
- create in valid cwd;
- invalid cwd failure;
- restart preserves logical worker identity;
- destroy does not affect unrelated session;
- MCP process restart followed by Worker rediscovery;
- tmux unavailable structured failure.