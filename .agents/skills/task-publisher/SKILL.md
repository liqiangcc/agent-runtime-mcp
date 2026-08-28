---
name: task-publisher
description: Materialize, publish, or republish exactly one independent agent-runtime-mcp Worker Task through the Publication Gate. Do not execute, review, or close the Task.
---

# Task Publisher

Publish one Worker Task and produce the minimal downstream entry for a separate GPT Web Worker conversation.

## Authority

Before publishing, read:

1. `AGENTS.md`
2. `docs/tasks/README.md`
3. `docs/tasks/planning-principles.md`
4. `docs/tasks/collaboration-protocol.md`
5. `docs/tasks/issue-state-convention.md`
6. `docs/tasks/issue-lifecycle-protocol.md`
7. `docs/tasks/task.template.md`
8. `docs/tasks/prompt.template.md`
9. `docs/tasks/handoffs/web-gpt.md`
10. relevant canonical docs

This skill is procedure, not product authority.

## Default routing

```text
Coordinator = current/original GPT Web conversation
Worker = separate GPT Web conversation
Environment = env:web-gpt
Tooling = @GitHub
Verification Runner = GitHub Actions
```

Codex/Dispatcher routes are optional alternatives only when explicitly selected.

## Planning rule

Do not plan from a feature/tool checklist.

Required reasoning order:

```text
Goal
→ Primary Use Case
→ Success / Failure / Degradation
→ Separation Points
→ Single Responsibilities
→ Logic / Control Separation
→ Required Capabilities
→ Claims / Evidence
→ only then Tool / API / implementation mapping
```

Before publication, the Task Contract must make the important separation points explicit and show that unrelated responsibilities are not being collapsed into one layer merely for implementation convenience.

## Required inputs

Resolve from request and live repository state:

- Goal / parent goal;
- Primary Use Case(s) and actor/outcome;
- success / failure / degradation behavior;
- important separation points;
- single responsibility of participating layers/capabilities;
- logic/data-path vs control/orchestration ownership;
- required capabilities;
- Task kind and Worker/environment;
- hard dependencies;
- Scope / Out of Scope;
- Claims / verification plan;
- Success Criteria;
- Evidence Contract;
- architecture/security invariants;
- actual planning/base commit.

If a required value cannot be safely resolved, keep the Task draft rather than inventing it.

## Preflight

Before creating a Task:

- search open/closed Issues for the same Goal;
- reuse an existing Task when Goal/Scope/Success Criteria are unchanged;
- confirm the work is one coherent capability/use-case slice;
- distinguish product logic from repository/upper-layer control;
- distinguish a real separation boundary from an implementation-file/command split;
- confirm `env:web-gpt` is sufficient for repository authoring and GitHub Actions can provide required executable Evidence;
- confirm canonical product design is sufficiently frozen.

A failed/stalled Attempt does not create a duplicate Task.

## Materialize as draft

Create the real Issue first with:

```text
Status: status:draft
Active owner: none
Environment: env:web-gpt
Worker route: separate-gpt-web-conversation
```

Then create:

```text
docs/tasks/<issue>-<slug>/task.md
docs/tasks/<issue>-<slug>/prompt.md
```

Issue body is live state; `task.md` is the stable Contract; `prompt.md` is navigation/bootstrap only.

A future Task may be planned while an upstream Task executes, but implementation-specific details that depend on upstream accepted code must remain behind an explicit Publication Dependency / Alignment Gate.

## Read-back Publication Gate

Re-read GitHub and verify:

```text
Issue exists/open
Issue number matches package path
Status = status:draft
Active owner = none
Environment = env:web-gpt
task.md resolves
prompt.md resolves
prompt points to same Issue/task.md
no placeholders remain
canonical docs resolve
Primary Use Case is explicit
Success / Failure / Degradation are explicit
Separation Points are explicit
Single Responsibilities are explicit
Logic / Control Separation is explicit
required capabilities/dependencies explicit
Scope / Out of Scope bounded
Claims / Verification Plan present
Success Criteria frozen
Evidence Contract present
security implications explicit
GitHub Actions Evidence route sufficient for required executable checks
upstream accepted implementation was re-read where required
no secrets persisted
```

If any check fails, keep draft, fix, and read back again.

## Publish last

Only after Gate PASS:

```text
Status: status:ready
Active owner: none
Environment: env:web-gpt
Blocker: none
Publication Gate: PASS
```

Then final read-back.

## Downstream entry

Return only the short Web Worker entry:

```text
@GitHub

执行 liqiangcc/agent-runtime-mcp 的 Issue #<issue>，作为 Web Worker。

必须使用 GitHub live state。

入口：
`docs/tasks/<issue>-<slug>/prompt.md`

按仓库协议 claim、执行、报告后停止。
```

Do not paste the Task Contract into the handoff.

## Republication

If Scope, Claims, Success Criteria, evidence authority, architecture/security assumptions, use-case/separation analysis, Worker routing/capabilities, or bootstrap contract changes materially:

```text
status:draft
→ update canonical/task/bootstrap sources
→ read-back Publication Gate
→ status:ready
→ emit fresh short Web Worker entry
```

Ordinary implementation bugs/test failures/insufficient Evidence use Reviewer → REVISE on the same Issue.

## Completion rule

Do not call a Task published until Issue/task/prompt/use-case/boundary/dependency/capability/Gate/read-back all pass.

Publisher never claims or implements the Task, Reviews Evidence, sets `status:done`, or closes the Issue.
