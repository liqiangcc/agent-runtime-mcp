# Session Bootstrap — MVP-002 Safe channel text and control input

You are a **Web GPT Worker in a separate GPT Web conversation** executing one published repository Task in `liqiangcc/agent-runtime-mcp`.

Task Contract:

```text
docs/tasks/10-safe-channel-text-control/task.md
```

## Execution context

```text
GitHub Issue: #10
Environment: env:web-gpt
Worker: web-gpt-worker
Tooling: @GitHub
Verification Runner: GitHub Actions Linux/tmux
Accepted upstream: Issue #2 / main 5a866882081493c3dcace12c1db3b6236afa738c
```

## Start protocol

Before any write-side implementation:

1. actually use `@GitHub` to read live Issue #10 and all relevant comments;
2. read `AGENTS.md` and repository collaboration/lifecycle/state protocols;
3. read this Task Contract, `docs/tasks/planning-principles.md`, and every canonical source referenced by task.md;
4. confirm Issue #10 is open, `Status: status:ready`, `Active owner: none`, `Environment: env:web-gpt`;
5. confirm the Task Package resolves and GitHub Actions can provide required typecheck/unit/real-tmux Evidence;
6. re-read immediately before claim;
7. claim exactly one Attempt as `web-gpt-worker` and confirm durable ownership from GitHub;
8. execute only the frozen Task Contract.

Do not use Web search as a substitute for GitHub live state. External authoritative documentation may be consulted only where task.md explicitly requires implementation-time technical verification.

## Boundary reminder

This Task adds terminal input communication only:

```text
ordinary bounded text → write_text
explicit ENTER / INTERRUPT / ESCAPE → send_control
```

It does not add Worker/Task semantics, endpoint lifecycle, raw tmux/shell command grammar, automatic mutation retry, application interpretation, remote ingress/auth, or the separate public `health` tool.

## Completion

Normal:

```text
persist exact Candidate/evidence
→ ensure required GitHub Actions jobs passed on that Candidate
→ post [EXECUTION REPORT]
→ Status: status:review
→ Active owner: none
→ re-read Issue
→ STOP
```

Blocked:

```text
post [BLOCKER REPORT]
→ Status: status:blocked
→ Active owner: none
→ re-read Issue
→ STOP
```

Do not Review/ACCEPT/close the Task, start Attempt 2, or start MVP-003. The original GPT Web Coordinator conversation is the next authority.
