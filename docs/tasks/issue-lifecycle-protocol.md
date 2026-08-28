# Issue Feedback / Review / Iteration / Closure Protocol

This protocol defines the durable closed loop for independent repository Tasks.

Core principle:

> **GitHub Issue is live coordination state and append-only execution history; `task.md` is the frozen execution Contract; `prompt.md` is bootstrap/navigation only; a separate Worker executes one Attempt; the original Coordinator decides what the result means.**

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
```

Issue comments cannot silently redefine architecture, Scope, Claims or Success Criteria. Runtime/terminal observations cannot silently redefine Task state.

## 2. Default role model

```text
original GPT Web conversation
= Coordinator / Publisher / Reviewer

separate GPT Web conversation
= Web Worker using @GitHub

GitHub Actions
= executable verification Runner / Evidence
```

Default Task route:

```text
Coordinator publishes status:ready + env:web-gpt
→ short Web Worker entry
→ separate Web GPT Worker claims exactly one Attempt
→ repository changes + GitHub Actions Evidence
→ Worker reports and stops
→ original Coordinator reviews
```

Codex/Dispatcher is an optional explicitly published route, not the default lifecycle.

## 3. State machine

```text
status:draft
   ↓ Coordinator/Publisher Publication Gate PASS
status:ready
   ↓ separate Worker claim / Attempt N starts
status:in-progress
   │
   ├── [EXECUTION REPORT] → status:review + owner:none
   │                            ↓
   │                       Coordinator Review
   │                         ├─ ACCEPT → Final Acceptance → done → close
   │                         ├─ REVISE → ready → next Worker claim / Attempt N+1
   │                         ├─ BLOCK  → blocked
   │                         └─ SPLIT  → child Task(s) through Publisher
   │
   └── [BLOCKER REPORT] → status:blocked + owner:none
```

Only a Worker claim changes `ready → in-progress`.

Opening a new GPT Web conversation, creating a branch, starting CI, creating a tmux process, or preparing another execution environment does not begin an Attempt by itself.

## 4. Publication Gate

Before `status:ready`, Coordinator/Publisher must re-read GitHub and verify:

```text
Issue exists/open
+ valid state block
+ status:draft
+ Active owner:none
+ explicit Worker environment/route
+ task.md exists and matches Issue
+ prompt.md exists and points to task.md
+ Goal / Primary Use Case executable
+ Success / Failure / Degradation defined
+ Separation Points explicit
+ Single Responsibilities explicit
+ Logic / Control Separation explicit
+ Scope / Out of Scope bounded
+ Claims / Evidence Contract present
+ dependencies satisfied
+ architecture/security impact checked
+ upstream accepted interfaces re-read when required
+ GitHub Actions/external Evidence route sufficient
+ no prohibited secret persisted
```

Then:

```text
status:draft
→ Publication Gate PASS comment
→ status:ready + owner:none
→ final read-back
→ short Worker entry
```

Do not hand off a draft Task.

## 5. Default Web Worker entry

The entry is intentionally navigation-only:

```text
@GitHub

执行 liqiangcc/agent-runtime-mcp 的 Issue #<issue>，作为 Web Worker。

必须使用 GitHub live state。

入口：
`docs/tasks/<issue>-<slug>/prompt.md`

