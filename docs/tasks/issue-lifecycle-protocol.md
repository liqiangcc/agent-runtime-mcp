# Issue Feedback / Dispatch / Review / Iteration / Closure Protocol

This protocol defines the durable closed loop for independent Tasks.

Core principle:

> **Issue is the live coordination state and append-only execution history; `task.md` is the stable execution contract; `prompt.md` is Worker bootstrap/navigation only; Publisher makes Tasks executable; Dispatcher transports a published handoff; Worker executes one Attempt; Reviewer decides what the result means.**

## 1. Authority

```text
canonical docs
= product / architecture / security facts

AGENTS.md
= repository-wide Agent rules

task.md
= current stable Task Contract

prompt.md
= Worker bootstrap/navigation only

GitHub Issue body state block
= current Task-state snapshot

GitHub Issue comments
= Publication / Attempt / Blocker / Recovery / Review / Acceptance history

commit / PR / CI / logs / artifacts
= Evidence

runtime / tmux / worktree state
= execution/liveness/recovery evidence only
```

Issue comments cannot silently redefine architecture, Scope, Claims or Success Criteria. Runtime observations cannot silently redefine Task state.

## 2. End-to-end roles

```text
GPT Web Coordinator
→ Task Publisher
→ Task Dispatcher
→ Task Worker
→ Task Reviewer
```

Role boundaries are defined in `docs/tasks/collaboration-protocol.md`.

## 3. State machine

```text
status:draft
   ↓ Publisher Publication Gate PASS
status:ready
   ↓ Dispatcher may launch isolated Worker runtime (Task state unchanged)
   ↓ Worker claim / Attempt N starts
status:in-progress
   │
   ├── Worker [EXECUTION REPORT]
   │       ↓
   │   status:review
   │       │
   │       ├── Reviewer ACCEPT
   │       │      ↓
   │       │   [FINAL ACCEPTANCE]
   │       │      ↓
   │       │   status:done
   │       │      ↓
   │       │   close Issue
   │       │
   │       ├── Reviewer REVISE
   │       │      ↓
   │       │   status:ready
   │       │      ↓ fresh handoff → Dispatcher
   │       │      ↓ Worker claim
   │       │   Attempt N+1
   │       │
   │       ├── Reviewer BLOCK
   │       │      ↓
   │       │   status:blocked
   │       │      ↓ unblock/review
   │       │   status:ready | status:draft
   │       │
   │       └── Reviewer SPLIT
   │              ↓ child Task(s) through Publisher
   │
   ├── Worker [BLOCKER REPORT]
   │       ↓
   │   status:blocked
   │
   └── Worker/runtime interruption before durable report
           ↓
       Reviewer/Coordinator recovery
           ↓
       status:ready | status:draft | status:blocked
```

Only Worker claim changes `ready → in-progress`. Dispatcher launch does not.

## 4. Publication Gate

Publisher must verify before `status:ready`:

```text
Issue exists/open
+ valid state block
+ status:draft
+ Active owner: none
+ task.md exists
+ prompt.md exists
+ Task Goal/Scope/Success Criteria are executable
+ dependencies are explicit
+ required capabilities/environment are explicit
+ architecture/security impact checked
+ paths/state read back from GitHub
+ no prohibited secret persisted
```

Then:

```text
status:draft
→ read-back PASS
→ status:ready
→ final read-back
→ canonical Worker handoff
```

Do not hand off an unpublished/draft Task.

## 5. Dispatch Gate

Dispatcher receives the canonical Worker handoff and re-reads live GitHub before launching.

Require:

```text
Issue open
Status: status:ready
Active owner: none
prompt.md/task.md resolve
actual child environment/capabilities match Task routing
no already-running issue-linked Worker runtime for this Task
```

Dispatcher may create/resolve isolated worktree/runtime state and transport the handoff, but it does not claim the Issue.

If state is already `in-progress`, `review`, `blocked`, `done`, or closed, do not launch a duplicate Worker. Track/reconcile instead.

## 6. Attempt

Each successful Worker transition:

```text
status:ready → status:in-progress
```

begins a new incrementing Attempt:

```text
Attempt: 1
Attempt: 2
Attempt: 3
```

The Attempt is an auditable unit:

