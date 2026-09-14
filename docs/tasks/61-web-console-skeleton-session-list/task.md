# Task 61 — Web Console skeleton, auth gate, MCP client adapter and session list

## Metadata

```text
GitHub Issue: #61
Task ID: 61-web-console-skeleton-session-list
Task kind: implementation + verification
Parent: Issue #60 (Web Console Goal)
Base commit: 7dec85d6914b90aba035dd2b256349afc2b7d6f0 (record the actual main SHA at claim time)
Candidate commit: n/a
Session bootstrap: docs/tasks/61-web-console-skeleton-session-list/prompt.md
Preferred worker: coordinator-authorized-devin
Environment: env:devin
Handoff profile: docs/tasks/handoffs/devin.md
Required capabilities: github-read-write, repository-code-authoring, github-actions-evidence, local-node-tmux-execution
Hard dependencies: none (first Web Console slice)
```

Live Task state belongs in GitHub Issue #61 and its append-only comments.

Planning method: `docs/tasks/planning-principles.md`. Requirement authority for the Console layer:
`docs/web-console-requirements.md`.

## Goal

Create the `console/` upper-layer component with (1) an authenticated HTTP server that binds to
loopback by default, (2) an MCP client adapter that talks to `agent-runtime-mcp` over stdio using
only the seven public tools, and (3) a browser session list showing mechanical Channel facts and
backend health — **without touching `src/` or the public MCP contract**.

## Primary Use Case (WC-UC1)

```text
Actor: operator/human using a browser
Trigger: wants to see which tmux-backed sessions exist right now
Preconditions:
  - tmux socket and sessions already exist (prepared externally)
  - agent-runtime-mcp is installed in this repository (built dist/) and configured via TMUX_* env
  - Console started by the operator with an auth mode configured (or loopback-only default)
Main flow:
  1. browser loads Console; unauthenticated request is rejected unless loopback-default mode
  2. Console server calls health, list_channels (and get_channel on demand) through the MCP client
  3. browser renders channel_id, tmux.session_name, title, cwd, state, last_activity, capabilities
  4. list refreshes on demand / at a bounded interval
Success outcome: the list reflects the MCP inventory; health banner reflects health.available
Failure outcome: MCP process unavailable or backend unavailable → explicit unavailable state; no retry storm, no tmux mutation
Degraded outcome: missing optional fields shown as "unknown"; nothing inferred from terminal text
Authoritative evidence: GitHub Actions job running Console tests against a real disposable tmux + built agent-runtime-mcp
```

## Separation Points

```text
Console server | agent-runtime-mcp        → the public MCP contract is the only coupling
MCP client adapter | Console HTTP/UI      → adapter exposes typed results of the seven tools, no UI concerns
auth layer | channel operation            → auth decides who; adapter/MCP decide what
observation | interpretation              → Console shows mechanical facts only
console/ | src/                           → no runtime import from src/; no product change
console/ | runtime bundle                 → package-runtime output must not include console/
```

## Single Responsibilities

```text
console/server            = HTTP/WS ingress, auth enforcement, static UI serving
console/mcp-client        = spawn/connect agent-runtime-mcp over stdio, call the seven tools, map structured errors
console/ui                = render inventory/health; human-local state
agent-runtime-mcp         = unchanged Channel product
```

## Logic / Control Separation

Logic/data path (this Task): tool call mapping, typed results, structured error pass-through, bounded refresh.

Control (outside this Task / operator): when the MCP/tmux exist, restart policy, who is granted which role, deployment topology (reverse proxy, TLS).

## Success / Failure / Degradation

- Success proves: list/health are served through the MCP only; auth precondition is enforced; boundary guards pass.
- Hard failure: any `src/` change; any tmux invocation from `console/` in this Task; non-loopback bind without auth; secrets in logs.
- Safe degradation: `health.available=false` → read-only unavailable banner; MCP child exits → explicit "MCP unavailable", bounded reconnect attempts with backoff, no endpoint creation.
- Never inferred: agent identity/type/status from titles, cwd, or output.

## Required Capabilities

```text
WC-UC1 → inventory display    → MCP client adapter (list_channels, get_channel, health)
auth precondition            → console/server auth middleware with roles: read | write | terminal | lifecycle (only read is used here; roles are defined now)
boundary preservation        → console-specific CI guard + runtime-bundle exclusion assertion
```

## In Scope

