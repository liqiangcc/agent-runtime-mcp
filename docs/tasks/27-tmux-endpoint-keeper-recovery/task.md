# Task 27 — tmux endpoint keeper recovery

## Metadata

```text
GitHub Issue: #27
Task ID: tmux-endpoint-keeper-recovery
Task kind: implementation
Environment: env:web-gpt
Worker route: separate-gpt-web-conversation
```

## Goal

Add deployment-layer recovery guidance for external tmux endpoint lifecycle without changing Channel MCP product boundary.

## Primary Use Case

```text
Actor:
deployment operator

Trigger:
configured tmux socket disappears and agent-runtime-mcp cannot reach channels

Preconditions:
- agent-runtime-mcp uses an externally prepared tmux endpoint
- endpoint lifecycle is managed outside MCP

Main flow:
- deployment layer prepares keeper endpoint
- agent-runtime-mcp connects to existing channels
- worker panes can be created and removed independently

Success outcome:
- endpoint recovery restores agent-runtime-mcp health

Failure outcome:
- recovery fails and operator receives explicit unavailable state

Degraded outcome:
- runtime remains unavailable without hidden lifecycle mutation

Authoritative evidence:
- runtime health result
- recovery test result
- repository code boundary review
```

## Separation Points

```text
Channel MCP | deployment lifecycle

agent-runtime-mcp:
- existing channel communication
- channel discovery/read/write/control/health

Deployment layer:
- tmux endpoint creation
- supervision
- restart/recovery policy
- host lifecycle
```

## Single Responsibilities

```text
agent-runtime-mcp = communicate with existing terminal channels
Deployment supervisor = maintain endpoint availability
Doctor checks = report observable runtime state
```

## Logic / Control Separation

Logic/data path:
- Channel operations
- backend communication
- mechanical errors

Control/orchestration:
- when endpoint exists
- restart/recovery policy
- lifecycle decisions

## Success / Failure / Degradation

Success:
- tmux endpoint can be restored by deployment layer
- agent-runtime-mcp health recovers

Failure:
- endpoint cannot be recreated

Degradation:
- health reports unavailable
- no implicit endpoint mutation occurs inside MCP

## Frozen Contract

Inside agent-runtime-mcp:
- communicate with existing tmux panes
- expose channel discovery/read/write/control/health

Outside agent-runtime-mcp:
- create tmux sessions
- supervise processes
- restart/recovery policy
- host lifecycle

## Claims / Evidence Contract

C1:
Deployment layer can restore missing tmux endpoint.
Evidence: recovery test.

C2:
agent-runtime-mcp health changes from unavailable to healthy after recovery.
Evidence: health before/after.

C3:
No MCP public capability creates tmux sessions.
Evidence: public MCP surface review.

## Security Review

Security-sensitive: yes

Controls:
- no new shell execution capability
- no new public tmux lifecycle tool
- endpoint lifecycle remains outside MCP
- no secrets persisted

Remote ingress affected: no

## Success Criteria

1. Recovery procedure is reproducible.
2. MCP product boundary remains unchanged.
3. Evidence proves recovery behavior.

## Out of Scope

- worker scheduling
- task lifecycle
- raw tmux command exposure
- remote tunnel implementation
