# Task Planning Principles

This document defines how the Coordinator plans repository Tasks before Publication Gate.

Planning is not a feature checklist and not an implementation-file checklist. It exists to find the correct **use cases, separation points, responsibility boundaries and evidence authority** before implementation begins.

## 1. Required planning order

Every product Task should be reasoned in this order:

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

Do not reverse this into:

```text
existing tool/API
→ list possible uses
→ call that planning
```

## 2. Use case first

Start from one concrete actor goal and observable outcome.

For each use case identify:

```text
Actor
Trigger
Preconditions
Main flow
Success outcome
Failure outcome
Degraded outcome
External authority/evidence
```

A Task should implement or prove a coherent capability slice serving one or a small set of tightly related use cases.

## 3. Separation points

Explicitly identify where responsibility changes hands.

Typical separation questions:

- product vs repository collaboration;
- Channel transport vs upper-layer application semantics;
- MCP transport vs Channel logic;
- Channel service vs backend adapter;
- backend adapter vs tmux implementation;
- data transport vs policy/orchestration;
- authentication/authorization vs business/channel operation;
- observation vs interpretation;
- execution result vs acceptance authority.

A good separation point lets one side change without forcing unrelated semantics into the other side.

## 4. Single-responsibility rule

Each layer/module/capability should have one primary reason to change.

Examples:

```text
Channel Service
= Channel-level communication semantics

TmuxBackend
= map Channel operations to tmux

Remote MCP ingress
= protocol/authenticated transport into Channel Service

Upper layer
= decide why a Channel exists and what the terminal interaction means

GitHub Actions
= execute verification jobs and provide Evidence
```

Do not let a convenient implementation layer absorb lifecycle, scheduling, Task or acceptance authority merely because it technically can.

## 5. Logic vs control separation

Distinguish **logic/data-path responsibilities** from **control/orchestration responsibilities**.

Logic/data path answers:

```text
what operation means
what data is accepted/returned
how safety/invariants are preserved
what mechanical failure occurred
```

Control/orchestration answers:

```text
when to invoke the operation
which Task has priority
which endpoint should exist
whether to retry/recover/recreate
whether a result is accepted
what happens next
```

For `agent-runtime-mcp` the product normally owns Channel communication logic. Upper layers own endpoint lifecycle and workflow control.

## 6. Failure and degradation before implementation

For each use case, plan failures before choosing implementation details.

Ask:

- What can be proven mechanically?
- What cannot be proven and must remain unknown?
- What is a safe degraded result?
- Which failures are retryable?
- Which mutation failures are ambiguous/non-idempotent?
- Which failures must never trigger lifecycle side effects?
- Which evidence source is authoritative?

Do not add semantic guesses merely to avoid an `unknown`, `BLOCKED`, or explicit error.

## 7. Capability before tool

Only after use cases and boundaries are clear, derive capabilities.

Example:

```text
Need: deliver ordinary terminal text safely
→ Capability: literal text transport
→ Separation: text data != terminal control
→ Backend requirement: safe tmux data path
→ Public tool mapping: write_text
```

The public tool is the final mapping, not the starting point.

## 8. Planning ahead while upstream work executes

A future Task may be materialized as `status:draft` when its use case, boundaries and stable Claims are already known.

Do not prematurely freeze implementation-specific details that depend on an upstream Task, such as:

- concrete interface/class names;
- source paths;
- exact internal method signatures;
- exact error-type implementation;
- CI job names/layout;
- provider-specific integration details that can change.

Instead record an explicit **Publication Dependency / Alignment Gate** requiring Coordinator read-back of the accepted upstream Candidate before publication.

## 9. Publication Gate planning questions

Before a draft can become ready, Coordinator should be able to answer:

1. What user/upper-layer use case does this Task satisfy?
2. What is explicitly outside this Task?
3. Where are the important separation points?
4. Does each participating layer have one clear responsibility?
5. Are product logic and orchestration/control separated?
6. Are success, failure and degradation behaviors defined?
7. Are Claims tied to observable Evidence?
8. Are upstream implementation assumptions re-read from live GitHub?
9. Are security boundaries explicit?
10. Is the Task still one coherent independently reviewable capability slice?

If these cannot be answered, keep the Task draft.
