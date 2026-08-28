# Task — v0.1.0 consumer and release readiness

## Metadata

```text
GitHub Issue: #20
Task kind: post-MVP consumer/release readiness
Environment: env:web-gpt
Preferred worker: web-gpt-worker
Handoff profile: docs/tasks/handoffs/web-gpt.md
Accepted product baseline: Channel MCP MVP complete
```

Planning method: `docs/tasks/planning-principles.md`.

## Goal

Turn the accepted Channel MCP MVP into one coherent consumer-facing v0.1.0 source-release checkpoint **without adding or changing MCP capabilities**.

This Task is about how an integrator understands and consumes the accepted product. It is not a new product phase.

## Primary Use Case

### UC1 — external upper-layer integrator consumes the accepted Channel MCP

```text
Actor: external upper-layer integrator
Trigger: wants to use the completed Channel MCP
Preconditions: Node/npm/tmux available; endpoint lifecycle is prepared externally
Main flow:
  understand product identity
  → obtain source/version
  → build/run stdio server
  → configure one MCP client to launch it
  → provide backend env/scope
  → use the six accepted public Tools
Success: integrator can consume v0.1.0 without repository-internal workflow knowledge or old Worker Runtime assumptions
Failure: docs/metadata/distribution policy are contradictory or insufficient to identify/run the accepted product
Degradation: source-only clone/build is the accepted v0.1.0 distribution contract; npm/package publication is not required
Evidence: repository metadata + README/consumer docs + exact accepted CI + release/tag state
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

### Release readiness | product capability

Release work may change documentation, package/repository metadata and version/release records. It must not redefine Channel semantics.

### Source distribution | package distribution

v0.1.0 is a source-release checkpoint. `package.json` remains `private: true`; npm/package publication is not part of this Task.

### License policy | implementation mechanics

Choosing a license is an owner/policy decision. A Worker may apply a frozen license decision, but must not invent one.

### Repository identity | runtime semantics

Repository description/topics/README/package metadata should describe the Channel-only product accurately but do not change behavior.

### MCP client launch config | deployment

A local stdio consumer example may show how an MCP client launches the process and passes `TMUX_*` backend configuration. It must not grow tunnel/provider/network/auth scope.

### Endpoint preparation | MCP consumption

Consumer docs may show an externally prepared tmux pane. MCP still does not own endpoint lifecycle.

## Single Responsibilities

```text
consumer docs
= explain how to obtain/build/configure/use accepted v0.1.0

repository/package metadata
= identify the accepted product/version/source-only distribution policy

release checkpoint
= identify one immutable accepted source state through v0.1.0 tag/GitHub Release

Channel MCP runtime
= unchanged six capabilities

deployment/operator layer
= reachability/security/process supervision outside product
```

## Logic / Control Separation

No Channel data-path logic changes are planned.

Release/control decisions remain external to runtime:

- source-only distribution is frozen for v0.1.0;
- license selection remains an owner decision;
- v0.1.0 tag/GitHub Release is created only after readiness changes are accepted;
- repository identity is frozen to the generic Channel MCP meaning.

## Current Evidence / Gaps

Accepted baseline:

- Channel MVP accepted and integrated;
- public dogfooding accepted;
- `package.json` version is `0.1.0`;
- `package.json` is currently `private: true`;
- README accurately describes the six-Tool Channel boundary and clone/build/run flow;
- repository has no open product issue;
- GitHub Releases list is empty.

Known readiness gaps:

1. GitHub repository description still says `MCP server for managing agent runtime sessions`, which conflicts with the accepted Channel-only architecture.
2. Public repository currently reports no license.
3. README has build/run instructions but no frozen consumer-facing stdio MCP configuration example for an upper-layer client.
4. No immutable v0.1.0 release/tag checkpoint has been accepted.

## Publication Dependency / Decision Gate

### D1 — Distribution — FROZEN

```text
source-only v0.1.0
keep package.json private: true
consumers clone/build/run
no npm/package publication in this Task
```

A future package distribution use case requires separate planning and package-surface review.

### D2 — License — UNRESOLVED OWNER DECISION

Owner must select the repository license policy. The Worker must not choose a license.

Until D2 is frozen:

```text
status:draft
owner:none
Blocker: awaiting-license-policy-decision
```

### D3 — Release checkpoint — FROZEN

After consumer-readiness changes are accepted and canonical-main CI is green:

```text
create immutable v0.1.0 source checkpoint
→ v0.1.0 tag
→ GitHub Release for the same accepted commit
```

Do not create the tag/release before Coordinator Final Acceptance of the readiness Candidate.

### D4 — Product identity — FROZEN

Canonical identity meaning:

> Generic MCP communication layer for already-existing interactive terminal Channels, with tmux as the first backend.

Repository metadata may use a concise equivalent such as:

> MCP communication layer for existing interactive terminal Channels, with tmux as the first backend.

It must not reintroduce Worker/Task/Agent-runtime lifecycle ownership.

## Required Capabilities After Decision Gate

After D2 is frozen, this Task requires only:

- consumer-oriented README/documentation cleanup;
- one concrete local stdio MCP client configuration example;
- repository identity metadata aligned to D4;
- license state aligned to D2;
- source-only distribution clarity with `private: true` preserved;
- release readiness Evidence for a later Coordinator-created v0.1.0 tag/GitHub Release.

No new MCP capability follows from these needs.

## Verification Claims

- **C1 Product identity:** consumer-facing metadata/docs describe generic existing-terminal Channel MCP, not managed Agent/Worker Runtime.
- **C2 Contract preservation:** exact six public Tools remain unchanged.
- **C3 Consumer path:** documented source/build/run + stdio client configuration is sufficient to launch the accepted server with external tmux preparation.
- **C4 Boundary preservation:** deployment/network/auth and endpoint lifecycle remain external.
- **C5 Distribution clarity:** v0.1.0 is explicitly source-only and `private: true` remains consistent with no npm publication.
- **C6 License clarity:** repository license state matches the owner decision.
- **C7 Version clarity:** accepted readiness state is suitable for immutable v0.1.0 tag/GitHub Release on the same canonical commit.
- **C8 Regression:** existing typecheck/unit/tmux/public-discovery/public-dogfood/static-boundary CI stays green if repository files change.

## Out of Scope

- seventh MCP Tool;
- Tool/schema changes;
- Channel/backend semantic changes;
- endpoint lifecycle APIs;
- Worker/Task/application semantics;
- tunnel/provider/network/auth implementation;
- npm/package publication;
- changing `private: true`;
- automatically choosing a license;
- creating the final tag/GitHub Release before Coordinator acceptance;
- post-v0.1.0 feature roadmap.

## Publication Gate

Coordinator may publish only after D2 is explicitly resolved and live accepted main is re-read.

Current gate state:

```text
D1 source-only distribution: FROZEN
D2 license: UNRESOLVED
D3 v0.1.0 tag/GitHub Release after acceptance: FROZEN
D4 generic Channel MCP identity: FROZEN
```

Therefore current Issue state remains:

```text
status:draft
owner:none
Blocker: awaiting-license-policy-decision
```

## Completion Protocol

If/when published:

```text
Coordinator freezes D2 and re-runs Publication Gate
→ status:ready/env:web-gpt
→ separate Web GPT Worker claims one Attempt
→ consumer/release-readiness changes + Evidence
→ [EXECUTION REPORT] | [BLOCKER REPORT]
→ status:review | status:blocked + owner:none
→ STOP
→ Coordinator Review
→ accepted canonical main CI
→ Coordinator creates v0.1.0 tag/GitHub Release on accepted commit
```
