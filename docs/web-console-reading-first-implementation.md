# Web Console Reading-first — production implementation design

Parent Goal: GitHub Issue #60 · Task: #90 · Prototype acceptance: #116 / PR #117 · Related: #111 #112 #114

## 1. Status and authority

This document is a **design proposal**. It binds the user-accepted prototype
(`docs/prototypes/web-console-reading-first/`, branch `prototype/116-gpt-alignment`
@ `6f05885`, real-iPhone verdict "原型通过" on 2026-09-16) to real Channel data, so
that the operator's own agent sessions read like the prototype on a phone.

Authority order is unchanged:

```text
docs/requirements.md, channel-*.md, mcp-contract.md, security.md   (product — wins)
docs/web-console-requirements.md                                    (Console layer)
docs/tasks/90-web-console-mobile-ux/task.md + amendments             (frozen #90 contract)
this document                                                       (how to land the accepted prototype)
```

Nothing here changes the seven-tool MCP surface, channel identity, cursor/GAP
semantics, or the observer contract accepted in #62/#87.

## 2. What was learned from the prototype cycle

The prototype settled the *presentation* questions. The remaining, and only,
open question is the **data path**: `:8080` shows raw pane text, the prototype shows
mock data; nothing yet renders a real session in the accepted form.

Facts established on the Box host against real Devin panes (not assumptions):

