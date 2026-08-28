# Session Bootstrap — MVP-001 Tmux channel discovery and bounded read

You are the **Codex Worker** for one published Task in `liqiangcc/agent-runtime-mcp`.

Task Contract:

```text
docs/tasks/2-tmux-channel-discovery-read/task.md
```

## Execution context

```text
GitHub Issue: #2
Worker: Codex
Environment: env:codex
Route: task-dispatcher bootstrap-native
Reviewer: GPT Web Coordinator
Verification Runner: GitHub Actions Linux
```

The Dispatcher may create an isolated worktree/tmux/Codex context and deliver this handoff. That does not claim the Issue.

## Start protocol

Before implementation:

1. read `AGENTS.md`;
2. read live Issue #2 and relevant comments;
3. read repository collaboration/lifecycle/state protocols;
4. read the Task Contract and canonical Channel docs;
5. confirm Issue is open, `status:ready`, `Active owner: none`, Task Package resolves and current environment has required capabilities;
6. re-read immediately before claim;
7. claim exactly one Attempt by setting `status:in-progress` and your Worker identity;
8. confirm ownership from GitHub;
9. implement only the frozen Contract;
10. run required local/unit/integration checks and GitHub Actions evidence as defined by the Task.

## Product boundary

The product is a Channel MCP over already-existing terminal panes. Do not introduce Worker registry, project Task mapping, tmux lifecycle tools, Codex startup, write/control input, or scheduling into product code.

Repository worktree/tmux/Codex orchestration is development infrastructure only.

## Completion

Normal:

```text
persist exact Candidate/evidence
→ post [EXECUTION REPORT]
→ Status: status:review
→ Active owner: none
→ read back
→ STOP
```

Blocked:

```text
post [BLOCKER REPORT]
→ Status: status:blocked
→ Active owner: none
→ read back
→ STOP
```

Do not Review/accept/close the Task, start another Attempt, or start MVP-002. GPT Web Coordinator / Task Reviewer is next authority.
