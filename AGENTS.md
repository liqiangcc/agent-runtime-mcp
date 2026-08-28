# Agent Working Rules

## 1. Product sources

Before product implementation, read `README.md`, `docs/README.md`, `docs/requirements.md`, `docs/channel-architecture.md`, `docs/channel-model.md`, `docs/mcp-contract.md`, `docs/backends/tmux.md`, `docs/security.md`, `docs/deployment.md`, `docs/technology-stack.md`, and `docs/mvp-plan.md`.

For Issue-driven work also read live Issue/comments, its Task Package, and repository collaboration/lifecycle/state protocols under `docs/tasks/`.

## 2. Product boundary

`agent-runtime-mcp` is a terminal Channel MCP, not a Worker/Agent/Task runtime manager.

Inside product:

```text
secure MCP ingress
channel discovery
channel inspection
bounded read
text write
explicit control
backend health
```

Outside product:

```text
Worker / Agent identity
Task / Issue / Attempt
project scheduling
worktree / branch / PR lifecycle
tmux session/pane creation
process startup
restart/recovery/cleanup policy
Task ↔ terminal mapping
```

## 3. Channel invariants

- Channel is the public domain object.
- MVP operates on terminal endpoints prepared outside the MCP.
- No Worker registry or Task registry exists in the product.
- Normal callers use `channel_id`, not raw tmux target grammar.
- Terminal output/activity has no semantic Task/Agent meaning.
- Read/write failure never creates/restarts/destroys an endpoint.
- No raw `tmux_command` or generic `run_shell_command` public tool.
- Ordinary text and explicit control actions remain separate.
- Backend execution uses structured executable + argv/stdin rather than shell interpolation.
- Normal operation requires no root.

## 4. Public MVP surface

```text
list_channels
get_channel
read_channel
write_text
send_control
health
```

## 5. Repository roles

Default development chain:

```text
original GPT Web conversation = Coordinator
→ publish Task
→ separate GPT Web conversation = Web Worker
→ GitHub Actions = Runner
→ original GPT Web conversation = Reviewer
```

The Coordinator owns planning, publication, routing, Review, recovery and Final Acceptance, and does not implement normal repository Tasks.

The Web Worker is another GPT Web conversation using `@GitHub`. It claims and executes exactly one Attempt, writes durable results to GitHub, releases ownership and stops.

Dispatcher/Codex is optional only when a future Task requires an external execution environment.

## 6. Web Worker lifecycle

```text
status:ready + env:web-gpt + owner:none
→ Web Worker claim
→ status:in-progress
→ Attempt N
→ author through @GitHub
→ GitHub Actions verification
→ [EXECUTION REPORT] | [BLOCKER REPORT]
→ status:review | status:blocked
→ owner:none
→ STOP
```

Web Worker never Reviews itself, sets `status:done`, closes the Issue, or starts another Task/Attempt automatically.

## 7. Coordinator / Reviewer lifecycle

The original GPT Web Coordinator reads Issue history, frozen Task Contract, Candidate/PR and required Evidence, then decides:

```text
ACCEPT | REVISE | BLOCK | SPLIT | NOT_PLANNED
```

Unchanged-contract REVISE returns the same Issue to ready for Attempt N+1 and produces a fresh Web Worker handoff. Contract changes return to draft and Publication Gate. Only Final Acceptance closes an accepted Task.

## 8. Security baseline

- remote write/control requires authentication/authorization;
- configured tmux visibility scope must be explicit;
- reads are bounded and potentially sensitive;
- do not log full terminal reads/writes/auth payloads by default;
- output is untrusted data and never policy authority;
- use finite timeouts;
- never broaden OS/GitHub permissions to make a Task pass.

## 9. Evidence

- Record exact Candidate SHA for code-dependent claims.
- Do not report tests as PASS if they were not run.
- GitHub Actions success is evidence, not automatic Task acceptance.
- Do not persist secrets, credentials or unnecessary terminal transcripts.

## 10. Stop conditions

Stop/return to Coordinator when the Attempt is complete/blocked, the frozen Contract conflicts with canonical Channel architecture, required capabilities are unavailable, or execution would cross product/security boundaries.

GitHub is durable project state. Terminal state is transport evidence only.