| fact | evidence | consequence |
|---|---|---|
| Devin TUI does **not** use the alternate screen | `tmux list-panes -F '#{alternate_on}'` = 0 for every `devin` pane; `history_size` ≈ 2000 | scrollback exists |
| `read_channel` reads scrollback, not just the visible screen | `src/tmux-backend.ts`: `capture-pane -p -S -<lines>`; Console tail = 400 lines / 256 KiB | the recent conversation *is* retrievable through the public MCP |
| the TUI output grammar is stable and line-anchored | see §4.2 | a presentation adapter can segment it without protocol access |
| folded tool output is genuinely absent from the terminal | `[... N lines truncated (ctrl+o to expand) ...]` | hard ceiling — must be presented honestly, never fabricated |
| Markdown is already rendered by the TUI | captures are plain text; bold/italic/inline-code styling is gone, structure (lists, headings, fences) largely survives | reading typography applies; source-level Markdown fidelity is best-effort |
| agent type must not be inferred from terminal text | `docs/web-console-requirements.md` §9 | adapter selection is operator-declared metadata or explicit user choice |
| the ACP-client direction (#116 §二 A) was rejected by the user | #116 comment 5691678007 | the tmux Channel path is the only path |

## 3. Goal and non-goals

Goal: on a phone-width standalone browser, selecting a real Channel shows its recent
conversation in the accepted reading form — user turns, collapsed activity trace,
answer content — streaming as the agent prints, with the prototype's recovery,
composer, drawer, and viewport behaviour, and with a one-tap raw fallback.

Non-goals:

- no new MCP tool, no `read_channel` option, no observer/SSE contract change;
- no agent protocol client (ACP/stdio/HTTP) — the Console remains an MCP client;
- no server-side parsing of terminal output; no persisted transcripts;
- no attempt to recover content the terminal never contained.

## 4. Architecture

### 4.1 Layering (unchanged shape, new presentation layer)

```text
browser (console/public)
  ├── shell            drawer · header · recovery strip · composer · viewport model   ← prototype, ported
  ├── transcript model ring entries (SSE snapshot/delta) → ordered turns              ← new, client-side
  ├── adapters/        devin · generic                                                ← prototype grammar replaced by real grammar
  └── markdown.js      sanitised GFM renderer                                          ← prototype, ported
console/src            observer / history ring / SSE / mutations                       ← unchanged (Phase A)
agent-runtime-mcp      seven tools                                                     ← unchanged
```

Single responsibilities:

```text
console/src observer     = mechanical truth: ring entries, states, cursor/GAP (unchanged)
transcript model         = pure function  ring entries → turns/segments; no network, no state of its own
adapter                  = presentation parsing of one agent's stable output grammar; fallback = raw
shell                    = accepted prototype UX on top of the model; never reinterprets state
```

### 4.2 Devin adapter — real output grammar

Observed line classes (leading whitespace normalised; glyphs are literal):

```text
❭ <text>                                   user prompt echo (also the composer placeholder — see below)
 ⏺ Ran command | Read | Edited | Wrote | Viewed image | Searched | Called <tool> from <server>
                                           activity header
 │ <text>                                  activity body line
 └ <text>                                  activity body, last line (e.g. "Exited 0", "Session …")
[... N lines truncated (ctrl+o to expand) ...]
                                           folded body — content absent
⠀⢤ Thinking · 4s (esc twice to interrupt)  transient status (spinner glyph varies)
⠸⠀ Running tools · 4m 41s (…)              transient status
 ○ Running …                               transient status
 ✗ Failed                                  activity outcome
 ⚠︎ Connection lost, retrying...            agent-side notice
──────…                                    TUI chrome separator
❭ Ask Devin to build features, fix bugs, or work on your code
                                           TUI chrome: empty composer placeholder
SWE-2 High … Context: 41k / …              TUI chrome: status footer
<anything else>                            answer content
```

Adapter rules:

1. **Segmentation** is line-anchored and stateless per block: header opens an
   activity; `│`/`└` lines attach to the open activity; a folded marker attaches
   as an explicit `truncated: N` fact rendered as "N lines not shown in terminal"
   (never elided silently); any other line closes the activity and is content.
2. **Transient status** lines are never appended to the transcript; the latest one
   becomes the in-progress indicator of the current turn and disappears when a
   non-status line follows. This is what makes the diff-appended ring (§4.3)
   readable.
3. **Chrome** lines (separator, empty-composer placeholder, status footer) are
   dropped. The placeholder is matched by exact text; any other `❭ ` line is a
   prompt echo.
4. **Prompt echo vs Console user turn**: when an echo's text equals the most recent
   Console `user_turn` (whitespace-normalised) and arrives after it, the echo is
   suppressed — the Console turn carries the transport state and is the one shown.
   An echo that matches nothing (typed in the terminal or by another client) is
   rendered as a user turn without transport state.
5. **Answer content** is rendered through `markdown.js` on the segment text. Because
   the TUI has already rendered emphasis, the observable outcome is reading
   typography plus whatever structure survived (lists, headings, fences, tables).
   Nothing is invented: unparsable text renders as paragraphs.
6. **Fallback**: any segment the adapter cannot classify is content; the raw block
   text is always one tap away (`⋯ → Raw transcript`, same as `:8080` today).

The `generic` adapter applies only rules 5–6 (paragraph typography, raw fallback).

### 4.3 Transcript model — from ring entries to turns

Input is the existing SSE stream (`snapshot`, `delta`) of `HistoryEntry`:

```text
earlier_output   initial 400-line tail at attach          → parsed as history (turns before the Console attached)
output_block     open/paused/closed diff-appended text    → parsed incrementally; the current open block is the live turn
user_turn        Console send, transport_result            → user turn (authoritative)
control          explicit control key                     → control row (never merged into text)
drop_marker      ring eviction                            → "earlier history dropped (N lines)" row, kept visible
```

Properties the model must have (all verified by unit tests on fixtures captured
from real panes with sensitive content redacted):

- **Pure and re-entrant**: `model(entries) → turns`; a `delta` re-runs the model on
  the touched block only; unchanged blocks keep their DOM by stable key
  `(entry.id, segmentIndex)`, so streaming updates are in place — no re-append, no
  scroll jump (prototype invariant).
- **Tolerant of diff artefacts**: the observer's `diffTail` appends a rewritten last
  line as a new line, so a block may contain `Thinking · 4s`, `Thinking · 5s`, …
  and repeated chrome. Rules 2–3 absorb this; consecutive identical lines within
  an activity body are collapsed only when byte-identical.
- **Fail-closed continuity**: `state ∈ {needs_reobserve, error, closed}` is rendered
  by the prototype's compact recovery strip; the model never bridges a gap, and a
  block after a re-observe starts a new turn boundary.

### 4.4 Adapter selection (operator-declared, never inferred)

Per `docs/web-console-requirements.md` §9. Two phases:

- **Phase A (client-only, no `console/src` change)**: the session drawer offers
  "Reading mode: generic | devin" per Channel, persisted in `localStorage`
  keyed by `channel_id`; default `generic`. Explicit user choice is operator
  metadata.
- **Phase B (small `console/src` change, separate Publication Gate)**:
  `CONSOLE_UI_ADAPTERS="arm-*=devin,d2-*=devin"` — session-name glob → adapter,
  surfaced as `ui_adapter` on `/api/channels` items (Console-internal API, not
  MCP). The client uses it as the default and the Phase A override stays.
  `pane_current_command` is deliberately **not** used: the MCP does not expose it,
  and adding it would be a public-contract change.

### 4.5 Sending

Unchanged: the composer calls the existing `/api/channels/:id/text` with the exact
visible draft, `submit: true`, at most once; IME composition never triggers send;
`sending → delivered | failed | ambiguous` caption is driven by the existing
`transport_result`. No-submit and control keys stay in the advanced sheet.

### 4.6 Viewport / standalone model

Port verbatim from the prototype (`app.js`): canonical asymmetric `--app-vh`,
keyboard inset gated on real occlusion (`KB_MIN = 120`), scroll-restore on
keyboard close, and the #111 root-cause fix — **in standalone the shell height
floors at `screen.{height,width}` when the gap is ≤ 160 px**, because WebKit
reports all page metrics short at cold launch and corrects them only on first
touch. The HUD (`⋯ → Debug → Viewport HUD`) and the bounded diagnostics ring
(geometry and draft *length* only) ship, hidden behind Debug.

## 5. Delivery plan

```text
T1  console/public port (this design, Phase A)                      env:devin, contract: #90 frozen + this doc
    - port shell/style/markdown/viewport from 6f05885
    - transcript model + devin/generic adapters on the real grammar
    - drawer adapter switch (localStorage)
    - raw transcript fallback preserved; desktop layout remains usable
    - e2e: iPhone-width specs + adapter unit tests on redacted real fixtures
T2  Phase B operator mapping (console/src, tiny)                    separate Publication Gate
T3  Final Gate: Box predeploy redeploy + real-iPhone standalone dogfood on the operator's own sessions
```

T1 touches only `console/public/**`, `tests/console-e2e/**`, `console/README.md`,
exactly as the frozen #90 contract allows. If T1 discovers that a needed fact is
not in the SSE payload, that is BLOCKED → Coordinator, not a `console/src` edit.

## 6. Claims for T1

```text
C1  a real Devin Channel renders as user turns / collapsed activity / answer content;
    raw transcript equals the ring text byte-for-byte (existing #62 property)
C2  streaming: appended block text updates the live turn in place; no duplicated
    activity rows from Thinking/Running status rewrites; scroll pinned only when at bottom
C3  folded terminal output is shown as "N lines not shown in terminal", never dropped silently
C4  prompt echo of a Console send is not shown twice; a foreign echo is shown as a user turn
C5  adapter choice is explicit per Channel and defaults to generic; nothing infers type from text
C6  needs_reobserve / error / closed use the compact recovery strip; no auto re-observe
C7  standalone cold launch on a real iPhone: no bottom dead zone (HUD sh = vh, dead = 0);
    ≥10 keyboard cycles incl. Chinese IME, ≥2 bg/fg, ≥1 rotation — deadBottom = safe-area only
C8  no console/src, root src, .github, dependency, or MCP surface changes
C9  existing e2e suites (chat, transfer, observer/history, terminal, lifecycle) stay green
```

## 7. Known limits (stated, not hidden)

- Content folded by the TUI (`ctrl+o to expand`) cannot be recovered from any
  terminal read; the Console shows the count. Recovering it would require the agent
  to print unfolded output or a non-terminal data source — both outside this design.
- Emphasis/inline-code styling that the TUI rendered to colour is lost because
  `read_channel` captures plain text. An ANSI-preserving read would be a
  `read_channel` option and therefore a separate MCP Publication Gate; it is *not*
  assumed here.
- The 400-line tail bounds how far back history renders on first attach; older
  content is reachable via Advanced Terminal.
- The adapter grammar tracks the current Devin TUI; a TUI change degrades to
  generic rendering by construction (rule 6), never to missing content.
