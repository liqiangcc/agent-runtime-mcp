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
Degradation: source-only clone/build may be accepted even when no npm package is published, but only if that policy is explicit
Evidence: repository metadata + README/consumer docs + exact accepted CI + release/tag state as applicable
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

A Git clone/source release and an npm/package publication are different distribution policies. Do not silently convert `private: true` into a public package decision.

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
= identify the accepted product/version/distribution policy

release checkpoint
= identify one immutable accepted source state if owner policy approves

Channel MCP runtime
= unchanged six capabilities

deployment/operator layer
= reachability/security/process supervision outside product
```

## Logic / Control Separation

No Channel data-path logic changes are planned.

Release/control decisions remain external to runtime:

- whether to publish source-only or a package;
- which license to use;
- whether/when to tag v0.1.0;
- whether/when to create a GitHub Release;
- repository description/topics.

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
3. Distribution policy is not frozen: source-only vs package publication.
4. README has build/run instructions but no frozen consumer-facing stdio MCP configuration example for an upper-layer client.
5. No immutable v0.1.0 release/tag checkpoint has been accepted.

## Publication Dependency / Decision Gate

Keep this Task `status:draft` until the Coordinator has an explicit owner decision for all of:

### D1 — Distribution

Choose one:

```text
A. source-only v0.1.0
   keep package private
   consumers clone/build/run

B. package distribution
   requires separate package-surface review before publication
```

Do not infer B merely because the package version is 0.1.0.

### D2 — License

Owner selects the repository license policy. The Worker must not choose a license.

### D3 — Release checkpoint

Decide whether v0.1.0 should be represented by a tag/GitHub Release after readiness changes are accepted.

### D4 — Product identity

Freeze concise repository identity wording aligned to:

> Generic MCP communication layer for already-existing interactive terminal Channels, with tmux as the first backend.

Exact metadata wording may be shortened but must not reintroduce Worker/Task/lifecycle ownership.

## Required Capabilities After Decision Gate

Depending on D1-D4, this Task may require only:

- consumer-oriented README/documentation cleanup;
- package metadata alignment that does not publish a package unless explicitly chosen;
- repository identity checklist/evidence;
- release/tag notes/checkpoint evidence.

No new MCP capability follows from these needs.

## Verification Claims

- **C1 Product identity:** consumer-facing metadata/docs describe generic existing-terminal Channel MCP, not managed Agent/Worker Runtime.
- **C2 Contract preservation:** exact six public Tools remain unchanged.
- **C3 Consumer path:** documented source/build/run + stdio client configuration is sufficient to launch the accepted server with external tmux preparation.
- **C4 Boundary preservation:** deployment/network/auth and endpoint lifecycle remain external.
- **C5 Distribution clarity:** source-only vs package distribution is explicit and matches package metadata.
- **C6 License clarity:** repository license state matches the owner decision.
- **C7 Version clarity:** v0.1.0 checkpoint/version policy is explicit and consistent.
- **C8 Regression:** existing typecheck/unit/tmux/public-discovery/public-dogfood/static-boundary CI stays green if repository files change.

## Out of Scope

- seventh MCP Tool;
- Tool/schema changes;
- Channel/backend semantic changes;
- endpoint lifecycle APIs;
- Worker/Task/application semantics;
- tunnel/provider/network/auth implementation;
- npm publication unless D1 explicitly selects package distribution;
- automatically choosing a license;
- post-v0.1.0 feature roadmap.

## Publication Gate

Coordinator may publish only after D1-D4 are explicitly resolved and live accepted main is re-read.

If any policy decision remains unresolved:

```text
status:draft
owner:none
Blocker: awaiting-release-policy-decisions
```

## Completion Protocol

If/when published:

```text
Coordinator freezes D1-D4
→ status:ready/env:web-gpt
→ separate Web GPT Worker claims one Attempt
→ consumer/release-readiness changes + Evidence
→ [EXECUTION REPORT] | [BLOCKER REPORT]
→ status:review | status:blocked + owner:none
→ STOP
→ Coordinator Review
```