按仓库协议 claim、执行、报告后停止。
```

All actual Goal/Scope/Claims/Success Criteria live in the repository, not the chat handoff.

## 6. Attempt

Each successful:

```text
status:ready + owner:none
→ status:in-progress + owner:<worker>
```

begins the next monotonically increasing Attempt.

The Attempt is one auditable unit:

```text
Worker claim
→ implementation / verification
→ durable Candidate/Evidence
→ Worker report
→ Coordinator decision
```

If Goal/Scope/Success Criteria have not changed, prefer another Attempt on the same Issue over a duplicate Issue.

## 7. Worker pre-claim

Worker must re-read live GitHub immediately before claim and verify:

- Issue open;
- `Status: status:ready`;
- `Active owner: none`;
- expected Environment/Worker route matches current conversation;
- `task.md` / `prompt.md` resolve;
- required capabilities are available;
- frozen Contract remains executable.

On default Web Worker claim:

```text
Status: status:in-progress
Active owner: web-gpt-worker
```

Then re-read. If ownership cannot be durably confirmed, stop before repository write-side implementation.

## 8. Worker execution and Evidence

The Worker executes only the frozen Task Contract.

For `env:web-gpt` Tasks:

- repository authoring happens through `@GitHub`;
- commands/integration not executable in the Web conversation use GitHub Actions as Runner;
- PASS requires reading actual run/job Evidence on the exact Candidate SHA;
- Worker does not treat CI success as Coordinator acceptance.

## 9. Worker normal completion

```text
persist Candidate / branch / PR / Evidence
→ post [EXECUTION REPORT]
→ Status: status:review
→ Active owner: none
→ verify live Issue state
→ STOP
```

Execution Report records at least:

```text
[EXECUTION REPORT]
Attempt: <N>
Worker: <identity>
Base commit: <sha>
Candidate commit: <sha or n/a>
PR / branch: <reference or n/a>
Execution outcome: COMPLETED | PARTIAL | FAILED
Implementation result: ...
Claims: C1 PASS | FAIL | BLOCKED | NOT RUN ...
Commands / Actions runs/jobs: ...
Problems found: ...
Unverified / limitations: ...
```

`COMPLETED` is not acceptance.

## 10. Worker blocked completion

If a required permission, dependency, verification environment or capability is unavailable:

```text
preserve recoverable state
→ post [BLOCKER REPORT]
→ Status: status:blocked
→ Active owner: none
→ verify live state
→ STOP
```

Never lower Success Criteria or bypass product/security boundaries to avoid a blocker.

## 11. Coordinator Review

Reviewer is the original Coordinator conversation unless the Task explicitly publishes another review authority.

Reviewer re-reads:

- live Issue and append-only comments;
- frozen `task.md` / `prompt.md`;
- Candidate / branch / PR;
- changed files;
- required exact-SHA CI/runtime Evidence;
- canonical architecture/security sources.

Then posts:

```text
[COORDINATOR REVIEW]
Review of Attempt: <N>
Decision: ACCEPT | REVISE | BLOCK | SPLIT | NOT_PLANNED
Accepted: ...
Failed / missing: ...
Required changes: ...
Contract change required: yes | no
Canonical doc change required: yes | no
Next state: status:done | status:ready | status:blocked | status:draft
Next attempt: <N+1 or n/a>
```

Review must be durable in GitHub.

## 12. Integration Gate

For implementation Tasks whose accepted code must land on the canonical branch, Reviewer must not close the Issue merely because a Candidate branch passed CI.

Before Final Acceptance:

```text
accepted Candidate
→ integrate through PR or equivalent reviewed GitHub operation
→ verify canonical branch contains the Candidate
→ read canonical-branch CI when required
→ Final Acceptance
```

If the Candidate diverged from main because Coordinator planning continued concurrently, integrate both lines without discarding either accepted product implementation or newer planning/canonical work.

## 13. REVISE

If Contract remains correct but implementation/evidence is incomplete:

```text
[COORDINATOR REVIEW] Decision: REVISE
→ Status: status:ready
→ Active owner: none
→ preserve useful branch/PR/Candidate
→ emit fresh short Worker entry
→ next Worker claim starts Attempt N+1
```

The Reviewer does not execute Attempt N+1 in the Coordinator conversation.

## 14. Contract revision

If Review changes Scope, Claims, Success Criteria, architecture/security assumptions, Evidence authority, Worker route or bootstrap Contract:

```text
Status: status:draft
→ update canonical docs when needed
→ update task.md / prompt.md
→ read-back Publication Gate
→ status:ready
→ fresh Worker entry
```

Do not retroactively lower Success Criteria to make an existing Candidate pass.

## 15. Recovery

If an Issue remains `status:in-progress` without a durable completion report, Coordinator must establish concrete evidence before releasing ownership.

For a Web Worker route inspect at least:

```text
Issue/comments
Active owner
branch / commits / PR
Actions runs/jobs
current Task Contract
```

Elapsed time alone is not proof that ownership is stale.

If recovery is justified, post `[COORDINATOR RECOVERY]`, preserve reusable anchors, release stale owner and choose `ready | draft | blocked`.

A replacement Worker starts a new Attempt; it never continues the interrupted Attempt number.

## 16. SPLIT

Create a child Task only when the new work has independent responsibility/lifecycle/Success Criteria/Evidence authority/deliverable.

Do not split merely because work touches a different source file, test command, tmux primitive or environment.

Child Tasks go through the normal draft → Publication Gate → ready lifecycle.

## 17. Final Acceptance

Issue closes only when:

```text
Success Criteria accepted
+ Claims/Evidence accepted
+ Candidate/PR accepted
+ required canonical-branch integration accepted
+ no unresolved blocker
+ no required child Task unresolved
```

Final comment:

```text
[FINAL ACCEPTANCE]
Task: <title>
Accepted candidate: <sha or n/a>
Accepted PR: <pr or n/a>
Integrated main: <sha or n/a>
Accepted attempts: ...
Success Criteria: ACCEPTED
Required Claims / Verification: PASS / accepted evidence
Known remaining limitations: ...
Decision: ACCEPT
Final state: status:done
```

Order:

```text
post [FINAL ACCEPTANCE]
→ Status: status:done
→ Active owner: none
→ close Issue reason=completed
```

## 18. Append-only history

- do not delete old Attempt/Review/Recovery records;
- use a new `[CORRECTION]` comment for material corrections;
- Issue body stores current snapshot;
- comments explain state transitions;
- `task.md` / `prompt.md` do not store dynamic execution outcomes.

A fresh Coordinator conversation should be able to reconstruct the Task from GitHub alone.

## 19. Product separation

Repository collaboration roles are not Channel MCP product concepts.

```text
GitHub = durable Task authority
Web Worker / optional Codex Worker = repository executor
GitHub Actions = verification Runner/Evidence
Channel MCP = terminal communication product being developed
```
