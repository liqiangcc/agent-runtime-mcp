# Handoff Profile — Codex Worker

This profile defines the canonical Task Worker handoff and how the Coordinator routes it through `task-dispatcher`.

## 1. Canonical Worker handoff

When the repository-scoped Worker skill is available:

```text
$task-worker Execute Issue #<issue> using `docs/tasks/<issue>-<slug>/prompt.md`.
```

This string is the stable Task-to-Worker bootstrap. It contains navigation only; GitHub + `task.md` remain authoritative.

Publisher or Reviewer produces this handoff only when the Issue is `status:ready + Active owner: none` after required read-back.

## 2. Preferred Coordinator → Dispatcher entry

When `task-dispatcher` is available, do not manually paste the Task Contract into a Codex terminal. Give Dispatcher the canonical Worker handoff unchanged:

```text
$task-dispatcher Dispatch this Worker handoff unchanged:
$task-worker Execute Issue #<issue> using `docs/tasks/<issue>-<slug>/prompt.md`.
```

Dispatcher must live-read the Issue, verify `ready + no owner + capability/environment match`, prepare/resolve the isolated runtime, and transport the Worker handoff unchanged.

Dispatcher does **not** claim the Issue. The child Worker claims after startup.

## 3. Worker fallback entry

If `$task-worker` is unavailable inside the child Codex session, Dispatcher may deliver this fallback bootstrap instead:

```text
Execute liqiangcc/agent-runtime-mcp Issue #<issue>.

Use live GitHub state, not chat history.

Before claiming, read:
- AGENTS.md
- Issue #<issue> and all relevant comments
- docs/tasks/<issue>-<slug>/prompt.md
- docs/tasks/<issue>-<slug>/task.md
- docs/tasks/collaboration-protocol.md
- docs/tasks/issue-state-convention.md
- docs/tasks/issue-lifecycle-protocol.md
- every canonical document required by task.md

Confirm the Issue is open, Status is status:ready, Active owner is none, and required capabilities are available.

Then claim exactly one Attempt, change live state to status:in-progress with your Worker identity, re-read to confirm ownership, and execute only the published Task Contract.

Normal completion:
- persist candidate/evidence
- post [EXECUTION REPORT]
- move to status:review
- clear Active owner
- re-read the Issue
- stop

Blocked completion:
- post [BLOCKER REPORT]
- move to status:blocked
- clear Active owner
- re-read the Issue
- stop

Do not dispatch another Worker, set status:done, close the Issue, start another Attempt, or select another Task. Task Reviewer / GPT Web Coordinator is the next authority.
```

## 4. Publication rule

Publisher emits a handoff only after:

```text
Issue exists/open
+ state block valid
+ status:draft before publication
+ task.md committed/read back
+ prompt.md committed/read back
+ canonical docs resolve
+ dependencies/capabilities explicit
+ Success Criteria frozen
+ Active owner = none
→ Status: status:ready
→ final read-back
→ canonical Worker handoff
```

## 5. Reviewer redispatch rule

For unchanged-contract REVISE/UNBLOCK/recovery:

```text
Reviewer
→ Status: status:ready
→ Active owner: none
→ final read-back
→ fresh canonical Worker handoff
→ Dispatcher
→ child Worker claim
→ Attempt N+1
```

For Contract/bootstrap change, Reviewer returns the Task to draft and Publisher republishes before any new dispatch.

## 6. Dispatcher bootstrap transport

Before `agent-runtime-mcp` can manage its own Codex runtimes, Dispatcher may implement delivery with:

```text
isolated git worktree
→ issue-linked native tmux session
→ Codex CLI
→ literal Worker handoff input
```

Default mapping:

```text
Issue #<N>
→ <repo>.worktrees/issue-<N>
→ tmux codex-issue-<N>
```

## 7. Runtime-backed transport

After the required runtime capabilities are accepted, Dispatcher should replace native tmux orchestration with runtime MCP composition, for example:

```text
get/create Worker
→ set_external_reference(worker, "github:liqiangcc/agent-runtime-mcp#<issue>")
→ send_text(worker, canonical_handoff, submit=true)
→ capture/track as needed
```

This changes the transport only.

```text
Dispatcher/runtime delivery
!= Issue claim
!= Attempt start
!= Task acceptance
```

GitHub remains Task authority.