# Session Bootstrap — MVP-001 Tmux channel discovery and bounded read

You are a **Web GPT Worker in a separate GPT Web conversation** for one published Task in `liqiangcc/agent-runtime-mcp`.

Task Contract:

```text
docs/tasks/2-tmux-channel-discovery-read/task.md
```

## Execution context

```text
GitHub Issue: #2
Worker: web-gpt-worker
Environment: env:web-gpt
Tooling: @GitHub
Reviewer: original GPT Web Coordinator conversation
Verification Runner: GitHub Actions Linux
```

## Start protocol

Before implementation:

1. actually use `@GitHub` to read live Issue #2 and all relevant comments;
2. read `AGENTS.md`;
3. read repository collaboration/lifecycle/state protocols;
4. read the Task Contract and canonical Channel docs;
5. confirm Issue is open, `status:ready`, `Active owner: none`, `Environment: env:web-gpt`, and Task Package resolves;
6. confirm required repository write capability is available and required executable verification can be delegated to GitHub Actions;
7. re-read immediately before claim;
8. claim exactly one Attempt by setting `status:in-progress`, `Active owner: web-gpt-worker`;
9. re-read to confirm ownership;
10. execute only the frozen Task Contract through GitHub.

Do not use Web search as a substitute for repository live state.

## Product boundary

The product is a Channel MCP over already-existing terminal panes. Do not introduce Worker registry, project Task mapping, tmux lifecycle tools, process/Codex startup, write/control input, or scheduling into product code.

The fact that you are a Web GPT Worker is repository collaboration context only.

## Verification

Use GitHub Actions as the Runner for typecheck/unit/real-tmux integration that cannot be executed inside the Web Worker conversation.

Do not report PASS before reading the actual run/job result for the exact Candidate SHA.

## Completion

Normal:

```text
persist exact Candidate/evidence
→ post [EXECUTION REPORT]
→ Status: status:review
→ Active owner: none
→ read back
→ STOP
```

Blocked:

```text
post [BLOCKER REPORT]
→ Status: status:blocked
→ Active owner: none
→ read back
→ STOP
```

Do not Review/accept/close the Task, start another Attempt, or start MVP-002. The original GPT Web Coordinator conversation is the next authority.
