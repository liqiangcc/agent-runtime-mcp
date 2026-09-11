# Task 41 — v0.2.1 release preparation

## Metadata

```text
GitHub Issue: #41
Task ID: 41-v0-2-1-release
Task kind: release-metadata preparation + verification
Base commit: e78e906ef93c3c43d3c26114837f816cac0fe2bc
Candidate commit: n/a
Session bootstrap: docs/tasks/41-v0-2-1-release/prompt.md
Preferred worker: coordinator-authorized-codex-a
Environment: env:codex
Handoff profile: docs/tasks/handoffs/codex.md
Required capabilities: github-read-write, repository-code-authoring, github-actions-evidence
Hard dependencies: Issue #38 Final Acceptance; canonical main contains accepted Candidate cc893f7985ee791cbff1c6869c6b24731d36ec93
Release target: v0.2.1 metadata candidate only; tag/Release publication is explicitly out of scope for this Task
```

Live Task state belongs in Issue #41 and append-only comments.

## Goal

Prepare canonical release metadata for `v0.2.1` so a later publication Task can create an immutable tag from an already-reviewed canonical-main commit. Align current-version surfaces with the accepted Issue #38 bounded-cursor-continuity contract without changing the seven-tool API, cursor semantics, token capacity, deployment state, or historical records.

## Primary Use Case

```text
Actor: explicitly authorized Codex release-preparation worker
Trigger: Coordinator Publication Gate for Issue #41
Preconditions:
- Issue #38 is closed with Final Acceptance;
- canonical main is e78e906ef93c3c43d3c26114837f816cac0fe2bc or a Coordinator-approved descendant containing it;
- latest formal Release remains v0.2.0;
- no v0.2.1 tag or Release exists.
Main flow:
1. re-read live #41, #38 acceptance and canonical main;
2. reconcile only current-version/release surfaces for v0.2.1;
3. create `docs/releases/v0.2.1.md` describing the accepted fix and limits;
4. run release preflight and exact Candidate CI/package checks;
5. open a reviewable PR tied to one exact Candidate SHA;
6. post an EXECUTION REPORT, return Issue #41 to review/owner none, and stop.
Success outcome:
- a reviewable Candidate consistently identifies v0.2.1 on current runtime/release surfaces;
- canonical contract prose reflects the already-accepted #38 limits rather than calling them proposed/pending;
- historical v0.2.0 Task/evidence records remain historical and unmodified;
- no tag, GitHub Release or deployment occurs.
Failure outcome:
- ambiguous version surface, release-preflight failure, CI failure, or contract drift blocks acceptance;
- no workaround may create the tag early or weaken existing checks.
Degraded outcome:
- preparation may stop at a clean reviewable PR if publication capabilities are unavailable; publication is a separate Task anyway.
Authoritative evidence:
- exact Candidate SHA and PR diff;
- `node scripts/release-preflight.mjs v0.2.1`;
- exact-SHA GitHub Actions checks;
- package/runtime version assertions and release note content.
```

## Separation Points

```text
release preparation | release publication
```

This Task may prepare and verify version metadata and a Release Note. It must not create `v0.2.1`, publish a GitHub Release, or upload formal release assets.

```text
current-version surfaces | historical evidence
```

Current runtime/package/canonical contract files may be updated. Historical Task documents, old Release Notes, old CI evidence, and client-harness self-identification strings are not mass-rewritten merely because they contain `0.2.0`.

```text
product semantics | version metadata
```

Issue #38 product behavior is already accepted. This Task must not redesign history retention, token capacity, TTL, timeout cursor behavior, GAP/expiry behavior, completion semantics, or tool discovery.

```text
release artifact identity | deployment selection
```

No systemd/tunnel/runtime-directory cutover or production d/j/i operation belongs here.

## Single Responsibilities

```text
package.json / package-lock = package release identity
src/mcp.ts serverInfo        = runtime-advertised server version
canonical docs               = current accepted contract/status
release note                 = user-facing v0.2.1 change and limitations
GitHub Actions               = exact-Candidate executable evidence
Coordinator                  = review/integration and later publication authorization
```

## Logic / Control Separation

Repository logic owns version consistency, release-preflight validation, deterministic package creation, runtime/discovery tests and canonical contract text. Coordinator control owns Candidate acceptance, merge, future tag creation, Release publication and deployment authorization.

## Selected v0.2.1 Content

The Release Note and canonical current-version surfaces must accurately state:

- observation history is `1,536` records and `256 KiB` logical event payload per observer;
- count and byte ceilings are independent and history remains bounded;
- five-minute cursor TTL is unchanged and waits do not renew it;
- timeout preserves the input/original cursor;
- genuine `OBSERVATION_GAP` and `CURSOR_EXPIRED` remain explicit;
- `MAX_TOKENS` is unchanged;
- the public MCP surface remains exactly seven tools;
- no application completion detection, write retry, or caller-transparent polling is added;
- Issue #38 supported-host evidence measured eight full 1,536-record observers below the frozen retained-state budget and isolated real tmux continuity crossed the old 256-change window;
- the previously observed roughly 110-second end-to-end `read_channel` delay remains unlocalized and is not claimed fixed;
- this preparation Task does not deploy v0.2.1.

Do not copy incident transcripts or sensitive terminal output into the Release Note.

## Canonical / Process Sources

Read before execution:

