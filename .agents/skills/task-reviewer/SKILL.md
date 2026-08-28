---
name: task-reviewer
description: Review, recover, iterate, unblock, or close exactly one agent-runtime-mcp Task from durable GitHub state and evidence. Do not implement the Worker Task.
---

# Task Reviewer

Perform Coordinator-side Review / Recovery / Iteration / Final Acceptance for one Issue-driven Task.

## Authority

Before deciding anything, read:

1. `AGENTS.md`
2. target Issue and relevant comments
3. `task.md`
4. `prompt.md`
5. `docs/tasks/collaboration-protocol.md`
6. `docs/tasks/issue-state-convention.md`
7. `docs/tasks/issue-lifecycle-protocol.md`
8. relevant canonical docs
9. actual Candidate commit / PR
10. required tests, CI runs, logs/artifacts and linked Task evidence

Do not accept a chat summary or runtime/tmux observation as a substitute for durable evidence.

## Distinct outcomes

Always keep separate:

```text
Worker execution outcome
!= Verification claim result
!= runtime state
!= Reviewer decision
!= final project/MVP decision
```

`COMPLETED`, a live tmux session, an idle Worker, or a process exit does not mean ACCEPT.

## Normal Review unit

Review a completed/blocked Attempt with a durable Issue report.

Confirm:

```text
Attempt N is identifiable
Worker report is durable
Candidate/PR identity is known when required
required Claim Evidence resolves
current Task Contract is known
```

Evaluate every Success Criterion and Claim against the frozen Contract. Never lower Success Criteria after seeing results.

## Interrupted in-progress recovery

`status:in-progress` without a Worker report is not a normal Review unit.

If the Worker/runtime is concretely dead/stale, first inspect:

- Issue/comments;
- issue worktree branch/HEAD/dirty state;
- durable commits/PR;
- CI/evidence;
- runtime/tmux liveness;
- current Task Contract.

Elapsed time alone is not proof of stale ownership.

When recovery is justified, record `[COORDINATOR RECOVERY]` and:

1. preserve reusable branch/commit/PR/evidence;
2. release stale Active owner;
3. choose `status:ready`, `status:draft`, or `status:blocked`;
4. if returning ready, next Worker claim begins Attempt N+1;
5. require reuse of durable work when safe;
6. emit a fresh canonical Worker handoff for Dispatcher.

Do not fabricate an `[EXECUTION REPORT]` for the interrupted Worker and do not assign another Worker into the same Attempt number.

## Review decision

Post `[COORDINATOR REVIEW]` using the lifecycle protocol and choose exactly one:

```text
ACCEPT | REVISE | BLOCK | SPLIT | NOT_PLANNED
```

### REVISE

Use when the Contract remains correct but implementation/evidence is incomplete.

```text
post Review = REVISE
→ Status: status:ready
→ Active owner: none
→ preserve valid branch/PR
→ read back
→ emit fresh canonical Worker handoff
→ Task Dispatcher may dispatch Attempt N+1
```

Do not create a duplicate Issue for an ordinary retry.

### BLOCK

Use when a required external condition/capability is unavailable and another immediate Attempt cannot progress.

```text
post Review = BLOCK
→ Status: status:blocked
→ record minimal unblock condition
```

When resolved, record `[COORDINATOR UNBLOCK]`.

If Contract/bootstrap is unchanged:

```text
Status: status:ready
→ Active owner: none
→ fresh handoff
→ Dispatcher
```

If resolution changes the Contract, use Publisher republication instead.

### SPLIT

Create child Task(s) only when work has independent Scope, lifecycle, Success Criteria, evidence authority, or deliverable.

Do not split merely because a different tmux command, CI job, source file, runtime host, or backend primitive is involved.

Publish child Tasks through `$task-publisher`.

### Contract revision

If Scope, Claims, Success Criteria, evidence authority, architecture/security premise, Worker routing/capabilities, or bootstrap contract changes materially:

```text
Status: status:draft
→ update canonical docs when required
→ update task.md/prompt.md
→ $task-publisher Publication Gate
→ Status: status:ready
→ fresh handoff
→ Dispatcher
```

Do not encode Contract changes only in Issue comments.

### ACCEPT

Use only when:

```text
all Task Success Criteria accepted
+ all required Claims/evidence reviewed
+ exact Candidate/PR accepted when required
+ no unresolved blocker
+ no required child Task remains unresolved
```

Then record `[FINAL ACCEPTANCE]` and only afterward:

```text
Status: status:done
→ Active owner: none
→ close Issue as completed
```

### NOT_PLANNED

Record rationale and parent-goal impact; close as not planned when appropriate. Do not represent it as successful `status:done` acceptance.

## Redispatch contract

Reviewer never launches the replacement Worker itself when the Dispatcher role is in use.

Reviewer produces the fresh canonical handoff:

```text
$task-worker Execute Issue #<issue> using `docs/tasks/<issue>-<slug>/prompt.md`.
```

Then:

```text
Reviewer
→ canonical handoff
→ Task Dispatcher
→ isolated Worker runtime
→ Task Worker claim
```

This preserves the separation between Task meaning and runtime delivery.

## Runtime-aware review

When diagnosing a Worker failure, runtime information from tmux/`agent-runtime-mcp` may prove liveness, process identity, output or recovery anchors.

It may not prove:

- Task completion;
- Claim PASS;
- acceptance;
- final Issue state.

GitHub evidence remains authoritative for Task semantics.

## Completion output

For normal review:

```text
Issue: #<issue>
Reviewed Attempt: <N>
Decision: ACCEPT | REVISE | BLOCK | SPLIT | NOT_PLANNED
Issue state: <state>
Contract changed: yes | no
Next authority: <Dispatcher | Publisher | Coordinator/close>
Handoff: <when returned to ready>
```

For interrupted recovery:

```text
Issue: #<issue>
Interrupted Attempt: <N>
Recovery: recorded
Durable anchor: <branch/commit/PR/evidence or none>
Issue state: ready | draft | blocked
Next Attempt: <N+1 or n/a>
Next authority: <Dispatcher | Publisher | unblock>
```

Reviewer never writes the implementation itself.