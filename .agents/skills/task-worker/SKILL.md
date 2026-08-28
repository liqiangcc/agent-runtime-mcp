---
name: task-worker
description: Claim and execute exactly one published agent-runtime-mcp Task Attempt, report durable results to its GitHub Issue, release ownership, and stop. Never publish, review, accept, close, or automatically select the next Task.
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
5. `docs/tasks/issue-state-convention.md`
6. `docs/tasks/issue-lifecycle-protocol.md`
7. every canonical document explicitly required by `task.md`

If this skill conflicts with those sources, follow the higher-authority repository source.

## Inputs

Prefer an explicit Issue number and `prompt.md` path, for example:

```text
$task-worker Execute Issue #2 using `docs/tasks/2-runtime-core-tmux-discovery/prompt.md`.
```

Do not autonomously choose among multiple ready Issues unless the Coordinator explicitly delegates that scheduling decision and repository policy uniquely determines the target.

## GitHub capability

Use an authenticated GitHub read/write path available in the Codex environment.

If Issue body/comments/ownership cannot be durably updated, do not begin write-side implementation because the Attempt cannot be closed-loop reported.

## Pre-claim checks

Re-read the live Issue immediately before claim and confirm:

```text
Issue is open
Status = status:ready
Active owner = none
linked task.md resolves
linked prompt.md resolves
Required Capabilities are available
Task Contract is executable as published
```

If any condition fails, stop without implementation changes.

## Claim and Attempt

Each successful:

```text
Status: status:ready + Active owner: none
→ Status: status:in-progress + Active owner: <worker identity>
```

begins a new monotonically increasing Attempt.

Determine `Attempt N` from Issue history. Do not reuse a previous Attempt number.

Claim by updating the Issue body state block defined in `docs/tasks/issue-state-convention.md`. Preserve unrelated Issue prose/metadata. Labels/assignee may mirror the state but are not required for correctness.

Re-read the Issue after mutation and confirm the body shows your ownership before executing. If the claim cannot be confirmed, stop.

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
- start a different Issue.

## Repository-specific architecture reminders

Always preserve these boundaries unless a formal canonical design change is part of the published Task:

```text
GitHub = Task authority
GPT Web = Coordinator authority
agent-runtime-mcp = runtime authority
tmux = backend
Codex = Worker
```

And:

```text
runtime idle/running/exited
!= Task accepted/review/done
```

Public MCP design is use-case-first. Do not implement a raw generic `tmux_command` or `run_shell_command` surface unless the Task Contract explicitly changes canonical architecture.

## Security reminders

For backend execution/input work:

- prefer structured process argv/stdin;
- do not concatenate untrusted values into shell command strings;
- ordinary text input is data;
- special control input is a closed explicit set;
- capture output is potentially sensitive and must stay bounded;
- destructive lifecycle operations target one verified managed Worker;
- normal operation must not require root.

If valid implementation requires breaking these invariants, stop and report the design conflict instead of bypassing it.

## Recoverable work

For non-trivial repository changes:

1. work on a Task-specific/reusable branch when the environment supports it;
2. commit coherent in-scope progress rather than leaving the only copy in a transient shell;
3. use/reuse a PR when appropriate for review/recovery;
4. report exact candidate SHA and evidence at Attempt completion.

Do not create empty commits/PRs just to manufacture progress.

## Normal Attempt completion

Before leaving the Attempt:

1. persist the required candidate/code/docs;
2. run the verification required by `task.md`;
3. collect exact Evidence and Candidate SHA;
4. post the exact `[EXECUTION REPORT]` structure from `docs/tasks/issue-lifecycle-protocol.md`;
5. update Issue body `Status` to `status:review`;
6. update `Candidate` / `PR` current pointers when applicable;
7. set `Active owner: none`;
8. re-read the Issue to verify report + state are durable;
9. stop.

Do not set `status:done`, close the Issue, or start Attempt N+1.

## Blocked Attempt

If required permission, dependency, tmux/runtime capability, test environment or other necessary condition is unavailable:

1. preserve safe/recoverable work;
2. clean temporary state when required;
3. post `[BLOCKER REPORT]` using the lifecycle protocol;
4. update Issue body `Status` to `status:blocked` and the current `Blocker` field;
5. set `Active owner: none`;
6. re-read the Issue to verify durable state;
7. stop.

Never lower Success Criteria or weaken architecture/security boundaries to avoid `BLOCKED`.

## After REVISE

When Coordinator returns the same Task to `status:ready`:

- read previous Attempt reports and Coordinator Review;
- reuse the existing candidate/branch/PR when still valid;
- make a new claim;
- increment Attempt number;
- implement only the requested revision within the unchanged Task Contract;
- report and stop again.

If Review changes Scope/Claims/Success Criteria/architecture/security assumptions, require formal Task Contract/canonical-doc revision before execution.

## Completion output to chat

After durable GitHub update, summarize only the handoff essentials:

```text
Issue: #<issue>
Attempt: <N>
Execution outcome: COMPLETED | PARTIAL | FAILED | BLOCKED
Issue state: review | blocked
Candidate: <sha or n/a>
Report: posted
Next authority: GPT Web Coordinator
```

GitHub is the recoverable handoff. Chat text is not the project state.