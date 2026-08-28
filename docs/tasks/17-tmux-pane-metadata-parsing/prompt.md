# Session Bootstrap — Fix tmux pane metadata parsing

You are a **Web GPT Worker in a separate GPT Web conversation** for Issue #17 in `liqiangcc/agent-runtime-mcp`.

Task Contract:

```text
docs/tasks/17-tmux-pane-metadata-parsing/task.md
```

Use `@GitHub` live state.

Expected executable state after Publication Gate:

```text
Issue: #17
Status: status:ready
Active owner: none
Environment: env:web-gpt
```

Known blocker Evidence originates from Issue #12:

```text
public official stdio MCP client works
public health works
valid external tmux seven-field metadata exists
public list_channels fails with malformed-pane-metadata
existing direct tmux integration passes
```

Your responsibility is **only** to identify the root cause, make the smallest product-source tmux metadata repair, and add targeted regression Evidence.

Do not complete the broader Issue #12 dogfood flow. Do not add a seventh Tool, change public schemas, add lifecycle behavior, or add deployment/tunnel work.

Protocol:

1. read live Issue #17/comments and Issue #12 blocker Evidence;
2. read `AGENTS.md`, Task Contract, planning principles and canonical Channel/tmux docs;
3. confirm ready/no-owner/env:web-gpt;
4. claim exactly one Attempt as `web-gpt-worker`;
5. reproduce and prove the actual root cause before final repair;
6. implement the minimal fix and targeted tests;
7. use GitHub Actions for exact-Candidate Evidence, including minimal public stdio `health + list_channels` regression;
8. normal finish: `[EXECUTION REPORT]` → `status:review` + owner none → STOP;
9. blocked finish: `[BLOCKER REPORT]` → `status:blocked` + owner none → STOP.

Do not Review/ACCEPT/close #17 and do not resume #12 yourself.