# Task 65 — Web Console: operator-enabled tmux session lifecycle adapter

> **Draft.** Non-claimable until Issue #61 is accepted and the Alignment Gate below is re-read by the Coordinator. Lifecycle authority is a deployment-layer concern (`docs/deployment.md §9`); this Task must not move it toward the MCP.

## Metadata

```text
GitHub Issue: #65
Task ID: 65-web-console-session-lifecycle
Task kind: implementation + verification
Parent: Issue #60 (Web Console Goal)
Base commit: to be recorded at publication (must contain accepted #61 Candidate)
Candidate commit: n/a
Session bootstrap: docs/tasks/65-web-console-session-lifecycle/prompt.md
Preferred worker: coordinator-authorized-devin
Environment: env:devin
Handoff profile: docs/tasks/handoffs/devin.md
Required capabilities: github-read-write, repository-code-authoring, github-actions-evidence, local-node-tmux-execution
Hard dependencies: Issue #61 Final Acceptance
```

Requirement authority: `docs/web-console-requirements.md` (WC-UC5).

## Goal

Allow an authenticated `lifecycle`-role operator to create a new tmux session (name, cwd, and a
start command chosen **only** from an operator-configured allowlist) or kill an existing session,
through a separate `session lifecycle adapter` in `console/` that invokes `tmux` as executable +
argv on the configured socket. Default off. Never via the MCP, never in `src/`.

## Primary Use Case (WC-UC5)

```text
Actor: operator with lifecycle role
Trigger: wants to start a new agent session (e.g. Codex in repo X) from the phone without SSH
Preconditions: #61 Console; CONSOLE_LIFECYCLE_ENABLED=true; command allowlist configured
Main flow:
  1. operator picks an allowlisted profile (label → argv template with only cwd/name parameters), enters a session name and cwd (validated against CONSOLE_ALLOWED_CWD_ROOTS)
  2. adapter runs tmux new-session -d -s <name> -c <cwd> <argv...> on the configured socket
  3. new session appears in the list via the MCP within one refresh
  4. kill-session requires confirmation and the lifecycle role
Success outcome: session created/killed; MCP inventory reflects it; no MCP change
Failure outcome: name conflict, cwd outside roots, profile not allowlisted → refused before spawn; tmux error → surfaced
Degraded outcome: feature disabled → routes 404; keeper session (docs/deployment.md §9) is never killable from the Console
Authoritative evidence: Actions integration test creating/killing a disposable session and observing inventory through the MCP
```

## Separation Points

```text
lifecycle adapter | MCP                → the MCP still never creates/destroys endpoints
allowlisted profiles | free commands   → no free-form command or shell; argv templates only
lifecycle role | terminal/write roles  → separate grant
Console lifecycle | deployment keeper  → keeper session protected; Console never becomes the supervisor
```

## Single Responsibilities

```text
console/lifecycle-adapter = validate + run new-session/kill-session as argv on the configured socket
console/api/lifecycle     = authz + CSRF + confirmation token for kill
console/ui/lifecycle      = profile picker, name/cwd inputs, kill confirmation
```

## Logic / Control Separation

Logic: validation (name charset, cwd roots, allowlist), argv building, error mapping.
Control (operator): enabling the feature, defining profiles/roots, who holds the role, restart/supervision policy (stays outside the Console).

## Success / Failure / Degradation

Success proves: a guarded, allowlisted lifecycle path exists at the deployment layer, invisible to the MCP.
Hard failure: free-form command; shell string; kill of keeper/allowlist-excluded sessions; lifecycle via MCP; feature on by default.
Degradation: disabled routes; explicit tmux errors; no auto-recreate on failure.

## In Scope

- `CONSOLE_LIFECYCLE_ENABLED` (default false), `CONSOLE_LIFECYCLE_PROFILES` (JSON: label → argv template), `CONSOLE_ALLOWED_CWD_ROOTS`, `CONSOLE_PROTECTED_SESSIONS` (default includes `agent-runtime-keeper`);
- adapter module as the only allowed location of `new-session|kill-session`; static guard exception updated;
- API + UI with confirmation for kill;
- audit log line per lifecycle action (actor, action, session name; no command output);
- tests: allowlist enforcement, cwd root enforcement, protected session refusal, create→inventory→kill on real tmux, disabled-by-default.

## Out of Scope

- process supervision/restart, worktree creation, repository cloning, credentials handling;
- any MCP change; `deployment/tmux-endpoint-keeper.sh` changes (separate deployment Task if needed).

## Architecture Invariants

- The MCP has no lifecycle capability; `src/` unchanged; `static-boundary` job unchanged.
- tmux as executable + argv; no shell interpolation; no free-form commands.
- Keeper/protected sessions cannot be killed from the Console.

## Claims / Verification

```text
C1: profile not in allowlist / cwd outside roots / invalid name → refused, no spawn. (unit with spawn spy)
C2: create via adapter → session visible in MCP list_channels; kill → absent; keeper session survives. (integration, real tmux)
C3: kill of a protected session is refused. (unit)
C4: with the flag unset, routes return 404. (unit)
C5: static guard: new-session/kill-session only in the adapter module; no shell:true. (CI)
C6: MCP discovery still exactly seven tools; src/ unchanged. (CI)
C7: audit log contains no command output or secrets. (unit)
```

## Security Review

```text
Security-sensitive: yes (T1, T3, T4, S6 boundary preservation; new deployment-layer authority)
Remote ingress affected: yes — lifecycle role, default-off flag
```

## Success Criteria

1. SC1: C1–C7 PASS on the exact Candidate SHA in Actions.
2. SC2: product boundary unchanged (no `src/` diff, seven tools).
3. SC3: `console/README.md` documents profiles, roots, protected sessions, and that lifecycle is deployment-layer authority.

## Failure / Blocked Rules

BLOCK if requirements would need the MCP to expose lifecycle or if allowlisting cannot express a required start command without shell → Coordinator decides.

## Publication Dependency / Alignment Gate

Re-read accepted #61 (roles, guard layout) and, if #64 is accepted first, align adapter module conventions. Coordinator must confirm the default profile set before publication.

## Evidence Contract

As in `docs/tasks/task.template.md`; worker identity `coordinator-authorized-devin`; no secrets or transcripts persisted.
