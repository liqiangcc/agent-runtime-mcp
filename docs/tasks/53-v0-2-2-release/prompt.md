# Session Bootstrap — Issue #53 v0.2.2 release preparation

You are the explicitly authorized Codex executor for `liqiangcc/agent-runtime-mcp` Issue #53.

Use live GitHub state and the frozen Contract at:

`docs/tasks/53-v0-2-2-release/task.md`

Before any write-side action, re-read Issue #53/comments, Issue #50 Final Acceptance, `AGENTS.md`, collaboration/state/lifecycle protocols, release workflow/preflight files, current package/runtime/security docs and canonical `main`.

Claim only when Issue #53 is `status:ready` with `Active owner: none`, then claim exactly one Attempt as `coordinator-authorized-codex-a` in `env:codex` and durably re-read ownership before repository writes.

This Attempt is **release preparation only**. Prepare a reviewable v0.2.2 version/Release Note Candidate + PR with exact-SHA CI/release-preflight evidence. Do not create `v0.2.2` tag or GitHub Release, do not enable `AGENT_RUNTIME_MCP_PHASE_DIAGNOSTICS` in production, do not deploy/restart services, and do not operate production d/j/i.

Do not blindly replace every `0.2.1`. Historical v0.2.1 Release/Task/continuity evidence remains historical. Change only current release/runtime version surfaces.

The Release Note must preserve Issue #50 semantics: diagnostics are default-off, bounded stderr-only metadata; `backend_end` is actual read-action settlement; `method_end` is handler completion only; seven public Tool semantics are unchanged; the external 45–111 second latency class is not claimed fixed.

Normal completion: append `[EXECUTION REPORT]`, set Issue #53 to `status:review` with owner none, verify durable state, and stop. Coordinator owns review/integration and later publication/deployment gates.
