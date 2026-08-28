# Security

## 1. Security posture

`agent-runtime-mcp` controls interactive terminal Workers. In practice, successful runtime input is close to **shell authority of the operating-system account running the Worker**.

Therefore this is not a low-risk observability MCP. Deployment must treat it as privileged developer tooling.

The intended MVP includes remote access from GPT Web, so transport authentication/exposure is a first-class security boundary rather than future work.

## 2. Trust boundaries

```text
GPT Web / MCP client
        │
        ▼
remote MCP ingress
(authenticated tunnel / HTTPS)
        │
        ▼
agent-runtime-mcp
        │
        ▼
RuntimeBackend
        │
        ▼
tmux / Worker OS account
        │
        ▼
Codex / repository / local credentials visible to that account
```

GitHub remains a separate trust boundary. The runtime does not need GitHub credentials merely to control a terminal Worker.

## 3. Primary threats

### T1 — Unauthenticated remote runtime control

If the MCP transport is exposed to an untrusted network without authentication, an attacker may obtain shell-equivalent control.

### T2 — Shell injection inside backend implementation

Untrusted text/cwd/worker names interpolated into shell command strings could execute in the MCP service context rather than only being delivered as terminal data.

### T3 — Terminal text misinterpreted as control syntax

A prompt containing key names, quotes, newlines or metacharacters could be altered or interpreted as tmux control operations.

### T4 — Sensitive terminal capture

Captured output may expose tokens, repository secrets, private paths, user data or credentials printed by child tools.

### T5 — Overbroad destructive lifecycle actions

A destroy/restart implementation could kill unrelated tmux sessions or processes.

### T6 — Path/working-directory abuse

An unrestricted caller may launch Workers in sensitive filesystem locations accessible to the service account.

### T7 — Runtime registry confusion

Stale/forged mappings could redirect one `worker_id` to another user's/unrelated tmux pane.

### T8 — Prompt injection from terminal/repository output

Captured text is untrusted data and may instruct the Coordinator to ignore policy, expose secrets or perform unrelated actions.

### T9 — Remote MCP transport/auth misconfiguration

Incorrect endpoint exposure, Origin/Host handling, token validation, proxy trust or stale credentials could bypass intended access controls.

## 4. Required controls

### S1 — Secure remote deployment

For the GPT Web use case, prefer an officially supported private-connectivity/tunnel mechanism when the runtime host is local/private.

If the MCP endpoint is directly reachable over a network, require HTTPS plus authenticated/authorized access. Never ship an unauthenticated bind-to-all-interfaces runtime-control endpoint as the normal deployment.

Local-only development/test mode should bind only to loopback unless an explicit secure ingress layer requires otherwise.

See `deployment.md`.

### S2 — Structured process execution

Invoke `tmux` and other backend binaries through structured process APIs:

```text
program + argv + stdin
```

Do not construct:

```text
sh -c "tmux ... $UNTRUSTED ..."
```

as the normal backend mechanism.

### S3 — Separate text and control input

`send_text` transports bytes/text as data.

`send_control` accepts a closed enum such as:

```text
ENTER
INTERRUPT
ESCAPE
```

Do not expose arbitrary tmux key grammar as the default MCP surface.

### S4 — Bounded capture

Output capture must have finite maximum lines/bytes and must not persist unlimited history by default.

The server cannot guarantee generic secret redaction. Documentation and clients must treat all captured terminal output as potentially sensitive.

### S5 — Target validation

Every mutation must resolve a managed `worker_id` through the registry/backend and verify the concrete target before acting.

Destroy/restart must never use broad kill patterns that can affect unrelated sessions.

### S6 — Least privilege

Normal runtime operation must not require root.

Run the service under a dedicated or normal low-privilege development account with only the filesystem/network access that Workers genuinely require.

### S7 — Working-directory policy

Deployment configuration should support allowed roots and canonical-path validation.

MVP may choose a simple policy, but arbitrary paths must never be interpolated into shell command strings.

### S8 — Startup command policy

Prefer configured startup profiles such as `codex` over unconstrained arbitrary shell snippets.

