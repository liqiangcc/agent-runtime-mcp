# Collaboration Roles and Dispatch Protocol

This document defines how **this repository** coordinates development. It is not the public MCP product protocol.

## 1. End-to-end repository workflow

```text
GPT Web Coordinator
→ Task Publisher
→ GitHub Issue + task.md + prompt.md
→ Publication Gate PASS / status:ready
→ Task Dispatcher
→ isolated project execution context
→ Codex Task Worker
→ claim / Attempt N / report
→ Task Reviewer
→ ACCEPT | REVISE | BLOCK | SPLIT | NOT_PLANNED
```

GitHub is durable project state.

## 2. Role boundaries

### Publisher

Materializes and publishes one executable Task. Does not execute or dispatch it.

### Dispatcher

Owns project-specific execution preparation and delivery:

- verify Issue is ready/unowned;
- prepare isolated git worktree;
- create/reconcile issue-linked tmux session/pane;
- start/reconcile Codex process;
- deliver the canonical Worker handoff;
- track tmux/worktree/process liveness;
- surface recovery evidence.

Dispatcher does not claim, implement, Review, accept or close the Issue.

### Worker

Claims and executes exactly one Attempt, posts durable result/blocker, releases ownership and stops.

### Reviewer

Interprets GitHub/candidate/evidence, handles recovery and decides ACCEPT/REVISE/BLOCK/SPLIT/NOT_PLANNED.

## 3. Product separation

`agent-runtime-mcp` is a generic terminal Channel MCP.

The collaboration layer owns:

```text
Issue ↔ worktree mapping
Issue ↔ tmux pane mapping
tmux pane creation
Codex startup
restart/recovery policy
cleanup policy
Task handoff meaning
```

Channel MCP owns only communication with an already-existing terminal endpoint:

```text
list/get channel
read channel
write text
send control
health
```

No repository role may treat Channel MCP as Task authority or lifecycle manager.

## 4. Canonical Worker handoff

```text
$task-worker Execute Issue #<issue> using `docs/tasks/<issue>-<slug>/prompt.md`.
```

Publisher/Reviewer produces it. Dispatcher transports it. Worker resolves all Task meaning from GitHub and repository docs.

## 5. Dispatch preflight

Before launching a new Worker execution context:

```text
Issue open
Status: status:ready
Active owner: none
Task package resolves
required capabilities match actual child environment
no unresolved issue worktree/session collision
```

If Issue is already in-progress/review/blocked/done, do not launch a duplicate Worker.

## 6. Isolation rule

```text
one concurrent Issue
→ one isolated mutable worktree
→ one issue-linked tmux session/pane
→ one Codex Worker
```

Default bootstrap mapping:

```text
Issue #123
→ <repo>.worktrees/issue-123
→ tmux session codex-issue-123
```

Dispatcher owns this mapping; Channel MCP does not store it.

## 7. Dispatch modes

### Mode A — native communication

```text
Dispatcher
→ git worktree
→ create tmux
→ start Codex
→ native tmux input/inspection
```

Used before Channel MCP is usable.

### Mode B — Channel-MCP communication

After Channel read/write/control capabilities are accepted:

```text
Dispatcher
→ prepare worktree
→ create tmux pane
→ start Codex
→ discover the already-existing pane through Channel MCP
→ write_text(canonical handoff)
→ read_channel / send_control as needed
```

Only communication changes from native tmux to MCP. Workspace/session/process lifecycle stays in Dispatcher.

Migration invariant:

> Channel MCP must not absorb worktree, tmux lifecycle, Codex lifecycle, Issue mapping or Task-state responsibilities.

## 8. Tracking/recovery

GitHub durable state wins over terminal observations.

```text
ready + no runtime
→ published, not running here

in-progress + live runtime
→ active Attempt

in-progress + dead/missing runtime
→ Reviewer/Coordinator recovery required

review
→ Reviewer next

blocked
→ no auto-resume

done/closed
→ project Task complete
```

Channel/tmux output cannot prove Task completion.

A missing channel only says the endpoint is missing. Dispatcher/Reviewer decides whether/how to recreate the project execution environment.

## 9. Review → redispatch

Unchanged Contract:

```text
Attempt N → Review REVISE → status:ready
→ fresh handoff → Dispatcher
→ prepare/reuse execution context
→ Worker claim → Attempt N+1
```

Changed Contract:

```text
status:draft
→ canonical/task/bootstrap revision
→ Publisher Gate
→ Dispatcher
```

## 10. Core separation

```text
Publisher = make Task executable
Dispatcher = prepare project execution environment and deliver handoff
Worker = execute one Attempt
Reviewer = decide project meaning
GitHub = durable project authority
Channel MCP = optional communication transport to existing terminal endpoints
```
