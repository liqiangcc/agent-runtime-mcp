# Task 35 — v0.2.0 release and live cutover

## Metadata

```text
GitHub Issue: #35
Task ID: v0-2-0-release-deployment
Task kind: combined release + deployment verification
Base commit: a921067ebaa8c38b7c8ee6a0b879d1c6671d53f0
Candidate commit: n/a
Session bootstrap: docs/tasks/35-v0-2-0-release-deployment/prompt.md
Preferred worker: coordinator-authorized-codex-a
Environment: env:codex
Handoff profile: docs/tasks/handoffs/web-gpt.md
Required capabilities: github-read-write, github-actions-evidence, release-tag-and-release-write, linux-systemd-read-write, package-installation, tmux-read-only-observation
Hard dependencies: Issue #32 final acceptance; Issue #29 v0.1.1 release record; accepted main a921067ebaa8c38b7c8ee6a0b879d1c6671d53f0
```

Live Task state belongs in Issue #35. This draft is a preparation contract;
tag creation, formal Release publication and live cutover require explicit
Coordinator authorization after preparation evidence is reviewed.

## Goal

Produce and verify the v0.2.0 release from accepted main, then make a
reversible switch of the current Linux stdio bridge from v0.1.1 to v0.2.0
without mutating or restarting existing tmux application endpoints. Preserve a
tested v0.1.1 rollback path.

## Primary Use Case

```text
Actor:
release/deployment operator working under Coordinator authorization

Trigger:
Coordinator authorizes publication and cutover after this preparation gate

Preconditions:
- Issue #32 is complete and remains closed; accepted implementation is on
  main at a921067ebaa8c38b7c8ee6a0b879d1c6671d53f0.
- Current metadata, lockfile and release note identify v0.2.0.
- Existing v0.1.1 Release/tag and rollback archive remain available and their
  recorded checksum matches the local rollback copy.
- Current service, bridge profile and configured tmux target are inventoried
  without exposing credentials; visible application sessions are known.

Main flow:
1. run version/release preflight and build the v0.2.0 archive from the exact
   accepted main/tag commit;
2. verify checksum, clean-room production install, seven-tool discovery and
   accepted Issue #32 wait evidence;
3. create immutable v0.2.0 tag and let the tag-only workflow publish exactly
   the verified archive/checksum (Coordinator action);
4. stage the downloaded release under a versioned runtime directory, install
   production dependencies and verify the staged stdio server;
5. record service/bridge configuration and tmux inventory, then perform one
   controlled service restart/cutover;
6. verify bridge health, discovery and bounded wait smoke without writing to or
   controlling an application Channel;
7. retain the v0.1.1 directory/archive and documented reverse switch.

Success outcome:
- tag, Release assets, checksum and staged runtime identify one accepted
  v0.2.0 commit;
- bridge serves the seven-tool v0.2.0 package;
- existing tmux application sessions remain present and untouched;
- rollback to v0.1.1 is executable without guessing paths.

Failure outcome:
- identity/checksum/package/service/health/discovery failure stops publication
  or cutover;
- failed cutover restores the known v0.1.1 command and service state;
- no endpoint is created, destroyed, renamed or restarted by MCP product code.

Degraded outcome:
- preparation may remain complete while tag/release/cutover is withheld;
- provider, tunnel or host timeout is reported unavailable/unknown;
- an interrupted MCP client must reconnect explicitly; tmux state is not
  inferred from bridge process state.

Authoritative evidence:
- exact accepted main and immutable tag target;
- tag-triggered release workflow jobs and Release metadata/assets;
- independent archive checksum and clean-room package verification;
- read-only service/bridge configuration and before/after tmux inventory;
- post-cutover health/discovery smoke and rollback rehearsal.
```

## Separation Points

```text
Channel MCP product | release/deployment operator
```

Product communicates with existing Channels only. Tagging, package installation,
systemd/tunnel supervision, cutover and rollback remain outside product code.

```text
release artifact identity | live service selection
```

Release workflow proves tag and assets. Operator separately selects a versioned
runtime directory; a passing asset does not authorize a live switch.

```text
tunnel/stdio lifecycle | tmux endpoint lifecycle
```

Bridge restart may interrupt MCP clients, but must not stop, recreate or
reconfigure tmux servers, sessions or panes.

```text
mechanical observation | application meaning
```

The wait tool reports bounded activity/idle/timeout/closure only; idle never
means command or Task completion.

```text
execution evidence | acceptance authority
```

Commands, CI and host observations are evidence. Coordinator decides tag,
Release, cutover and Final Acceptance.

## Single Responsibilities

```text
package metadata/release workflow = exact version, tag and asset identity
runtime bundle = deterministic runnable v0.2.0 files
bridge service = expose selected stdio runtime through existing profile
operator runbook = stage, switch and roll back versioned runtime directories
tmux backend = observe existing endpoints without lifecycle mutation
Coordinator = authorize irreversible release/cutover and accept evidence
```

## Logic / Control Separation

Logic/data path owns version validation, deterministic packaging, checksum,
clean-room runtime behavior, public-tool discovery and mechanical health/wait
responses. Control/orchestration owns whether to tag, publish, restart, retry,
roll back or declare deployment accepted.

## Success / Failure / Degradation

Success proves artifact identity and reversible service operation, not
application-level completion. Hard failures include tag/version mismatch,
missing release note, checksum/package mismatch, staged runtime failure,
unexpected public tools, lost tmux inventory or inability to restore v0.1.1.
Safe degradation is leaving the current v0.1.1 service running. Client
disconnects during a controlled restart are operational impact, not tmux loss.

## Required Capabilities

