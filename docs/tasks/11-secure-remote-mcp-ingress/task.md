# Task — MVP-003 Secure remote MCP ingress and client compatibility

## Metadata

```text
GitHub Issue: #11
MVP phase: Phase 3
Task kind: combined implementation + verification
Planning base commit: cfb1c81d8571438d0a93f559d4162ec04e50fb9e
Session bootstrap: docs/tasks/11-secure-remote-mcp-ingress/prompt.md
Preferred worker: web-gpt-worker
Environment: env:web-gpt
Handoff profile: docs/tasks/handoffs/web-gpt.md
Hard publication dependencies: MVP-002 Final Acceptance + live remote MCP compatibility/auth verification + explicit deployment topology
```

> This Task is intentionally **draft**. Stable security/product Claims are planned now; current MCP transport/auth/client details must be re-verified immediately before Publication Gate.

## Goal

Expose the accepted Channel MCP capabilities through a secure authenticated remote MCP ingress and prove real client compatibility, including read and write/control operations, without expanding Channel MCP into collaboration, host administration, endpoint lifecycle, or generic remote shell functionality.

## Canonical / Process Sources

Before publication/execution read:

- `AGENTS.md`
- `docs/requirements.md`
- `docs/channel-architecture.md`
- `docs/channel-model.md`
- `docs/mcp-contract.md`
- `docs/security.md`
- `docs/deployment.md`
- `docs/technology-stack.md`
- `docs/mvp-plan.md`
- repository Task protocols under `docs/tasks/`
- accepted MVP-001 and MVP-002 Candidates/Reviews
- current official MCP SDK/transport/auth documentation
- current intended remote client capability documentation/evidence

## Publication dependency / live-compatibility gate

Before `status:ready`, Coordinator must:

1. confirm MVP-002 Final Acceptance;
2. re-read accepted server/tool implementation surfaces;
3. verify the current supported remote MCP transport and authorization model from authoritative sources;
4. verify the intended client can discover/invoke the required read and write tools;
5. select the concrete deployment topology and credential boundary;
6. update this draft if SDK/transport/auth/client realities differ from current assumptions.

Do not freeze provider-specific tunnel commands, plan/workspace capability assumptions, or obsolete protocol details before this gate.

## In Scope

1. Add the current supported remote MCP server transport around the accepted Channel service/tool layer.
2. Add server-side authentication/authorization appropriate to the selected topology.
3. Enforce request/body/operation bounds and finite timeouts.
4. Enforce active transport requirements such as Host/Origin/session/auth handling as required by the current SDK/spec/topology.
5. Preserve the same Channel semantics and backend visibility policy used locally.
6. Provide deployment configuration/documentation for the selected secure topology.
7. Prove unauthenticated/unauthorized callers cannot read or write exposed terminal Channels.
8. Prove an authorized real remote client can discover and invoke `list_channels`, `get_channel`, `read_channel`, `write_text`, `send_control`, and `health` as applicable.
9. Add automated transport/auth tests and CI where possible, plus durable real-client integration evidence for claims that Actions cannot establish.
10. Ensure logs/errors do not expose bearer credentials or full terminal payloads by default.

## Out of Scope

- Worker/Task/Issue/scheduler semantics;
- tmux session/pane lifecycle;
- process/Codex startup or restart;
- worktree management;
- generic shell or raw tmux command tools;
- provisioning a full host operating system;
- automatic DNS/account/domain purchasing;
- remote SSH Runtime Backend / multi-host terminal routing;
- changing Channel tool semantics merely to match a client limitation;
- treating UI confirmation as server authorization.

## Architecture Invariants

1. Remote ingress wraps the Channel MCP; it does not become a second product domain.
2. Authentication/authorization is enforced server-side or by an explicitly trusted ingress boundary.
3. ChannelBackend/TmuxBackend semantics remain independent from remote transport.
4. Remote access does not add Worker/Task/lifecycle knowledge.
5. Unauthenticated public terminal read/write/control is forbidden.
6. Credentials are not accepted in URL query strings or logged in clear text.
7. Existing Channel visibility scope remains enforced remotely.
8. Remote request failure never creates/restarts/destroys an endpoint.
9. Client capability gaps produce BLOCKED/compatibility evidence, not product-scope expansion.
10. Normal operation requires no root.

