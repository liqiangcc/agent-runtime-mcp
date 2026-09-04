# Task 29 — v0.1.1 deployment bundle and GitHub Release

## Metadata

```text
GitHub Issue: #29
Task ID: v0-1-1-deployment-release
Task kind: combined implementation + release preparation
Base commit: 0d51b8b2fc0967a6d9e7711b7889d4b48b01c62d
Candidate commit: n/a
Session bootstrap: docs/tasks/29-v0-1-1-deployment-release/prompt.md
Preferred worker: web-gpt-worker
Environment: env:web-gpt
Handoff profile: docs/tasks/handoffs/web-gpt.md
Required capabilities: github-read-write, repository-code-authoring, github-actions-evidence, release-workflow-authoring
Hard dependencies: Issues #22, #23, #27 accepted and integrated
```

Live Task state belongs in GitHub Issue/comments, not this file.

## Goal

Prepare and prove a reusable tag-driven release path, then allow the Coordinator to publish the first formal GitHub Release `v0.1.1` only from an accepted canonical-main commit, without changing the six-tool Channel MCP product contract.

## Primary Use Case

```text
Actor:
repository release operator / Coordinator

Trigger:
an accepted patch release is ready after integration and canonical-main CI

Preconditions:
- accepted reliability work is already integrated
- release-preparation Candidate has been reviewed and integrated
- package/runtime version is 0.1.1
- docs/releases/v0.1.1.md exists on the accepted main commit
- normal canonical-main CI is successful
- immutable v0.1.1 tag does not already exist

Main flow:
1. explicit release authorization creates tag v0.1.1 at the accepted main SHA;
2. tag push triggers .github/workflows/release.yml;
3. workflow validates tag == v${package.json.version};
4. workflow builds the deployment archive from that exact tagged commit;
5. workflow verifies checksum, package contents and clean-room production installation;
6. workflow proves packaged public MCP health/discovery and packaged keeper/recovery behavior;
7. workflow creates GitHub Release v0.1.1 using the reviewed release-note file;
8. workflow uploads the verified tarball and checksum.

Success outcome:
- immutable tag, GitHub Release and verified assets all correspond to the same accepted commit;
- deployment package is runnable and includes accepted deployment-layer keeper support;
- public MCP surface remains exactly six tools.

Failure outcome:
- any version/tag mismatch, package-content mismatch, clean-room failure, MCP verification failure, keeper/recovery failure, missing release note or release publication failure stops the release and reports failure;
- no lower-quality artifact is published as successful.

Degraded outcome:
- Candidate may be fully prepared and verified while the formal tag/Release remains intentionally absent until Coordinator integration and release authorization;
- an unpublished/draft release may exist only as recoverable repository state if publication fails after release creation, but a failed workflow must never be represented as a successful Release.

Authoritative evidence:
- exact Candidate/PR diff;
- exact-SHA GitHub Actions Candidate evidence;
- canonical-main CI after integration;
- Git tag target;
- tag-triggered release workflow run/jobs/logs;
- GitHub Release metadata/assets;
- SHA-256 recorded in the release artifact.
```

## Why this is one coherent Task

Version consistency, package composition, release notes and tag-triggered publication are one release pipeline with one externally observable outcome: a verified immutable `v0.1.1` deployment release. Splitting them would allow incompatible intermediate states such as a version bump without a releasable bundle or a tag without verified assets.

## Separation Points

```text
Channel MCP product | repository/deployment release automation
```

The product remains the six Channel communication capabilities. Versioning, packaging, GitHub Actions, tags and Releases are repository/deployment concerns and must not introduce product lifecycle semantics.

```text
normal CI | formal release workflow
```

Normal PR/main CI proves a commit is releasable. The release workflow only acts after explicit tag authorization and builds from that exact tag.

```text
Worker execution | Coordinator release authority
```

The Web Worker may prepare code/workflows/docs and prove Candidate behavior. It MUST NOT create `v0.1.1` or publish a formal GitHub Release from an unintegrated Candidate. Coordinator integration + canonical-main CI + release-note presence precede tag creation.

```text
Release Note content | artifact identity
```

`docs/releases/v0.1.1.md` explains changes and limitations. Artifact names/checksums are mechanical evidence and must not be hand-invented inside prose.

## Single Responsibilities

```text
package metadata = declare the repository/runtime version
package-runtime logic = build deterministic runtime deployment archive from declared version
normal CI = prove Candidate/main remains buildable, testable and packageable
release.yml = validate an explicit release tag, reproduce verification and publish the formal GitHub Release
release note = human-readable explanation of this accepted version
Coordinator = decide when an accepted main commit becomes an immutable release
Channel MCP = communicate with existing terminal Channels only
```

## Logic / Control Separation

