# Documentation Map

This directory contains the product, architecture and collaboration contracts for `agent-runtime-mcp`.

## Reading order

1. `requirements.md` — goals, use cases, non-goals and success criteria
2. `architecture.md` — system boundary and control-plane / execution-plane separation
3. `runtime-model.md` — domain model and runtime state semantics
4. `mcp-contract.md` — capability-first public MCP contract
5. `technology-stack.md` — implementation language/official SDK decision
6. `deployment.md` — GPT Web remote MCP ingress, authentication and deployment topology
7. `backends/tmux.md` — first runtime backend design
8. `security.md` — threat model and safeguards
9. `mvp-plan.md` — staged implementation and dogfooding sequence
10. `tasks/README.md` — Issue-driven Task model
11. `tasks/collaboration-protocol.md` — Publisher → Dispatcher → Worker → Reviewer role chain
12. `tasks/issue-state-convention.md` — live Issue state/ownership representation
13. `tasks/issue-lifecycle-protocol.md` — publication/dispatch/attempt/recovery/review/closure loop
14. `tasks/handoffs/codex.md` — canonical Worker handoff and Dispatcher entry
15. `.agents/skills/` — executable role procedures

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
→ implementation stack / official SDK decision

deployment.md
→ remote ingress / transport / deployment security

backends/*.md
→ backend-specific implementation contract

security.md
→ security invariants and threat controls

mvp-plan.md
→ sequencing, not architectural authority

tasks/*.md
→ collaboration/Task execution protocol, not product architecture authority
```

If a Task requires changing a canonical invariant, update the corresponding canonical document before or together with the Task Contract. Do not use Issue comments, Dispatcher behavior, or terminal observations to silently redefine architecture.

## Design principle

The project is **use-case-first**, not tmux-command-first:

```text
Goal
→ Use Case
→ Capability
→ Domain Model
→ Backend Contract
→ MCP Tool
```

Backend primitives are implementation details unless a stable user-facing capability requires them.

## Product separation

```text
GPT Web → remote MCP ingress → agent-runtime-mcp
agent-runtime-mcp → RuntimeBackend → tmux
```

Remote MCP ingress and a future remote RuntimeBackend are different concerns.

## Collaboration separation

```text
GPT Web Coordinator
→ Task Publisher
→ Task Dispatcher
→ Task Worker
→ Task Reviewer
```

```text
Publisher = make Task executable
Dispatcher = deliver published handoff to isolated runtime
Worker = claim/execute one Attempt
Reviewer = decide what result means
GitHub = durable Task authority
agent-runtime-mcp = runtime authority
```

During bootstrap, Dispatcher may use native worktree + tmux. After the runtime capabilities exist, Dispatcher should dogfood `agent-runtime-mcp`. The transport may change; Issue/Attempt semantics must not.

Runtime output is never a substitute for GitHub Task state.