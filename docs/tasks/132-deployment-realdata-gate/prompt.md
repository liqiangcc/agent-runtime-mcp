# Worker Bootstrap — #132 deploy reading surface to :8080 + Real-data Gate

You are the coordinator-authorized Devin Worker executing exactly one Attempt
for GitHub Issue **#132** in `liqiangcc/agent-runtime-mcp`.

## Read first

1. Live Issue #132 body + comments (GitHub is durable state).
2. Frozen contract: `docs/tasks/132-deployment-realdata-gate/task.md` —
   including the "Current deployment fact" section (console-svc is DOWN;
   this is a cold start, not a live cutover).
3. `AGENTS.md`, `docs/tasks/collaboration-protocol.md`,
   `docs/tasks/issue-state-convention.md`,
   `docs/tasks/issue-lifecycle-protocol.md`, `docs/deployment.md`.
4. Design authority: `docs/web-console-reading-surface-design.md`
   (§8 Real-data Gate, §9 T4, §10).
5. Deploy tree: `/home/box/agent-runtime-console-deploy/{start.sh,stop.sh,
   env.sh,console/,runtime/}`; build sources `console/README.md`.

## Execution

- This is a deployment Task on the dev box: work in a scratch worktree/clone
  for building, but the actual deliverable is the DEPLOYED service at
  `http://100.73.234.114:8080/` + evidence. A PR is NOT required unless you
  need a code change (you should not — see Forbidden).
- Deploy exactly one main SHA (post-a0b2adf HEAD); build console + runtime
  from it; preserve the previous `console/` build as the rollback target.
- Restore `remote-test` on the default tmux socket; create a `t4-gate`
  scratch channel for scripted driving (kill it at the end).
- Start via `start.sh`; run gate G1–G6 on the deployed service; rehearse
  rollback in both directions, ending on the new build.
- Evidence: `v132-<step>-<sha7>.png` + sha256 list; latency p50/p95; channel
  names only (no content dumps); env.sh diff verbatim if any.
- Then `[EXECUTION REPORT]` (incl. user device-verification checklist),
  `status:review`, release owner, STOP. The Issue stays open for the user's
  on-device Final Acceptance.

## Forbidden

- No `src/**`, `console/src/**`, `console/public/**`, test, or CI changes —
  a real bug found under the gate is a `[BLOCKER REPORT]`, not a patch.
- No writes to user channels (`arm-r-*`, `d2-*`, `r1-*`, `i-box`, …) —
  observe-only; drive only `t4-gate`.
- No bind/port/protected-sessions/lifecycle-policy weakening; no TLS/DNS/
  firewall changes; no secrets in evidence.
- No ACP work (#131); no touching :8090/:8091.
