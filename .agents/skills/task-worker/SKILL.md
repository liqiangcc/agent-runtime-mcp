---
name: task-worker
description: Claim and execute exactly one published agent-runtime-mcp repository Task Attempt, report durable results to its GitHub Issue, release ownership, and stop. Never publish, dispatch, review, accept, close, or automatically select another Task.
---

# Task Worker

Execute exactly one repository Task Attempt.

## Before execution

Read:

1. `AGENTS.md`
2. target Issue and relevant comments
3. Task `prompt.md` and `task.md`
4. `docs/tasks/collaboration-protocol.md`
5. `docs/tasks/issue-state-convention.md`
6. `docs/tasks/issue-lifecycle-protocol.md`
7. canonical product docs required by the Task.

Prefer an explicit handoff such as:

```text
$task-worker Execute Issue #2 using `docs/tasks/2-tmux-channel-discovery-read/prompt.md`.
```

## Claim

Immediately before write-side work require:

```text
Issue open
Status: status:ready
Active owner: none
Task Package resolves
required capabilities available
```

Then change the Issue body to `status:in-progress` with your Worker identity, re-read to confirm, and start the next Attempt number from Issue history.

Dispatcher launch does not claim the Issue.

## Execute frozen Contract only

Do not silently change Scope, Claims, Success Criteria, security or architecture.

Current canonical product boundary:

```text
agent-runtime-mcp product
= generic terminal Channel MCP
= discover / inspect / bounded read / text write / explicit control / health
```

Product code must not absorb repository collaboration concerns such as:

```text
Worker/Agent registry
Issue/Task mapping
worktree lifecycle
tmux session/pane creation
Codex startup/restart
project scheduling/review
```

Those belong to this repository's upper-layer development workflow.

Do not add raw generic `tmux_command` or `run_shell_command` public APIs.

## Security

- backend execution uses structured argv/stdin;
- terminal text is data;
- explicit control is a closed set;
- reads are bounded and potentially sensitive;
- configured tmux visibility scope is respected;
- normal product operation requires no root;
- do not persist secrets or unnecessary terminal transcripts.

## Repository isolation

Use the issue-isolated worktree supplied by Dispatcher or another Task-specific checkout. Do not mutate Coordinator/Dispatcher main checkout.

Persist coherent in-scope work and exact Candidate/evidence. Reuse valid prior branch/PR when instructed by Reviewer.

## Normal completion

```text
persist candidate/evidence
→ post [EXECUTION REPORT]
→ Status: status:review
→ Active owner: none
→ re-read
→ STOP
```

## Blocked completion

```text
preserve safe state
→ post [BLOCKER REPORT]
→ Status: status:blocked
→ Active owner: none
→ re-read
→ STOP
```

Never set `status:done`, close the Issue, Review yourself, dispatch another Worker, or start another Attempt/Task.

After durable update, return only the handoff essentials and state that Task Reviewer / GPT Web Coordinator is next authority.
