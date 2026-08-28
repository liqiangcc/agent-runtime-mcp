# Documentation Map

This directory contains the canonical product and architecture documentation for `agent-runtime-mcp`.

## Reading order

1. `requirements.md` — goals, use cases, non-goals and success criteria
2. `architecture.md` — system boundary and control-plane / execution-plane separation
3. `runtime-model.md` — domain model and runtime state semantics
4. `mcp-contract.md` — capability-first public MCP contract
5. `backends/tmux.md` — first backend design
6. `security.md` — threat model and required safeguards
7. `mvp-plan.md` — staged implementation and dogfooding sequence
8. `tasks/README.md` — Issue-driven execution model
9. `tasks/issue-lifecycle-protocol.md` — Task feedback/review/closure protocol

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