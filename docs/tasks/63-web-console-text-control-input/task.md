# Task 63 — Web Console: send a message and explicit control (chat composer + mutation routes)

> **Publication-aligned.** Issue #61 is accepted. This contract has been re-read against the accepted #61 implementation on main (`426d90322a7d2130078965ca302ea8c4078865e0`). In the Chat-first ordering (`docs/web-console-requirements.md §6`) this is MVP-2 and precedes #62 Chat History, which consumes the user-turn event defined here.

## Metadata

```text
GitHub Issue: #63
Task ID: 63-web-console-text-control-input
Task kind: implementation + verification
Parent: Issue #60 (Web Console Goal)
Base commit: 426d90322a7d2130078965ca302ea8c4078865e0 (contains accepted #61)
Candidate commit: n/a
Session bootstrap: docs/tasks/63-web-console-text-control-input/prompt.md
Preferred worker: coordinator-authorized-devin
Environment: env:devin
Handoff profile: docs/tasks/handoffs/devin.md
Required capabilities: github-read-write, repository-code-authoring, github-actions-evidence, local-node-tmux-execution
Hard dependencies: Issue #61 Final Acceptance. Downstream: #62 depends on this Task's user-turn event.
```

Requirement authority: `docs/web-console-requirements.md` §2 and WC-UC3.

## Goal

Let a human on the tailnet, from a **chat composer**, deliver a message (`write_text`, `submit=true` by default; multi-line/no-submit mode available)
or exactly one explicit control (`send_control`: `ENTER | INTERRUPT | ESCAPE`) to one Channel from
the browser, with Origin/Host verification, confirmation for `INTERRUPT`, and honest handling of ambiguous
mutation timeouts — no new key grammar, no retry. Every send emits a **user-turn event** `{channel_id, text, submit, sent_at, transport_result}` that #62 records as conversation history; controls emit a control event.

## Primary Use Case (WC-UC3)

```text
Actor: human on the tailnet
Trigger: wants to answer an agent prompt or interrupt a running command
Preconditions: #61 Console running; Channel available
Main flow:
  1. human types a message in the chat composer (Enter sends with submit=true; Shift+Enter newline; a "send without Enter" option exists)
  2. Console verifies Origin/Host, forwards to write_text through the adapter unchanged
  3. for controls, human uses the "Stop" (INTERRUPT, confirmation required), "Enter", "Escape" actions — presented as actions, not key chords
  4. Console shows mechanical result: delivered | rejected(INVALID_ARGUMENT…) | ambiguous timeout
Success outcome: text/control reaches the pane exactly once; UI states "delivered (transport only)"; a user-turn/control event is emitted
Failure outcome: mismatched Origin/Host → 403; invalid Cc control chars → the MCP's INVALID_ARGUMENT shown verbatim; Channel missing → explicit error
Degraded outcome: TIMEOUT after send → "ambiguous: may have been delivered" with no automatic retry; user decides
Authoritative evidence: Actions integration test writing to a real tmux pane and reading back
```

## Separation Points

```text
Console composer | MCP input safety   → Console does not pre-sanitize beyond size hint; MCP rejects, Console displays
ordinary text | explicit control      → separate UI affordances, separate API routes, never merged
tailnet access control | channel op   → the Console authenticates nobody; Origin/Host check happens before the adapter call
mutation result | application meaning → "delivered" is transport only
```

## Single Responsibilities

```text
console/api/write     = Origin/Host check + one write_text call
console/api/control   = Origin/Host check + one send_control call with the closed enum
console/ui/composer   = chat-style message entry (Enter sends), no-submit option, Stop/Enter/Escape actions, confirmation, result display
console/events        = in-process user-turn / control event bus emitted per send; #62 owns browser push/history transport
```

## Logic / Control Separation

Logic: request shape, enum enforcement (mirror of the MCP enum, no extension), error/timeout mapping.
Control (human): when to send, whether to retry after an ambiguous timeout.

