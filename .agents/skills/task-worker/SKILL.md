---
name: task-worker
description: Claim and execute exactly one published agent-runtime-mcp Task Attempt, report durable results to its GitHub Issue, release ownership, and stop. Never publish, dispatch, review, accept, close, or automatically select another Task.
---

# Task Worker

Execute exactly one published Task Attempt and return all durable feedback to the GitHub Issue.

## Authority

This skill does not define Task scope.

Before execution, read:

1. `AGENTS.md`
2. the target GitHub Issue and all relevant comments
3. the Task Package `prompt.md`
4. the Task Package `task.md`
5. `docs/tasks/collaboration-protocol.md`
6. `docs/tasks/issue-state-convention.md`
7. `docs/tasks/issue-lifecycle-protocol.md`
8. every canonical document explicitly required by `task.md`

If this skill conflicts with those sources, follow the higher-authority repository source.

## Input

Prefer an explicit Issue number and `prompt.md` path:

```text
$task-worker Execute Issue #2 using `docs/tasks/2-runtime-core-tmux-discovery/prompt.md`.
```

This handoff may arrive directly or through `$task-dispatcher`. Its transport does not change Worker responsibilities.

Do not autonomously select another ready Issue. Task scheduling belongs upstream.

## GitHub capability

Use an authenticated GitHub read/write path available in the Codex environment.

If Issue body/comments/ownership cannot be durably updated, do not begin write-side implementation because the Attempt cannot be closed-loop reported.

## Pre-claim checks

Re-read live Issue immediately before claim and confirm:

```text
Issue open
Status = status:ready
Active owner = none
linked task.md resolves
linked prompt.md resolves
Required Capabilities available
Task Contract executable as published
```

If any condition fails, stop without implementation changes. A Dispatcher launching this process is not proof that the Task is still claimable.

## Claim and Attempt

Each successful:

```text
Status: status:ready + Active owner: none
→ Status: status:in-progress + Active owner: <worker identity>
```

begins a new monotonically increasing Attempt.

Determine `Attempt N` from Issue history. Do not reuse a previous Attempt number.

Claim by updating the Issue body state block defined in `issue-state-convention.md`. Preserve unrelated Issue prose/metadata. Re-read after mutation and confirm ownership before executing.

If the claim cannot be confirmed, stop. Dispatcher must not claim on your behalf.

## Execute only the Task Contract

Follow `task.md` exactly:

- Goal;
- In Scope / Out of Scope;
- Architecture Invariants;
- Implementation Requirements;
- Claims / Verification Plan;
- Security Review;
- Success Criteria;
- Evidence Contract;
- Failure / Blocked rules.

Do not silently:

- change Success Criteria;
- expand scope;
- weaken security controls;
- expose tmux internals as public API merely because implementation is easier;
- treat runtime state as GitHub Task state;
- launch/dispatch a second Worker;
- start a different Issue.

## Repository-specific boundaries

```text
GitHub = Task authority
GPT Web = Coordinator authority
Publisher = publication
Dispatcher = runtime delivery
Worker = one Attempt
Reviewer = Task decision
agent-runtime-mcp = runtime authority
tmux = backend
```

And:

```text
runtime idle/running/exited
!= Task accepted/review/done
```

Public MCP design is use-case-first. Do not implement a raw generic `tmux_command` or `run_shell_command` surface unless the published Contract formally changes canonical architecture.

## Security reminders

- prefer structured process argv/stdin;
- do not concatenate untrusted values into shell command strings;
- ordinary text input is data;
- special control input is an explicit closed set;
- captured output may contain secrets and must be bounded;
- destructive lifecycle operations target one verified managed Worker;
- normal operation must not require root.

If valid implementation requires breaking an invariant, stop and report the design conflict.

## Recoverable work

For non-trivial repository changes:

1. use the issue-isolated worktree supplied by Dispatcher or another Task-specific checkout;
2. create/reuse a Task-specific branch as appropriate;
3. commit coherent in-scope progress rather than keeping the only copy transient;
4. use/reuse a PR when appropriate;
5. report exact Candidate SHA and evidence at completion.

Do not mutate the Dispatcher/Coordinator main checkout. Do not create empty commits/PRs merely to manufacture progress.

## Normal completion

1. persist required candidate/code/docs;
2. run required verification;
3. collect exact Evidence and Candidate SHA;
4. post `[EXECUTION REPORT]` from the lifecycle protocol;
5. set Issue `Status: status:review`;
6. update Candidate/PR pointers when applicable;
7. set `Active owner: none`;
8. re-read Issue to verify durable report/state;
9. stop.

Do not Review your own Attempt, set `status:done`, close the Issue, dispatch another Worker, or start Attempt N+1.

## Blocked completion

1. preserve safe/recoverable work;
2. clean temporary state when required;
3. post `[BLOCKER REPORT]`;
4. set `Status: status:blocked` and current Blocker;
5. set `Active owner: none`;
6. re-read Issue;
7. stop.

Never lower Success Criteria or weaken boundaries to avoid BLOCKED.

## After REVISE

A later Worker may receive a fresh Dispatcher handoff after Reviewer returns the same Task to ready.

That Worker must:

- read previous Attempt reports and Review;
- reuse existing candidate/branch/PR when still valid;
- make a fresh claim;
- use Attempt N+1;
- execute only the required unchanged-contract revision;
- report and stop.

If Review changes Scope/Claims/Success Criteria/architecture/security/routing assumptions, require Publisher republication before execution.

## Completion output

After durable GitHub update, summarize only:

```text
Issue: #<issue>
Attempt: <N>
Execution outcome: COMPLETED | PARTIAL | FAILED | BLOCKED
Issue state: review | blocked
Candidate: <sha or n/a>
Report: posted
Next authority: Task Reviewer / GPT Web Coordinator
```

GitHub is the recoverable handoff. Chat and terminal output are not project state.