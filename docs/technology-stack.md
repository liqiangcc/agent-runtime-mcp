# Technology Stack

## 1. Decision

Initial implementation uses **TypeScript on Node.js with the official Model Context Protocol TypeScript SDK v2**.

Verified on 2026-08-28 against the current MCP project documentation:

- TypeScript is a Tier 1 official MCP SDK.
- The v2 TypeScript SDK is the stable release line.
- Server package: `@modelcontextprotocol/server`.
- The v2 line implements the 2026-07-28 MCP specification generation.

Authoritative upstream references to re-check when implementation starts:

- https://modelcontextprotocol.io/docs/sdk
- https://github.com/modelcontextprotocol/typescript-sdk
- https://github.com/modelcontextprotocol/typescript-sdk/tree/main/packages/server

## 2. Why TypeScript first

The primary MVP risk is correct MCP server/transport integration and safe runtime orchestration, not language-level performance.

TypeScript is preferred initially because:

- the official SDK is Tier 1 and current;
- remote/local MCP transport support is first-class;
- Node process APIs are sufficient for structured `tmux` argv execution and bounded subprocess control;
- schema/tool definitions are ergonomic and strongly typed;
- implementation can move quickly while the MCP ecosystem is still changing.

## 3. Why not Rust first

Rust remains a valid future implementation option, but the official Rust MCP SDK is currently below Tier 1. Choosing it for the first MVP would add SDK maturity/integration risk without solving a product requirement that TypeScript cannot satisfy.

Do not interpret this as a permanent rejection of Rust. A later migration requires evidence that it improves deployment, resource use, reliability or packaging enough to justify the protocol/integration cost.

## 4. Initial runtime assumptions

```text
Language: TypeScript
Runtime: Node.js
MCP SDK: official TypeScript SDK v2
MCP server package: @modelcontextprotocol/server
Backend process execution: Node structured child-process APIs
Primary backend: tmux CLI
Primary host: Linux
Package manager: choose one standard lockfile-backed Node package manager during MVP-001 and keep it consistent
```

Exact Node/TypeScript minimum versions must follow the selected SDK's current supported range at implementation time and be pinned in repository metadata/CI.

## 5. Process execution rule

Backend commands must use structured argv/process APIs.

Allowed shape:

```text
executable = "tmux"
args = ["list-panes", ...]
```

Forbidden design:

```text
shell("tmux ... " + user_input)
```

Ordinary terminal text must never be interpolated into a shell command string.

## 6. Dependency rule

Prefer a small dependency surface:

- official MCP SDK;
- schema/runtime dependencies required by that SDK;
- focused test tooling;
- no tmux wrapper library unless it provides a clear audited advantage over structured argv execution.

Do not add an application framework merely to avoid understanding the MCP server lifecycle.

## 7. Verification rule

MVP-001 must establish CI checks for at least:

```text
typecheck
unit tests
format/lint policy selected by the implementation
```

Backend integration tests requiring a real tmux binary must be clearly separated from pure unit tests and skipped/fail with an explicit classification when tmux is unavailable.

## 8. Change rule

Changing the implementation language or official MCP SDK major line is a canonical technology decision. It requires Coordinator review and an update to this document before the change is treated as the new default.