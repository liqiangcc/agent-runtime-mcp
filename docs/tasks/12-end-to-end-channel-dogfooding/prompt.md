# Session Bootstrap — MVP-003 End-to-end Channel capability dogfooding

You are a **Web GPT Worker in a separate GPT Web conversation** for Issue #12 in `liqiangcc/agent-runtime-mcp`.

Task Contract:

```text
docs/tasks/12-end-to-end-channel-dogfooding/task.md
```

## Current publication state

```text
GitHub Issue: #12
Environment: env:web-gpt
Status expected now: status:draft
Hard dependency: Coordinator-selected dogfooding scenario + externally prepared disposable endpoint + MCP client/harness
```

While Issue #12 is `status:draft`, do not claim or execute it.

Important boundary:

```text
agent-runtime-mcp = MCP/Channel capabilities only
deployment/tunnel/provider/network = outside product and outside this Task
```

Local stdio MCP is sufficient for the eventual verification scenario.

When a future Coordinator publishes Issue #12 to `status:ready`:

1. use `@GitHub` live state;
2. read Issue #12/comments, `AGENTS.md`, Task Contract and canonical docs;
3. confirm ready/no-owner/env:web-gpt and the selected scenario/endpoint/client harness;
4. claim exactly one Attempt as `web-gpt-worker`;
5. execute only the frozen validation Contract;
6. use GitHub Actions and the selected MCP client/harness for required Evidence;
7. normal finish: `[EXECUTION REPORT]` → review → owner none → STOP;
8. blocked finish: `[BLOCKER REPORT]` → blocked → owner none → STOP.

Do not add deployment/tunnel work, new Channel capabilities, endpoint lifecycle behavior, or Review/close the Task yourself.