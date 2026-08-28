---
name: task-publisher
description: Materialize, publish, or republish exactly one independent agent-runtime-mcp Worker Task through the Publication Gate. Do not execute, dispatch, review, or close the Task.
---

# Task Publisher

Publish one Worker Task and produce the exact downstream handoff consumed by `task-dispatcher` or a directly invoked Worker.

## Authority

Before publishing, read:

1. `AGENTS.md`
2. `docs/tasks/README.md`
3. `docs/tasks/collaboration-protocol.md`
4. `docs/tasks/issue-state-convention.md`
5. `docs/tasks/issue-lifecycle-protocol.md`
6. `docs/tasks/task.template.md`
7. `docs/tasks/prompt.template.md`
8. `docs/tasks/handoffs/codex.md`
9. relevant canonical docs

This skill is procedure, not product authority.

## Required inputs

Resolve from the request and repository state:

- Goal / parent goal;
- Task kind;
- expected Worker/environment;
- required capabilities;
- hard dependencies;
- Scope / Out of Scope;
- Claims / verification plan;
- Success Criteria;
- Evidence Contract;
- architecture/security invariants;
- actual planning/base commit.

If a required value cannot be resolved safely, keep the Task draft and stop rather than inventing it.

## Preflight

Before creating a new Issue:

- search open/closed Issues for the same Goal;
- reuse an existing Task when Goal/Scope/Success Criteria are unchanged;
- distinguish a business Task from verification jobs or runtime execution details;
- confirm the intended Worker route/capabilities;
- confirm the canonical design is sufficiently frozen.

A failed/stalled Attempt is not a reason to create a duplicate Task.

## Materialize as draft

Create the real Issue first with:

```text
Status: status:draft
Active owner: none
```

Then create:

```text
docs/tasks/<issue>-<slug>/task.md
docs/tasks/<issue>-<slug>/prompt.md
```

The Issue is the live state snapshot; `task.md` is the stable Contract; `prompt.md` is bootstrap/navigation only.

Do not persist dynamic Attempt results in Task Package files.

## Read-back Publication Gate

A successful write is not publication. Re-read GitHub and verify:

```text
Issue exists/open
Issue number matches package path
Status = status:draft
Active owner = none
task.md resolves
prompt.md resolves
prompt points to the same Issue/task.md
no task placeholders remain
required canonical docs resolve
Worker/environment/capabilities are explicit
hard dependencies are satisfied or explicitly none
Scope / Out of Scope are bounded
Claims / Verification Plan are present
Success Criteria are frozen
Evidence Contract is present
architecture/security implications are explicit
no secrets/tokens/private terminal output were persisted
```

If any check fails:

```text
remain status:draft
→ fix
→ read back again
```

## Publish last

Only after Gate PASS:

```text
Status: status:ready
Active owner: none
Blocker: none
Publication Gate: PASS
```

Re-read the Issue again and confirm the Task is claimable.

## Downstream handoff

Produce exactly one canonical Worker handoff for the Codex route:

```text
$task-worker Execute Issue #<issue> using `docs/tasks/<issue>-<slug>/prompt.md`.
```

This handoff is the input to `task-dispatcher` when a Dispatcher is being used.

Do not paste the Task Contract into the handoff. Dispatcher transports this handoff unchanged; Worker reads GitHub.

## Republication

If Scope, Claims, Success Criteria, evidence authority, architecture/security assumptions, Worker routing/capabilities, or bootstrap contract change materially:

```text
status:draft
→ update canonical/process docs when required
→ update task.md / prompt.md
→ read-back Gate
→ status:ready
→ emit fresh handoff
```

Ordinary implementation bugs, test failures, or insufficient evidence use Reviewer → REVISE on the same Task and do not automatically require Contract republication.

## Completion rule

Do not say the Task is published until:

```text
Issue read-back PASS
+ task.md read-back PASS
+ prompt.md read-back PASS
+ dependency/capability checks PASS
+ Publication Gate PASS
+ status:ready read-back PASS
+ downstream handoff emitted
```

Publisher never claims the Issue, launches Codex, executes code, Reviews evidence, sets `status:done`, or closes the Issue.