# Session Bootstrap — stale pre-initialize stdio compatibility

You are a **Web GPT Worker in a separate GPT Web conversation** for Issue #22 in `liqiangcc/agent-runtime-mcp`.

Task Contract:

```text
docs/tasks/22-stdio-stale-preinitialize-compat/task.md
```

Use `@GitHub` live state.

Expected executable state after Publication Gate:

```text
Issue: #22
Status: status:ready
Active owner: none
Environment: env:web-gpt
Worker route: separate-gpt-web-conversation
```

## Frozen purpose

This is a **compatibility regression / validation Task** based on the historical failure fixed in `liqiangcc/reading-mcp` PR #15 (`fix: preserve stdio lifecycle across stale tunnel calls`).

Prove on the real built `agent-runtime-mcp` stdio child that:

```text
no initialize
→ raw claim-less tools/list
→ bounded response
→ process remains alive
→ SAME connection initialize succeeds
→ notifications/initialized
→ tools/list returns exact six accepted Tools
→ tools/call health remains usable
```

## Rules

1. live-read Issue #22/comments, `AGENTS.md`, Task Contract, current `src/server.ts`, `package.json`, and relevant existing CI/tests before claim;
2. confirm Publication Gate PASS, owner none and env:web-gpt;
3. claim exactly one Attempt as `web-gpt-worker`;
4. use a small raw stdio JSON-RPC test harness because the scenario intentionally violates the normal client initialize ordering;
5. exercise the real built server child (`node dist/src/server.js` or the repository-equivalent built entry), not a mocked `serveStdio` instance;
6. use bounded timeouts so a wedged connection fails deterministically;
7. prove child-process liveness after the stale call and same-connection later initialize;
8. post-init Tool discovery must equal exactly `list_channels`, `get_channel`, `read_channel`, `write_text`, `send_control`, `health`;
9. call `health` after initialization to prove normal public Tool dispatch remains usable;
10. preserve existing full CI including runtime deployment bundle and dogfood;
11. do not add ChatGPT/Tunnel/provider/reconnect/process-supervision semantics;
12. do not add or change public MCP Tools/schemas;
13. this Task is expected to change tests/CI only. If the frozen scenario fails and product `src/` behavior must change, STOP with `[BLOCKER REPORT]`; do not patch runtime behavior inside #22;
14. finish with `[EXECUTION REPORT]` or `[BLOCKER REPORT]`, set `status:review` or `status:blocked`, clear owner, then STOP.

Do not diagnose ChatGPT internals from repository tests. The Task can only prove whether the MCP stdio process itself survives and remains usable after stale pre-initialize traffic.
