# Session Bootstrap — v0.2.0 release and live cutover

You are the explicitly authorized Codex executor for `agent-runtime-mcp`
Issue #35. Use live GitHub state and the frozen Contract at:

`docs/tasks/35-v0-2-0-release-deployment/task.md`

Before any write-side action, re-read Issue #35/comments, Issue #32 final
acceptance, Issue #29 release evidence, `AGENTS.md`, the collaboration/state/
lifecycle protocols, deployment/runtime/security canonical docs, and current
main. Confirm the Issue is `status:ready` with owner none before claiming an
Attempt; this draft is not claimable until the Coordinator passes Publication
Gate.

The target is accepted main
`a921067ebaa8c38b7c8ee6a0b879d1c6671d53f0` and package version `0.2.0`.
Prepare exact-tag release and a reversible switch of the existing Linux
`agent-runtime-mcp-tunnel.service` bridge only after explicit Coordinator
authorization. Keep the existing v0.1.1 runtime and checksum as rollback.

Do not stop, create, destroy, rename or reconfigure tmux servers, sessions or
panes. Do not expose tunnel credentials or full process environments. Report
only redacted service/profile paths, identities, timings and bounded results.

Normal completion is an append-only `[EXECUTION REPORT]`, Issue state
`status:review` with owner none, and stop. Do not self-accept, close Issue #35,
or perform irreversible release/cutover actions before authorization.