## Verification Claims

### C1 — Authenticated boundary
Protected remote MCP operations require valid authorization according to the selected topology.

### C2 — Unauthorized rejection
Missing/invalid credentials cannot discover, read, write or control Channels.

### C3 — Remote read compatibility
An authorized intended remote client can discover and invoke the accepted read/health tool surface.

### C4 — Remote write compatibility
An authorized intended remote client can invoke accepted `write_text` / `send_control` operations with actual write capability.

### C5 — Channel semantic preservation
Remote transport does not alter channel identity, visibility, bounded-read, text/control separation or lifecycle boundaries.

### C6 — Transport safety
Request bounds/timeouts and required current transport/session/Host/Origin protections are covered by tests or trusted gateway/SDK evidence.

### C7 — Secret/log safety
Auth credentials and full terminal payloads are not emitted by default logs/errors.

### C8 — Failure separation
Ingress/auth failures are distinguishable from backend/channel failures and do not mutate terminal lifecycle.

### C9 — Current compatibility evidence
Execution Report records the actual SDK/spec/client environment and date used to validate compatibility rather than relying on stale planning assumptions.

### C10 — Product boundary
No host-admin, Worker/Task, endpoint-lifecycle, raw shell/tmux capability is introduced.

## Verification Plan

### J1 — Automated transport/auth tests
GitHub Actions should cover protected endpoint behavior, malformed/oversized requests, timeout handling, auth rejection, safe logging and regression of local Channel semantics.

### J2 — Remote integration
Required against the selected deployed topology. Prove authorized discovery/read and, when current client support permits the frozen Goal, `write_text`/`send_control` invocation.

### J3 — Negative security checks
Prove unauthenticated/invalid-auth requests cannot access Channel tools and do not receive secret-bearing diagnostics.

### J4 — Exact Candidate / config identity
Evidence must identify Candidate SHA, deployment configuration revision, relevant SDK/runtime versions and real-client compatibility environment/date.

## Security Review

Security-sensitive: **yes — highest MVP security gate**.

Primary risks:

- unauthenticated terminal authority;
- token/auth validation mistakes;
- proxy/Host/Origin trust mistakes;
- credential leakage;
- denial-of-service via unbounded requests;
- confusing remote transport errors with Channel/backend state;
- weakening tool semantics to accommodate a client.

## Success Criteria

Reviewer may ACCEPT only when:

1. MVP-002 accepted Channel tools are exposed through the selected supported remote MCP transport.
2. Protected operations require valid server-side/trusted-ingress authorization.
3. Unauthorized callers cannot read/write/control Channels.
4. Authorized real remote read tool invocation is proven.
5. Authorized real remote write/control invocation is proven when required by the frozen Goal; otherwise Task is BLOCKED rather than declared complete.
6. request bounds/timeouts and current transport protection requirements are satisfied.
7. Channel scope/product boundaries remain unchanged.
8. credentials/full terminal payloads are absent from default logs/errors.
9. required automated CI passes on exact Candidate.
10. real compatibility Evidence records actual environment/date/versions.
11. deployment docs explain the selected secure topology without making infrastructure provisioning a Channel MCP tool.
12. `[EXECUTION REPORT]` includes C1–C10 results and exact Evidence.

## Failure / Blocked Rules

### FAIL
Examples: unauthenticated access succeeds; write tools bypass auth; logs expose credentials; transport changes Channel semantics; required tests fail due implementation.

### BLOCKED
Examples: MVP-002 not accepted; current intended client lacks required write capability; no supported secure remote transport/topology can be established; external auth/tunnel prerequisite unavailable; required real-client evidence cannot be produced.

### Resume condition
Accepted MVP-002 plus a current verified remote MCP/auth/client path capable of exercising the frozen Goal.

## Completion Protocol

When eventually published:

```text
Coordinator publishes to env:web-gpt
→ separate GPT Web Worker claims one Attempt
→ implementation + CI + real remote compatibility Evidence
→ [EXECUTION REPORT] | [BLOCKER REPORT]
→ review/blocked + owner:none
→ STOP
→ original GPT Web Coordinator reviews
```

Do not start MVP-004 from this Task.
