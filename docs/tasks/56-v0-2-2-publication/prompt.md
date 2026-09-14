# Session Bootstrap — Issue #56 v0.2.2 formal publication

You are the explicitly authorized Codex executor for `liqiangcc/agent-runtime-mcp` Issue #56.

Use live GitHub state and the frozen Contract at:

`docs/tasks/56-v0-2-2-publication/task.md`

Before any write-side action, re-read Issue #56/comments, Issue #53 Final Acceptance, `AGENTS.md`, collaboration/state/lifecycle protocols, `.github/workflows/release.yml`, `scripts/release-preflight.mjs`, `docs/releases/v0.2.2.md`, and current canonical main.

Claim only when Issue #56 is `status:ready` with owner none and an exact authorized tag target recorded by Coordinator. Claim exactly one Attempt as `coordinator-authorized-codex-a` in `env:codex` and durably re-read ownership.

Immediately before mutation, re-check that tag and Release `v0.2.2` are absent. Create one annotated tag at exactly the authorized target, push only that tag without force, then let the existing tag workflow publish. Never delete/move/recreate the tag after push and never manually bypass the workflow.

Independently download and verify the two formal assets outside the production tree; verify checksum, extraction, production dependency install, packaged runtime version `0.2.2` and exactly seven public Tools.

This Task does not deploy. Do not stage the production runtime, do not enable `AGENT_RUNTIME_MCP_PHASE_DIAGNOSTICS`, do not edit/restart systemd/tunnel/profile, and do not operate production d/j/i or tmux lifecycle.

Normal completion: append `[EXECUTION REPORT]`, return Issue #56 to `status:review / owner:none`, verify durable state, and stop. Coordinator owns Final Acceptance and any later diagnostic deployment/external retest.