```text
Worker claim
→ execution
→ candidate/evidence
→ report
→ Reviewer decision
```

A Dispatcher launch before claim is not yet an Attempt.

If Goal/Scope/Success Criteria have not changed, prefer another Attempt on the same Issue over a duplicate Issue.

## 7. Worker pre-claim

Worker must re-read live Issue immediately before claim and verify:

- Issue open;
- `Status: status:ready`;
- `Active owner: none`;
- Worker has required capabilities;
- linked `task.md` / `prompt.md` resolve;
- Task Contract is executable as published.

On claim:

```text
Status: status:in-progress
Active owner: <worker identity>
Attempt: next N determined from append-only history
```

Re-read after mutation. If claim cannot be durably confirmed, stop before write-side Task work.

## 8. Worker normal completion

```text
persist candidate/evidence
→ post [EXECUTION REPORT]
→ Status: status:review
→ Active owner: none
→ verify Issue state
→ STOP
```

Worker does not wait for implicit chat review, dispatch another Worker, or start another Attempt/Task.

### Execution Report

```text
[EXECUTION REPORT]

Attempt: <N>
Worker: codex
Role: implementation | verification | combined | research

Base commit: <sha>
Candidate commit: <sha or n/a>
PR: <number/url or n/a>

Execution outcome: COMPLETED | PARTIAL | FAILED

Implementation result:
- <what changed>

Verification results:
- C1: PASS | CONDITIONAL PASS | FAIL | BLOCKED | NOT RUN
- C2: ...

Commands / Jobs:
- <commands / workflow / run>

Evidence:
- <commit / PR / run / log / artifact>

Problems found:
- <problem or none>

Unverified / limitations:
- <item or none>

Suggested next action:
- <optional; Reviewer decides>
```

`COMPLETED` is not Reviewer acceptance.

## 9. Worker blocked completion

If a required permission, dependency, runtime, test environment or capability is unavailable:

```text
preserve safe/recoverable state
→ post [BLOCKER REPORT]
→ Status: status:blocked
→ Active owner: none
→ verify Issue state
→ STOP
```

### Blocker Report

```text
[BLOCKER REPORT]

Attempt: <N>
Worker: codex

Blocked at:
- <step / claim>

Missing capability / dependency:
- <concrete missing condition>

Completed before blocker:
- <safe completed work>

Reusable candidate / branch / PR:
- <reference or n/a>

Evidence:
- <logs / command output / run>

Required to resume:
- <minimal concrete condition>

Safe state / cleanup:
- <state>

Result: BLOCKED
```

Never lower Success Criteria or bypass security rules to avoid a blocker.

## 10. Interrupted in-progress recovery

`status:in-progress` with a dead/missing child runtime and no durable Worker completion report is a recovery unit, not a normal Review and not automatic redispatch permission.

Before recovery inspect:

```text
Issue/comments
Active owner
issue worktree branch/HEAD/dirty state
commits / PR
tests/CI/evidence
runtime/tmux liveness
current Task Contract
```

Elapsed time alone is not proof of stale ownership.

When stale ownership is concretely justified, Reviewer/Coordinator posts:

```text
[COORDINATOR RECOVERY]

Interrupted Attempt: <N>
Worker: <identity>
Reason recovery is justified:
- <evidence>

Durable anchors found:
- <branch/commit/PR/evidence/worktree>

Reusable work:
- <what to preserve>

Contract change required: yes | no
Next state: status:ready | status:draft | status:blocked
Next attempt: <N+1 or n/a>
```

Then release stale `Active owner`.

If returned to ready, Reviewer emits a fresh canonical handoff; Dispatcher may launch/resume an appropriate runtime; next Worker claim starts Attempt N+1. Never place a replacement Worker into the interrupted Attempt N.

## 11. Reviewer decision

Reviewer reads:

- current Issue/comments;
- current `task.md`/`prompt.md`;
- Candidate commit/PR;
- required tests/CI/evidence;
- linked Task evidence when relevant.

Then posts:

```text
[COORDINATOR REVIEW]

Review of Attempt: <N>
Decision: ACCEPT | REVISE | BLOCK | SPLIT | NOT_PLANNED

Accepted:
- <criteria / claims>

Failed / missing:
- <criteria / evidence>

Required changes:
1. <change>
2. <change>

Contract change required: yes | no
Canonical doc change required: yes | no

Linked tasks:
- <issue or n/a>

Next state:
- status:done | status:ready | status:blocked | status:draft

Next attempt:
- <N+1 or n/a>
```

