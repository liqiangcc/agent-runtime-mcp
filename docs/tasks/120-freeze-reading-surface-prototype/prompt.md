# Worker Bootstrap — #120 freeze reading-surface prototype

You are the coordinator-authorized Devin Worker executing exactly one Attempt
for GitHub Issue **#120** in `liqiangcc/agent-runtime-mcp`.

## Read first

1. Live Issue #120 body + comments (GitHub is durable state).
2. Frozen contract: `docs/tasks/120-freeze-reading-surface-prototype/task.md`.
3. `AGENTS.md`, `docs/tasks/collaboration-protocol.md`,
   `docs/tasks/issue-state-convention.md`, `docs/tasks/issue-lifecycle-protocol.md`.
4. Reference: `docs/web-console-reading-surface-design.md` §3 S5, §9 T1.

## Execution

- Base: `main`. Source subtree: `docs/prototypes/web-console-reading-first/`
  at `prototype/116-gpt-alignment` @ `6f05885`.
- Land that subtree **byte-identical** (e.g. `git checkout 6f05885 -- <path>`),
  open one PR tied to this Issue. Do not merge it.
- No changes outside that subtree. No deployment changes.
- Evidence: exact Candidate SHA + commands/output proving subtree identity and
  path confinement + CI run links + a one-line statement that the committed
  screenshots contain no secrets.
- Post `[EXECUTION REPORT]` on #120, set `status:review`, release owner, STOP.

## Boundaries

- This is a reference freeze, not production approval.
- Do not modify prototype content, `src/**`, `console/**`, CI, or deployments.