Logic/data path owns:
- deriving archive name/version from package metadata;
- deterministic package contents;
- checksum calculation/verification;
- clean-room runtime checks;
- exact public-tool verification;
- packaged keeper/recovery verification;
- tag/version equality validation.

Control/orchestration owns:
- deciding that v0.1.1 is ready;
- merging the accepted Candidate;
- requiring canonical-main CI before release authorization;
- creating the immutable release tag;
- deciding whether a failed publication should be retried or repaired;
- Final Acceptance and Issue closure.

No release automation may add endpoint lifecycle authority to MCP product code.

## Success / Failure / Degradation

Success proves the exact tagged main commit can deterministically produce a verified deployment package and formal GitHub Release.

Hard failure includes:
- package.json/package-lock/runtime manifest version inconsistency;
- remaining release-critical hard-coded `0.1.0` package paths/assertions;
- missing or non-executable packaged keeper helper;
- source/tests/dev-only repository material leaking into runtime bundle beyond explicitly accepted deployment support;
- tag/version mismatch;
- missing release note;
- checksum mismatch;
- clean-room install/runtime failure;
- public Tool set differs from the accepted six;
- packaged keeper/recovery proof fails;
- release workflow lacks the minimum permission needed to publish or grants unrelated broad permissions;
- published Release/assets do not point to the accepted tag/commit.

Safe degradation before tag creation is simply “release not yet published”. Do not fabricate a Release, overwrite an existing immutable tag, lower tests, or publish from a Candidate branch to avoid this state.

## Required Capabilities

```text
accepted release candidate
→ consistent patch-version metadata
→ deterministic deployment packaging
→ reusable package verification
→ reviewed Release Note
→ tag-driven GitHub Actions release workflow
→ exact tag/version/commit validation
→ verified GitHub Release assets
```

## Canonical / Process Sources

Read:
- `AGENTS.md`
- `docs/tasks/README.md`
- `docs/tasks/planning-principles.md`
- `docs/tasks/collaboration-protocol.md`
- `docs/tasks/issue-state-convention.md`
- `docs/tasks/issue-lifecycle-protocol.md`
- `docs/tasks/handoffs/web-gpt.md`
- `docs/deployment.md`
- `docs/runtime-package.md`
- `docs/mcp-contract.md`
- `docs/security.md`
- `package.json`
- `package-lock.json`
- `scripts/package-runtime.mjs`
- `scripts/verify-runtime-package.mjs`
- `scripts/verify-tmux-endpoint-keeper.mjs`
- `.github/workflows/ci.yml`

Accepted upstream evidence to re-read:
- Issue #22 final accepted state;
- Issue #23 final accepted state;
- Issue #27 final accepted state;
- Issue #27 integrated main `6045f819c01f566717a2e92d043efc1336b85a66` and canonical-main CI `33865419724` SUCCESS.

## Worker / Verification Route

```text
original GPT Web conversation = Coordinator / Reviewer / release authority
separate GPT Web conversation = Web Worker using @GitHub
GitHub Actions = executable verification Runner / Evidence
```

Worker authors the release preparation in a branch/PR and supplies exact Candidate CI Evidence. Worker stops at `status:review` and does not tag or formally release the Candidate.

After Coordinator ACCEPT/integration, final release publication is a Coordinator release gate:

```text
accepted Candidate
→ merge/integrate to main
→ canonical-main CI SUCCESS
→ verify docs/releases/v0.1.1.md on exact main SHA
→ explicit immutable tag v0.1.1 at that exact SHA
→ tag-triggered release.yml
→ verify Release/assets/checksum
→ Final Acceptance
```

## In Scope

- bump `package.json` and lockfile/root package metadata to `0.1.1`;
- make package/runtime archive naming and validation derive from package metadata rather than a hard-coded `0.1.0` release;
- update normal runtime-bundle CI to work with the current package version dynamically;
- include deployment-layer keeper/recovery helper and required deployment guidance in the deployment archive;
- preserve a minimal runtime artifact: compiled runtime, production manifests, focused runtime/deployment documentation, accepted deployment helper, optional existing LICENSE;
- add/adjust verification so the extracted package itself is clean-room installed and exercised;
- prove packaged MCP public Tool surface remains exactly six tools;
- prove packaged keeper/recovery path against the extracted package, not merely repository source files;
- add `docs/releases/v0.1.1.md` as the reviewed Release Note input;
- add `.github/workflows/release.yml` triggered only by `v*.*.*` tag pushes for formal publication;
- tag/version equality check and release-note existence check;
- minimal `contents: write` permission only in the release publication workflow/job where required;
- formal GitHub Release with verified archive + checksum after the Coordinator release gate.

## Out of Scope