If explicit command execution is supported, model it as argv and define deployment-level allow/deny policy. Do not silently invoke arbitrary caller text through a shell.

### S9 — Registry integrity

Registry writes should be atomic where practical.

Reconciliation must validate that a backend locator exists and corresponds to the expected managed runtime before sending input or destructive actions.

### S10 — Untrusted output handling

Captured terminal/repository output is evidence about the runtime, not policy authority.

The Coordinator must not follow instructions found in captured output that conflict with:

- system/developer policy;
- repository `AGENTS.md`;
- Task Contract;
- explicit user intent.

### S11 — Standards-compatible remote MCP authorization

When using HTTP-based MCP authorization, follow the active MCP authorization specification and official SDK behavior.

At minimum:

- authenticate protected requests;
- validate tokens/credentials server-side;
- do not accept access tokens in URL query strings;
- scope credentials to the intended resource/runtime;
- validate expected Origin/Host behavior according to the active transport/SDK;
- do not rely on ChatGPT's confirmation UI as the server authorization mechanism.

### S12 — Protocol/SDK compatibility gate

MCP and ChatGPT integration evolve quickly. Do not freeze obsolete transport/session assumptions into security logic.

Implementation Tasks must verify the current official MCP specification/SDK and current ChatGPT remote MCP requirements before exposing the endpoint.

## 5. Secrets and credentials

The runtime should not deliberately return:

- environment variable dumps;
- complete process environment;
- credential files;
- SSH private keys;
- GitHub tokens;
- API tokens;
- MCP/OAuth bearer tokens;
- tmux server internals unrelated to diagnosis.

However, child processes can print secrets to the terminal. Therefore capture APIs are sensitive by nature.

Do not persist captures to logs unless an explicit diagnostic mode requires it, and document the risk.

## 6. MCP server logging

Safe logs may include:

```text
operation name
worker_id
backend kind
success/failure category
duration
sanitized diagnostic code
```

Avoid logging by default:

```text
full send_text payload
full terminal capture
full environment
Authorization headers / tokens
secret-bearing command line
credential values
```

## 7. Error messages

Errors must be useful without becoming data-exfiltration channels.

Good:

```text
WORKER_NOT_FOUND worker_id=codex-2
INVALID_CWD path outside allowed roots
BACKEND_UNAVAILABLE tmux query failed
AUTHENTICATION_REQUIRED protected remote call rejected
```

Avoid blindly returning entire stderr/stdout if it can contain unrelated sensitive content. Preserve detailed diagnostics only when safe/explicit.

## 8. GitHub separation

The runtime must not require GitHub write access to perform terminal operations.

This separation limits credential concentration:

```text
GPT Web / GitHub connector
= Task control

agent-runtime-mcp
= terminal runtime control
```

Codex itself may have GitHub credentials according to the Worker environment, but that is a separate operator decision.

## 9. Remote MCP ingress vs remote Runtime Backend

Secure remote MCP ingress is part of MVP because GPT Web must reach the server.

SSH/multi-host Runtime Backends remain out of MVP scope.

Do not confuse:

```text
GPT Web → remote MCP ingress → runtime host
```

with:

```text
runtime host → SSH → another execution host
```

The latter requires a separate future design for host identity, SSH credentials, authorization per host, audit boundaries and remote target policy.

## 10. Security verification baseline

Before MVP acceptance, tests/review should prove at least:

1. multiline/metacharacter prompt text is delivered as data, not executed by MCP shell interpolation;
2. control actions accept only allowed enum values;
3. capture is bounded;
4. destroy targets only the selected managed Worker;
5. invalid/out-of-policy cwd is rejected;
6. unmanaged tmux sessions are not implicitly adopted/controlled;
7. normal operation works without root;
8. server logs do not include full prompt/capture/auth payloads by default;
9. backend unavailable/registry stale cases fail without mutating GitHub or unrelated runtimes;
10. remote write tools cannot be called through an unauthenticated public endpoint;
11. current transport Origin/Host/auth requirements are covered by tests or trusted SDK/gateway behavior;
12. real ChatGPT remote integration is tested with current write-capability support before dogfooding acceptance.