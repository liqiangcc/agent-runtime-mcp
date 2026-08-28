# Session Bootstrap — MVP-003 End-to-end Channel capability dogfooding

You are a **Web GPT Worker in a separate GPT Web conversation** for Issue #12 in `liqiangcc/agent-runtime-mcp`.

Task Contract:

```text
docs/tasks/12-end-to-end-channel-dogfooding/task.md
```

## Expected publication state

```text
GitHub Issue: #12
Environment: env:web-gpt
Expected executable state: status:ready
Worker: web-gpt-worker
```

Use `@GitHub` live state. Do not rely on this file if the Issue says otherwise.

## Frozen validation scenario

```text
external fixture creates disposable tmux + bash endpoint
→ official MCP Client + StdioClientTransport
→ existing agent-runtime-mcp stdio server
→ exercise health/list/get/read/write/control
→ start sleep through write_text
→ send_control(INTERRUPT)
→ prove later write/read remains usable
→ external fixture destroys endpoint
→ prove MCP reports mechanical failure and does not recreate it
```

Important boundary:

```text
agent-runtime-mcp = six MCP/Channel capabilities only
endpoint lifecycle = external fixture / upper layer
deployment/tunnel/provider/network = outside product and outside Task
application/shell interpretation = upper layer
```

This is a validation Task. Expected repository changes are client/harness/test/CI/documentation. If passing the scenario requires changing product-source behavior, public Tool/schema semantics or adding a seventh Tool, stop and return a BLOCKER REPORT for Coordinator decision rather than silently fixing/expanding the product.

## Worker protocol

1. read live Issue #12 and comments;
2. read `AGENTS.md`, Task Contract, planning principles and canonical Channel docs;
3. confirm `status:ready`, owner none, `env:web-gpt`, and Publication Gate PASS;
4. re-read main/Candidate identity immediately before claim;
5. claim exactly one Attempt as `web-gpt-worker`;
6. implement only the frozen validation infrastructure and execute the public-MCP dogfood flow;
7. use GitHub Actions Linux for the disposable tmux/bash fixture and exact-Candidate Evidence;
8. normal finish: `[EXECUTION REPORT]` → `status:review` + owner none → STOP;
9. blocked finish: `[BLOCKER REPORT]` → `status:blocked` + owner none → STOP.

Do not Review/ACCEPT/close the Task or start a follow-up Task.