- npm registry publication;
- automatic semantic-version selection;
- automatically bumping version on ordinary merges;
- automatically creating release tags from ordinary main CI;
- moving/replacing an existing `v0.1.1` tag;
- nightly/scheduled releases;
- Docker/systemd/tunnel/provider deployment;
- product-owned tmux/session/process lifecycle;
- Worker/Task/application semantics in MCP code;
- seventh public MCP Tool;
- generic raw shell/tmux public API;
- redesign of Channel contract unrelated to packaging/release.

## Architecture Invariants

- Channel remains the MCP public domain object.
- Public Tool surface remains exactly `list_channels`, `get_channel`, `read_channel`, `write_text`, `send_control`, `health`.
- endpoint creation/supervision/recovery remains deployment/operator responsibility.
- keeper/recovery helper is operator-side deployment material, not MCP product authority.
- `private:true` remains true; no npm publication.
- normal CI keeps repository contents permission read-only.
- release publication obtains only the minimum GitHub contents permission required after trusted tag authorization.
- tag must identify the exact commit that produced the release assets.
- release assets are rebuilt from the tag; do not reuse an unrelated Candidate artifact as formal release authority.

## Implementation Requirements

1. Set repository/runtime release version to `0.1.1` consistently in package metadata and lockfile root metadata.
2. Remove the `manifest.version === 0.1.0` special-case from `scripts/package-runtime.mjs`; packaging must use a valid declared version and keep `private:true`/start contract validation.
3. Refactor `.github/workflows/ci.yml` runtime-package checks/artifact names so they derive the version rather than hard-code `v0.1.0`.
4. Package `deployment/tmux-endpoint-keeper.sh` under a clear deployment path and preserve executable semantics in the archive.
5. Package focused documentation sufficient to install/run the runtime and operate keeper/recovery. Update version-specific text so the shipped README is accurate for v0.1.1 and future packaging is not needlessly pinned to v0.1.0.
6. Extend verification to assert the extracted archive contains expected runtime/deployment files and excludes source/tests/dev build state/node_modules.
7. Execute clean-room `npm ci --omit=dev` inside the extracted archive and exercise its compiled stdio server.
8. Verify the extracted package exposes exactly the accepted six public Tools.
9. Verify missing endpoint → packaged deployment helper `ensure` → healthy MCP → endpoint loss → packaged helper recovery on the extracted package path.
10. Add `docs/releases/v0.1.1.md`. It must accurately describe at least: structured tmux identity, stdio compatibility regression coverage, deployment keeper/recovery, deployment/package changes, compatibility boundary, upgrade/install path, and known limitations. Do not invent checksum before the release artifact exists.
11. Add `.github/workflows/release.yml` with `on.push.tags: ['v*.*.*']` (or equivalent exact tag-only trigger). It must fail closed unless `GITHUB_REF_NAME == v${package.json.version}` and `docs/releases/${GITHUB_REF_NAME}.md` exists.
12. The release workflow must build from the checked-out tag commit, run release-grade package verification, verify SHA-256, and only then publish GitHub Release/assets. Use the checked-in release-note file as the Release body.
13. Release workflow may use GitHub-provided primitives/CLI and `GITHUB_TOKEN`, but must not require user secrets for a public repository release. Scope permissions to `contents: write` only where publication requires it.
14. Prefer release publication behavior that is recoverable before public publication (for example draft-then-publish) and fails closed if an already-published immutable release/tag would be overwritten. Do not use asset clobbering as the normal path.
15. Worker MUST NOT create `v0.1.1`, publish a GitHub Release, or mutate an existing release/tag during Candidate execution.

## Claims / Verification

Worker/Candidate claims:

```text
C1: Version/package metadata is consistently 0.1.1 and release-critical package paths are not pinned to 0.1.0.
C2: Candidate normal CI builds a deterministic v0.1.1 archive + checksum and clean-room verifies the extracted runtime package.
C3: The extracted package contains executable keeper/recovery deployment support and proves unavailable → healthy → unavailable → healthy behavior through the packaged runtime/helper.
C4: Extracted package public MCP surface remains exactly six accepted Tools.
C5: docs/releases/v0.1.1.md exists and accurately describes accepted changes/boundaries without fabricated artifact checksum.
C6: release.yml is tag-only, validates tag/version/release-note identity, builds/verifies from the tag, and has bounded release permissions; Candidate tests/static validation prove the publication path without actually releasing.
C7: Candidate diff introduces no product-owned tmux lifecycle capability, seventh Tool, npm publication, or unrelated deployment/network scope.
```

Coordinator post-integration/release claims:

