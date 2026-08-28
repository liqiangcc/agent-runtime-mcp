# Session Bootstrap — MVP-002 Safe channel text and control input

You are a **Web GPT Worker in a separate GPT Web conversation** for one repository Task in `liqiangcc/agent-runtime-mcp`.

This file is bootstrap/navigation only. The Task Contract is:

```text
docs/tasks/10-safe-channel-text-control/task.md
```

## Current publication state

```text
GitHub Issue: #10
Environment: env:web-gpt
Status expected now: status:draft
Hard dependency: Issue #2 MVP-001 Final Acceptance + interface alignment
```

While Issue #10 is still `status:draft`, **do not claim or implement it**.

When a future Coordinator Publication Gate changes Issue #10 to `status:ready`, use live GitHub state and the standard repository Web Worker protocol:

1. read Issue #10 and relevant comments with `@GitHub`;
2. read `AGENTS.md`, collaboration/lifecycle/state protocols, this Task Contract, and required canonical docs;
3. confirm `status:ready`, `Active owner: none`, `Environment: env:web-gpt`, and all dependencies/capabilities are satisfied;
4. re-read immediately before claim;
5. claim exactly one Attempt as `web-gpt-worker`;
6. execute only the frozen Task Contract;
7. use GitHub Actions for required executable/typecheck/unit/real-tmux Evidence;
8. normal finish: `[EXECUTION REPORT]` → `status:review` → owner none → STOP;
9. blocked finish: `[BLOCKER REPORT]` → `status:blocked` → owner none → STOP.

Do not Review/ACCEPT/close the Task or start MVP-003. The original GPT Web Coordinator conversation is the next authority.
