# Task 27 — tmux endpoint keeper recovery

## Goal

Add deployment-layer recovery guidance for external tmux endpoint lifecycle without changing Channel MCP product boundary.

## Boundary

Inside agent-runtime-mcp:

- communicate with existing tmux panes
- expose channel discovery/read/write/control/health

Outside agent-runtime-mcp:

- create tmux sessions
- supervise processes
- restart/recovery policy
- host lifecycle

## Problem

A deployment using a dedicated tmux socket can enter BACKEND_UNAVAILABLE when the external tmux server/session disappears.

## Contract

Implement only deployment-layer recovery:

- keeper session is external to MCP
- keeper session does not carry business tasks
- worker panes can be independently created and destroyed
- doctor can detect missing endpoint

## Evidence

Required:

- tmux socket recovery test
- agent-runtime-mcp health before/after
- proof that no MCP public capability creates tmux sessions