- `console/` with own `package.json`, lockfile, `tsconfig.json`, TypeScript, Node >= 20, minimal deps (official `@modelcontextprotocol/client` for the adapter; a small HTTP/WS server library or Node built-ins; minimal or no frontend framework — prefer plain TS/HTML unless justified in the PR).
- MCP client adapter connecting to `node <repo>/dist/src/server.js` via `StdioClientTransport`, passing through `TMUX_*` env unchanged; typed wrappers for all seven tools (only list/get/health are exercised by UI here; the others are needed by later slices and must be thin pass-throughs with no extra semantics).
- Auth layer: config `CONSOLE_BIND` (default `127.0.0.1`), `CONSOLE_AUTH_MODE = none|token|proxy-header`; `none` is only valid with a loopback bind; `token` = bearer/session secret from env; `proxy-header` = trusted identity header accepted only from `CONSOLE_TRUSTED_PROXY_CIDRS`. Role mapping config for `read|write|terminal|lifecycle`. Server refuses to start on an invalid combination.
- Session list page (usable on a phone-width viewport, no mobile-first redesign) with health banner and manual/bounded auto refresh.
- Structured logging without terminal payloads; no request bodies or tokens logged.
- CI: new job(s) for `console/` typecheck + unit tests + one integration test that prepares a disposable tmux server (test harness only), builds the repo, starts the Console with `token` auth, and asserts: unauthenticated 401/403, authenticated list matches `tmux list-panes` count within the allowlist, health banner true, then after `tmux kill-server` health false and no session recreation.
- Console-specific static guard: reject `new-session|kill-session|attach-session|pipe-pane|send-keys|shell:\s*true` anywhere under `console/` (later Tasks will carve explicit adapter-module exceptions).
- Assertion that `npm run package:runtime` output contains no `console/` path.
- `docs/web-console-requirements.md` §12 satisfied; a short `console/README.md` covering configuration and the security posture.

## Out of Scope

- Browse View, write/control, Terminal View, session lifecycle (Tasks #62–#65).
- Any change under `src/`, `docs/mcp-contract.md`, or the seven-tool surface.
- agent type / status / Chat View (deferred to Future by Issue #60 review).
- TLS termination, reverse proxy configuration, public exposure — operator deployment concerns (document only).
- Persisting anything to disk.

## Architecture Invariants

- The Console is an upper layer; the MCP contract is its only product coupling.
- No tmux command is executed from `console/` in this Task.
- Terminal facts are mechanical; no semantic agent/task state.
- Failure never creates/restarts/destroys endpoints.
- Remote write/control/lifecycle require authn/authz (roles defined here, enforced by later Tasks).
- Normal operation requires no root.

## Implementation Requirements

1. Add `console/` as an independent npm package (not an npm workspace of the root unless the root lockfile stays byte-identical; do not alter root `package.json` dependencies).
2. Adapter connects via the official MCP TypeScript client v2 already used by `tests/dogfood`; reuse its connection pattern, do not fork product code.
3. Expose an internal HTTP JSON API (`/api/health`, `/api/channels`, `/api/channels/:id`) behind auth; the UI consumes only this API.
4. Enforce bind/auth validation at startup; document every env var in `console/README.md`.
5. Add CI job(s) in `.github/workflows/ci.yml` for the Console without modifying existing jobs' guards.
6. Keep root `npm test`/`npm run test:all` behaviour unchanged.

## Claims / Verification

```text
C1: unauthenticated request to /api/channels is rejected in token/proxy-header modes; none mode refuses a non-loopback bind. (unit + integration)
C2: authenticated list reflects MCP list_channels for a disposable tmux server with TMUX_ALLOWED_SESSIONS applied; disallowed session is absent. (integration, real tmux, Actions)
C3: health banner follows health.available before/after tmux kill-server; Console performs no tmux command (process-spawn spy / static guard). (integration)
C4: static guard finds no tmux lifecycle/attach/send-keys or shell:true under console/. (CI)
C5: runtime bundle contains no console/ path. (CI)
C6: no src/ diff in the Candidate; root lockfile unchanged or identical resolution. (PR diff review)
C7: logs contain no bearer token or terminal payload. (unit test on logger + review)
```

Record exact Candidate SHA and Actions run/job IDs. Do not report PASS without reading the run.

## Security Review

```text
Security-sensitive: yes
Threats/controls: T3 (scope: rely on MCP scope, same TMUX_* env), T5 (no payload logging), T8 (no inference), auth precondition per docs/web-console-requirements.md §8
Remote ingress affected: the Console is itself an ingress for humans; it binds loopback by default and refuses insecure combinations
```

## Success Criteria

1. SC1: `console/` builds and its tests pass in GitHub Actions on the exact Candidate SHA.
2. SC2: C1–C7 PASS with evidence.
3. SC3: `src/`, public tool surface, and existing CI guards are unchanged.
4. SC4: `console/README.md` documents bind/auth/roles/env and states the Console is not part of the MCP product.

## Failure / Blocked Rules

FAIL: any Success Criterion not met. BLOCKED: MCP client v2 cannot be used from `console/` without changing product code, or Actions cannot provide a real tmux runner. Resume when the blocker is resolved by the Coordinator. Never weaken guards or bind rules to pass.

## Publication Dependency / Alignment Gate

None; this is the first slice. Re-read canonical `main` at claim time and record the actual base SHA.

## Evidence Contract

Attempt, worker identity `coordinator-authorized-devin`, base/Candidate SHA, PR, Actions run/job IDs, Node/tmux versions, C1–C7 results, known limitations. No secrets, tokens, or terminal transcripts.

## Completion Protocol

```text
Coordinator → status:ready + Devin entry
Devin → claim → Attempt N → branch + PR → Actions Evidence
→ [EXECUTION REPORT] | [BLOCKER REPORT] → status:review | status:blocked → owner:none → STOP
Coordinator → ACCEPT | REVISE | BLOCK | SPLIT | NOT_PLANNED
```
