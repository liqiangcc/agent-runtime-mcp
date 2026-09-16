# Task — Deploy reading surface to :8080 with rollback + Real-data Gate

## Metadata

```text
GitHub Issue: #132
Task ID: 132-deployment-realdata-gate
Task kind: deployment + verification
Base commit: a0b2adf (main, post-#128)
Candidate commit: n/a (deployment consumes merged main; report records the
  exact deployed SHA)
Session bootstrap: docs/tasks/132-deployment-realdata-gate/prompt.md
Preferred worker: coordinator-authorized-devin
Environment: env:devin
Handoff profile: docs/tasks/handoffs/devin.md
Required capabilities: github-read-write, deployment-shell-access (Box),
  playwright, browser-viewport-screenshots, tmux
Hard dependencies: T3 merged (a0b2adf — reading surface on real data)
Parent: #116 · docs/web-console-reading-surface-design.md @ 6094e58
```

Live Task state belongs in GitHub Issue/comments, not this file.

Planning method: `docs/tasks/planning-principles.md`. Design authority:
`docs/web-console-reading-surface-design.md` (§8 Real-data Gate, §9 T4 row,
§10 leak checklist).

## Current deployment fact (must read)

As of 2026-09-16 the production Console is DOWN: the `console-svc` tmux
session and the `:8080` listener are absent. The deploy tree
`/home/box/agent-runtime-console-deploy/` is intact:

```text
agent-runtime-console-deploy/
  start.sh    tmux new-session -d -s console-svc → node console/dist/src/server.js
  stop.sh
  env.sh      CONSOLE_BIND=100.73.234.114, CONSOLE_PORT=8080,
              CONSOLE_MCP_ENTRY=runtime/dist/src/server.js,
              CONSOLE_LIFECYCLE_ENABLED=1, profiles shell+devin,
              CONSOLE_PROTECTED_SESSIONS=arm-r-box,d2-box,d2-coord,r1-box,
                remote-test,console-svc,
              CONSOLE_TERMINAL_ENABLED=1
  console/    previous console build (dist/, public/, node_modules/)
  runtime/    previous MCP build (dist/, node_modules/)
```

Because the service is already stopped, "cutover" is a cold start with the
new build — there is no live-traffic cutover window. The user has decided:
deploy now, directly to `:8080` (no staging port).

Channels are discovered on the default tmux socket (env.sh leaves
`TMUX_SOCKET_NAME` unset). That socket is alive (`arm-r-box`, `arm-r-coord`,
`d2-*`, `r1-*`, …). `remote-test` is listed in `CONSOLE_PROTECTED_SESSIONS`
but its session is absent — a stale pane process survives orphaned. Restoring
it is part of this deploy.

## Goal

Bring the merged reading surface (post-a0b2adf) up on
`http://100.73.234.114:8080/` as the production tailnet Console, prove the
Real-data Gate against the DEPLOYED service with a real tmux Channel, prove
the rollback path once, and leave the Issue ready for the user's on-device
Final Acceptance.

## Primary Use Case

```text
Actor: coordinator-authorized Devin Worker (deployment operator)
Trigger: deploy approved reading surface to production :8080
Preconditions: main contains T1+T2a+T2b+T3 (a0b2adf); deploy tree intact;
  console-svc down
Main flow:
1. record current deploy state (SHAs/dirs) as rollback target;
2. build console (+ runtime) from the deployed SHA; stage into deploy tree;
3. restore the remote-test endpoint; create a t4-gate scratch channel;
4. start.sh → verify :8080 serves and discovers real channels;
5. run the Real-data Gate (below) against the deployed service;
6. rehearse rollback: stop → restore previous build → start → verify →
   then redeploy the new build and re-verify;
7. post evidence + device-verification checklist for the user.
Success outcome: :8080 serves the reading surface on real data; gate passes;
  rollback demonstrated; user device checklist ready.
Failure outcome: deploy/gate fails and rollback is NOT demonstrated →
  BLOCKER; any product-semantics change attempted → STOP.
Degraded outcome: a gate item fails on real data that fixtures did not
  expose → report verbatim with evidence; do not patch under this Task.
Authoritative evidence: scripted checks on the deployed service, screenshots
  named v132-<step>-<sha7>.png with sha256 listed, latency p50/p95 numbers,
  rollback rehearsal result — all tied to the exact deployed SHA.
```

## Separation Points

```text
S7 evidence → acceptance   This Task produces evidence; the Reviewer and the
                           user decide acceptance. Identical before/after
                           hashes are a mechanical REJECT.
Deployment | product       All changes live outside src/** and console/src
                           semantics. The deploy tree, tmux sessions and
                           scripts are operator-layer (docs/deployment.md).
Observation | rendering    Gate checks use the deployed UI as-is; no code
                           edits to make a check pass.
```

## Single Responsibilities

```text
deploy tree (agent-runtime-console-deploy) = build staging + service start/stop
console-svc session                        = the production process host
t4-gate scratch channel                    = real Channel for scripted gate
real user channels (arm-r-*, d2-*, …)      = observe-only; never written to
```

## Logic / Control Separation

```text
Control owns: deployment order, backup/restore, service start/stop, gate
  execution, evidence collection.
Logic owns (unchanged, under test): projection/adapter/history/observer and
  the ported reading surface — exercised, never modified.
```

## Success / Failure / Degradation

- Success: :8080 on new build; gate items G1–G6 pass on real data; rollback
  rehearsed and verified; report + device checklist posted.
