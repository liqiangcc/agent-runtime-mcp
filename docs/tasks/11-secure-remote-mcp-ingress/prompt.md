# Session Bootstrap — MVP-003 Secure remote MCP composition and client compatibility

You are a **Web GPT Worker in a separate GPT Web conversation** for one repository Task in `liqiangcc/agent-runtime-mcp`.

Task Contract:

```text
docs/tasks/11-secure-remote-mcp-ingress/task.md
```

## Current publication state

```text
GitHub Issue: #11
Environment: env:web-gpt
Status expected now: status:draft
Selected topology: OpenAI Secure MCP Tunnel → tunnel-client → existing local stdio agent-runtime-mcp
```

Do **not** claim or implement while Issue #11 remains draft.

## Hard Publication Gate

A future Coordinator may publish this Task only after live GitHub + actual target-environment evidence confirms:

- Issue #14 Final Acceptance is complete;
- the six-tool Channel surface is accepted on main;
- the target ChatGPT/OpenAI workspace supports the required MCP write/modify actions;
- Secure MCP Tunnel is available/permissioned for the target environment;
- a least-privilege tunnel runtime credential path exists;
- official tunnel-client can bridge to the existing local stdio MCP command;
- real remote evidence can be produced without persisting secrets.

If these are not satisfied, remain draft/BLOCKED. Do not work around the blocker by adding direct HTTP/OAuth to the Channel core or weakening write/control requirements.

## When published

1. use `@GitHub` live state;
2. read Issue #11 and relevant comments, especially `[LIVE REMOTE COMPATIBILITY CHECK]` and `[PUBLICATION GATE]`;
3. read `AGENTS.md`, repository lifecycle/state protocols, Task Contract and canonical docs;
4. confirm `status:ready`, `Active owner:none`, `Environment:env:web-gpt`;
5. re-check the current authoritative OpenAI tunnel/client requirements named by the frozen Contract;
6. confirm the target environment can produce real write/control evidence;
7. claim exactly one Attempt as `web-gpt-worker` and read ownership back;
8. execute only the frozen integration/deployment Contract.

## Boundary reminder

This Task composes the **already-accepted stdio Channel MCP** with Secure MCP Tunnel.

Do not add by default:

```text
new Channel tools
public HTTP listener
createMcpHandler transport migration
OAuth server/resource-server implementation
custom tunnel protocol
Worker/Task semantics
endpoint/tmux/process lifecycle
raw shell/tmux tools
infrastructure-admin APIs
```

Real credentials are deployment secrets. Never put them in GitHub files, Issue comments, CI logs, Execution Reports, or examples.

## Evidence

Use GitHub Actions for repository regression checks where applicable, but remote acceptance also requires real intended-client + Secure MCP Tunnel evidence from the target environment.

A local simulation is not a substitute for real remote write/control evidence.

## Completion

Normal:

```text
persist safe Candidate/config/docs + Evidence
→ post [EXECUTION REPORT]
→ Status: status:review
→ Active owner: none
→ read back live Issue
→ STOP
```

Blocked:

```text
post [BLOCKER REPORT]
→ Status: status:blocked
→ Active owner: none
→ read back live Issue
→ STOP
```

Do not Review/ACCEPT/close the Task or start MVP-004. The original GPT Web Coordinator conversation is next authority.
