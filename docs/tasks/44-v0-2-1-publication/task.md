# Task 44 — publish v0.2.1 GitHub Release

## Metadata

```text
GitHub Issue: #44
Task ID: 44-v0-2-1-publication
Task kind: formal tag + GitHub Release publication verification
Base commit: 65711829d4e4ba9802e6659819314b228e234857
Candidate commit: n/a
Session bootstrap: docs/tasks/44-v0-2-1-publication/prompt.md
Preferred worker: coordinator-authorized-codex-a
Environment: env:codex
Handoff profile: docs/tasks/handoffs/codex.md
Required capabilities: github-read-write, git-tag-write, github-actions-evidence, release-read, release-asset-download, local-isolated-package-verification
Hard dependencies: Issue #38 Final Acceptance; Issue #41 Final Acceptance; accepted v0.2.1 metadata integrated on canonical main
Release target: resolve exact canonical-main SHA after this Task package is integrated
Tag: v0.2.1
```

Live Task state belongs in Issue #44 and append-only comments.

## Goal

Publish `v0.2.1` exactly once from an explicitly authorized canonical-main commit through the existing immutable tag-driven Release workflow. Verify the published tag, workflow, archive, checksum and packaged seven-tool runtime independently, then return for Coordinator acceptance. Do not deploy, stage into the production runtime tree, restart services, or mutate production Channels.

## Primary Use Case

```text
Actor: explicitly authorized Codex release publisher
Trigger: Coordinator Publication Gate names one exact canonical-main target SHA
Preconditions:
- Issue #38 implementation and Issue #41 release preparation are finally accepted;
- canonical main contains the accepted v0.2.1 package/runtime/release-note state;
- package.json and root lock metadata identify 0.2.1;
- src runtime advertises 0.2.1 and docs/releases/v0.2.1.md is final public text;
- no v0.2.1 tag exists and no GitHub Release for v0.2.1 exists;
- existing tag-only release workflow is unchanged except already-reviewed wording corrections.
Main flow:
1. fetch/re-read canonical main and record the exact authorized target SHA;
2. require exact-target CI success and run `node scripts/release-preflight.mjs v0.2.1`;
3. re-check immediately before mutation that tag/Release v0.2.1 do not exist;
4. create one immutable annotated `v0.2.1` tag at exactly the authorized target and push only that tag;
5. wait for the tag-triggered Release workflow and require verify-release + publish-release success;
6. verify tag peeling, published Release metadata and exact asset set;
7. independently download the formal archive/checksum outside the production runtime tree, verify checksum, extract/install production dependencies in an isolated temporary directory, and verify the packaged runtime exposes exactly seven tools;
8. post EXECUTION REPORT, return Issue to status:review / owner:none, and stop.
Success outcome:
- tag `v0.2.1` peels to exactly the authorized canonical-main commit;
- the tag-triggered workflow publishes one public non-prerelease Release using checked-in release notes;
- formal archive/checksum are exactly the workflow-produced assets and checksum verification passes;
- isolated packaged runtime verifies the seven-tool surface and version 0.2.1;
- no production deployment/restart/channel mutation occurs.
Failure outcome:
- any preexisting tag/Release, target drift, preflight/CI failure, tag mismatch, workflow failure, asset mismatch, checksum failure or packaged-runtime failure stops the Task;
- once the immutable tag is pushed, failure is reported against that durable tag; do not delete, move or recreate it to hide failure.
Degraded outcome:
- after a pushed tag, a workflow/provider outage may leave publication incomplete; preserve the tag and workflow evidence and return BLOCKED for Coordinator recovery rather than manually publishing or rewriting history.
Authoritative evidence:
- exact canonical target and tag object/peeled commit;
- exact tag-triggered GitHub Actions run/jobs;
- GitHub Release metadata and asset names;
- independently computed archive SHA-256 / checksum-file verification;
- isolated extracted runtime version and seven-tool discovery.
```

## Separation Points

```text
accepted release metadata | immutable publication
```

Issue #41 prepared and integrated the release metadata. This Task does not revise product/release content unless a discovered blocking inconsistency requires a fresh Coordinator decision.

