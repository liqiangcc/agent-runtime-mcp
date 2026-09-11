# Task 46 — v0.2.1 production cutover with v0.2.0 rollback

## Metadata

```text
GitHub Issue: #46
Task ID: 46-v0-2-1-production-cutover
Task kind: production deployment + reversible verification
Base commit: 44a1b914689e22af32c4f1f7caedc79a4b63c31d
Candidate release: v0.2.1
Release target commit: 44a1b914689e22af32c4f1f7caedc79a4b63c31d
Release archive SHA-256: ee60aad9f842915b142eca0c461e7050d048a3fc3953097a99e003cd2f56d2e0
Session bootstrap: docs/tasks/46-v0-2-1-production-cutover/prompt.md
Preferred worker: coordinator-authorized-codex-a
Environment: env:codex
Handoff profile: docs/tasks/handoffs/codex.md
Required capabilities: github-read, release-asset-download, linux-systemd-read-write, package-installation, tmux-read-only-inventory, local-mcp-verification
Hard dependencies: Issue #44 Final Acceptance; published v0.2.1 Release; healthy current v0.2.0 production service; recoverable v0.2.0 rollback source
```

Live Task state belongs in Issue #46 and append-only comments.

## Goal

Deploy the already published and accepted v0.2.1 runtime to the existing production `agent-runtime-mcp-tunnel.service` using a narrow, reversible operator cutover. Preserve v0.2.0 as a verified rollback target, preserve every pre-existing tmux application pane, verify the live bridge and seven-tool runtime after the restart, and roll back immediately if the post-cutover gate fails.

This is deployment/operator work, not a product capability. No product code or public MCP contract change belongs in this Task.

## Read-only preparation baseline

The Coordinator-authorized read-only inventory before publication of this Contract established:

```text
service: agent-runtime-mcp-tunnel.service
service state: active / enabled
current WorkingDirectory: /root/agent-runtime-mcp-runtime/agent-runtime-mcp-v0.2.0
current MCP script: /root/agent-runtime-mcp-runtime/agent-runtime-mcp-v0.2.0/dist/src/server.js
profile: /root/.config/tunnel-client/agent-runtime-mcp.yaml
profile MCP command: /root/agent-runtime-mcp-runtime/agent-runtime-mcp-v0.2.0/dist/src/server.js
healthz: HTTP 200 / live
readyz: HTTP 200 / ready
v0.2.0 runtime dir: present, package version 0.2.0
v0.2.1 runtime dir: absent
v0.2.0 local release archive/checksum under releases/v0.2.0: absent
available filesystem space: approximately 3.05 GB
preparation tmux pane count: 12
preparation tmux identity digest: 332d5b1f51d614324dca73181a4a55aecd3ee9ea5140121ffd1121c637c1eb0f
```

The service cgroup contained tunnel/MCP-side processes but no tmux server or tmux pane application process. The current unit/profile paths both point to v0.2.0 and therefore form the operational rollback target.

The preparation digest is historical evidence only. The executor must capture a fresh immediately-before-cutover pane list/digest and compare against the immediately-after-cutover list.

## Primary Use Case

```text
Actor: authorized deployment operator in existing tmux a executor
Trigger: Coordinator Publication Gate PASS for Issue #46
Preconditions:
- formal v0.2.1 GitHub Release remains public and its archive digest matches this Contract;
- production is still healthy on v0.2.0;
- current unit/profile still point to v0.2.0;
- no tmux process belongs to the service cgroup;
- a verified formal v0.2.0 rollback archive/checksum has been restored locally before any service mutation;
- v0.2.1 is staged beside, never over, v0.2.0;
- fresh pre-cutover tmux identities are captured.
Main flow:
1. restore and verify formal v0.2.0 rollback assets from the existing v0.2.0 GitHub Release;
2. download and verify formal v0.2.1 assets from the accepted Release;
3. extract/install v0.2.1 into a versioned sibling runtime directory and verify the staged runtime;
4. create protected pre-v0.2.1 backups of the current unit and tunnel profile;
5. capture fresh service/cgroup/health and tmux identity evidence;
6. change only the unit WorkingDirectory and tunnel profile MCP command path from v0.2.0 to v0.2.1;
7. daemon-reload and perform one bounded restart of agent-runtime-mcp-tunnel.service;
8. verify v0.2.1 child path, health/readiness, seven-tool runtime identity and preserved tmux identities;
9. if any required post-cutover check fails, restore the pre-v0.2.1 unit/profile and restart back to v0.2.0;
10. report durable evidence and stop for Coordinator live-connector acceptance.
Success outcome:
- production bridge runs the formal v0.2.1 asset;
- health/readiness and seven-tool verification pass;
- all pre-existing tmux panes remain present with unchanged endpoint identities;
- verified v0.2.0 rollback assets and runtime remain available.
Failure outcome:
- failed asset identity, staging, service, health, runtime, or pane-preservation checks trigger stop-before-mutation or immediate rollback;
- a failed rollback is BLOCKED and must be reported without further improvisation.
Degraded outcome:
- active external MCP clients may disconnect during the bounded bridge restart and must reconnect/reinitialize;
- tmux application endpoints must survive independently;
- Coordinator may need to verify the external ChatGPT connector after the local worker has completed.
```

