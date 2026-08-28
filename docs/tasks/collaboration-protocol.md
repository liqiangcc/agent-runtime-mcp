# Repository Collaboration Protocol

This document defines how **this repository** is developed. It is not the public Channel MCP product protocol.

## 1. Default execution model

The default route for `agent-runtime-mcp` is **Web GPT-first**:

```text
GPT Web
→ define/freeze Task Contract
→ GitHub Issue status:ready
→ direct Web GPT implementation on a Task branch
→ GitHub Actions verification
→ Web GPT read-back/review
→ ACCEPT | REVISE | BLOCK | SPLIT
```

GitHub is durable project state. GitHub Actions is the primary automated verification Runner.

## 2. Logical roles vs physical agent

The repository preserves logical phases even when one Web GPT performs them sequentially:

```text
Publisher phase
= materialize/freeze Task

Executor phase
= author code/docs on a Task branch and record exact Candidate

Reviewer phase
= re-read frozen Contract + Candidate + CI evidence and decide result
```

One physical Web GPT may perform all three phases, but must not skip the boundaries between them. Review must use durable GitHub state and actual CI evidence rather than relying on memory of implementation intent.

## 3. Web GPT execution route

For `env:web-gpt` Tasks:

1. live-read Issue and Task Package;
2. confirm `status:ready + Active owner:none`;
3. create/reuse a Task-specific Git branch;
4. claim the Issue as `status:in-progress`, owner `web-gpt`;
5. author repository changes through GitHub;
6. use GitHub Actions for typecheck/unit/real-tmux integration where required;
7. inspect failed jobs/logs and fix on the same branch;
8. post durable `[EXECUTION REPORT]` with exact Candidate SHA and CI evidence;
9. move Issue to `status:review`, owner none;
10. perform a separate read-back Reviewer phase against the frozen Contract;
11. ACCEPT/REVISE/BLOCK/SPLIT as appropriate.

A Web GPT Task does not require tmux, Dispatcher, Codex CLI, or a local development workspace merely to be executable.

## 4. Optional Codex/Dispatcher route

The repository retains `$task-dispatcher` / `$task-worker` as an optional route for Tasks that genuinely benefit from an external coding environment or capabilities unavailable to Web GPT.

That route remains:

```text
Publisher
→ Dispatcher
→ isolated worktree/tmux
→ Codex Worker
→ Reviewer
```

It is not the default for this project.

## 5. Product separation

`agent-runtime-mcp` itself remains a generic terminal Channel MCP.

Repository development mechanisms—Web GPT, Issues, branches, Actions, Dispatcher, worktrees, tmux and Codex—are all outside the MCP product boundary.

## 6. Branch/evidence rule

Non-trivial implementation should use a Task-specific branch such as:

```text
web/issue-<N>-<slug>
```

Evidence records:

- base SHA;
- exact Candidate SHA;
- branch/PR when used;
- Actions run/job IDs;
- required Claim results;
- known limitations.

Do not report PASS for checks that were not run.

## 7. Review rule

Web GPT self-review is allowed for this lightweight repository, but only as a distinct durable phase:

```text
implementation complete
→ post EXECUTION REPORT
→ status:review
→ re-read Issue/task.md/current files/CI
→ COORDINATOR REVIEW
```

Do not accept directly from implementation context without read-back.

## 8. Retry

Unchanged Contract:

```text
Review REVISE
→ status:ready
→ next Web GPT Attempt on same Issue/branch when reusable
```

Contract change:

```text
status:draft
→ canonical/task/bootstrap revision
→ Publication Gate
→ status:ready
```

## 9. Optional Channel-MCP dogfooding

Once Channel write/control is available, a future optional Dispatcher flow may use Channel MCP for terminal communication, but that is dogfooding—not a requirement for ordinary repository implementation.

## 10. Core principle

```text
Web GPT = default project executor/coordinator
GitHub = durable project authority
GitHub Actions = verification Runner
Codex/Dispatcher = optional execution route
Channel MCP = product being built, not the repository workflow engine
```
