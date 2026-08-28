# Task — v0.1.0 consumer and release readiness

## Metadata

```text
GitHub Issue: #20
Task kind: post-MVP consumer/release readiness + deployment bundle
Environment: env:web-gpt
Preferred worker: web-gpt-worker
Handoff profile: docs/tasks/handoffs/web-gpt.md
Accepted product baseline: Channel MCP MVP complete
```

Planning method: `docs/tasks/planning-principles.md`.

## Goal

Turn the accepted Channel MCP MVP into one coherent consumer-facing **v0.1.0 deployment bundle** without adding or changing MCP capabilities.

This Task packages the accepted runtime for consumption. It does not add deployment infrastructure or a new product phase.

## Primary Use Case

### UC1 — external upper-layer integrator deploys the accepted Channel MCP

```text
Actor: external upper-layer integrator/operator
Trigger: wants to run the completed Channel MCP on a host
Preconditions: Node >=20, npm and tmux are available; terminal endpoint lifecycle is prepared externally
Main flow:
  obtain agent-runtime-mcp-v0.1.0.tar.gz
  → unpack
  → npm ci --omit=dev
  → configure TMUX_* backend scope
  → launch npm start from the unpacked bundle
  → MCP client consumes the six accepted public Tools
Success: integrator can run v0.1.0 without cloning TypeScript source or building the project on the target host
Failure: archive is incomplete, requires source/dev tooling, or cannot launch the accepted stdio server
Degradation: operator still owns process supervision/network reachability; the bundle only supplies the runnable MCP application
Evidence: deterministic package contents + clean-room extracted-bundle verification + existing public MCP CI + release artifact checksum
```

## Accepted Product Contract

Exactly these six Tools remain authoritative:

```text
list_channels
get_channel
read_channel
write_text
send_control
health
```

No Tool/schema/runtime-semantic change is in scope.

## Separation Points

### Deployment bundle | deployment infrastructure

The bundle contains the runnable MCP application. It does **not** own:

```text
systemd/supervisor policy
tunnel/proxy/network reachability
TLS/auth/DNS/firewall
host provisioning
Node/tmux installation
endpoint creation/restart
```

### Runtime distribution | npm publication

A downloadable runtime archive is the v0.1.0 distribution contract. `package.json` remains `private: true`; publishing the project to the npm registry is not part of this Task.

### Runtime artifact | source repository

The deployment bundle should not require TypeScript compilation on the target host and should not ship repository collaboration history, tests or source merely because they exist in the repository.

### License policy | packaging mechanics

Choosing a license is an owner/policy decision. A Worker may package the frozen license decision, but must not invent one.

### Repository identity | runtime semantics

Repository description/README/package metadata should describe the Channel-only product accurately but do not change behavior.

### MCP client launch config | endpoint lifecycle

Consumer docs may show how a local stdio MCP client launches the unpacked runtime and passes `TMUX_*`. The terminal endpoint is still prepared externally.

## Single Responsibilities

```text
runtime deployment bundle
= compiled application + production dependency manifests + deployment/consumer docs

consumer docs
= explain unpack/install/configure/start/use

repository/package metadata
= identify product/version/distribution policy

release checkpoint
= immutable v0.1.0 accepted commit + same deployment archive/checksum

Channel MCP runtime
= unchanged six capabilities

deployment/operator layer
= host/network/security/process supervision + endpoint lifecycle
```

## Logic / Control Separation

No Channel data-path logic changes are planned.

Packaging decides only how accepted runtime bytes are assembled and verified. Runtime orchestration remains external.

## D1 — Distribution — FROZEN: deployment bundle

Canonical artifact:

```text
agent-runtime-mcp-v0.1.0.tar.gz
```

Target-host contract:

```text
Node >=20
npm
tmux
```

Expected flow:

```text
tar -xzf agent-runtime-mcp-v0.1.0.tar.gz
cd agent-runtime-mcp-v0.1.0
npm ci --omit=dev
TMUX_SOCKET_NAME=<existing-socket> npm start
```

The bundle must be runnable without TypeScript compilation on the target host.

### Required bundle contents

At minimum:

```text
dist/src/**            # compiled runtime only
package.json
package-lock.json
README.md or focused deployment/consumer guide
LICENSE                # according to frozen D2 decision
```

A small start/config helper may be included if it only wraps the documented stdio startup and `TMUX_*` configuration. It must not create tmux panes or own supervision/network setup.

### Excluded from bundle

```text
src/**
tests/**
dist/tests/**
TypeScript/compiler tooling
devDependencies/node_modules snapshot
repository task/collaboration history
Node runtime
tmux binary
systemd/docker/tunnel/provider configuration unless separately justified outside this Task
```

