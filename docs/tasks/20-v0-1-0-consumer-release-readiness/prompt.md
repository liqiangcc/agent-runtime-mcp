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
Blocker: awaiting-license-policy-decision
```

While draft, do not claim or execute.

This Task is post-MVP consumer/release readiness only. The six public Channel Tools are already accepted and frozen.

Coordinator decisions already frozen:

```text
D1 distribution:
source-only v0.1.0
keep package.json private: true
no npm/package publication

D3 release checkpoint:
after readiness Final Acceptance, Coordinator creates v0.1.0 tag + GitHub Release on the same accepted canonical commit

D4 product identity:
Generic MCP communication layer for already-existing interactive terminal Channels, with tmux as the first backend.
```

Only D2 remains unresolved:

```text
D2 license policy
= owner decision
```

When and only when Issue #20 is published to `status:ready` after D2 is frozen:

1. read live Issue/comments, `AGENTS.md`, Task Contract and canonical Channel docs;
2. confirm D1-D4 are frozen, owner none, env:web-gpt;
3. claim exactly one Attempt as `web-gpt-worker`;
4. implement only consumer/release-readiness work authorized by D1-D4;
5. preserve `private: true` and do not publish an npm/package;
6. align consumer-facing repository identity/docs with the generic Channel MCP wording;
7. add one concrete local stdio MCP client configuration example with external tmux endpoint preparation;
8. apply only the owner-selected license policy;
9. do not create the final v0.1.0 tag/GitHub Release; Coordinator does that only after Final Acceptance;
10. do not change MCP Tools/schemas/runtime semantics, lifecycle boundaries or deployment scope;
11. preserve full existing CI including public discovery/dogfood;
12. finish with `[EXECUTION REPORT]` or `[BLOCKER REPORT]`, set review/blocked + owner none, then STOP.

Do not choose a license yourself. Do not create a post-v0.1.0 feature roadmap.