```text
accepted main + release metadata
→ exact-tag release workflow and asset verification
→ versioned staging directory with production install
→ read-only service/bridge inventory
→ controlled systemd/tunnel switch with bounded health smoke
→ reversible v0.1.1 rollback
```

No credential value, tunnel token or full environment dump may be persisted.

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
- `docs/mcp-contract.md`
- `docs/security.md`
- `docs/tasks/29-v0-1-1-deployment-release/task.md`
- `docs/tasks/29-v0-1-1-deployment-release/prompt.md`
- live Issues #29 and #32 comments/state

## Worker / Verification Route

This Task explicitly uses `env:codex` because it needs host inventory and, only
after Coordinator authorization, systemd/tunnel cutover. GitHub Actions remains
the authority for repository build/package/release workflow evidence. Host
commands must be bounded, redact secrets and preserve unrelated tmux channels.

## In Scope

- v0.2.0 version/tag/Release preflight and exact-asset verification;
- staging a versioned v0.2.0 runtime from the verified Release asset;
- service, bridge profile, runtime path and tmux visibility inventory;
- controlled bridge cutover and health/discovery smoke after authorization;
- documented executable rollback to the preserved v0.1.1 runtime;
- durable evidence of client impact and tmux non-interference.

## Out of Scope

- changing or reopening Issue #32;
- token/cursor capacity redesign or unrelated product refactoring;
- creating/recovering tmux endpoints from MCP code;
- changing application sessions, panes, commands or contents;
- tunnel-provider redesign, credential rotation, DNS/firewall/TLS changes;
- npm publication, Docker/systemd policy redesign or new public Tools;
- automatic deployment, rollback or tag creation from ordinary CI.

## Architecture / Security Invariants

- Channel remains the product domain object; Task/release state stays outside
  product code.
- Existing tmux endpoint lifecycle remains deployment/operator responsibility.
- No raw shell/tmux public API or implicit control is introduced.
- Credentials remain in existing protected service/config files; reports contain
  only paths, identities and redacted key names.
- Release workflow permissions stay tag-gated and minimally scoped.
- Failed or unavailable backend is never represented as successful application
  operation.

## Implementation Requirements

1. Re-read live #32 acceptance and verify exact accepted main SHA.
2. Verify package/lock/runtime/release-note identity for `0.2.0`; use the
   tag-only workflow for formal assets.
3. Independently verify checksum, extracted package, seven tools and accepted
   wait/discovery smoke before staging.
4. Record current service unit, bridge profile command, runtime directory,
   rollback archive/checksum and redacted environment keys.
5. Record read-only tmux inventory before any service operation.
6. Stage v0.2.0 beside (never over) v0.1.1 and install production dependencies.
7. Only after explicit Coordinator authorization, switch the bridge using the
   existing service mechanism with bounded stop/start timeouts and no tmux
   commands.
8. Verify post-switch health/discovery and reconnect expectations; on failure,
   restore v0.1.1 and verify it.
9. Preserve exact identities/timings without secrets and report client impact.

## Claims / Verification

```text
C1: exact accepted main/tag/release identity is consistent for v0.2.0.
C2: v0.2.0 archive and checksum are independently verified from the Release.
C3: staged package exposes the accepted seven-tool surface and wait behavior.
C4: v0.1.1 rollback archive/checksum remain available and verify.
C5: bridge configuration and tmux inventory are captured without secrets.
C6: authorized cutover affects only bridge/MCP processes, not tmux endpoints.
C7: post-cutover health/discovery and reconnect behavior are evidenced.
C8: rollback restores v0.1.1 when cutover checks fail or authorization is
    withdrawn.
```

## Success Criteria

1. SC1: v0.2.0 tag, Release assets and checksum point to accepted main and pass
   release workflow verification.
2. SC2: clean-room staged package verifies exactly seven public tools and the
   accepted Issue #32 observation/wait contract.
3. SC3: v0.1.1 rollback archive and checksum remain available and verify.
4. SC4: service/bridge configuration and tmux inventory are recorded without
   credential disclosure.
5. SC5: authorized cutover and bounded post-cutover smoke pass without tmux
   endpoint mutation.
6. SC6: client interruption/reconnect behavior is explicitly recorded.
7. SC7: failed cutover can restore v0.1.1 and verify service health.
8. SC8: no deployment/tag/Release action occurs before Coordinator authorization.

## Failure / Blocked Rules

Remain on v0.1.1 and report `BLOCKED` if tag/release capability, exact asset
evidence, host access, rollback integrity or safe cutover observability is
unavailable. Never overwrite v0.1.1, reuse an unrelated artifact, stop tmux
servers, expose credentials or lower a failed criterion.

## Publication Dependency / Alignment Gate

Before this Task can become `status:ready`, Coordinator must re-read closed
Issue #32 acceptance, accepted main `a921067ebaa8c38b7c8ee6a0b879d1c6671d53f0`,
the v0.2.0 release-note correction (if merged), and current host inventory.
The Task stays draft until release/cutover authority, target service and
rollback path are confirmed. No unaccepted branch may substitute for main.

## Evidence Contract

Record exact main/tag, release workflow and Release assets/digests, staged
package path/version/checksum, redacted service/profile/runtime identity,
before/after tmux inventory, cutover/reconnect/rollback timings and outcomes.
Do not persist API keys, tunnel tokens, full `/proc/*/environ`, terminal
transcripts or unrelated application output.

## Completion Protocol

This Task remains a draft until the Coordinator passes Publication Gate. After
publication, the authorized executor performs exactly one Attempt, records
release/deployment evidence, returns the Issue to `status:review + owner:none`,
and stops. Only the Coordinator may authorize tag/Release/cutover and perform
Final Acceptance/closure.
