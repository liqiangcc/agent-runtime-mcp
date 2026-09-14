# Task 62 — Web Console Chat History: conversation-style view over Console-owned bounded history

> **Draft.** Non-claimable until Issues #61 and #63 are accepted and the Publication Dependency / Alignment Gate below is re-read by the Coordinator. This Task completes the **primary closed loop** of the Chat-first Console (`docs/web-console-requirements.md §2`).

## Metadata

```text
GitHub Issue: #62
Task ID: 62-web-console-chat-history
Task kind: implementation + verification
Parent: Issue #60 (Web Console Goal, Chat-first revision)
Base commit: to be recorded at publication (must contain accepted #61 and #63 Candidates)
Candidate commit: n/a
Session bootstrap: docs/tasks/62-web-console-chat-history/prompt.md
Preferred worker: coordinator-authorized-devin
Environment: env:devin
Handoff profile: docs/tasks/handoffs/devin.md
Required capabilities: github-read-write, repository-code-authoring, github-actions-evidence, local-node-tmux-execution
Hard dependencies: Issue #61 Final Acceptance (skeleton, bind guard, MCP client adapter); Issue #63 Final Acceptance (send routes + composer, user-turn recording hook)
```

Requirement authority: `docs/web-console-requirements.md` §2 and WC-UC2.

## Goal

Make the default page for an agent session a **ChatGPT-like conversation view**: the messages this
Console sent (user turns) interleaved with the mechanically observed output that followed each of
them (output blocks), updated live, with reading position kept, search/copy, and a **Raw
transcript** toggle — using only `read_channel` + `get_channel(observe:true)` +
`wait_channel_event` and a Console-owned, finite, memory-only history ring. No role/turn parsing
of terminal output, no agent protocol knowledge.

## Primary Use Case (WC-UC2 — the primary closed loop)

```text
Actor: human on the tailnet
Trigger: opens an agent session to see what has happened and continue the conversation
Preconditions: #61 Console running; #63 composer/send routes present; Channel available
Main flow:
  1. Console attaches to the Channel: bounded read_channel snapshot becomes one "earlier output" block;
     get_channel(observe:true) starts the observe loop
  2. human types a message in the composer (#63); the send is recorded as a user turn
     {text, timestamp, submit, transport result} and rendered immediately
  3. the observe loop waits (wait_channel_event, finite idle/timeout); on activity it re-reads the bounded
     tail, appends the new lines to the ring, and renders them as the current output block
  4. the block closes on output_idle / timeout or when the next user turn is sent; UI shows "output paused"
     (never "done") while idle
  5. Raw transcript toggle shows the same ring as unshaped terminal text; search/copy/bookmarks are browser-local
Success outcome: browser open → pick session → conversation view → send message → new output appears as the next block
Failure outcome: CHANNEL_NOT_FOUND/UNAVAILABLE, CURSOR_EXPIRED/OBSERVATION_GAP → explicit state + "re-observe" action; no endpoint recovery
Degraded outcome: timeout is silent/normal; WAITER_LIMIT/RESOURCE_EXHAUSTED → bounded polling with a visible "polling" badge; ring full → oldest entries drop with a marker
Authoritative evidence: Actions integration + UI test on real tmux running a deterministic echo/sleep script
```

## Separation Points

```text
Console sends | observed output                 → the ONLY two message kinds; the Console knows what it sent, everything else is output
observation (output_idle) | interpretation      → "output paused", never completion/success
MCP bounded read/observe | Console-owned ring   → MCP stores no history; ring is finite and memory-only
conversation shape | agent protocol             → shape comes from Console events + observation timing only; no prompt detection, no role parsing
default chat view | raw transcript              → same data, two renderings; chat is default
chat view | Terminal View (#64)                 → Terminal is an "Advanced" entry, not reached from the chat flow by default
```

## Single Responsibilities

```text
console/history-ring   = per-Channel finite ring of {user_turn | output_block} entries with line/byte ceilings and drop marker
console/observer-loop  = one observe/wait loop per open Channel; closes/open output blocks on idle/timeout/next-turn; stops when no viewer remains
console/ui/chat        = conversation rendering (escaped, markdown-safe), live append, position keeping, search, copy, raw toggle
console/api/write (#63)= emits the user-turn event the ring records; unchanged otherwise
```

## Logic / Control Separation

Logic: ring bounds, tail dedupe against the previous snapshot, block boundary rules, cursor handling, structured error mapping.
Control (human/operator): which session to open, when to send, whether to open Raw/Terminal, ring ceilings, persistence (off; out of scope).

## Success / Failure / Degradation

