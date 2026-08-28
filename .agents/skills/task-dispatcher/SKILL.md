---
name: task-dispatcher
description: Dispatch, inspect, track, or resume exactly one issue-linked Codex Worker execution context for agent-runtime-mcp. Orchestration only: never claim, implement, review, accept, close, or automatically start another Attempt.
---

# Task Dispatcher

Bridge one published repository Task to one isolated Codex execution context.

## Authority

Before dispatch/tracking, read:

1. `AGENTS.md`
2. `docs/tasks/collaboration-protocol.md`
3. `docs/tasks/issue-state-convention.md`
4. `docs/tasks/issue-lifecycle-protocol.md`
5. target Issue/comments
6. referenced `prompt.md` and `task.md`
7. `docs/tasks/handoffs/codex.md`

Dispatcher owns **project execution preparation**, not product MCP semantics.

## Input

Require exactly one canonical Worker handoff:

```text
$task-worker Execute Issue #<issue> using `docs/tasks/<issue>-<slug>/prompt.md`.
```

Transport it unchanged.

## GitHub preflight

Require:

```text
Issue open
Status: status:ready
Active owner: none
prompt/task resolve
child environment/capabilities are eligible
no unresolved existing execution context for the same Issue
```

Dispatcher does not claim the Issue. Child Worker claims after startup.

## Isolation and lifecycle ownership

Dispatcher owns the repository-specific lifecycle:

```text
Issue #123
→ <repo>.worktrees/issue-123
→ tmux session codex-issue-123
→ start Codex
```

For a new dispatch:

1. require clean/synced main Dispatcher checkout;
2. record exact base SHA;
3. reconcile existing issue worktree/session before changing anything;
4. create isolated worktree;
5. create/reuse issue-linked tmux endpoint according to repository policy;
6. start/reuse Codex;
7. deliver the canonical handoff.

Never hide conflicts using destructive reset/clean or silently delete stale work.

## Communication mode A — native tmux

Until Channel MCP read/write/control is accepted, use native tmux for handoff delivery and tracking.

## Communication mode B — Channel MCP

After the Channel product is accepted for the needed operations, Dispatcher may use it **only as the communication path**:

```text
Dispatcher prepares worktree + tmux + Codex itself
→ Channel MCP list/get discovers that existing pane
→ write_text(handoff)
→ read_channel / send_control when needed
```

Do not call or invent MCP operations for:

```text
create_worker
restart_worker
destroy_worker
set_external_reference
create_worktree
create tmux session
start Codex
```

Those are outside the Channel product.

The Issue↔pane mapping remains Dispatcher state/knowledge, not Channel MCP state.

## Tracking

GitHub is project authority; tmux/Channel MCP is liveness and communication evidence.

```text
ready + no execution context
→ published, not executing here

in-progress + live context
→ active Attempt

in-progress + dead/missing context
→ Reviewer/Coordinator recovery condition

review
→ Reviewer next

blocked
→ no auto-resume

done/closed
→ project complete
```

Never infer Task completion from terminal text/activity.

## Recovery boundary

A missing tmux pane or `CHANNEL_NOT_FOUND` does not authorize automatic replacement.

Required flow:

```text
reconcile GitHub + worktree + commits/PR/evidence + process/channel state
→ Reviewer/Coordinator recovery decision
→ release stale owner if justified
→ ready/draft/blocked
→ next Worker claim is Attempt N+1
```

## Cleanup

Do not automatically remove worktree/session after Worker reports. Cleanup requires reconciled GitHub state and no work that would be lost.

## Forbidden authority

Dispatcher never:

- claims the Issue;
- changes Task Contract;
- implements Task code;
- fabricates Worker reports;
- Reviews/accepts/closes;
- auto-starts Attempt N+1;
- moves project lifecycle responsibilities into Channel MCP.
