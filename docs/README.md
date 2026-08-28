# Documentation Map

This directory contains the canonical product and architecture documentation for `agent-runtime-mcp`.

## Reading order

1. `requirements.md` — goals, use cases, non-goals and success criteria
2. `architecture.md` — system boundary and control-plane / execution-plane separation
3. `runtime-model.md` — domain model and runtime state semantics
4. `mcp-contract.md` — capability-first public MCP contract
5. `technology-stack.md` — current implementation language/official SDK decision
6. `deployment.md` — GPT Web remote MCP ingress, authentication and deployment topology
7. `backends/tmux.md` — first runtime backend design
8. `security.md` — threat model and required safeguards
9. `mvp-plan.md` — staged implementation and dogfooding sequence
10. `tasks/README.md` — Issue-driven execution model
11. `tasks/issue-state-convention.md` — live Issue state representation and ownership convention
12. `tasks/issue-lifecycle-protocol.md` — Task feedback/review/closure protocol
13. `tasks/handoffs/codex.md` — Coordinator → Codex downstream entry

## Authority

```text
requirements.md
→ product intent and externally meaningful behavior

architecture.md
→ system boundaries and architectural invariants

runtime-model.md
→ runtime domain semantics

mcp-contract.md
→ public MCP behavior

technology-stack.md
→ current implementation stack / official SDK decision

deployment.md
→ GPT Web ingress / transport / deployment security contract

backends/*.md
→ backend-specific implementation contract

security.md
→ security invariants and threat controls

mvp-plan.md
→ sequencing, not architectural authority
```

If a Task requires changing a canonical invariant, update the corresponding canonical document before or together with the Task Contract. Do not use Issue comments to silently redefine architecture.

## Design principle

The project is deliberately **use-case-first**, not tmux-command-first:

```text
Goal
→ Use Case
→ Capability
→ Domain Model
→ Backend Contract
→ MCP Tool
```

Backend primitives are implementation details unless a stable user-facing capability requires them.

## Important separation

Remote ingress and runtime backend are different concerns:

```text
GPT Web → remote MCP ingress → agent-runtime-mcp
agent-runtime-mcp → RuntimeBackend → tmux
```

The MVP needs secure remote MCP ingress because GPT Web cannot directly operate an arbitrary local stdio server. An SSH/multi-host RuntimeBackend remains future work.

## Collaboration separation

```text
Issue body state block
= required current Task-state snapshot

Issue comments
= append-only Attempt / Review / Acceptance history

task.md
= stable execution contract

prompt.md
= bootstrap/navigation only

Codex handoff profile
= downstream client entry only
```

Runtime output is never a substitute for GitHub Task state.