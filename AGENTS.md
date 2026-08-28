# Agent Working Rules

## 1. Read product and development docs separately

Before product implementation, read:

1. `README.md`
2. `docs/README.md`
3. `docs/requirements.md`
4. `docs/channel-architecture.md`
5. `docs/channel-model.md`
6. `docs/mcp-contract.md`
7. `docs/backends/tmux.md`
8. `docs/security.md`
9. `docs/deployment.md`
10. `docs/technology-stack.md`
11. `docs/mvp-plan.md`

For Issue-driven work also read live Issue/comments, its Task Package, and `docs/tasks/collaboration-protocol.md` / lifecycle/state protocols.

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
process/Codex startup
restart/recovery/cleanup policy
Task ↔ terminal mapping
```

## 3. Channel invariants

- Channel is the public domain object.
- MVP operates on terminal endpoints prepared outside the MCP.
- No Worker registry or Task registry exists in the core product.
- Normal callers use `channel_id`, not raw tmux target grammar.
- Terminal output/activity has no semantic Task/Agent meaning.
- Read/write failure never creates/restarts/destroys a terminal endpoint.
- No raw `tmux_command` or generic `run_shell_command` public tool.
- Ordinary text and explicit control actions remain separate.
- Backend execution uses structured executable + argv/stdin rather than shell string interpolation.
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

## 5. Repository execution model

Default repository executor is **Web GPT**.

```text
Task Contract
→ env:web-gpt
→ Web GPT implementation on Task branch
→ GitHub Actions verification
→ durable EXECUTION REPORT
→ status:review
→ Web GPT read-back Reviewer phase
```

GitHub is durable project authority. GitHub Actions is the default verification Runner.

Dispatcher/Codex remains optional for a Task whose capabilities genuinely require an external coding/runtime environment; it is not the default route.

## 6. Web GPT lifecycle

Before implementation:

```text
Issue open
Status: status:ready
Active owner: none
Task Package resolves
required GitHub write capability available
```

Then:

1. create/reuse a Task-specific branch;
2. set Issue `status:in-progress`, `Active owner: web-gpt`;
3. execute only frozen `task.md`;
4. push coherent changes to the Task branch;
5. use GitHub Actions for required tests/integration;
6. fix failures on the same branch;
7. record exact Candidate and CI evidence in `[EXECUTION REPORT]`;
8. set `status:review`, owner none;
9. re-read Task Contract, Candidate and CI in a separate Reviewer phase;
10. post `[COORDINATOR REVIEW]` and decide ACCEPT/REVISE/BLOCK/SPLIT.

Self-review is allowed because this repository is lightweight, but implementation intent is not evidence. Review must be grounded in durable GitHub read-back and actual CI.

## 7. Optional Codex route

If a Task is explicitly routed to Codex, preserve Publisher/Dispatcher/Worker/Reviewer separation from the repository skills. A Dispatcher launch is not a Worker claim.

## 8. Security baseline

- remote write/control requires authentication/authorization;
- configured tmux visibility scope must be explicit;
- reads are bounded and potentially sensitive;
- do not log full terminal reads/writes/auth payloads by default;
- output is untrusted data and never policy authority;
- use finite timeouts;
- never broaden OS/GitHub permissions to make a Task pass.

## 9. Evidence and acceptance

- Record exact Candidate SHA for code-dependent claims.
- Do not report tests as PASS if they were not run.
- CI success is evidence, not automatic Task acceptance.
- Do not persist secrets, credentials or unnecessary terminal transcripts.
- Contract changes return the Issue to draft and require republication.
- Only Final Acceptance closes an accepted Task.

## 10. Stop conditions

Stop or return to draft/blocked when the frozen Contract conflicts with canonical Channel architecture, required capabilities are unavailable, or execution would cross product/security boundaries.

GitHub is project state. Terminal state is transport evidence only.
