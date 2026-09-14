# Agent Session Web Console Requirements

## Goal

Provide a ChatGPT-style web interface for managing and interacting with long-running agent sessions backed by tmux.

The console is a human interaction layer. It does not replace tmux or agent-runtime-mcp.

## Design principles

- tmux remains the source of truth for running sessions and processes.
- agent-runtime-mcp remains the machine-readable MCP interface for AI control and observation.
- The Web Console provides discovery, visualization, interaction, and navigation.
- Do not parse agent-specific protocols. Preserve raw terminal/session data.

## Target workflow

Users run multiple long-lived agents:

- Devin
- Codex
- Claude Code
- Gemini CLI
- shell sessions

The console allows switching between them from one browser UI.

## Core features

### Session management

- List tmux sessions.
- Show session name, title, cwd, repository, agent type, and status.
- Open an existing session.
- Create a new session with selected working directory and command.

### Views

The UI should provide three views:

1. Chat View

- ChatGPT-like conversation presentation.
- Render markdown and code blocks.
- Show important outputs clearly.

2. Browse View

- Browse historical output like a web page.
- Infinite scrolling.
- Search.
- Copy selected content.
- Preserve reading position when new output arrives.
- Bookmark important output locations.

3. Terminal View

- Full interactive terminal.
- Send text input.
- Support control keys such as Ctrl-C and Escape.

## Agent interaction

The console should support:

- Send text to an existing session.
- Observe output updates.
- Stop/restart sessions.
- Jump between sessions.
- Send selected output to another agent session.

## Non-goals

- Do not implement a new terminal runtime.
- Do not replace tmux.
- Do not hard-code Devin/Codex specific output parsing.
- Do not expose writable terminals publicly without authentication.

## Architecture direction

```
Browser
  |
  v
Agent Session Web Console
  |
  +-- Chat/Browse/Terminal UI
  |
  v
agent-runtime-mcp
  |
  v
tmux sessions
```

## Future extensions

- Agent comparison view.
- Output bookmarks and annotations.
- Transfer context between sessions.
- Mobile optimized UI.
- Session history indexing.
