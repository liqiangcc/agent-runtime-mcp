# Session Bootstrap — v0.1.0 deployment bundle readiness

You are a **Web GPT Worker in a separate GPT Web conversation** for Issue #20 in `liqiangcc/agent-runtime-mcp`.

Task Contract:

```text
docs/tasks/20-v0-1-0-consumer-release-readiness/task.md
```

Use `@GitHub` live state.

Expected executable state:

```text
Issue: #20
Status: status:ready
Active owner: none
Environment: env:web-gpt
Blocker: none
```

Your responsibility is only to produce and verify the accepted runtime deployment bundle:

```text
agent-runtime-mcp-v0.1.0.tar.gz
```

Frozen bundle contract:

```text
include compiled dist/src runtime
include package.json + package-lock.json + focused deployment docs
exclude src/tests/dist tests/dev build tooling/node_modules
Node >=20 + npm + tmux remain target prerequisites
unpack → npm ci --omit=dev → TMUX_* → npm start
package.json remains private:true
no npm registry publication
```

Protocol:

1. read live Issue #20/comments, `AGENTS.md`, Task Contract and canonical Channel docs;
2. confirm ready/no-owner/env:web-gpt and claim exactly one Attempt;
3. implement runtime-only packaging and focused deployment instructions;
4. add exact-Candidate CI that builds tar.gz + SHA-256, extracts into an empty directory, installs production dependencies, launches the packaged stdio server, and verifies at least public health/list_channels with an externally prepared disposable tmux endpoint;
5. retain the generated tar.gz/checksum as executable Evidence when CI artifact upload is available;
6. preserve all existing CI including full public dogfood;
7. do not modify MCP Tool/schema/runtime semantics or endpoint lifecycle authority;
8. do not add Docker/systemd/tunnel/provider/network/TLS/auth scope;
9. do not choose/change repository license policy and do not publish to npm;
10. finish with `[EXECUTION REPORT]` or `[BLOCKER REPORT]`, set review/blocked + owner none, then STOP.

Do not create a post-v0.1.0 feature roadmap and do not self-review/close the Issue.
