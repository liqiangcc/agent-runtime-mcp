# Session Bootstrap — Issue #48 read_channel latency diagnosis

You are the explicitly authorized Codex diagnostic executor for `liqiangcc/agent-runtime-mcp` Issue #48, using the existing tmux `a` session only.

Use live GitHub state and the frozen Contract at:

`docs/tasks/48-read-channel-latency-diagnosis/task.md`

Before any diagnostic action, re-read Issue #48/comments, Issue #38 incident evidence, Issue #46 Final Acceptance, `AGENTS.md`, collaboration/state/lifecycle protocols, channel/tmux/MCP/deployment/security canonical docs, and current production/main identity.

Claim only when Issue #48 is `status:ready` with `Active owner: none`, then claim exactly one Attempt as `coordinator-authorized-codex-a` in `env:codex` and durably re-read ownership.

Attempt 1 is read-only diagnosis. Do not modify product code, tests, workflow, deployment, systemd/tunnel profile, logging configuration or production service state. Do not restart anything. Do not write/control production d/j/i. Do not use production application panes as generated benchmark fixtures.

Create a disposable isolated tmux socket/session and measure the same small/large bounded read workload at three layers: direct tmux capture, production-equivalent TmuxBackend read, and isolated stdio MCP `read_channel`, at least 5 samples per payload/layer. The large case must be comparable to `lines=650, bytes=45000`. Report sizes/truncation and timing method.

Read existing recent bridge/service logs only as needed to determine whether request/response/method timing can currently be correlated. If not, report the exact observability gap; do not add instrumentation in this Attempt.

Do not claim the historical roughly 110-second external call is a server defect unless local evidence actually localizes it. `local fast + external unknown` is a valid result.

Normal completion: append `[EXECUTION REPORT]`, set Issue #48 to `status:review / owner:none`, verify durable state, and stop. Coordinator will perform the external ChatGPT connector timing/correlation and decide ACCEPT/SPLIT/BLOCK/REVISE.