## Separation Points

```text
Channel MCP product | deployment/operator layer
```

Deployment, systemd, tunnel configuration, release download, staging and rollback remain outside the MCP product contract. The MCP must not gain deployment APIs because of this Task.

```text
bridge restart | tmux endpoint lifecycle
```

Restarting the tunnel/MCP bridge may disconnect MCP clients. It must not stop, create, destroy, rename, reconfigure or restart tmux servers, sessions or panes.

```text
formal Release identity | production runtime directory
```

Release checksum proves artifact identity. The operator separately stages that artifact in a versioned directory. Existing v0.2.0 is never overwritten in place.

```text
local worker verification | external connector acceptance
```

The worker can verify host/service identity and isolated/local MCP behavior. The Coordinator performs any final current-conversation connector smoke after restart; worker must not claim external connector success from local stdio evidence alone.

## Single Responsibilities

```text
GitHub Release        = immutable v0.2.1/v0.2.0 asset source and digest identity
versioned runtime dir = extracted production package + production dependencies
systemd unit          = WorkingDirectory selection
 tunnel profile       = MCP command path selection
operator              = backups, stage, cutover, rollback and host evidence
TmuxBackend/tmux      = existing endpoints only; no deployment lifecycle ownership
Coordinator           = Publication Gate, final external live smoke and Final Acceptance
```

## Canonical / Process Sources

Read before execution:

- `AGENTS.md`
- `docs/tasks/README.md`
- `docs/tasks/planning-principles.md`
- `docs/tasks/collaboration-protocol.md`
- `docs/tasks/issue-state-convention.md`
- `docs/tasks/issue-lifecycle-protocol.md`
- `docs/deployment.md`
- `docs/runtime-package.md`
- `docs/security.md`
- `docs/mcp-contract.md`
- `docs/tasks/35-v0-2-0-release-deployment/task.md`
- `docs/tasks/44-v0-2-1-publication/task.md`
- live Issues #35, #44 and #46

## In Scope

- restore the formal v0.2.0 archive/checksum locally as rollback evidence before mutation;
- verify v0.2.0 formal archive digest against the existing GitHub Release;
- download and verify the formal v0.2.1 archive/checksum;
- stage `/root/agent-runtime-mcp-runtime/agent-runtime-mcp-v0.2.1` beside v0.2.0;
- install production dependencies for the staged runtime;
- run isolated/local packaged runtime verification for version 0.2.1 and exactly seven tools;
- create protected `.pre-v0.2.1` backups of the current unit/profile immediately before editing;
- update exactly two versioned path references from v0.2.0 to v0.2.1;
- bounded `systemctl daemon-reload` + one service restart;
- verify live service child path, `/healthz`, `/readyz`, current runtime package version and bridge availability;
- capture fresh before/after tmux pane identity lists and prove all pre-existing pane identities survive;
- execute v0.2.0 rollback if post-cutover acceptance fails;
- preserve rollback assets/runtime after a successful cutover.

## Out of Scope

- product code, API/schema, history capacity or observation semantic changes;
- changing public tool count or MCP security model;
- tunnel endpoint/provider, credentials, ports, DNS, firewall, TLS or auth changes;
- modifying session allowlists or tmux configuration;
- creating/restarting/destroying production tmux application endpoints;
- writing or controlling production d/j/i Channels;
- changing application commands/content inside existing panes;
- deleting v0.2.0, v0.1.1 or older rollback material;
- npm registry publication;
- fixing the separately unlocalized historical `read_channel` end-to-end delay.