```text
Git tag | GitHub Release
```

The tag is the immutable source identity. The existing workflow derives and publishes assets from that tag. Do not manually create a parallel Release or substitute assets if the workflow fails.

```text
formal publication | production deployment
```

Published assets may be downloaded only for isolated verification. Do not install under `/root/agent-runtime-mcp-runtime/agent-runtime-mcp-v0.2.1`, edit systemd/tunnel profiles, restart bridge processes, or cut over production in this Task.

```text
release verification | Channel application activity
```

Seven-tool/runtime verification must use an isolated/disposable endpoint where terminal observation is needed. Do not write/control production d/j/i or use their application output as release evidence.

## Single Responsibilities

```text
canonical main                 = accepted release source
annotated v0.2.1 tag           = immutable source identity
.github/workflows/release.yml  = deterministic build + draft verification + publication
GitHub Release                 = public archive/checksum distribution
isolated verifier              = independent checksum/install/runtime/tool proof
Coordinator                    = target authorization + final acceptance
```

## Logic / Control Separation

Repository/workflow logic validates tag/version/release-note identity, deterministic packaging, checksum, clean archive shape, production dependency install, runtime package and keeper. Coordinator control decides which exact main commit may be tagged and whether publication evidence is accepted. Deployment control is outside this Task.

## Frozen Publication Rules

- tag name is exactly `v0.2.1`;
- package version is exactly `0.2.1` and `private:true` remains true;
- release note is exactly checked-in `docs/releases/v0.2.1.md` from the tagged commit;
- tag target is the exact canonical-main SHA named by the Coordinator after this Task package is merged;
- create an annotated tag and record both tag-object SHA and peeled commit SHA;
- never force-push, move, delete, recreate or overwrite an existing `v0.2.1` tag;
- never overwrite an existing `v0.2.1` GitHub Release;
- formal assets are generated only by the tag-triggered workflow;
- expected public assets are exactly `agent-runtime-mcp-v0.2.1.tar.gz` and `agent-runtime-mcp-v0.2.1.tar.gz.sha256`;
- Release must end public (`draft=false`) and non-prerelease;
- no npm registry publication occurs;
- no deployment occurs.

## Canonical / Process Sources

Read before execution:

- `AGENTS.md`
- `docs/tasks/README.md`
- `docs/tasks/planning-principles.md`
- `docs/tasks/collaboration-protocol.md`
- `docs/tasks/issue-state-convention.md`
- `docs/tasks/issue-lifecycle-protocol.md`
- `.github/workflows/release.yml`
- `scripts/release-preflight.mjs`
- `scripts/package-runtime.mjs`
- `scripts/verify-runtime-package.mjs`
- `docs/runtime-package.md`
- `docs/releases/v0.2.1.md`
- `docs/tasks/41-v0-2-1-release/task.md`
- live Issues #38, #41 and #44

## In Scope

- re-read exact canonical-main source identity and release metadata;
- verify exact-target main CI and release-preflight;
- re-check absence of v0.2.1 tag/Release immediately before tag creation;
- create/push one immutable annotated `v0.2.1` tag at the exact authorized target;
- observe the existing tag-only workflow through completion;
- verify published Release and exact two-asset set;
- independently download/check/extract the formal assets in a non-production temporary/evidence path;
- run clean-room `npm ci --omit=dev --ignore-scripts` (or stricter current supported equivalent) against the extracted bundle;
- verify packaged runtime version 0.2.1 and exactly seven public tools, using isolated/disposable tmux if required by the verifier;
- record exact tag/workflow/asset/digest evidence.

## Out of Scope

- product code, API or contract redesign;
- version/release-note edits after Publication Gate unless publication is returned to draft for a new review;
- deleting/moving/reusing tags;
- manual Release publication to bypass a failed workflow;
- npm publication;
- production runtime staging/copying into the live runtime tree;
- systemd/tunnel/profile edits or restart;
- deployment, cutover or rollback;
- production d/j/i read/write/control as publication evidence;
- fixing the unlocalized ~110-second `read_channel` end-to-end latency.

## Implementation Requirements

