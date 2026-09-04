# Session Bootstrap — v0.1.1 deployment bundle and GitHub Release

You are a **Web GPT Worker in a separate GPT Web conversation** executing one already-published Task in `liqiangcc/agent-runtime-mcp`.

This file is bootstrap/navigation only. It is not the Task Contract.

## Execution Context

```text
GitHub Issue: #29
Task Contract: docs/tasks/29-v0-1-1-deployment-release/task.md
Worker: web-gpt-worker
Environment: env:web-gpt
Tooling: @GitHub
Reviewer / release authority: original GPT Web Coordinator conversation
Verification Runner: GitHub Actions
```

## Start Protocol

Before write-side work:

1. actually use `@GitHub` to read Issue #29 live state and all comments;
2. read `AGENTS.md`;
3. read `docs/tasks/README.md`, `planning-principles.md`, `collaboration-protocol.md`, `issue-state-convention.md`, and `issue-lifecycle-protocol.md`;
4. read the full Task Contract and every canonical/process source it references;
5. re-read accepted Issues #22, #23 and #27 and current `main`;
6. confirm Issue #29 is open with `Status: status:ready`, `Active owner: none`, `Environment: env:web-gpt`, `Worker route: separate-gpt-web-conversation`, `Blocker: none`, and `Publication Gate: PASS`;
7. confirm required repository writes are possible and GitHub Actions can supply required exact-SHA Evidence;
8. confirm no `v0.1.1` tag or formal Release should be created during Worker execution;
9. immediately re-read Issue #29, then claim exactly one Attempt by setting `Status: status:in-progress` and `Active owner: web-gpt-worker`;
10. re-read to confirm durable ownership;
11. execute only the frozen Task Contract.

Use GitHub live state, not old chat context. Do not use Web search as a substitute for repository state.

## Task-specific Boundary

The Worker prepares and proves the release pipeline. It does **not** perform the irreversible release authorization.

```text
Worker Candidate
→ version/package/release-note/release-workflow implementation
→ exact Candidate Actions Evidence
→ PR + EXECUTION REPORT
→ status:review + owner:none
→ STOP

Coordinator after ACCEPT
→ integrate main
→ canonical-main CI
→ verify Release Note on exact main SHA
→ explicit immutable v0.1.1 tag
→ tag-triggered release workflow
→ verify GitHub Release/assets/checksum
→ Final Acceptance
```

Do not create, move or overwrite `v0.1.1` from the Worker branch. Do not publish a formal GitHub Release from Candidate code.

## Verification

Use GitHub Actions as the Runner for all build/package/clean-room/tmux/release-preflight commands that cannot execute directly in the Web Worker conversation.

Candidate PASS must be tied to the exact Candidate SHA and actual run/job evidence.

The actual formal release claims remain unproven until the post-integration tag-triggered workflow runs. Do not report them PASS from YAML inspection alone.

## Completion

Normal:

```text
persist exact Candidate / branch / PR / Actions Evidence
→ post [EXECUTION REPORT]
→ Status: status:review
→ Active owner: none
→ re-read Issue #29
→ STOP
```

The Execution Report must explicitly state that no `v0.1.1` tag or formal GitHub Release was created by the Worker.

Blocked:

```text
post [BLOCKER REPORT]
→ Status: status:blocked
→ Active owner: none
→ re-read Issue #29
→ STOP
```

Do not Review/ACCEPT/close the Task, start another Attempt, create another Task, tag Candidate code, or publish the formal release. The original GPT Web Coordinator conversation is the next authority.