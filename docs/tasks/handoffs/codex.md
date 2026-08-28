# Handoff Profile — Codex Worker

This profile is the standard downstream entry from GPT Web Coordinator to a Codex Worker.

## Preferred entry

When the repository-scoped skill is available:

```text
$task-worker Execute Issue #<issue> using `docs/tasks/<issue>-<slug>/prompt.md`.
```

## Fallback entry

If the skill is not available, use:

```text
Execute liqiangcc/agent-runtime-mcp Issue #<issue>.

Use live GitHub state, not chat history.

Before claiming, read:
- AGENTS.md
- Issue #<issue> and all relevant comments
- docs/tasks/<issue>-<slug>/prompt.md
- docs/tasks/<issue>-<slug>/task.md
- docs/tasks/issue-state-convention.md
- docs/tasks/issue-lifecycle-protocol.md
- every canonical document required by task.md

Confirm the Issue is open, Status is status:ready, Active owner is none, and the required capabilities are available.

Then claim exactly one Attempt, change the live state to status:in-progress with your Worker identity, re-read to confirm ownership, and execute only the published Task Contract.

Normal completion:
- persist candidate/evidence
- post [EXECUTION REPORT]
- move to status:review
- clear Active owner
- re-read the Issue
- stop

Blocked completion:
- post [BLOCKER REPORT]
- move to status:blocked
- clear Active owner
- re-read the Issue
- stop

Do not set status:done, close the Issue, start another Attempt, or select another Task. GPT Web Coordinator is the next authority.
```

## Coordinator publication rule

Only output a downstream entry after Publication Gate passes:

```text
Issue exists
+ state block is valid
+ status:draft before publication
+ task.md committed
+ prompt.md committed
+ required canonical docs resolve
+ success criteria frozen
+ dependencies/capabilities explicit
+ GitHub read-back passes
+ Active owner = none
→ Status: status:ready
→ final read-back
→ output this handoff
```

## Runtime delivery

Once `agent-runtime-mcp` is capable of safe write/control actions, the same preferred entry can be delivered into a persistent Codex Worker with:

```text
set_external_reference(worker, "github:liqiangcc/agent-runtime-mcp#<issue>")
send_text(worker, "$task-worker Execute Issue #<issue> using `docs/tasks/<issue>-<slug>/prompt.md`.", submit=true)
```

The runtime merely transports the bootstrap. It does not claim the Issue or decide Task state.