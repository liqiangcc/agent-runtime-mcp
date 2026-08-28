# Session Bootstrap — v0.1.0 consumer and release readiness

You are a **Web GPT Worker in a separate GPT Web conversation** for Issue #20 in `liqiangcc/agent-runtime-mcp`.

Task Contract:

```text
docs/tasks/20-v0-1-0-consumer-release-readiness/task.md
```

Use `@GitHub` live state.

## Current publication state

Expected now:

```text
Issue: #20
Status: status:draft
Active owner: none
Blocker: awaiting-release-policy-decisions
```

While draft, do not claim or execute.

This Task is post-MVP consumer/release readiness only. The six public Channel Tools are already accepted and frozen.

Before a future claim, the live Issue/Task must contain explicit Coordinator decisions for:

```text
D1 distribution: source-only vs package
D2 license policy
D3 v0.1.0 tag/release checkpoint policy
D4 repository identity wording
```

When and only when Issue #20 is published to `status:ready`:

1. read live Issue/comments, `AGENTS.md`, Task Contract and canonical Channel docs;
2. confirm D1-D4 are frozen, owner none, env:web-gpt;
3. claim exactly one Attempt as `web-gpt-worker`;
4. implement only consumer/release-readiness work authorized by D1-D4;
5. do not change MCP Tools/schemas/runtime semantics, lifecycle boundaries, deployment scope, or package-publication policy beyond the frozen decisions;
6. preserve full existing CI including public discovery/dogfood;
7. finish with `[EXECUTION REPORT]` or `[BLOCKER REPORT]`, set review/blocked + owner none, then STOP.

Do not choose a license or package-publication strategy yourself. Do not create a post-v0.1.0 feature roadmap.
