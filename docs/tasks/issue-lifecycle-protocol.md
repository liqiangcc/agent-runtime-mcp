# Issue Feedback / Review / Iteration / Closure Protocol

This protocol defines the durable closed loop for independent Tasks.

Core principle:

> **Issue is the live coordination state and append-only execution history; `task.md` is the stable execution contract; `prompt.md` is bootstrap/navigation only; Codex reports results; GPT Web Coordinator decides acceptance.**

## 1. Authority

```text
canonical docs
= product / architecture / security facts

AGENTS.md
= repository-wide Agent rules

task.md
= current stable Task Contract

prompt.md
= session bootstrap / navigation only

GitHub Issue labels/fields/body
= current Task-state snapshot

GitHub Issue comments
= Attempt / Blocker / Review / Acceptance history

commit / PR / CI / logs / artifacts
= Evidence
```

Issue comments cannot silently redefine architecture, Scope, Claims or Success Criteria.

## 2. State machine

```text
status:draft
   ↓ Publication Gate PASS
status:ready
   ↓ Codex claim / Attempt N
status:in-progress
   │
   ├── [EXECUTION REPORT]
   │       ↓
   │   status:review
   │       │
   │       ├── Coordinator ACCEPT
   │       │      ↓
   │       │   [FINAL ACCEPTANCE]
   │       │      ↓
   │       │   status:done
   │       │      ↓
   │       │   close Issue
   │       │
   │       ├── Coordinator REVISE
   │       │      ↓
   │       │   status:ready
   │       │      ↓
   │       │   Attempt N+1
   │       │
   │       ├── Coordinator BLOCK
   │       │      ↓
   │       │   status:blocked
   │       │      ↓ blocker resolved
   │       │   status:ready
   │       │
   │       └── Coordinator SPLIT
   │              ↓ child Task(s)
   │
   └── [BLOCKER REPORT]
           ↓
       status:blocked
```

Only Coordinator performs final acceptance/closure.

## 3. Publication Gate

Before `status:ready`, Coordinator must verify:

```text
Issue exists
+ task.md exists
+ prompt.md exists
+ Task Goal/Scope/Success Criteria are executable
+ dependencies are explicit
+ required capabilities are explicit
+ architecture/security impact checked
+ paths and state read back from GitHub
+ no active owner
```

Then:

```text
status:draft
→ read-back PASS
→ status:ready
→ output Codex downstream entry
```

Do not hand off an unpublished/draft Task.

## 4. Attempt

Each successful:

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
claim
→ execution
→ candidate / evidence
→ report
→ Coordinator decision
```

If Goal/Scope/Success Criteria have not changed, prefer another Attempt on the same Issue over creating a duplicate Issue.

## 5. Pre-claim checks

Codex must re-read the live Issue immediately before claim and verify:

- Issue is open;
- state is `status:ready`;
- no active execution owner exists;
- current Worker has the required capabilities;
- linked `task.md`/`prompt.md` resolve;
- Task Contract is executable as published.

If claim cannot be durably confirmed, stop before write-side Task work.

## 6. Worker normal completion

At the end of an Attempt:

```text
persist candidate/evidence
→ post [EXECUTION REPORT]
→ status:review
→ release active ownership
→ verify Issue state
→ STOP
```

Worker does not wait for implicit chat review and does not start another Attempt/Task.

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
- <optional; Coordinator decides>
```

`COMPLETED` is not Coordinator acceptance.

## 7. Blocked completion

If a required permission, dependency, runtime, tmux capability, test environment or other necessary condition is unavailable:

```text
preserve safe/recoverable state
→ post [BLOCKER REPORT]
→ status:blocked
→ release active ownership
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

Never lower Success Criteria or bypass security rules merely to avoid a blocker.

## 8. Coordinator Review

Coordinator reads:

- current Issue and relevant comments;
- current `task.md`;
- candidate commit/PR;
- required tests/CI/evidence;
- linked child/blocker Task evidence when relevant.

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
- status:done | status:ready | status:blocked

Next attempt:
- <N+1 or n/a>
```

Review must be durable in GitHub, not only in chat.

## 9. REVISE

If the problem is within the existing Contract, such as:

- implementation bug;
- test failure;
- missing required behavior;
- insufficient evidence;
- integration/fix needed;

then:

```text
task.md unchanged
→ Coordinator Review = REVISE
→ status:ready
→ no active owner
→ next Codex handoff
→ Attempt N+1
```

Reuse the recoverable branch/PR/candidate when safe.

## 10. Contract Revision

If review changes:

- Scope;
- Claims;
- Success Criteria;
- architecture/security assumptions;
- required evidence authority;
- Task decomposition;

then comments are insufficient.

Required sequence:

```text
Coordinator
→ status:draft if current Contract is no longer executable
→ update canonical docs when required
→ update task.md
→ update prompt.md only if bootstrap/navigation changed
→ GitHub read-back
→ Publication Gate
→ status:ready
→ new Codex handoff
```

Never retroactively lower Success Criteria to make an existing result pass.

## 11. UNBLOCK

When the concrete blocker is resolved, Coordinator records:

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
Next state: status:ready
```

If resolution changes the Task Contract, use Contract Revision instead.

## 12. SPLIT

Create a child Task only when the new work has independent Scope/lifecycle/Success Criteria/evidence authority.

Do not split merely because work touches a different source file, test command, tmux primitive or environment.

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

## 13. Final Acceptance

Issue closes only when:

```text
Task Success Criteria accepted
+ required Claims/evidence accepted
+ candidate/PR accepted
+ no unresolved blocker
+ no required child Task remains unresolved
+ Coordinator final acceptance recorded
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
→ status:done
→ close Issue
```

## 14. Append-only history

Issue comments are append-only by default.

- do not delete old Attempt/Review records to tidy history;
- use a new `[CORRECTION]` comment for material corrections;
- Issue body/labels hold the current snapshot;
- comments explain how/why state changed;
- `task.md` does not store dynamic execution outcomes;
- `prompt.md` does not store dynamic execution outcomes.

A new Coordinator/Worker should be able to reconstruct the Task from GitHub without old chat history.

## 15. End-to-end loop

```text
GPT Web Coordinator
→ define/publish Task
→ Publication Gate
→ status:ready
→ Codex handoff

Codex Worker
→ claim
→ Attempt N
→ implement/verify
→ report
→ review/blocked
→ STOP

GPT Web Coordinator
→ review durable evidence
→ ACCEPT / REVISE / BLOCK / SPLIT

REVISE
→ same Issue, Attempt N+1

ACCEPT
→ Final Acceptance
→ status:done
→ close
```

Chat is for operation and explanation. GitHub is the durable coordination record.