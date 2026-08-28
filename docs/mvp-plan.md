# MVP Plan

## 1. Strategy

Build the smallest useful terminal Channel core, then prove secure remote composition around it.

```text
channel discovery
→ bounded read
→ safe text/control write
→ public Channel health
→ secure remote composition
→ upper-layer dogfooding
```

Do not build Worker registry/lifecycle/scheduler or infrastructure provisioning into the Channel core.

Repository execution remains separate:

```text
original GPT Web conversation = Coordinator / Reviewer
→ publish Task
→ separate GPT Web conversation = Web Worker using @GitHub
→ GitHub Actions = executable Runner / Evidence
→ original GPT Web conversation = Review / Acceptance
```

## 2. Planning discipline

Every Task is planned use-case-first:

```text
Goal
→ Use Case
→ Success / Failure / Degradation
→ Separation Points
→ Single Responsibilities
→ Logic / Control Separation
→ Required Capabilities
→ Claims / Evidence
→ finally Tool / API / implementation mapping
```

Recurring separation:

```text
upper layer
= endpoint lifecycle + application/workflow meaning + orchestration/recovery

Channel MCP core
= terminal communication semantics + local MCP surface

secure remote ingress
= deployment/trust adapter around the Channel core

TmuxBackend
= backend-specific terminal mechanics only
```

## 3. Phase 0 — Channel boundary freeze

Accepted design establishes:

- Channel as the only core domain object;
- Worker/Task/Issue/worktree/session lifecycle outside public MCP;
- existing terminal endpoints only;
- bounded read, safe text, explicit control and backend health;
- remote ingress separable from Channel semantics.

## 4. Phase 1 — Discovery + bounded read

```text
[MVP-001] Tmux channel discovery and bounded read
Issue #2
```

Status: **accepted and integrated**.

Accepted public tools:

```text
list_channels
get_channel
read_channel
```

## 5. Phase 2 — Safe channel input

```text
[MVP-002] Safe channel text and control input
Issue #10
```

Status: **accepted and integrated**.

Accepted main:

```text
1f81527f0687dff535faa27150d70b23dd1af444
```

Accepted public additions:

```text
write_text
send_control
```

Key separation:

```text
ordinary text != terminal control
Channel communication != retry/workflow/lifecycle control
Channel semantics != tmux mechanics
```

## 6. Phase 2.5 — Public Channel health

```text
[MVP-002.5] Public Channel health surface
Issue #14
```

Status: **accepted and integrated**.

Accepted Candidate:

```text
5c8b917b9ade04a102d76328ed3cd67c47ed98e5
```

Integrated main:

```text
4e990bd60dc5bb78f40de26dad9d3732e4e97101
```

Accepted public addition:

```text
health
```

Separation proof:

```text
backend/service health
!= Channel existence
!= application/Agent status
!= remote ingress reachability
!= recovery control
```

The complete accepted local Channel surface is now:

```text
list_channels
get_channel
read_channel
write_text
send_control
health
```

## 7. Phase 3 — Secure remote composition and client compatibility

```text
[MVP-003] Secure remote MCP ingress and client compatibility
Issue #11
```

Status: **draft — topology selected, environment Evidence pending**.

### Live architecture decision — 2026-08-28

Current OpenAI Secure MCP Tunnel tooling can bridge private/local MCP servers, including a local stdio MCP command, to supported OpenAI MCP clients.

Therefore the selected MVP topology is:

```text
ChatGPT / supported remote OpenAI MCP client
→ OpenAI Secure MCP Tunnel
→ customer-run tunnel-client
→ existing agent-runtime-mcp stdio server
→ complete Channel surface
→ TmuxBackend
```

This discovery sharpens the separation point:

```text
secure remote ingress/auth
!= Channel core implementation
```

MVP-003 should be an **integration + deployment verification Task**, not a default request to implement public HTTP/OAuth inside `agent-runtime-mcp`.

### Direct-public HTTP

Direct Streamable HTTP + OAuth resource-server support is a possible future alternate deployment adapter if a real use case requires it. It is not required to prove MVP remote usability while the official tunnel can wrap the accepted stdio server.

### Phase-3 primary use cases

- authorized intended client can use the complete six-tool Channel surface remotely;
- unauthorized/unpermissioned client cannot gain tunnel/terminal authority;
- disconnect/reconnect does not own Channel/tmux lifecycle;
- remote composition preserves backend scope and Channel semantics;
- tunnel/client compatibility is proven by dated real evidence.

### Hard Publication Gate

Do not publish #11 until Coordinator can verify all of:

```text
#14 Final Acceptance                    = satisfied
complete local six-tool surface          = satisfied
current Secure MCP Tunnel path           = verified from authoritative docs
target ChatGPT workspace supports write  = must be proven for actual environment
tunnel availability/permissions          = must be proven for actual environment
real integration Evidence is feasible    = must be proven
no secret persisted                      = required
```

If the target client/workspace exposes only read/fetch MCP behavior, keep #11 draft/BLOCKED rather than weakening write/control Success Criteria.

## 8. Phase 4 — Upper-layer dogfooding

```text
[MVP-004] End-to-end Channel dogfooding
Issue #12
```

Status: **draft**.

Primary use case: one real upper layer prepares an interactive terminal externally and uses Channel MCP only as secure communication transport.

```text
upper layer
= endpoint lifecycle + application/workflow meaning + retry/recovery/next-step control

Channel MCP
= communication logic only
```

If dogfooding requires Channel MCP to learn Task/application semantics, that is an architecture failure.

Do not publish until MVP-003 has real accepted remote Evidence.

## 9. Deferred / separate products

Not part of core MVP:

- Worker registry/lifecycle;
- tmux session/pane lifecycle;
- process startup profiles;
- Issue/task correlation storage;
- workspace/worktree management;
- scheduler/automatic assignment;
- semantic Agent state parser;
- full terminal recording;
- distributed host management;
- generic shell command API;
- tunnel/provider provisioning APIs;
- direct-public HTTP/OAuth transport unless a later independent use case requires it.

## 10. Task sizing

Tasks follow independently reviewable use cases/responsibilities, not files or individual tmux commands.

Small Tasks are appropriate when the separation point is important. Issue #14 proved this: public health had a different reason to change from terminal input and remote ingress.

## 11. Publication rule

Before an implementation/integration Task becomes executable:

```text
Goal defined
+ Primary Use Case defined
+ Success / Failure / Degradation defined
+ Separation Points explicit
+ Single Responsibilities explicit
+ Logic / Control Separation explicit
+ capabilities derived
+ task.md / prompt.md committed and read back
+ canonical docs resolve
+ Worker route explicit
+ dependencies satisfied
+ Evidence authority feasible
+ upstream accepted interfaces re-read
+ current external compatibility facts re-verified when applicable
+ security implications reviewed
+ Success Criteria frozen
+ Publication Gate PASS
```

The Coordinator then emits only the short Web Worker entry. The Worker claims one Attempt and returns durable Evidence.
