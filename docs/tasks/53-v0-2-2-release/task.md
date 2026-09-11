# Task 53 — v0.2.2 release preparation

## Metadata

```text
GitHub Issue: #53
Task ID: 53-v0-2-2-release
Task kind: release-metadata preparation + verification
Base commit: 823c17c77f98d925c750ddec4cf091c4d57560bd
Candidate commit: n/a
Session bootstrap: docs/tasks/53-v0-2-2-release/prompt.md
Preferred worker: coordinator-authorized-codex-a
Environment: env:codex
Handoff profile: docs/tasks/handoffs/codex.md
Hard dependencies: Issue #50 Final Acceptance; canonical main contains accepted Candidate f533f372a46cd931f275c4cb4b7d805a982a0e6f
Release target: v0.2.2 metadata candidate only; tag/Release publication is out of scope
Deployment: explicitly out of scope
```

Live Task state belongs in Issue #53 and append-only comments.

## Goal

Prepare canonical release metadata for `v0.2.2` containing the already accepted Issue #50 phase diagnostics. Align only current package/runtime version surfaces and add a timeless public Release Note. Do not change the seven-tool API, diagnostic semantics, observation/read/write limits, or deployment state.

This Task prepares a release. It does **not** claim that v0.2.2 fixes the external latency diagnosed in Issue #48.

## Accepted change carried into v0.2.2

The Release Note must accurately state:

- phase diagnostics are disabled by default and require exact `AGENT_RUNTIME_MCP_PHASE_DIAGNOSTICS=1` opt-in;
- enabled diagnostics emit bounded, field-whitelisted JSONL to stderr only; stdout MCP framing is unchanged;
- all seven public Tools keep the same names/schemas/results/errors;
- all Tools emit `method_start`/`method_end` only when diagnostics are enabled;
- `read_channel` additionally emits `backend_start`/`backend_end` around the actual read action;
- `backend_end` occurs when `readChannel(...)` settles, before result/error shaping and JSON serialization;
- `method_end` means Tool callback/handler completion only and does not prove SDK response encoding, stdio write/drain, bridge forwarding, connector posting or remote receipt;
- sensitive terminal/write content, raw request IDs/cursors/tokens, full arguments/results/errors, credentials, URLs and environments are excluded from diagnostic fields;
- the external slow-call class from Issue #48 (`read_channel` and `health`, tens to >100 seconds) is **not claimed fixed**; v0.2.2 adds localization evidence for a later controlled diagnostic deployment/retest.

## Separation points

```text
release preparation | formal publication | diagnostic deployment
current version surface | historical release/task evidence
phase observability | performance fix
server handler evidence | bridge/connector/remote receipt
```

Do not collapse these stages.

## In scope

- bump `package.json` version to `0.2.2`;
- align root `package-lock.json` package version metadata to `0.2.2`;
- update the runtime-advertised MCP server version to `0.2.2` and authoritative server-version assertion(s);
- add final public-facing `docs/releases/v0.2.2.md`;
- update `docs/runtime-package.md` where it identifies the current runtime bundle/version;
- inspect exact `0.2.1` matches and update only those representing current release/runtime state;
- run `node scripts/release-preflight.mjs v0.2.2`, typecheck/tests/package checks and exact-Candidate CI;
- open one PR and record exact Candidate evidence.

## Out of scope

- rewriting `docs/releases/v0.2.1.md` or historical Task/evidence documents;
- changing Issue #38 continuity semantics or its historical `v0.2.1` wording;
- changing Issue #50 diagnostic schema, enablement, phase boundaries, fingerprints, security policy or tests except version assertions strictly required by release metadata;
- changing public Tool names/schemas/results/errors;
- changing observation/history/token/read/write/wait limits;
- investigating/fixing latency;
- creating `v0.2.2` tag or GitHub Release;
- enabling diagnostics in production;
- runtime staging, service/profile edits, restart/deployment/cutover/rollback;
- production d/j/i writes/controls or tmux lifecycle operations.

## Implementation requirements

1. Start from fresh canonical `main` containing `823c17c77f98d925c750ddec4cf091c4d57560bd`; if main has advanced, record the exact base and prove it still contains Issue #50.
2. Search exact `0.2.1` occurrences before editing and classify each as current-version or historical context. Do not globally replace.
3. Keep `package.json`, root lockfile, runtime `serverInfo.version` and authoritative assertion aligned at `0.2.2`; keep `private:true` unchanged.
4. Add non-empty `docs/releases/v0.2.2.md`; the text must be timeless and usable verbatim by the tag-driven GitHub Release workflow.
5. Release Note installation section must use the formal `v0.2.2` archive/checksum names and `npm ci --omit=dev` flow.
6. Release Note must explicitly say diagnostics remain default-off and latency is not claimed fixed.
7. Do not modify phase-diagnostic behavior just to prepare the release.
8. Run release preflight, typecheck, repository tests, runtime packaging and `git diff --check`; generated artifacts are evidence only and are not committed unless the repository workflow requires it.
9. Open one PR tied to one exact Candidate SHA and wait for exact-head Actions.
10. Normal completion: `[EXECUTION REPORT]` → Issue `status:review / owner:none` → stop. Do not tag/publish/deploy.

## Success criteria

1. `SC1`: package/lock/runtime-advertised server version consistently identify `0.2.2` and authoritative version tests agree.
2. `SC2`: `node scripts/release-preflight.mjs v0.2.2` passes with checked-in final `docs/releases/v0.2.2.md`.
3. `SC3`: Release Note accurately describes the accepted Issue #50 diagnostics and their safety/semantic boundaries, including `backend_end` vs `method_end`.
4. `SC4`: Release Note explicitly states the external latency remains unresolved/not claimed fixed and diagnostic enablement remains opt-in/default-off.
5. `SC5`: public discovery remains exactly seven Tools and Issue #50 behavior/tests remain unchanged except version assertions.
6. `SC6`: exact Candidate CI and runtime packaging checks pass.
7. `SC7`: diff review shows no accidental historical rewrite, tag/Release creation, production diagnostic enablement or deployment action.

## Failure / blocked rules

BLOCK if canonical main no longer contains the accepted Issue #50 implementation, release-preflight cannot pass without widening scope, or release preparation would require changing diagnostic/product semantics. Do not tag early, weaken tests/security checks, or rewrite historical evidence to force PASS.

## Canonical sources

Read before execution:

- `AGENTS.md`
- `docs/tasks/collaboration-protocol.md`
- `docs/tasks/issue-state-convention.md`
- `docs/tasks/issue-lifecycle-protocol.md`
- `docs/runtime-package.md`
- `docs/security.md`
- `docs/mcp-contract.md`
- `.github/workflows/release.yml`
- `scripts/release-preflight.mjs`
- `docs/tasks/50-external-call-phase-correlation/task.md`
- live Issues #48, #50 and #53

## Evidence contract

Record exact base/Candidate/PR, files changed, release-preflight output, version assertions, package artifact name/digest if built, exact GitHub Actions runs/jobs, and explicit confirmation that no tag/Release/deployment/diagnostic enablement occurred. Do not persist credentials, tunnel URLs, terminal content, raw request IDs/cursors/tokens, or unrelated application output.
