# Handoff Profile — Codex Worker

This profile defines the canonical repository Task handoff text.

## Preferred entry

```text
$task-worker Execute Issue #<issue> using `docs/tasks/<issue>-<slug>/prompt.md`.
```

## Fallback entry

If the repository skill is unavailable:

```text
Execute liqiangcc/agent-runtime-mcp Issue #<issue>.

Use live GitHub state, not chat history.
Read AGENTS.md, the Issue/comments, prompt.md, task.md and repository lifecycle protocols.
Confirm Status: status:ready and Active owner: none.
Claim exactly one Attempt yourself, execute only the Task Contract, report durably, release ownership, and stop.
Do not Review/accept/close or start another Task.
```

## Publisher rule

Emit this handoff only after Publication Gate PASS and final GitHub read-back confirms ready/no-owner state.

## Dispatcher rule

Dispatcher transports this handoff unchanged to Codex. Dispatcher does not claim the Issue.

## Channel-MCP delivery

Once `write_text` is accepted, Dispatcher may deliver this same text through Channel MCP **after Dispatcher has already prepared the worktree, tmux pane and Codex process outside the MCP**:

```text
list/get channel for the prepared pane
→ write_text(channel_id, canonical handoff, submit=true)
```

Channel MCP does not store Issue mapping, create the pane, start Codex or change Task state.
