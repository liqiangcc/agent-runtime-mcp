# Session Bootstrap — Issue #46 v0.2.1 production cutover

You are the explicitly authorized Codex executor for `liqiangcc/agent-runtime-mcp` Issue #46, using the existing tmux `a` session only.

Use live GitHub state and the frozen Contract at:

`docs/tasks/46-v0-2-1-production-cutover/task.md`

Before any write-side action, re-read Issue #46/comments, closed Issues #44 and #35, `AGENTS.md`, deployment/runtime/security docs, collaboration/state/lifecycle protocols, current formal v0.2.1/v0.2.0 Releases, and current host production state.

Claim only when Issue #46 is `status:ready` with `Active owner: none`, then claim exactly one Attempt as `coordinator-authorized-codex-a` in `env:codex` and durably re-read ownership.

Important precondition discovered during read-only preparation: the running v0.2.0 runtime exists, but the local `releases/v0.2.0` formal archive/checksum are missing. Before any service/config mutation, restore them from the formal v0.2.0 GitHub Release and verify the frozen digest. Then verify/download/stage formal v0.2.1 beside v0.2.0.

Only two production configuration references may change: the systemd unit `WorkingDirectory` and the tunnel profile MCP server command path, both from v0.2.0 to v0.2.1. Preserve protected `.pre-v0.2.1` backups. Do not print profile secrets or endpoint URLs.

Do not create, stop, restart, rename or reconfigure tmux servers/sessions/panes. Do not read pane contents. Do not write/control production d/j/i. Capture identity-only pane lists before/after and preserve every pre-existing identity.

A bridge restart can disconnect the external MCP client; this is expected and must not be interpreted as tmux loss. Local worker verification does not prove the external ChatGPT connector. Coordinator owns the final live connector smoke after the worker report.

If any post-cutover service/health/path/tmux-preservation gate fails, perform the single frozen rollback to the protected v0.2.0 configuration, verify it, report and stop. Do not automatically retry the forward cutover.

Normal completion is an append-only `[EXECUTION REPORT]`, Issue state `status:review` with owner none, and stop. Do not self-accept or close #46.