## Frozen paths and asset identities

```text
unit: /etc/systemd/system/agent-runtime-mcp-tunnel.service
profile: /root/.config/tunnel-client/agent-runtime-mcp.yaml
health URL file: /root/.local/state/tunnel-client/health/agent-runtime-mcp.url
runtime root: /root/agent-runtime-mcp-runtime
v0.2.0 runtime: /root/agent-runtime-mcp-runtime/agent-runtime-mcp-v0.2.0
v0.2.1 runtime: /root/agent-runtime-mcp-runtime/agent-runtime-mcp-v0.2.1
v0.2.0 rollback asset dir: /root/agent-runtime-mcp-runtime/releases/v0.2.0
v0.2.1 asset dir: /root/agent-runtime-mcp-runtime/releases/v0.2.1
unit backup: /etc/systemd/system/agent-runtime-mcp-tunnel.service.pre-v0.2.1
profile backup: /root/.config/tunnel-client/agent-runtime-mcp.yaml.pre-v0.2.1
```

Formal release digests:

```text
v0.2.0 archive SHA-256: 9f37cc78426c40ccbcf775e41da50502277f4f6afe9e7f09d88aaf3584f1a8f8
v0.2.1 archive SHA-256: ee60aad9f842915b142eca0c461e7050d048a3fc3953097a99e003cd2f56d2e0
```

The executor must verify the checksum files as well as these recorded archive digests. Any mismatch is BLOCKED before service mutation.

## Implementation Requirements

1. Re-read live Issue #46 and confirm `status:ready / owner:none` before claim. Claim exactly one Attempt and read back durable ownership.
2. Re-read Issues #44/#35, formal v0.2.1/v0.2.0 Releases and the current production paths before any write.
3. Before service mutation, restore the missing v0.2.0 formal archive and checksum into `releases/v0.2.0` from the public Release and verify SHA-256 `9f37...a8f8`. Do not reconstruct a rollback archive from the live runtime directory.
4. Download v0.2.1 formal archive/checksum into `releases/v0.2.1`, verify checksum and SHA-256 `ee60...d2e0`, and require exactly the accepted formal files.
5. Extract v0.2.1 into a new sibling directory. If that target already exists unexpectedly, do not overwrite it; establish identity or BLOCK. Run `npm ci --omit=dev --ignore-scripts` (or an equally strict repository-supported production install) in the staged runtime.
6. Verify staged `package.json` version `0.2.1`, server file existence and exactly seven public tools using the repository's packaged-runtime verifier or equivalent isolated stdio check. Do not touch production tmux for this staged verification.
7. Immediately before mutation, verify service is active/enabled and still uses v0.2.0; health/ready pass; profile command still uses v0.2.0; service cgroup contains no tmux server/pane application process.
8. Capture fresh default-tmux pane identity rows in exact format `session|window_id|window_index|pane_id|pane_index|tty` and SHA-256. Preserve the full list in Issue evidence; do not read pane contents.
9. Create `.pre-v0.2.1` unit/profile backups with ownership/modes preserved. If those backup paths already exist unexpectedly, do not overwrite without proving they are the intended current-v0.2.0 backups; otherwise BLOCK.
10. Change only these two references: unit `WorkingDirectory` v0.2.0 → v0.2.1 and profile MCP `command` server path v0.2.0 → v0.2.1. Validate no other textual/config difference and never print protected profile values.
11. Run `systemctl daemon-reload` then one bounded restart of `agent-runtime-mcp-tunnel.service`. Expect the current external MCP connection to disconnect/reinitialize; this is not tmux loss.
12. After restart, require service active; child MCP script path under v0.2.1; healthz live; readyz ready; staged/runtime package version 0.2.1. Confirm unit/profile still differ from backups only by the two authorized version paths.
13. Capture post-cutover tmux identities. Every pre-cutover identity must remain present unchanged. If the exact digest differs, inspect only the identity-list diff: unrelated newly added panes do not prove loss, but any missing or changed pre-existing pane is a deployment failure and triggers rollback.
14. Run local/isolated seven-tool runtime verification. Do not infer external ChatGPT connector success from it.
15. If any step after service mutation fails, restore both `.pre-v0.2.1` files, daemon-reload, restart once, and verify v0.2.0 child path, health/ready and preservation of pre-cutover tmux identities. Report rollback outcome; do not continue forward deployment after rollback.
16. On success or rollback completion, write an append-only EXECUTION REPORT, return Issue to `status:review / owner:none`, and stop. Do not close #46 or self-accept.

