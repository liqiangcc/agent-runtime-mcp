# Technology Stack

## 1. Decision

Initial implementation uses **TypeScript on Node.js with the official Model Context Protocol TypeScript SDK v2**.

At implementation time, re-check current official MCP SDK and transport documentation before pinning exact versions.

## 2. Why TypeScript first

The primary MVP risks are MCP compatibility, safe terminal I/O transport, schema design and remote integration rather than CPU-bound performance.

TypeScript/Node is preferred initially because:

- the official MCP TypeScript SDK is a first-class implementation path;
- Node process APIs support structured `tmux` executable/argv/stdin handling;
- schema/tool definitions are concise and strongly typed;
- the ecosystem supports fast iteration while MCP transport details evolve.

## 3. Initial assumptions

```text
Language: TypeScript
Runtime: Node.js
MCP SDK: official TypeScript server SDK
Primary backend: tmux CLI
Backend execution: structured child-process APIs
Primary host: Linux
Package management: standard lockfile-backed Node package manager selected in MVP-001
```

## 4. Process execution rule

Allowed shape:

```text
executable = "tmux"
args = ["list-panes", ...]
stdin = <terminal text when applicable>
```

Forbidden design:

```text
shell("tmux ... " + untrusted_input)
```

Terminal text must remain data.

## 5. Dependency rule

Prefer a small dependency surface:

- official MCP SDK;
- dependencies required by that SDK;
- focused schema/test tooling;
- no tmux wrapper library unless it provides a clear audited advantage over structured argv execution.

The core implementation does not require a database/registry because Channel discovery comes from the configured backend.

## 6. Verification rule

MVP-001 establishes at least:

```text
typecheck
unit tests
real tmux integration
CI
```

Integration tests create external test panes in their harness, but the product MCP API itself does not expose tmux lifecycle operations.

## 7. Change rule

Changing implementation language or SDK major line is a canonical technology decision and requires Coordinator review/document update first.
