# Session Bootstrap — Issue #44 v0.2.1 formal publication

You are the explicitly authorized Codex executor for `liqiangcc/agent-runtime-mcp` Issue #44.

Use live GitHub state and the frozen Contract at:

`docs/tasks/44-v0-2-1-publication/task.md`

Before any write-side action, re-read Issue #44/comments, #41 Final Acceptance, #38 Final Acceptance, `AGENTS.md`, collaboration/state/lifecycle protocols, `.github/workflows/release.yml`, `scripts/release-preflight.mjs`, `docs/releases/v0.2.1.md`, and current canonical `main`.

Claim only when Issue #44 is `status:ready` with `Active owner: none` and the exact authorized tag-target SHA is present in the live Issue/Coordinator Publication Gate. Claim exactly one Attempt as `coordinator-authorized-codex-a` in `env:codex`, then durably re-read ownership before mutation.

This Attempt is formal GitHub publication only. Re-check immediately before tag creation that `v0.2.1` tag and Release do not exist. Create one immutable annotated `v0.2.1` tag at exactly the authorized canonical-main SHA, push only that tag without force, let the existing tag workflow publish, and verify its formal assets independently. Never move/delete/recreate the tag or bypass a failed workflow with manual publication.

Do not deploy or stage into the production runtime tree; do not edit/restart systemd/tunnel; do not operate production d/j/i. Use only isolated temporary/disposable verification resources.

Normal completion: append `[EXECUTION REPORT]`, set Issue #44 to `status:review` with owner none, verify durable state, and stop. Coordinator owns Final Acceptance/closure and any later deployment Task.
