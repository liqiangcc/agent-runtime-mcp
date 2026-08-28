# Technology Stack

## 1. Decision

Initial implementation uses **TypeScript on Node.js with the official Model Context Protocol TypeScript SDK v2**.

Re-check current official MCP SDK documentation before changing the pinned major line.

## 2. Why TypeScript first

The primary MVP risks are MCP contract compatibility, safe terminal I/O transport, schema design and tmux integration rather than CPU-bound performance.

TypeScript/Node is preferred because:

- the official MCP TypeScript SDK is a first-class implementation path;
- Node process APIs support structured tmux executable/argv/stdin handling;
- schema/tool definitions are concise and strongly typed;
- the ecosystem supports fast iteration around MCP capability contracts.

Deployment/tunnel/provider integration is not a technology-selection requirement for the Channel product.

## 3. Initial assumptions

```text
Language: TypeScript
Runtime: Node.js
MCP SDK: official TypeScript server SDK
Current MCP transport adapter: stdio
Primary backend: tmux CLI
Backend execution: structured child-process APIs
Primary host for backend verification: Linux
Package management: lockfile-backed npm
```

## 4. Process execution rule

Allowed:

```text
executable = "tmux"
args = ["list-panes", ...]
stdin = <terminal text when applicable>
```

Forbidden:

```text
shell("tmux ... " + untrusted_input)
```

Terminal text remains data.

## 5. Dependency rule

Prefer a small dependency surface:

- official MCP SDK;
- dependencies required by that SDK;
- focused schema/test tooling;
- no tmux wrapper unless it provides a clear audited advantage over structured argv execution.

The core requires no database/registry because Channel discovery comes from the configured backend.

## 6. Verification rule

The repository baseline includes:

```text
typecheck
unit tests
real tmux integration
static product-boundary checks
CI
```

Integration tests may create temporary panes in the test harness. The product MCP API itself does not expose endpoint lifecycle operations.

## 7. Change rule

Changing implementation language, MCP SDK major line, or the public MCP capability semantics is a canonical technology/product decision and requires Coordinator review.

Adding a deployment mechanism is not a Channel-core technology change unless it genuinely changes the MCP capability contract.