```text
C8: Accepted Candidate is integrated into canonical main and canonical-main CI succeeds on the exact integration SHA.
C9: immutable tag v0.1.1 points exactly to that accepted main SHA and was created only after Release Note/main CI gate.
C10: tag-triggered release workflow succeeds for the exact tag commit.
C11: GitHub Release v0.1.1 uses the reviewed Release Note and contains exactly the expected verified tarball/checksum assets (plus GitHub-generated source archives outside the asset contract).
C12: recorded SHA-256 matches the uploaded release tarball.
```

PASS requires reading actual GitHub Actions/Release/tag evidence; do not infer from intended workflow YAML.

## Security Review

```text
Security-sensitive: yes
Remote ingress affected: no
```

Controls:
- no new MCP authority or shell/tmux public capability;
- release token stays in GitHub Actions and is not persisted;
- normal CI remains read-only;
- release workflow gets bounded `contents: write` only after trusted tag trigger;
- no third-party secret is required;
- release note must not contain credentials or terminal transcripts;
- package excludes development state and secrets;
- tag/version mismatch and missing notes fail closed;
- existing immutable published release/tag must not be silently overwritten.

## Success Criteria

1. SC1 — Version metadata and package naming are consistently `0.1.1` with no release-critical hard-coded v0.1.0 dependency.
2. SC2 — Candidate exact-SHA CI proves deterministic package creation/checksum and clean-room install/runtime behavior.
3. SC3 — Packaged deployment helper/recovery behavior is executable and verified from the extracted archive.
4. SC4 — Public MCP surface remains exactly six Tools and product boundary checks pass.
5. SC5 — Reviewed `docs/releases/v0.1.1.md` exists before release authorization.
6. SC6 — Tag-driven release workflow validates tag/version/notes, rebuilds/verifies from exact tag, and uses bounded permissions.
7. SC7 — Worker does not prematurely tag/release Candidate code.
8. SC8 — Coordinator integrates accepted Candidate and exact canonical-main CI passes.
9. SC9 — `v0.1.1` tag points to the accepted canonical-main SHA.
10. SC10 — actual tag-triggered release workflow succeeds.
11. SC11 — formal GitHub Release `v0.1.1` contains verified tarball + `.sha256` and reviewed notes.
12. SC12 — uploaded tarball checksum is independently verified and recorded before Issue closure.

## Failure / Blocked Rules

Worker must post `[BLOCKER REPORT]`, set `status:blocked + Active owner:none`, and stop when:
- required GitHub repository writes are unavailable;
- required Actions Evidence cannot be produced/read;
- package/release workflow would require weakening product/security boundaries;
- clean-room or packaged recovery verification cannot be made authoritative;
- accepted upstream baseline no longer matches current main and cannot be safely aligned.

Coordinator must not create the tag when Candidate is unaccepted, canonical-main CI is not successful, Release Note is absent, or `v0.1.1` already exists with conflicting identity.

A tag/release publication capability unavailable to the current Coordinator tooling is not permission to publish from Candidate or weaken the gate. Keep the Task at the appropriate review/blocked release-gate state and report the minimal explicit release authorization action required.

## Publication Dependency / Alignment Gate

Upstream feature dependencies are accepted: Issues #22, #23 and #27 are complete. Before Worker claim, re-read current main and confirm its product tree still contains the Issue #27 accepted baseline.

The current planning base may contain repository-only Coordinator commits after `6045f819...`; these do not authorize changing the accepted product boundary. Worker must base on live main at claim time and preserve later planning/protocol commits.

## Evidence Contract

Worker Execution Report records:

```text
Attempt
Worker identity
live Base SHA
Candidate SHA
branch / PR
changed files
exact Candidate push/PR Actions run IDs and job results
archive name produced in Candidate CI
Candidate artifact checksum
tag/release workflow static/preflight Evidence
release note path/content scope
known limitations
explicit statement: no v0.1.1 tag/Release created by Worker
```

Coordinator release evidence records:

```text
accepted Candidate
integrated canonical-main SHA
canonical-main CI run
Release Note path read from exact main SHA
v0.1.1 tag target SHA
tag-triggered release workflow run/job
GitHub Release URL/ID/tag/target
release asset names/sizes
uploaded tarball SHA-256 and independent verification result
Final Acceptance comment
```

Do not persist secrets or unnecessary terminal output.

## Completion Protocol

```text
Coordinator/Publisher → Publication Gate → status:ready
separate Web GPT Worker → claim → Attempt N → release preparation + Candidate Evidence
→ [EXECUTION REPORT] → status:review + owner:none → STOP
original Coordinator → Review ACCEPT | REVISE | BLOCK | SPLIT
if ACCEPT:
  integrate Candidate → canonical-main CI → Release Note gate → explicit v0.1.1 tag
  → tag-triggered release workflow → verify Release/assets/checksum
  → [FINAL ACCEPTANCE] → status:done + owner:none → close Issue
```

Contract change returns to draft + Publication Gate. Only Final Acceptance may close the Task.