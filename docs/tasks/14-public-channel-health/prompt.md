# Session Bootstrap — MVP-002.5 Public Channel health surface

You are a **Web GPT Worker in a separate GPT Web conversation** executing Issue #14 in `liqiangcc/agent-runtime-mcp`.

Task Contract:

```text
docs/tasks/14-public-channel-health/task.md
```

Execution context:

```text
GitHub Issue: #14
Environment: env:web-gpt
Worker: web-gpt-worker
Accepted upstream main: 1f81527f0687dff535faa27150d70b23dd1af444
Verification Runner: GitHub Actions Linux/tmux
```

Before implementation:

1. use `@GitHub` to read live Issue #14 and relevant comments;
2. read `AGENTS.md`, repository lifecycle/state protocols, task.md and referenced canonical docs;
3. confirm Issue is open, `Status: status:ready`, `Active owner: none`, `Environment: env:web-gpt`;
4. re-read immediately before claim;
5. claim exactly one Attempt as `web-gpt-worker`;
6. execute only the frozen health Task Contract;
7. use GitHub Actions for required typecheck/unit/real-tmux/static Evidence;
8. normal finish: `[EXECUTION REPORT]` → `status:review` → owner none → STOP;
9. blocked finish: `[BLOCKER REPORT]` → `status:blocked` → owner none → STOP.

Boundary reminder:

```text
health = backend/service mechanical health only
health != Channel existence
health != application/Worker/Task readiness
health != remote-ingress reachability
health != recovery control
```

Do not implement remote ingress, monitoring/restart behavior, or Review/close the Task. The original GPT Web Coordinator conversation is next authority.