- `AGENTS.md`
- `docs/tasks/README.md`
- `docs/tasks/planning-principles.md`
- `docs/tasks/collaboration-protocol.md`
- `docs/tasks/issue-state-convention.md`
- `docs/tasks/issue-lifecycle-protocol.md`
- `docs/runtime-package.md`
- `docs/mcp-contract.md`
- `docs/security.md`
- `.github/workflows/release.yml`
- `scripts/release-preflight.mjs`
- `docs/tasks/38-bounded-cursor-continuity/task.md`
- live Issues #38 and #41

## In Scope

- bump `package.json` package version to `0.2.1`;
- keep root `package-lock.json` package version metadata aligned at `0.2.1`;
- update the runtime-advertised server version and its authoritative server-version assertion(s) to `0.2.1`;
- add `docs/releases/v0.2.1.md`;
- update `docs/runtime-package.md` where it identifies the current runtime bundle/version;
- update canonical `docs/security.md` / `docs/mcp-contract.md` wording that still describes the now-accepted #38 amendment as proposed/pending, while preserving the accepted numerical and semantic boundaries;
- inspect exact `0.2.0` matches and change only those that represent current release/runtime state;
- run release-preflight, build/typecheck/tests/package evidence and exact-SHA Actions;
- open a PR and report Candidate evidence.

## Out of Scope

- changing historical v0.2.0 Release Notes or completed Task/evidence documents;
- mass-replacing arbitrary test-client self-identification versions that do not describe server/product version;
- changing public tool names/schemas or observation semantics;
- changing 1,536/256 KiB limits, TTL, token capacity, waiter limits, sampling cadence or retained-state budget;
- investigating/fixing `read_channel` latency;
- creating git tags, GitHub Releases, or formal release assets;
- package installation into production, systemd/tunnel restart, deployment/cutover/rollback;
- writes or controls to production d/j/i channels.

## Implementation Requirements

1. Start from fresh canonical main containing `e78e906ef93c3c43d3c26114837f816cac0fe2bc`; if main has advanced, record the exact base and verify it still contains #38.
2. Search exact `0.2.0` occurrences before editing; classify each as current-version surface or historical/test-client context. Avoid blind global replacement.
3. Update package and runtime server version consistently to `0.2.1` and keep `private:true` unchanged.
4. Add non-empty `docs/releases/v0.2.1.md` so `node scripts/release-preflight.mjs v0.2.1` passes.
5. Canonical contract edits must convert stale proposed/pending #38 language to accepted/current language without altering the already accepted semantics or numbers.
6. Run `npm run typecheck`, unit/integration/discovery/dogfood or the repository's current equivalent through CI; preserve the forced-GC Issue #38 evidence gate already on main.
7. Run `npm run package:runtime` or the repository's current release-preparation check and verify generated names derive from `0.2.1`; generated artifacts are evidence only and must not be committed unless canonical workflow requires it.
8. Open one PR; tie all code-dependent claims to its exact head SHA and actual CI run/jobs.
9. Do not tag or publish. Normal completion is EXECUTION REPORT → status:review / owner:none → stop.

## Claims / Verification

```text
C1: package/lock/runtime-advertised current version is consistently v0.2.1.
C2: release-preflight for v0.2.1 passes with checked-in docs/releases/v0.2.1.md.
C3: canonical security/contract prose reflects accepted #38 limits and no longer labels them proposed/pending.
C4: seven-tool API and Issue #38 cursor/history semantics are unchanged except the already-accepted capacity fix.
C5: historical v0.2.0 records remain intact; edits are limited to current release surfaces.
C6: exact-Candidate CI/package evidence passes and no tag/Release/deployment occurs.
```

## Success Criteria

1. `SC1`: `package.json`, root lockfile metadata and runtime server version identify `0.2.1`, with authoritative server-version tests updated accordingly.
2. `SC2`: `node scripts/release-preflight.mjs v0.2.1` passes and the Release Note accurately captures #38 boundaries/limitations.
3. `SC3`: canonical current contract docs describe 1,536 records / 256 KiB as accepted v0.2.1 behavior, preserving five-minute TTL, original-cursor timeout continuation, explicit GAP/expiry and unchanged token capacity.
4. `SC4`: exact Candidate Actions checks pass, including Issue #38 retained-state/tmux continuity regressions already in CI.
5. `SC5`: diff review shows no accidental rewrite of historical release/task evidence and no product/deployment scope expansion.
6. `SC6`: no `v0.2.1` tag, GitHub Release, production restart or d/j/i mutation occurs.

## Failure / Blocked Rules

BLOCK if canonical main no longer contains accepted #38, version ownership is ambiguous, release-preflight cannot be made to pass without widening scope, exact-SHA CI fails, or canonical docs would require a semantic contract change. Do not tag early, weaken CI, alter security boundaries, or rewrite history to force PASS.

## Publication Dependency / Alignment Gate

This Task may become `status:ready` only after the Coordinator verifies #38 is closed/accepted, latest formal Release is v0.2.0, no v0.2.1 tag/Release exists, canonical main contains #38, and this Task package is merged into main. The Worker then claims exactly one Attempt. Formal `v0.2.1` publication requires a separate follow-up Task after this preparation Candidate is reviewed and integrated.

## Evidence Contract

Record exact base/Candidate/PR, files changed, exact `release-preflight` result, version assertions, package artifact name/version if built, GitHub Actions run/job results, and explicit confirmation that no tag/Release/deployment occurred. Do not persist credentials, full environments, terminal transcripts, or unrelated application output.