Production `node_modules` are **not** embedded in the portable v0.1.0 archive; `npm ci --omit=dev` installs the exact production dependency graph from the lockfile on the target host.

`package.json` remains:

```text
private: true
version: 0.1.0
```

No npm registry publication occurs.

## D2 — License — UNRESOLVED OWNER DECISION

Owner must select the repository/license policy. The Worker must not choose a license.

Until D2 is frozen:

```text
status:draft
owner:none
Blocker: awaiting-license-policy-decision
```

The selected LICENSE must be included in the final deployment bundle.

## D3 — Release checkpoint — FROZEN

After readiness/package changes are accepted and canonical-main CI is green:

```text
accepted canonical commit
→ build exact agent-runtime-mcp-v0.1.0.tar.gz
→ compute SHA-256 checksum
→ verify extracted bundle
→ v0.1.0 tag
→ GitHub Release on the same commit
→ attach the accepted deployment archive + checksum
```

The Worker prepares package/release Evidence. Coordinator remains final release authority.

## D4 — Product identity — FROZEN

Canonical identity meaning:

> Generic MCP communication layer for already-existing interactive terminal Channels, with tmux as the first backend.

Concise metadata wording may be equivalent but must not reintroduce Worker/Task/Agent-runtime lifecycle ownership.

## Package Verification Claims

- **C1 Product identity:** consumer-facing metadata/docs describe generic existing-terminal Channel MCP.
- **C2 Contract preservation:** exactly six public Tools remain unchanged.
- **C3 Runtime-only archive:** deployment package contains compiled runtime and production manifests but not TypeScript source/tests/dev build tooling.
- **C4 Clean-room install:** extracting the archive into an empty directory and running `npm ci --omit=dev` succeeds.
- **C5 Clean-room launch:** the extracted bundle launches `dist/src/server.js` through `npm start` with the documented backend env.
- **C6 Public MCP verification:** a test harness outside the bundle can connect to the extracted runtime and prove at least health/discovery; the existing full public dogfood suite remains green against repository main.
- **C7 Endpoint boundary:** package/start helpers never create/restart/destroy tmux panes.
- **C8 Deployment boundary:** bundle does not require or own tunnel/network/TLS/auth/supervisor configuration.
- **C9 Distribution clarity:** `private: true` remains and no npm publication occurs.
- **C10 License clarity:** LICENSE in repository and bundle matches owner D2 decision.
- **C11 Artifact integrity:** exact release candidate produces a named tar.gz plus SHA-256 evidence.
- **C12 Regression:** typecheck/unit/tmux/public-discovery/public-dogfood/static-boundary remain green.

## Expected Implementation Surface

After D2 is frozen, Worker may add/modify only what is necessary for release readiness, for example:

```text
README / deployment consumer docs
package.json packaging scripts
scripts/package-runtime.*
CI package + clean-room verification job
repository identity metadata checklist/evidence
LICENSE according to D2
```

Product `src/` behavior is not expected to change. If packaging requires changing MCP semantics or runtime behavior, Worker must BLOCK and return to Coordinator.

## Out of Scope

- seventh MCP Tool;
- Tool/schema changes;
- Channel/backend semantic changes;
- endpoint lifecycle APIs;
- Worker/Task/application semantics;
- tunnel/provider/network/auth implementation;
- Docker/systemd/supervisor ownership;
- bundling Node or tmux;
- npm registry publication;
- changing `private: true`;
- automatically choosing a license;
- post-v0.1.0 feature roadmap.

## Publication Gate

Coordinator may publish only after D2 is explicitly resolved and live accepted main is re-read.

Current gate state:

```text
D1 deployment tar.gz distribution: FROZEN
D2 license: UNRESOLVED
D3 v0.1.0 release attaches exact bundle + checksum: FROZEN
D4 generic Channel MCP identity: FROZEN
```

Therefore current Issue state remains:

```text
status:draft
owner:none
Blocker: awaiting-license-policy-decision
```

## Completion Protocol

```text
Coordinator freezes D2 and re-runs Publication Gate
→ status:ready/env:web-gpt
→ separate Web GPT Worker claims one Attempt
→ package + consumer/release-readiness changes + Evidence
→ [EXECUTION REPORT] | [BLOCKER REPORT]
→ status:review | status:blocked + owner:none
→ STOP
→ Coordinator Review
→ accepted canonical main CI + clean-room bundle verification
→ Coordinator creates v0.1.0 release checkpoint with accepted archive/checksum
```
