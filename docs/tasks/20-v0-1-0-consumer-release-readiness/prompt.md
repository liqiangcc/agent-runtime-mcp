# Session Bootstrap — v0.1.0 consumer and deployment-bundle readiness

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

This Task packages the already accepted six-Tool Channel MCP runtime. It is not a new MCP capability and not deployment-infrastructure work.

Coordinator decisions already frozen:

```text
D1 distribution:
agent-runtime-mcp-v0.1.0.tar.gz deployment bundle
compiled dist/src runtime + package manifests + consumer/deployment docs + LICENSE
no src/tests/dev build tooling in bundle
no embedded Node/tmux
unpack → npm ci --omit=dev → TMUX_* → npm start
package.json remains private:true
no npm registry publication

D3 release checkpoint:
after readiness Final Acceptance, accepted archive + SHA-256 are bound to the same v0.1.0 canonical release checkpoint

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
4. implement only consumer/release-readiness + runtime deployment-bundle work authorized by D1-D4;
5. preserve `private:true` and do not publish to npm;
6. produce `agent-runtime-mcp-v0.1.0.tar.gz` with compiled runtime, production manifests, docs and the frozen LICENSE;
7. exclude source/tests/dist tests/dev tooling, Node/tmux and deployment infrastructure from the archive;
8. add CI clean-room verification: extract to empty dir → `npm ci --omit=dev` → launch the packaged stdio server and verify the accepted public path;
9. produce SHA-256 Evidence for the exact deployment artifact;
10. align consumer-facing identity/docs and include concrete local stdio + external tmux configuration;
11. do not create the final v0.1.0 release checkpoint before Coordinator acceptance;
12. do not change MCP Tools/schemas/runtime semantics or endpoint lifecycle authority;
13. preserve full existing CI including public discovery/dogfood;
14. finish with `[EXECUTION REPORT]` or `[BLOCKER REPORT]`, set review/blocked + owner none, then STOP.

Do not choose a license yourself. Do not add Docker/systemd/tunnel/provider scope merely because this is called a deployment bundle. Do not create a post-v0.1.0 feature roadmap.
