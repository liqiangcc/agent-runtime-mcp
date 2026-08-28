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
original GPT Web conversation = Coordinator / Publisher / Reviewer
separate GPT Web conversation = Web Worker using @GitHub
GitHub Actions = executable Runner / Evidence
```

Default flow:

```text
Coordinator
→ plan/materialize/publish Task
→ status:ready + env:web-gpt
→ short Web Worker entry
→ separate Web GPT Worker claims one Attempt
→ repository changes + Actions Evidence
→ [EXECUTION REPORT] | [BLOCKER REPORT]
→ review/blocked + owner:none
→ STOP
→ original Coordinator reviews
```

## Planning before publication

Canonical method: `planning-principles.md`.

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

Planning focuses on **where responsibility changes hands**, not source files or tmux commands.

Recurring separations include:

```text
product | repository collaboration
MCP capability | deployment mechanism
Channel communication | upper-layer application semantics
Channel Service | backend adapter
backend adapter | tmux mechanics
data/communication logic | orchestration/control policy
observation | interpretation
execution Evidence | acceptance authority
```

A Task represents one coherent independently reviewable use-case/capability slice.

## Durable state

- Issue body = current live snapshot.
- Issue comments = append-only Attempt/Blocker/Review/Acceptance history.
- `task.md` = frozen execution Contract.
- `prompt.md` = bootstrap/navigation only.
- GitHub Actions = Evidence, never Task authority.

## Web Worker entry

```text
@GitHub

执行 liqiangcc/agent-runtime-mcp 的 Issue #<issue>，作为 Web Worker。

必须使用 GitHub live state。

入口：
`docs/tasks/<issue>-<slug>/prompt.md`

按仓库协议 claim、执行、报告后停止。
```

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

Publication Gate checks use case, separation points, single responsibilities, logic/control ownership, failure/degradation and Evidence authority.

## Worker

The Worker is a **different GPT Web conversation** from the Coordinator.

```text
@GitHub live read
→ confirm ready/no-owner/env:web-gpt
→ claim as web-gpt-worker
→ Attempt N
→ execute frozen Contract
→ use Actions for required executable verification
→ report
→ review/blocked + owner:none
→ STOP
```

Worker never Reviews itself, closes the Issue, or starts another Task automatically.

## Reviewer

Coordinator chooses:

```text
ACCEPT | REVISE | BLOCK | SPLIT | NOT_PLANNED
```

Unchanged-contract REVISE returns the same Issue to ready for Attempt N+1. Contract/boundary changes return to draft and Publication Gate.

## Planning ahead

A future Task may remain `status:draft` while upstream work executes when its stable use case and separation points can already be planned.

Do not freeze implementation details that depend on unaccepted upstream work.

## Product separation

Repository collaboration concepts are not Channel MCP concepts:

```text
Coordinator
Web Worker
Issue
Attempt
GitHub Actions
branch / PR
Task review
```

Deployment concepts are also not Channel MCP concepts:

```text
tunnel / proxy
TLS / DNS / firewall
workspace authorization
provider credentials
host supervision
```

The Channel product remains the six MCP communication capabilities defined by canonical product docs.
