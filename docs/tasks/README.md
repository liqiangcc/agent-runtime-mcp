# Issue-driven Task Model

This directory defines **repository development workflow**, not the public Channel MCP product protocol.

Independent Task package:

```text
GitHub Issue
+
docs/tasks/<issue>-<slug>/
├── task.md
└── prompt.md
```

## Default role chain

```text
original GPT Web conversation
= Coordinator / Publisher / Reviewer

separate GPT Web conversation
= Web Worker using @GitHub

GitHub Actions
= executable verification Runner / Evidence
```

Default flow:

```text
Coordinator
→ plan/materialize/publish Task
→ status:ready + env:web-gpt
→ short Web Worker entry
→ separate GPT Web Worker claims one Attempt
→ repository changes + Actions Evidence
→ [EXECUTION REPORT] | [BLOCKER REPORT]
→ review/blocked + owner:none
→ STOP
→ original Coordinator reviews
```

Codex/Dispatcher profiles may exist as optional alternative routes but are not the repository default.

## Planning before publication

Canonical planning method: `planning-principles.md`.

Plan in this order:

```text
Goal
→ Use Case
→ Success / Failure / Degradation
→ Separation Points
→ Single Responsibilities
→ Logic / Control Separation
→ Required Capabilities
→ Claims / Evidence
→ only then Tool / API / implementation mapping
```

Planning must focus on **where responsibility changes hands** rather than on source files, tmux commands or existing Tool names.

Important recurring separations include:

```text
product | repository collaboration
Channel transport | upper-layer application semantics
MCP ingress/auth | Channel logic
Channel Service | backend adapter
backend adapter | tmux mechanics
data/communication logic | orchestration/control policy
observation | interpretation
execution Evidence | acceptance authority
```

A Task should represent one coherent independently reviewable capability/use-case slice with clear single responsibilities.

## Durable state

- Issue body = current live snapshot from `issue-state-convention.md`.
- Issue comments = append-only Attempt/Blocker/Review/Acceptance history.
- `task.md` = frozen execution Contract.
- `prompt.md` = bootstrap/navigation only.
- GitHub Actions = Evidence, never Task authority.

## Web Worker entry

Normal published Task entry is intentionally short:

```text
@GitHub

执行 liqiangcc/agent-runtime-mcp 的 Issue #<issue>，作为 Web Worker。

必须使用 GitHub live state。

入口：
`docs/tasks/<issue>-<slug>/prompt.md`

按仓库协议 claim、执行、报告后停止。
```

The Worker reads all real Scope/Claims/Success Criteria from GitHub + Task Package.

## Publication

```text
Goal + use-case/boundary analysis
→ status:draft
→ Issue + task.md + prompt.md
→ GitHub read-back Publication Gate
→ status:ready + owner:none + env:web-gpt
→ short Web Worker entry
```

A draft Task is not claimable.

Publication Gate includes checking that use case, separation points, single responsibilities, logic/control ownership, failure/degradation and Evidence authority are explicit.

## Worker

The Worker is a **different GPT Web conversation** from the Coordinator.

```text
@GitHub live read
→ confirm ready/no-owner/env:web-gpt
→ claim as web-gpt-worker
→ Attempt N
→ execute frozen Contract through GitHub
→ use GitHub Actions for required executable verification
→ [EXECUTION REPORT] | [BLOCKER REPORT]
→ review/blocked + owner:none
→ STOP
```

Worker never Reviews itself, closes the Issue, or starts another Task/Attempt automatically.

## Reviewer

The original Coordinator conversation reads live Issue + Contract + Candidate/PR + actual Evidence and chooses:

```text
ACCEPT | REVISE | BLOCK | SPLIT | NOT_PLANNED
```

Unchanged-contract REVISE returns the same Issue to ready for Attempt N+1. Contract or separation-boundary changes return to draft and Publication Gate.

## Planning ahead

A future Task may be materialized as `status:draft` while the current Task executes when its **use case, stable boundaries and Claims** can already be planned.

Do not prematurely freeze implementation details that depend on the current Task. Keep an explicit Publication Dependency / Alignment Gate and re-read the accepted upstream Candidate before publication.

## Product separation

Repository collaboration concepts are not Channel MCP product concepts:

```text
Coordinator
Web Worker
Issue
Attempt
GitHub Actions
branch / PR
Task review
```

Channel MCP remains only terminal communication infrastructure as defined by canonical product docs.

Final principle:

```text
GitHub = durable repository Task authority
separate GPT Web conversation = default implementation Worker
GitHub Actions = Runner / Evidence
Channel MCP = product being built, not collaboration engine
```
