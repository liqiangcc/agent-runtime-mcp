# Session Bootstrap — Issue #58 v0.2.2 diagnostic deploy/retest

You are the explicitly authorized Codex executor for `liqiangcc/agent-runtime-mcp` Issue #58 using the existing tmux `a` session only.

Use live GitHub state and the frozen Contract:

`docs/tasks/58-v0-2-2-diagnostic-deploy-retest/task.md`

Before any mutation re-read Issue #58/comments, Issues #48/#50/#56 Final Acceptance, `AGENTS.md`, deployment/runtime/security docs, collaboration/state/lifecycle protocols, formal v0.2.1/v0.2.2 Releases and fresh host state.

Claim only when Issue #58 is `status:ready / owner:none`, then claim exactly one Attempt as `coordinator-authorized-codex-a` in `env:codex` and durably re-read ownership.

Before service/config mutation verify v0.2.1 rollback archive digest `ee60aad9f842915b142eca0c461e7050d048a3fc3953097a99e003cd2f56d2e0`, formal v0.2.2 archive digest `ea418353392588bcc8c9ecbc229763cc8b7757cad64e79ecffaae7428cbc5db6`, stage/install/verify v0.2.2, capture fresh service/health/cgroup/pre-existing tmux identities, create the one safe Task-owned fixture, and create protected `.pre-v0.2.2` backups.

Diagnostic cutover may only change the two v0.2.1→v0.2.2 runtime paths plus exact systemd `Environment=AGENT_RUNTIME_MCP_PHASE_DIAGNOSTICS=1`, followed by one bounded restart. Verify flag reaches the MCP child, v0.2.2 is live/ready, and all pre-existing panes survive. Then post `[DIAGNOSTIC READY]` with the safe fixture channel_id and stop at the prompt while keeping Issue in-progress/owned; Coordinator will run the actual external probes.

After Coordinator sends the probe timing summary, parse only bounded accepted phase records, classify the latency boundary without inventing identity joins, then **always disable diagnostics** by removing the exact environment setting and restart once while keeping v0.2.2 paths. Delete only the Task-owned fixture, prove final diagnostics-off v0.2.2/live/ready state and exact preservation of every pre-existing tmux identity.

If mandatory cutover/final-cleanup gates fail, restore `.pre-v0.2.2` v0.2.1 config and restart once; do not automatically retry forward deployment.

Never write/control d/j/i or other pre-existing application panes; never output credentials, tunnel URLs, raw journal bodies, terminal content, raw request IDs/cursors/tokens or full environments.

Normal completion after cleanup: append `[EXECUTION REPORT]`, set Issue to `status:review / owner:none`, verify durable state, and stop. Coordinator owns final acceptance and any follow-up fix/instrumentation split.