Success proves: the primary closed loop works end to end in a browser with chat-shaped rendering, no MCP surface change, bounded memory, zero agent-protocol parsing.
Hard failure: any role/turn inference from terminal text; prompt detection; unbounded ring; history on disk; observe loops outliving viewers; `output_idle` shown as completion; command-line styling as the default view.
Degradation: cursor expiry → re-observe; waiter limits → polling badge; backend unavailable → frozen view + banner.
Never inferred: agent identity, task state, "done".

## In Scope

- ring entry model `{kind: user_turn|output_block|earlier_output, ...}` with configurable ceilings (documented defaults, e.g. 5,000 lines / 2 MiB per Channel, max N open Channels) and a visible drop marker;
- block boundary rules exactly as in WC-UC2 (idle/timeout/next-turn), including the "earlier output" block for pre-attach content;
- observer loop respecting `docs/mcp-contract.md §7` bounds (idle_ms/timeout_ms ranges, 2 waiters per Channel), cancelled when the last viewer leaves;
- WS/SSE push with `Origin`/`Host` verification against the bound address;
- chat UI: default view for a session; user turns visually distinct; output blocks monospace-in-bubble, HTML-escaped, safe markdown rendering (no raw HTML, no script); live append; position keeping with "new output" marker; search; copy; browser-local bookmarks; Raw transcript toggle; explicit "Advanced → Terminal" link placeholder (target implemented by #64);
- structured error surfaces for `CURSOR_*`, `OBSERVATION_GAP`, `CHANNEL_*`, `WAITER_LIMIT`;
- tests: ring bounds and drop marker; tail dedupe; block boundary rules (idle / timeout / next-turn); loop cancellation; Origin rejection; **no-parsing guard**: a deterministic transcript containing prompt-like and role-like strings (`> `, `$ `, `assistant:`, `user:`) is rendered as plain output, never as separate turns; integration on real tmux.

## Out of Scope

- Terminal View (#64), lifecycle (#65); any `src/` or MCP bound change;
- role/turn parsing, prompt detection, agent-specific rendering (Future);
- disk persistence / history indexing (Future, separately reviewed);
- context transfer between sessions (Future).

## Architecture Invariants

- The Console's only knowledge of "who said what" is its own `write_text` calls.
- `read_channel` truncation metadata is surfaced, never hidden.
- `output_idle` is displayed as a pause, never completion.
- Ring, loops and connections are finite; last viewer leaving cancels the loop.
- Terminal output is rendered escaped; never executed or used as Console policy.
- tmux/command-line styling is not the default presentation.

## Claims / Verification

```text
C1: ring never exceeds configured line/byte ceilings under a synthetic 10× overflow; drop marker present. (unit)
C2: overlapping read tails are deduped; no duplicated or lost lines for a deterministic tmux output script. (integration)
C3: a send via #63 appears immediately as a user turn; output observed afterwards appears as the following output block; the block closes on output_idle and a second send opens a new block. (integration + UI)
C4: prompt-like / role-like strings in output are rendered as plain output; no turn split occurs. (unit, no-parsing guard)
C5: observer loop stops within one timeout after the last viewer disconnects; no waiters remain. (integration)
C6: CURSOR_EXPIRED / OBSERVATION_GAP produce the explicit re-observe state and no automatic tmux action. (unit/integration)
C7: Raw transcript toggle shows the identical ring content as unshaped text. (UI)
C8: WS/SSE rejects mismatched Origin/Host. (unit)
C9: no src/ diff; console static guard passes; runtime bundle excludes console/. (CI)
```

## Security Review

```text
Security-sensitive: yes (T5 sensitive output in browser memory; T8 no semantic authority; T10 bounded loops; XSS via markdown rendering → escaped/safe renderer, no raw HTML)
Remote ingress affected: no new mutation path; tailnet is the access boundary
```

## Success Criteria

1. SC1: C1–C9 PASS on the exact Candidate SHA in Actions.
2. SC2: the conversation view is the default page for a session; the primary closed loop is demonstrable in the integration/UI test.
3. SC3: Chat History usable on desktop and a phone-width viewport.
4. SC4: no history on disk; no `src/` change; no agent-protocol parsing anywhere in `console/`.

## Failure / Blocked Rules

BLOCK if MCP wait bounds make live following impossible without product change, or if #63's send path cannot expose a user-turn event without modification → Coordinator decides (REVISE #63 or amend). Never add output parsing to "improve" the chat shape.

## Publication Dependency / Alignment Gate

Before `status:ready`, the Coordinator must re-read the accepted #61 and #63 Candidates and align: adapter API names, bind guard/Origin helpers, UI stack, composer/user-turn event shape, CI job layout. Update this file, then run the Publication Gate.

## Evidence Contract

As in `docs/tasks/task.template.md`; worker identity `coordinator-authorized-devin`; screenshots allowed without secrets; no terminal transcripts persisted.