## Success / Failure / Degradation

Success proves: a human write path exists on the tailnet, mapped 1:1 to the two MCP mutation tools.
Hard failure: any extra key grammar; auto-retry; accepting cross-origin requests; logging of text.
Degradation: ambiguous timeout is explicit; backend unavailable disables the composer.
Never inferred: whether the agent "accepted" the input.

## In Scope

- `Origin`/`Host` verification on both mutation routes;
- API routes `POST /api/channels/:id/text` and `POST /api/channels/:id/control`;
- chat composer UI (bottom of the session page, ChatGPT-like): Enter sends with submit=true, Shift+Enter newline, explicit "send without Enter" option, size hint (1 MiB hard bound is the MCP's), Stop/Enter/Escape actions, INTERRUPT confirmation, result banner; no command-line styling;
- user-turn / control event definition and emission through a small in-process event bus for #62; no WS/SSE endpoint is added in this Task — #62 owns browser push/history transport;
- logging: operation, channel_id, result category, byte size — never the text;
- tests: cross-origin denial, enum rejection of anything but the three values, write→read-back on real tmux, timeout mapping (mocked adapter).

## Out of Scope

- terminal attach (#64), lifecycle (#65);
- key macros, paste history, templates;
- any `src/` change or MCP enum extension.

## Architecture Invariants

- Ordinary text and explicit control remain separate.
- Closed control enum identical to the MCP's.
- Non-idempotent mutations are never blindly retried.
- No terminal text in logs.

## Claims / Verification

```text
C1: request with a mismatched Origin/Host receives 403 on both mutation routes. (unit)
C2: request without Origin from a non-browser client on the tailnet is accepted (same-host API use is allowed); a foreign Origin is rejected. (unit)
C3: control value outside ENTER|INTERRUPT|ESCAPE is rejected before reaching the adapter. (unit)
C4: text with submit=true appears in the pane and read_channel shows the marker; submit=false shows no extra newline execution. (integration, real tmux)
C5: INTERRUPT after a sleep command returns the pane to prompt; UI required confirmation. (integration + UI test)
C6: adapter TIMEOUT is surfaced as ambiguous and no second call is made. (unit with mocked adapter)
C7: logs contain no text payload. (unit)
C8: each successful or ambiguous send emits exactly one user-turn event carrying text/submit/sent_at/transport_result; a rejected send emits none. (unit)
```

## Security Review

```text
Security-sensitive: yes (remote write/control path on the tailnet; T2, T6, T5, Origin/Host)
Remote ingress affected: yes — tailnet is the access boundary; bind guard from #61 unchanged
```

## Success Criteria

1. SC1: C1–C8 PASS on the exact Candidate SHA in Actions.
2. SC2: no `src/` change; console static guard passes (no `send-keys` in console/).
3. SC3: `console/README.md` documents the ambiguity rule, the user-turn event shape, and that anyone on the tailnet can write.

## Failure / Blocked Rules

BLOCK if the #61 bind guard/Origin helpers cannot be reused without weakening them → Coordinator decides. Never bypass the Origin/Host check to pass.

## Publication Dependency / Alignment Gate

Resolved by Coordinator after #61 Final Acceptance. Accepted #61 provides:

```text
Origin/Host helper: console/src/http-app.ts::checkRequestAuthority / expectedAuthority
MCP adapter:        console/src/mcp-client.ts::ConsoleMcp + StdioMcpClient
UI stack:           plain HTML/CSS/JavaScript under console/public
CI layout:          additive `console` job in .github/workflows/ci.yml
Network behavior:   upgrades currently rejected; #63 keeps that behavior
```

#63 must reuse those helpers/signatures rather than creating parallel ingress or adapter layers. It may add POST mutation routes and an internal event-bus module, but it must not add WebSocket/SSE transport; browser push belongs to #62.

## Evidence Contract

As in `docs/tasks/task.template.md`; worker identity `coordinator-authorized-devin`; no terminal transcripts persisted.
