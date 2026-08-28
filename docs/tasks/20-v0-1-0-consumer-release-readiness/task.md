# Task — v0.1.0 deployment bundle readiness

## Metadata

```text
GitHub Issue: #20
Task kind: post-MVP deployment-bundle readiness
Environment: env:web-gpt
Preferred worker: web-gpt-worker
Handoff profile: docs/tasks/handoffs/web-gpt.md
Accepted product baseline: Channel MCP MVP complete
```

Planning method: `docs/tasks/planning-principles.md`.

## Goal

Package the accepted Channel MCP MVP as a runnable **v0.1.0 deployment archive** without adding or changing MCP capabilities.

This Task packages runtime bytes. It does not add deployment infrastructure, endpoint lifecycle or a new product capability.

## Primary Use Case

```text
Actor: operator / upper-layer integrator
Trigger: wants to run agent-runtime-mcp on a target host
Preconditions: target has Node >=20, npm and tmux; tmux endpoint lifecycle is external
Main flow:
  obtain agent-runtime-mcp-v0.1.0.tar.gz
  → extract
  → npm ci --omit=dev
  → configure TMUX_*
  → npm start
  → consume the accepted stdio MCP Tools
Success: target runs the accepted MCP without cloning TypeScript source or compiling on the target
Failure: archive is incomplete, needs dev/source build tooling, or cannot launch/serve the accepted MCP path
Degradation: host supervision/network/security remain operator concerns
Evidence: package contents + SHA-256 + clean-room extracted-bundle verification + full existing CI
```

## Frozen Product Contract

Exactly six public Tools:

```text
list_channels
get_channel
read_channel
write_text
send_control
health
```

No Tool/schema/runtime-semantic change is authorized.

## D1 — Deployment Bundle — FROZEN

Canonical artifact:

```text
agent-runtime-mcp-v0.1.0.tar.gz
```

Target runtime requirements:

```text
Node >=20
npm
tmux
```

Canonical target flow:

```text
tar -xzf agent-runtime-mcp-v0.1.0.tar.gz
cd agent-runtime-mcp-v0.1.0
npm ci --omit=dev
TMUX_SOCKET_NAME=<existing-socket> npm start
```

Target host must not need TypeScript compilation.

### Required archive contents

```text
dist/src/**
package.json
package-lock.json
consumer/deployment README or equivalent focused guide
```

If the repository contains a LICENSE under the owner's current policy, include it. This Task does not create or choose a new license.

### Excluded archive contents

```text
src/**
tests/**
dist/tests/**
TypeScript/compiler/dev build tooling
node_modules snapshot
repository Task/collaboration history
Node runtime
tmux binary
systemd/docker/tunnel/provider/network configuration
```

Production dependencies are installed on the target with:

```text
npm ci --omit=dev
```

Keep:

```text
package.json private: true
package.json version: 0.1.0
```

No npm registry publication occurs.

## Separation Points

```text
deployment bundle
= runnable application artifact

Channel MCP
= six accepted communication capabilities

endpoint lifecycle
= external

process supervision
= external

network/tunnel/TLS/auth
= external

public license/repository distribution policy
= separate owner decision, not a packaging precondition
```

Calling this a deployment bundle does not authorize Docker/systemd/tunnel/provider scope.

## Product Identity — FROZEN

Canonical meaning:

> Generic MCP communication layer for already-existing interactive terminal Channels, with tmux as the first backend.

Consumer-facing metadata/docs must not reintroduce Worker/Task/Agent-runtime lifecycle ownership.

## Implementation Scope

Expected changes may include:

```text
package.json packaging script
scripts/package-runtime.*
focused deployment/consumer documentation
CI deployment-bundle job
clean-room package verification harness
repository identity/documentation correction
```

Product `src/` behavior is not expected to change.

If packaging requires changing MCP semantics, Tool schemas or endpoint lifecycle authority, Worker must BLOCK and return to Coordinator.

## Verification Claims

- **C1 Contract preserved:** exactly six public Tools remain unchanged.
- **C2 Runtime-only artifact:** archive contains compiled `dist/src` runtime and production manifests, not source/tests/dev tooling.
- **C3 Deterministic name/version:** exact Candidate produces `agent-runtime-mcp-v0.1.0.tar.gz`.
- **C4 Integrity:** exact Candidate produces SHA-256 for that archive.
- **C5 Clean-room install:** empty-directory extraction + `npm ci --omit=dev` succeeds.
- **C6 Clean-room launch:** packaged `npm start` launches `dist/src/server.js` without TypeScript tooling.
- **C7 Public MCP package proof:** an external test harness connects to the extracted packaged runtime and proves at least public `health + list_channels` against an externally prepared disposable tmux endpoint.
- **C8 Existing regression:** typecheck/unit/real-tmux/public-discovery/public-dogfood/static-boundary remain green.
- **C9 Endpoint boundary:** package scripts/helpers never create/restart/destroy tmux endpoints.
- **C10 Deployment boundary:** no systemd/docker/tunnel/network/TLS/auth ownership is introduced.
- **C11 Distribution policy:** `private:true` remains and no npm publication occurs.
- **C12 Consumer identity:** README/package guidance describes generic existing-terminal Channel MCP.

## CI / Artifact Evidence

Exact Candidate CI should add one package verification path:

```text
build
→ stage runtime-only directory
→ create agent-runtime-mcp-v0.1.0.tar.gz
→ sha256sum
→ extract into empty directory
→ npm ci --omit=dev
→ prepare disposable tmux endpoint externally
→ launch packaged stdio server
→ external official MCP client verifies packaged health/list_channels
→ prove archive excludes src/tests/dist/tests
→ preserve all existing jobs
```

The CI-produced tar.gz + checksum should be retained as workflow artifact Evidence when supported.

## Out of Scope

- seventh MCP Tool;
- public schema/runtime behavior changes;
- endpoint lifecycle APIs;
- Worker/Task/application semantics;
- Docker image;
- systemd unit or process supervisor policy;
- tunnel/provider/network/TLS/auth implementation;
- bundling Node or tmux;
- embedding node_modules;
- npm registry publication;
- choosing/changing repository license policy;
- public GitHub Release/tag policy;
- post-v0.1.0 feature roadmap.

## Publication Gate

PASS.

Frozen inputs:

```text
D1 deployment tar.gz: frozen
runtime contents/exclusions: frozen
clean-room package verification: frozen
package remains private: true
product identity: frozen
license/public-release policy: explicitly separate, not blockers
```

Live Issue must be:

```text
status:ready
owner:none
env:web-gpt
Blocker:none
```

## Completion Protocol

```text
Worker claims one Attempt
→ package implementation + exact artifact/checksum Evidence
→ [EXECUTION REPORT] | [BLOCKER REPORT]
→ status:review | status:blocked + owner:none
→ STOP
→ Coordinator Review
→ Integration Gate + canonical-main package verification
→ Final Acceptance
```