## Claims / Verification

```text
C1: deployed bytes come from the formal v0.2.1 Release archive with accepted digest.
C2: v0.2.0 formal rollback archive/checksum and existing runtime are verified before cutover.
C3: only WorkingDirectory and profile MCP command version paths change.
C4: service restart does not mutate or remove pre-existing tmux panes.
C5: post-cutover service is active/live/ready and its child/runtime path is v0.2.1.
C6: v0.2.1 staged/runtime verification exposes exactly seven public tools and package version 0.2.1.
C7: rollback to v0.2.0 is executable from protected backups and verified assets if any post-cutover gate fails.
C8: production d/j/i are never written or controlled; no secrets or tunnel endpoint values are persisted.
C9: no product/API/semantic change is made by this deployment Task.
```

## Success Criteria

1. `SC1`: formal v0.2.0 and v0.2.1 archives/checksum files are present in versioned local release dirs and independently verify against their accepted digests before cutover.
2. `SC2`: v0.2.1 is staged beside v0.2.0, production dependencies install cleanly, version is 0.2.1 and isolated runtime verification returns exactly seven tools.
3. `SC3`: fresh pre-cutover service/health/cgroup/tmux evidence confirms the frozen starting boundary and protected backups are created without exposing secrets.
4. `SC4`: diff of unit/profile proves exactly two authorized version-path changes; the controlled restart succeeds.
5. `SC5`: post-cutover service child path is v0.2.1, health is live and readiness is ready.
6. `SC6`: every pre-existing tmux pane identity remains present unchanged after cutover; d/j/i are not written or controlled.
7. `SC7`: v0.2.0 runtime, formal rollback assets and `.pre-v0.2.1` backups remain preserved after success.
8. `SC8`: if the forward gate fails, rollback restores v0.2.0 service health and the pre-cutover tmux identities; no repeated forward attempts occur automatically.
9. `SC9`: worker returns review/none with exact evidence; Coordinator independently verifies the external live connector before Final Acceptance.

## Failure / Blocked Rules

BLOCK before mutation if release assets/digests cannot be verified, v0.2.0 rollback material cannot be restored, service is not healthy on the expected current version, v0.2.1 staging identity is ambiguous, protected backup paths conflict, the service cgroup owns tmux processes, or the fresh tmux inventory cannot be captured.

After service mutation, any failed service/health/path/tmux-preservation check triggers one rollback sequence. If rollback fails, stop immediately in `status:blocked / owner:none`; do not improvise additional restarts or edit tmux/application processes.

Never weaken a criterion because the current external MCP connection temporarily disconnects during the expected bridge restart. Reconnection is an external-client concern and Coordinator verification follows the worker report.

## Publication Dependency / Alignment Gate

This Task may become `status:ready` only after the Coordinator verifies:

- Issue #44 remains closed/completed and v0.2.1 Release/tag identity is unchanged;
- this Task package is merged to canonical main;
- the read-only production baseline still points to healthy v0.2.0;
- the formal v0.2.0 Release remains available so the missing local rollback archive can be restored before mutation;
- the authorized executor remains the existing tmux `a` channel, not a replacement session.

Publication Gate authorizes the specific staging/cutover/rollback procedure above. It does not authorize broader host/network/tmux changes.

## Evidence Contract

Record without secrets:

- exact v0.2.0/v0.2.1 Release identities and archive digests;
- local versioned asset/runtime paths and checksum PASS;
- pre/post service state, child script version path and health/readiness states;
- redacted confirmation that unit/profile differ only by two version path references;
- protected backup paths/modes;
- full pre/post tmux identity rows and digests, plus identity-only diff if changed;
- restart/rollback outcome and bounded timing where available;
- local staged/runtime seven-tool verification;
- explicit note that external ChatGPT connector verification remains Coordinator-owned;
- explicit confirmation that d/j/i were not written or controlled.

Do not persist tunnel endpoint URLs, credentials/tokens, full profile contents, process environments, pane output or unrelated application data.
