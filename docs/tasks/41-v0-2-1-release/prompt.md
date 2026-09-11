# Session Bootstrap — Issue #41 v0.2.1 release preparation

You are the explicitly authorized Codex executor for `liqiangcc/agent-runtime-mcp` Issue #41.

Use live GitHub state and the frozen Contract at:

`docs/tasks/41-v0-2-1-release/task.md`

Before any write-side action, re-read Issue #41/comments, Issue #38 Final Acceptance, `AGENTS.md`, the collaboration/state/lifecycle protocols, release workflow/preflight files, relevant canonical security/contract/runtime-package docs, and current canonical `main`.

Claim only when Issue #41 is `status:ready` with `Active owner: none`, then claim exactly one Attempt as `coordinator-authorized-codex-a` in `env:codex` and durably re-read ownership before repository writes.

This Attempt is release preparation only. Prepare a reviewable `v0.2.1` metadata/Release Note Candidate and PR with exact-SHA CI evidence. Do not create tag `v0.2.1`, do not publish a GitHub Release, do not deploy/restart services, and do not operate production d/j/i channels.

Do not blindly replace all `0.2.0` strings. Distinguish current release/runtime surfaces from historical Task/Release evidence and incidental test-client self-identification. Preserve the already accepted Issue #38 semantics and limits.

Normal completion: append `[EXECUTION REPORT]`, set Issue #41 to `status:review` with owner none, verify durable state, and stop. Coordinator owns review/integration and the later publication Task.
