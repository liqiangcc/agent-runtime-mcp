# Task 56 — v0.2.2 formal publication

## Metadata

```text
GitHub Issue: #56
Task ID: 56-v0-2-2-publication
Task kind: immutable tag + GitHub Release publication + independent verification
Base commit: 3588f2f7e43c9344f0b245cc223e8f16f6cb2f9a
Candidate commit: n/a
Session bootstrap: docs/tasks/56-v0-2-2-publication/prompt.md
Preferred worker: coordinator-authorized-codex-a
Environment: env:codex
Hard dependencies: Issue #53 Final Acceptance; existing tag-driven release workflow
Deployment: explicitly out of scope
```

Live Task state belongs in Issue #56 and append-only comments.

## Goal

Publish `v0.2.2` exactly once from a Coordinator-authorized canonical-main commit using the repository's existing tag-triggered workflow. Independently verify immutable tag identity, public Release state, formal assets/checksum, clean extraction/production install, runtime version and seven-tool surface. Do not deploy or enable diagnostics.

## Preconditions / publication gate

Before authorizing execution, Coordinator must verify:

- Issue #53 is closed/completed with accepted Candidate `7dec85d6914b90aba035dd2b256349afc2b7d6f0` integrated in canonical main;
- canonical main package/lock/runtime server version is `0.2.2` and `docs/releases/v0.2.2.md` is final public text;
- exact canonical-main CI is fully successful;
- `node scripts/release-preflight.mjs v0.2.2` passes on the exact authorized target;
- no `v0.2.2` git tag exists;
- no GitHub Release for `v0.2.2` exists;
- this Task package is merged and the final target SHA is freshly resolved afterward.

The authorized target must be recorded in the Issue before mutation.

## Immutable mutation rules

Immediately before tag creation, re-check tag/Release absence.

If either already exists, BLOCK. Do not overwrite, move, delete or reuse it.

Create exactly one annotated tag:

```text
v0.2.2 -> exact authorized canonical-main commit
```

Push only that tag, without force.

After the tag has been pushed:

- never delete/move/recreate the tag to recover from workflow failure;
- never manually publish substitute assets to hide a workflow failure;
- preserve the failed state/evidence and return BLOCKED for Coordinator recovery if publication does not complete correctly.

## Required release path

Use only the existing `.github/workflows/release.yml` tag workflow. The workflow must:

- verify tag identity and `release-preflight`;
- deterministically package the runtime;
- verify archive shape and checksum;
- perform clean production dependency install;
- verify packaged runtime version/public Tool surface and keeper recovery;
- create a draft Release with exactly archive+checksum assets;
- verify asset set before making the Release public.

Do not bypass these stages manually.

## Independent post-publication verification

After workflow success, independently verify:

1. annotated tag object exists and peels exactly to the authorized target;
2. tag workflow run is success; record verify/publish job IDs;
3. GitHub Release `v0.2.2` is public (`draft=false`) and non-prerelease;
4. Release contains exactly:
   - `agent-runtime-mcp-v0.2.2.tar.gz`
   - `agent-runtime-mcp-v0.2.2.tar.gz.sha256`
5. download both assets to an isolated temporary location outside the production runtime tree;
6. `sha256sum -c` passes and archive digest is recorded;
7. extraction creates the expected versioned root;
8. `npm ci --omit=dev --ignore-scripts` succeeds in the extracted package;
9. packaged runtime verification reports version `0.2.2` and exactly seven public Tools;
10. diagnostics are still merely packaged/default-off — publication must not enable them anywhere.

## In scope

- final exact-main release gate verification;
- one immutable annotated `v0.2.2` tag push;
- existing tag workflow observation/verification;
- public Release/asset readback;
- independent isolated asset checksum/extraction/install/runtime verification;
- durable Issue report and review handoff.

## Out of scope

- product/source/test/release-note changes after publication gate;
- changing tag workflow behavior;
- npm registry publication;
- production runtime staging;
- setting `AGENT_RUNTIME_MCP_PHASE_DIAGNOSTICS=1` on the production service;
- systemd/tunnel/profile edits or restart;
- deployment/cutover/rollback;
- external latency retest;
- production d/j/i write/control or tmux lifecycle action.

## Success criteria

1. `SC1`: pre-mutation tag and Release are absent; exact authorized target is current canonical main and passes exact-main CI + release-preflight.
2. `SC2`: one annotated `v0.2.2` tag is pushed without force and peels exactly to the authorized target.
3. `SC3`: tag workflow verify/publish jobs succeed without manual bypass.
4. `SC4`: Release is public/non-prerelease with exactly two expected assets.
5. `SC5`: independent checksum/download/extraction/production-install verification passes and archive digest is recorded.
6. `SC6`: isolated packaged runtime reports version `0.2.2` and exactly seven public Tools.
7. `SC7`: no production deployment/config/restart/diagnostic enablement or d/j/i/tmux application mutation occurs.

## Failure / blocked rules

BLOCK before mutation if tag/Release already exists, target identity is stale/ambiguous, exact-main CI/preflight fails, or package/release-note identity is inconsistent.

After tag mutation, any workflow/asset identity/checksum/publication failure is a preserved immutable release incident. Do not delete or repoint the tag; return BLOCKED with evidence.

## Evidence contract

Record exact authorized commit, annotated tag object and peeled commit, workflow run and job IDs, Release URL/state, exact asset names/sizes, archive SHA-256, independent verification outcome, packaged runtime version/seven-tool proof, and explicit confirmation that production diagnostics/deployment were untouched. Do not persist credentials, tunnel URLs, environment dumps, terminal output, request IDs/cursors/tokens or unrelated application data.