1. At claim time fetch canonical `main`, record its exact SHA, and require it equals the Coordinator-authorized target or return BLOCKED before tagging.
2. Verify the authorized target contains accepted Issue #41 Candidate `b71118d2995296b24a23002b05ff8ee0d1727c48` and Issue #38 Candidate `cc893f7985ee791cbff1c6869c6b24731d36ec93`.
3. Read exact-target check runs and require the current repository CI set successful; run `node scripts/release-preflight.mjs v0.2.1` on the exact target.
4. Query both Git refs/tags and GitHub Releases immediately before mutation. If either `v0.2.1` already exists, BLOCK; never overwrite.
5. Create an annotated tag at the exact target and push only `refs/tags/v0.2.1` without force. Record tag-object SHA and peeled commit.
6. Identify the workflow run triggered by that tag rather than an unrelated branch/push run. Require both release jobs to succeed; do not manually compensate for workflow failure.
7. Verify Release tag/name/state and require the exact archive/checksum asset names. Record workflow-published archive SHA-256 from logs/outputs where available.
8. Download formal assets to an isolated temporary/evidence directory outside the production runtime tree, run checksum verification, extract cleanly and install only production dependencies. Do not persist unnecessary node_modules/artifacts after evidence if cleanup is safe.
9. Verify packaged version and exact seven-tool discovery using a disposable endpoint. No claim about the live bridge is made by this Task.
10. Post a durable report with exact identities and limitations; return review/none and stop.

## Claims / Verification

```text
C1: v0.2.1 tag source identity equals one authorized canonical-main commit.
C2: tag/version/release-note preflight and exact-target CI pass before mutation.
C3: tag-triggered workflow succeeds without manual release bypass.
C4: public Release is v0.2.1, non-draft/non-prerelease, with exactly archive + checksum assets.
C5: downloaded checksum verifies and independent archive digest matches published/workflow evidence.
C6: isolated formal bundle is version 0.2.1 and exposes exactly seven tools.
C7: no production deployment/restart/channel mutation occurs.
```

## Success Criteria

1. `SC1`: exact authorized canonical-main SHA is recorded, contains accepted #38/#41 Candidates, and has successful required CI.
2. `SC2`: `release-preflight v0.2.1` passes and immediate pre-tag checks prove no existing v0.2.1 tag/Release.
3. `SC3`: immutable annotated tag `v0.2.1` peels to exactly the authorized target.
4. `SC4`: tag-triggered release workflow succeeds and published Release has exactly the expected two assets.
5. `SC5`: independent checksum/download/extraction/production-install verification passes; archive digest is recorded.
6. `SC6`: isolated packaged runtime reports version 0.2.1 and exactly seven public tools.
7. `SC7`: no production runtime staging, service restart, deployment/cutover/rollback or production d/j/i mutation occurs.

## Failure / Blocked Rules

Before tag push, any inconsistency returns BLOCKED with no irreversible action. After tag push, preserve the immutable tag and report workflow/release failure exactly; do not delete/move/recreate the tag, do not force-push and do not publish substitute assets manually. A provider outage or failed tag workflow requires Coordinator recovery. If asset verification fails after publication, preserve the public evidence and return BLOCKED; do not silently replace assets.

## Publication Dependency / Alignment Gate

This Task becomes `status:ready` only after its Task package is integrated and the Coordinator freshly verifies: Issue #41 is closed/accepted; canonical main contains the accepted v0.2.1 release-preparation Candidate; package/release note identify v0.2.1; latest existing formal Release remains v0.2.0; `v0.2.1` tag and Release do not exist; and exact canonical main is explicitly named as the authorized tag target. The Publication Gate authorizes the one immutable tag push and the existing tag-driven workflow only. It does not authorize production deployment.

## Evidence Contract

Record exact canonical target, tag-object SHA, peeled commit, exact pre-tag absence checks, exact-target CI, preflight output, release workflow run/job IDs, Release URL/state, asset names/sizes where available, workflow/archive checksum, independently computed checksum, isolated package/runtime version and seven-tool result, and explicit no-deployment/no-production-channel confirmation. Do not persist credentials, auth headers, full environments, terminal transcripts or unrelated application output.