Review must be durable in GitHub, not only chat.

## 12. REVISE and redispatch

If Contract remains correct but implementation/evidence is incomplete:

```text
task.md unchanged
→ Reviewer REVISE
→ Status: status:ready
→ Active owner: none
→ preserve recoverable branch/PR/candidate
→ fresh canonical handoff
→ Dispatcher
→ Worker claim
→ Attempt N+1
```

Reviewer produces the handoff; Dispatcher performs runtime delivery. Reviewer does not launch the Worker itself when Dispatcher is being used.

## 13. Contract Revision / republication

If Review changes:

- Scope;
- Claims;
- Success Criteria;
- architecture/security assumptions;
- required evidence authority;
- Task decomposition;
- Worker routing/capability contract;
- bootstrap contract;

comments are insufficient.

Required sequence:

```text
Status: status:draft
→ update canonical docs when required
→ update task.md / prompt.md
→ Publisher read-back Publication Gate
→ Status: status:ready
→ fresh handoff
→ Dispatcher
```

Never retroactively lower Success Criteria to make an existing result pass.

## 14. UNBLOCK

When the concrete blocker is resolved, Reviewer/Coordinator records:

```text
[COORDINATOR UNBLOCK]

Blocker from Attempt: <N>
Resolved:
- <what changed>

Evidence:
- <reference>

Resume condition satisfied: yes
Resume from:
- <step / claim>

Next attempt: <N+1>
Next state: status:ready | status:draft
```

If Contract/bootstrap is unchanged, return ready + fresh handoff → Dispatcher. If changed, use Publisher republication.

## 15. SPLIT

Create child Task only when new work has independent Scope/lifecycle/Success Criteria/evidence authority/deliverable.

Do not split merely because work touches a different source file, test command, tmux primitive, backend, worktree or environment.

Parent records:

```text
[SPLIT]

Reason:
- <why independent Task>

Child Task(s):
- #<issue> <purpose>

Parent blocked by child: yes | no
Required Evidence to return:
- <what parent needs>
```

Child Task is materialized/published through Publisher.

## 16. Final Acceptance

Issue closes only when:

```text
Task Success Criteria accepted
+ required Claims/evidence accepted
+ Candidate/PR accepted
+ no unresolved blocker
+ no required child Task unresolved
+ Final Acceptance recorded
```

Final comment:

```text
[FINAL ACCEPTANCE]

Task: <id/title>
Accepted candidate: <sha or n/a>
Accepted PR: <pr or n/a>

Accepted attempts:
- Attempt <N>: <summary>

Success Criteria:
- SC1: ACCEPTED
- SC2: ACCEPTED

Required Claims / Verification:
- C1: PASS / accepted evidence
- C2: PASS / accepted evidence

Known remaining limitations:
- <non-blocking limitation or none>

Decision: ACCEPT
Final state: status:done
Issue close reason: completed
```

Order:

```text
post [FINAL ACCEPTANCE]
→ Status: status:done
→ Active owner: none
→ close Issue
```

## 17. Append-only history

- do not delete old Attempt/Review/Recovery records to tidy history;
- use a new `[CORRECTION]` comment for material corrections;
- Issue body holds current snapshot;
- comments explain how/why state changed;
- `task.md` and `prompt.md` do not store dynamic execution outcomes.

A new Coordinator/role should reconstruct the Task from GitHub without old chat history.

## 18. End-to-end loop

```text
Coordinator
→ Publisher
→ draft → Publication Gate → ready
→ canonical handoff
→ Dispatcher
→ isolated Worker runtime
→ Worker claim
→ Attempt N
→ report / blocker
→ review / blocked
→ Reviewer

REVISE
→ ready + fresh handoff
→ Dispatcher
→ Attempt N+1

CONTRACT CHANGE
→ draft
→ Publisher

INTERRUPTION
→ Reviewer recovery
→ ready/draft/blocked

ACCEPT
→ Final Acceptance
→ done
→ close
```

Chat and terminal state are operational views. GitHub is the durable coordination record.