- Hard failure: any src/** or console/src semantic edit; MCP tool surface
  touched; env.sh rewritten to weaken security boundaries (bind address,
  protected sessions, lifecycle profiles); secrets or full transcripts
  persisted.
- Safe degradation: gate finding that traces to a real code bug →
  [BLOCKER REPORT] with the failing evidence, service left in the last
  verified-good state (old build if new build is the failure cause).

## Required Capabilities

```text
Use Case → deploy           → shell on Box + deploy tree + tmux
Use Case → real channel     → tmux on default socket (t4-gate, remote-test)
Use Case → gate evidence    → Playwright or equivalent scripted browser +
                              DOM assertions + screenshots + sha256
Use Case → latency          → SSE delta timestamps vs read.captured_at
Use Case → rollback         → stop.sh / build swap / start.sh rehearsal
```

## Canonical / Process Sources

Read: `AGENTS.md`, `docs/tasks/{planning-principles,collaboration-protocol,
issue-state-convention,issue-lifecycle-protocol}.md`,
`docs/web-console-reading-surface-design.md` (§8, §9 T4, §10),
`docs/deployment.md`, `console/README.md`, deploy tree
`/home/box/agent-runtime-console-deploy/{start.sh,stop.sh,env.sh}`.

## In Scope

- Build `console/` and `runtime/` from the deployed main SHA into the deploy
  tree (previous `console/` preserved as `console.prev-<oldsha>` or
  equivalent for rollback).
- Recreate `remote-test` on the default socket if absent
  (`while true; do date; sleep 60; done` loop as before).
- Create a `t4-gate` scratch tmux session for scripted gate driving
  (bash with controllable output; kill it at the end).
- Start the service via `start.sh`; verify bind/port/channel discovery.
- Real-data Gate G1–G6 (below) against `http://100.73.234.114:8080/`.
- One full rollback rehearsal ending on the new build.
- `[EXECUTION REPORT]` + device-verification checklist for the user.

## Out of Scope

- `src/**`, `console/src/**`, `console/public/**`, tests, CI workflows — no
  code changes; bugs found → report, do not fix.
- GitHub branch/PR changes; new endpoints; transport changes.
- `:8090` / `:8091` prototype servers (leave them).
- ACP direction (#131); any channel other than tmux.
- TLS/DNS/firewall/tailnet changes; CONSOLE_* policy changes beyond what the
  new build strictly requires (justify any env delta in the report).
- Writing to real user channels (arm-r-*, d2-*, r1-*, i-box, …): observe-only.

## Architecture Invariants

- MCP public tool surface unchanged (7 tools); deployment only swaps builds.
- Bind stays `100.73.234.114:8080` tailnet-only.
- `CONSOLE_PROTECTED_SESSIONS` and lifecycle profile semantics preserved
  verbatim unless the new build requires otherwise (then justify).
- Gate channels never receive writes the operator did not intend; no writes
  to user channels.
- Evidence never embeds secrets; screenshots may show real channel content —
  pick a benign channel (t4-gate or a shell pane) for published shots.

## Implementation Requirements

1. Deploy exactly one main SHA (record it); build `console` and `runtime`
   from that SHA (`npm ci && npm run build` per console/README); stage into
   deploy tree with the previous console build preserved for rollback.
2. Keep a machine-checkable record: deployed SHA, build artifact hashes,
   rollback target SHA.
3. Rollback rehearsal: stop → swap to previous build → start → assert :8080
   serves old surface → stop → swap to new build → start → assert new
   surface. Both directions must be verified, not just scripted.
4. `remote-test` restored before gate so `CONSOLE_PROTECTED_SESSIONS`
   matches reality; `t4-gate` created for driving; killed at end.
5. If `env.sh` needs changes for the new build, diff is shown verbatim in
   the report with justification; otherwise env.sh untouched.

## Claims / Verification (Real-data Gate, run on the deployed service)

```text
G1: channel discovery — /api/channels lists the real default-socket sessions
    (t4-gate, remote-test, arm-r-* present); get_channel healthy.
G2: generic conversation on t4-gate — console send produces a user bubble;
    subsequent real output renders as an answer block; output_idle settles it;
    raw view byte-equals /api/channels/:id/raw.
G3: real-time — while t4-gate produces continuous output, UI updates in
    place; record per-delta (SSE arrival − read.captured_at); report
    p50/p95; target p95 ≤ 1.5 s; attach a frame sequence or DOM counters
    proving in-place increments (no whole-list rebuild).
G4: settled-turn structure — after settle, exactly one .trace-sum per
    settled turn and zero top-level .tool-card; expand/collapse preserves
    answer node identity and scroll position.
G5: mobile widths — no page-level horizontal scroll at 375 / 390 / 420;
    standalone-sim exercises the #111 screenExtent floor (HUD/assert).
G6: adapter selection — default generic; selecting devin on a channel
    persists across reload; an unrecognized devin turn falls back to
    generic/raw visibly.

Evidence naming: v132-<step>-<sha7>.png + sha256 list; identical
before/after hashes anywhere = mechanical REJECT.
```

## Evidence Contract

```text
[EXECUTION REPORT] on #132 must include:
- deployed SHA + build hashes + rollback target SHA;
- rollback rehearsal: both directions verified (verbatim assertions);
- G1–G6 results with screenshot filenames + sha256 + the DOM assertions run;
- latency table (n, p50, p95) with measurement method;
- post-deploy channel list (names only, no content dumps);
- env.sh diff (or "unchanged");
- device-verification checklist for the user (standalone add-to-homescreen,
  shell floor, send/receive, settle collapse, raw view);
- explicit statement: Issue remains status:review pending user on-device
  Final Acceptance.
```

## Success Criteria

- :8080 serves the new reading surface on real channel data; G1–G6 pass.
- Rollback demonstrated in both directions; service ends on the new build.
- No product-code delta; env.sh delta justified or absent.
- Report + checklist posted; status:review; owner cleared; worker stops.
