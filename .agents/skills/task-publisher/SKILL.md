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
3. `docs/tasks/collaboration-protocol.md`
4. `docs/tasks/issue-state-convention.md`
5. `docs/tasks/issue-lifecycle-protocol.md`
6. `docs/tasks/task.template.md`
7. `docs/tasks/prompt.template.md`
8. `docs/tasks/handoffs/web-gpt.md`
9. relevant canonical docs

This skill is procedure, not product authority.

## Default routing

For normal repository implementation in this project:

```text
Coordinator = current/original GPT Web conversation
Worker = separate GPT Web conversation
Environment = env:web-gpt
Tooling = @GitHub
Verification Runner = GitHub Actions
```

Codex/Dispatcher routes are optional alternatives only when explicitly selected for a Task; they are not the default.

## Required inputs

Resolve from request and live repository state:

- Goal / parent goal;
- Task kind;
- Worker/environment;
- required capabilities;
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
- distinguish Task scope from CI jobs or execution mechanics;
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
required capabilities/dependencies explicit
Scope / Out of Scope bounded
Claims / Verification Plan present
Success Criteria frozen
Evidence Contract present
security implications explicit
GitHub Actions Evidence route sufficient for required executable checks
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

If Scope, Claims, Success Criteria, evidence authority, architecture/security assumptions, Worker routing/capabilities, or bootstrap contract changes materially:

```text
status:draft
→ update canonical/task/bootstrap sources
→ read-back Publication Gate
→ status:ready
→ emit fresh short Web Worker entry
```

Ordinary implementation bugs/test failures/insufficient Evidence use Reviewer → REVISE on the same Issue.

## Completion rule

Do not call a Task published until Issue/task/prompt/dependency/capability/Gate/read-back all pass.

Publisher never claims or implements the Task, Reviews Evidence, sets `status:done`, or closes the Issue.
