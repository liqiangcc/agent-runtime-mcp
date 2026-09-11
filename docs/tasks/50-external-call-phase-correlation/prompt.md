# Session Bootstrap — Issue #50 external MCP phase correlation

You are the explicitly authorized Codex executor for `liqiangcc/agent-runtime-mcp` Issue #50.

Use live GitHub state and the frozen Contract at:

`docs/tasks/50-external-call-phase-correlation/task.md`

Before any write-side action, re-read Issue #50/comments, Issue #48 Final Acceptance, `AGENTS.md`, repository collaboration/state/lifecycle rules, `docs/security.md`, `docs/requirements.md`, `docs/mcp-contract.md`, `src/mcp.ts`, `src/server.ts`, `src/handlers.ts`, current canonical `main`, and the installed `@modelcontextprotocol/server` callback/context + stdio transport types/source referenced by the Task.

Claim only when Issue #50 is `status:ready` with `Active owner: none`, then claim exactly one Attempt as `coordinator-authorized-codex-a` in `env:codex` and durably re-read ownership before repository writes.

Implement only the default-off, bounded, stderr-only phase diagnostics frozen by the Task. Preserve all public MCP Tool names/schemas/results/errors, cursor/timeout/limit semantics and cancellation. Never log terminal/write content, raw cursor/token/request IDs, full arguments/results/errors, credentials, tunnel URLs or environments. Do not assume current tunnel request IDs equal MCP JSON-RPC IDs.

Critical semantic boundary: `method_end` means Tool callback/handler completion only. It does not prove SDK response encoding, stdout write/drain, bridge forwarding, connector posting or remote receipt. Do not implement transport monkey-patching or overclaim this boundary.

Add isolated stdio verification for `health` and `read_channel`, including disabled silence, enabled ordered phase records, safe request-id fingerprinting, sensitive-sentinel negative evidence and stdout protocol integrity. Open one implementation PR with exact-SHA CI evidence.

Do not deploy or enable diagnostics in production, do not restart/configure the live service, and do not write/control production d/j/i or alter tmux lifecycle.

Normal completion: append `[EXECUTION REPORT]`, set Issue #50 to `status:review` with owner none, verify durable state, and stop. Coordinator owns review/integration and any later deployment/external diagnostic gate.
