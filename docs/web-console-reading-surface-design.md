# Web Console Reading Surface Design (generic-first, Devin adapter, real-time)

Parent: Issue #60 (Web Console goal) · #90 (Reading-first) · #116 (direction decision).
Related: #111 (iOS standalone shell floor) · #112 · #114.

Status: design, user-aligned 2026-09-16. Not a Task Contract. The two decisions in §11 are
closed (user, 2026-09-16); Task publication may proceed from this document.

Baselines:

```text
product runtime   main @ 9c94be2  (agent-runtime-mcp v0.2.2, seven public tools, unchanged)
visual reference  prototype/116-gpt-alignment @ 6f05885  (user-accepted on a physical iPhone)
```

Authority: `docs/web-console-requirements.md` remains the canonical Console requirement; product
documents (`docs/requirements.md`, `docs/mcp-contract.md`, `docs/security.md`, ...) win over both.

## 1. Requirements

### 1.1 Confirmed with the user

| # | Requirement |
|---|---|
| R1 | Target is **any tmux Channel**. The generic reading experience is first-class; Devin structure is an optional overlay. |
| R2 | Content a screen capture cannot see (Devin TUI `[... N lines truncated ...]`, alternate screen) is **labelled honestly**; never fabricated, no data-source change. |
| R3 | The adapter (`generic` / `devin`) is **chosen by the user in the UI and remembered per Channel**. Default `generic`. Agent type is never inferred from terminal text. |
| R4 | This document is design only: no Task publication, no change to the deployed `:8080` Console. |
| R5 | **Real-time output**: new terminal output is visible on the phone with p95 <= 1.5 s (inside the tailnet); during streaming the answer and tool rows update in place (no flicker, no rebuild, no scroll yank). |

### 1.2 Assumptions (defaults, correctable)

| # | Assumption |
|---|---|
| A1 | Generic conversation shape: my send = bubble; everything observed until `output_idle` = one answer block; Markdown is attempted, monospace verbatim on failure. |
| A2 | Only a Devin adapter is built now. The adapter interface is reserved; no fixtures for Codex / Claude Code. |
| A3 | Scrollback that existed before the Console attached is one collapsed "earlier output" entry; it is not split into turns. |

### 1.3 Explicitly out

- No change to `src/**`, the seven public tools, cursor / GAP / timeout / lifecycle semantics.
- No ACP client, no Devin log files, no alternative data source.
- No automatic agent detection, server-side adapter hints, or session-name -> adapter mapping.
- No splitting of historical output into turns.
- No recovery of TUI-folded content.
- No WebSocket or new transport; SSE stays.

## 2. Use cases

| Use case | Success | Failure (explicit) | Degradation (honest) |
|---|---|---|---|
| Open a Channel | First screen is a conversation: one collapsed "earlier output" + subsequent turns | MCP unavailable -> existing `error` state | - |
| Send and watch | Bubble -> activity / answer grows in real time -> settles after `output_idle` | TIMEOUT ambiguity keeps "may have been delivered", no auto-retry (existing) | - |
| Devin Channel | After settle: one `Thought Ns · N tool steps ›` row + dominant Markdown answer | A turn with no recognisable structure renders generic and is marked `raw` | Truncated segment shows "N lines folded in the terminal, not captured" + Terminal View entry |
| Interrupt / recover | During CURSOR_EXPIRED / GAP activity rows stay visible; collapse only after re-observe and settle | - | - |
| Generic Channel | One answer block per send, Markdown or monospace | - | The program's own redraw noise is shown as-is: it is real output |

## 3. Separation points (primary design axis)

```text
tmux pane
  | S1  terminal bytes -> Channel semantics
agent-runtime-mcp (src/**)                    unchanged
  | S2  MCP tool results -> Console observation records
Console observation (HistoryHub / HistoryRing) cadence change only
  | S3  verbatim records -> conversation structure
Projection (turn boundary / settle)            new, adapter-agnostic, pure
  | S4  turn text -> segment structure
Adapter (generic | devin)                      new, pluggable, pure
  | S5  segments -> pixels
Rendering (console/public)                     ported from 6f05885
  | S6  user intent -> configuration
Adapter selection (explicit, per Channel)
  | S7  execution result -> acceptance authority
Evidence / Real-data Gate
```

Test for every point (planning-principles §3): one side may change without forcing unrelated
semantics into the other.

### S1 · terminal bytes -> Channel semantics (MCP boundary)

| | |
|---|---|
| Hand-over | `read_channel.text / truncated / captured_at`, `wait_channel_event.reason / activity_observed / next_cursor` |
| Upstream reason to change | Channel communication semantics, tmux mechanics |
| Downstream reason to change | how the Console consumes observations |
| Logic | MCP: what a bounded read is, what idle is, what a GAP is |
| Control | Console: when to call, how often, what to do on failure |
| Failure | mechanical failures (GAP / EXPIRED / CLOSED) reported by MCP; **handling** decided by Console |

Commitment: **zero change**. R5 is achieved purely by the Console choosing `timeout_ms`
(server range 100..60000). If R5 turns out to require an MCP change, that is an S1 leak and
planning restarts instead of adding a parameter.

### S2 · MCP results -> Console observation records (Ring boundary)

| | |
|---|---|
| Hand-over | `HistoryEntry`: `earlier_output`, `output_block (open -> paused -> closed)`, `user_turn`, `control` |
| Upstream reason to change | observation cadence, dedupe, cursor recovery |
| Downstream reason to change | how the reading surface organises entries |
| Logic | Ring: **store verbatim, never parse** (Issue #62 invariant); `diffTail` dedupe |
| Control | HistoryHub: busy / quiet cadence, poll fallback, re-observe |
| Failure | `needs_reobserve / error / closed` decided and broadcast by the Hub; downstream displays only |

Real-time changes land on the control side only: `runLoop` switches `timeout_ms` between a
busy value and the quiet heartbeat (§6). Ring shape, `output_block` state semantics and the
byte-identical raw transcript are unchanged.

Reverse check: Devin knowledge (`⏺ │ └`, spinner) must never enter the Ring or the Hub.
Filtering spinner lines in the Hub "for cleaner blocks" would break raw fidelity and impose
Devin semantics on generic Channels.

### S3 · verbatim records -> conversation structure (Projection boundary)

| | |
|---|---|
| Hand-over | `Turn { user?, blocks[], controls[], settled }` |
| Upstream reason to change | Ring entry shape |
| Downstream reason to change | adapter segment grammar |
| Logic | turn boundary = the Console's own `user_turn`; membership = order; `settled` = `block.state in {paused, closed}` |
| Control | none; pure function |
| Failure | none: valid input yields deterministic output |

This layer carries R1: boundaries depend only on facts the Console produced itself, never on
any program's output format. Generic and Devin are therefore identical here.

Known limitation kept explicit: input typed directly in tmux produces no `user_turn` and is
attributed to the previous turn. No echo-based boundary guessing (A3, R3).

Observation vs interpretation: `settled` is an **observed fact** (idle reached). "The agent
finished" is an **interpretation** and belongs to S4/S5. Naming keeps them apart.

### S4 · turn text -> segment structure (Adapter boundary)

| | |
|---|---|
| Hand-over | `Segment[] \| null` and `settleHint: idle \| busy \| unknown` |
| Upstream reason to change | Turn shape |
| Downstream reason to change | one specific program's TUI format |
| Logic | recognise `⏺ / │ / └ / ❭ / truncated / chrome`; `null` means "not recognised" |
| Control | the **caller** decides: `null` -> generic; final settle = Projection `settled` AND `settleHint != busy` |
| Failure | an adapter never throws; uncertainty -> `null` or `unknown` (planning-principles §6) |

Two directions to defend:

1. an adapter never asks the Ring / Hub to change data for it (S2 leak);
2. an adapter never touches DOM / layout (S5 leak). `parse` has no DOM and no IO, which is
   also what allows node-level tests against real fixtures.

`generic` is the identity adapter: `parse -> null`, `settleHint -> unknown`. "Any Channel" is
the default path, not a special case.

`settleHint` lives in S4 because `❭ Ask Devin` vs `❭ Guide Devin` is Devin format knowledge;
it is returned as a hint and combined by the caller because it affects control.

### S5 · segments -> pixels (Rendering boundary)

| | |
|---|---|
| Hand-over | DOM: turns, summary row, answer, activity rows, truncation label, raw |
| Reason to change | visual / interaction (6f05885 alignment, #111 shell floor) |
| Logic | none; mapping and in-place increments (reparent, never rebuild) |
| Control | collapse / expand, scroll pin, live delta feeding |
| Failure | render failure -> that turn falls back to generic / raw; text is never dropped |

R5 here: keep the last text length per `entry.id`, feed the appended slice into the live
Markdown / adapter `update(delta)`. The renderer does not know where deltas come from or how
often; that is S2.

R2 here: render `{ type: 'truncated', lines }` as an honest label plus a Terminal View entry;
never ask S1/S2 for more data.

### S6 · user intent -> adapter configuration (R3 boundary)

| | |
|---|---|
| Hand-over | `channel_id -> adapterId` in browser localStorage |
| Logic / Control | the user |
| Failure | no record -> `generic` |

Hard exclusion: the server provides no default adapter hint from session name, pane command
or output features. An earlier `CONSOLE_ADAPTER_HINTS` idea is removed: it is operator-side
inference re-entering through the back door. If wanted later it is a separate requirement.

### S7 · execution result -> acceptance authority (Evidence boundary)

| | |
|---|---|
| Hand-over | script-generated screenshots (file name carries the SHA, report carries sha256), DOM assertions, SSE latency p50/p95, real-fixture replay tests |
| Logic | scripts produce recomputable facts |
| Control | Reviewer / user accept or reject |
| Failure | any before/after pair with identical hashes -> mechanical REJECT before human judgement |

This is where #114 failed: `v114-0-before-112.png` and `v114-1-history-collapsed.png` are the
same file (identical md5) and the "clearly visible before/after" claim passed review. The gate
is now mechanical, not a reviewer habit.

Final authority is the user opening **their own real Channel** on a physical device in
standalone mode. Chromium emulation and mock data are intermediate evidence only.

## 4. Data flow

```text
tmux pane
-> get_channel(observe) / read_channel / wait_channel_event   (HistoryHub, cadence §6)
-> HistoryRing: earlier_output | output_block | user_turn | control
-> SSE /api/channels/:id/events  (existing snapshot / delta)
-> projectConversation(entries) -> Turn[]
-> adapter.parse(turn text) -> Segment[] | null
-> render (in-place increments)
```

## 5. Adapter interface and Devin grammar

```ts
interface Adapter {
  id: 'generic' | 'devin';
  parse(text: string): Segment[] | null;                       // null -> caller renders generic
  settleHint(tailText: string): 'idle' | 'busy' | 'unknown';   // generic: always 'unknown'
}

type Segment =
  | { type: 'text'; text: string }
  | { type: 'tool'; title: string; body: string; status?: string; open: boolean }
  | { type: 'truncated'; lines: number }
  | { type: 'chrome'; kind: 'idle_prompt' | 'busy_prompt' | 'status' | 'sep' | 'spinner' };
```

Devin TUI grammar, derived from real `arm-r-box` scrollback (to be frozen by fixtures, §7):

```text
TOOL_START    ^\s?⏺\s+(?<title>\S.*)$           ⏺ Ran command / Edited / Viewed image / Searched for / Read ...
TOOL_BODY     ^\s?│(?<line>.*)$
TOOL_END      ^\s?└\s+(?<status>.*)$             └ Exited with code 0
TRUNCATED     ^\[\.\.\. (?<n>\d+) lines truncated \(ctrl\+o to expand\) \.\.\.\]
CHROME_SEP    ^─{5,}
CHROME_PROMPT ^❭ (Ask Devin|Guide Devin)
CHROME_STATUS ^SWE-2 .*Context: \d+k / \d+k
CHROME_SHELL  ^\d+ shell · ↓ select
CHROME_SPIN   ^[\u2800-\u28FF]+ Running tools
TEXT          everything else -> answer Markdown
```

Rules:

- `│` lines keep their content verbatim after the leading marker.
- Consecutive duplicate chrome lines are merged (by-product of in-place TUI redraw plus
  line-wise `diffTail`); chrome is hidden from the reading surface only, raw keeps it.
- An unterminated `⏺` block is a running activity row.
- Zero TOOL / CHROME matches in a turn -> `null`.
- Parsing is idempotent; rendering updates nodes keyed by `(turnId, segmentIndex)`.

Settle:

```text
generic: block.state in {paused, closed}
devin:   the above AND settleHint(tail) == 'idle'
         idle = latest chrome prompt is "❭ Ask Devin to build features..."
         busy = "❭ Guide Devin while it works" or "Running tools ·" spinner
```

An interrupted turn never reaches `paused`, so it never collapses: fail-closed by construction.

## 6. Real-time output (Console control side only)

Current loop (`console/src/observer.ts`, `runLoop`) pulls the tail only on `output_idle` or on
a 15 s `timeout` with `activity_observed`. During continuous output the phone may see nothing
for up to 15 s.

Adaptive cadence:

```text
busy  (previous wait had activity_observed, or current block is open):
      wait_channel_event(idle_ms = 1000, timeout_ms = 600)
      any result with activity_observed -> pull tail -> broadcast `updated`

quiet (previous result was output_idle with no activity):
      wait_channel_event(idle_ms = 1000, timeout_ms = 15000)     existing heartbeat
```

- `timeout_ms` range is 100..60000 on the server; `idle_ms` and therefore `output_idle` /
  settle semantics are untouched. `timeout` is still never a block boundary.
- Still one waiter per Channel (limits 2 per Channel / 16 global unaffected). Busy cadence is
  about 1.6 `read_channel` calls per second (400 lines), negligible on the host.
- New configuration `CONSOLE_OBSERVE_BUSY_TIMEOUT_MS` (default 600, range 100..5000).
- Client side: append-only deltas per `entry.id` feed the live Markdown / adapter `update`
  interface that already exists in 6f05885.
- Side effect: busy cadence surfaces more redraw noise as "new lines". Devin adapter merges and
  hides it on the reading surface; generic shows it; raw is unchanged.

## 7. Modules and fixtures

```text
console/public/projection.mjs                 turn boundary / membership / settled (no DOM)
console/public/adapters/generic.mjs           identity adapter
console/public/adapters/devin/parse.mjs       pure function, shared by browser and node tests
console/public/adapters/devin/render.mjs      DOM: activity rows, trace summary, truncated label
console/public/{style.css,markdown.js,app.js} ported from 6f05885, including #111 screenExtent() floor
console/src/observer.ts                       adaptive cadence (§6)
console/src/config.ts                         CONSOLE_OBSERVE_BUSY_TIMEOUT_MS
tests/fixtures/record-pane-tail.mjs           new recorder: tail 400 lines every 500 ms -> JSONL {t, text}
tests/fixtures/devin-tui/*.jsonl              real, scrubbed recordings
tests/console/projection.test.ts              generic turn / settle
tests/console/devin-parse.test.ts             fixture replay through diffTail + HistoryRing, then parse
tests/console-e2e/real-data.spec.js           Real-data Gate (§8)
```

The existing `tests/fixtures/terminal-recorder.mjs` records pty **stdin** bytes and is not
suitable. The new recorder replays through `diffTail` and `HistoryRing` first, so tests target
the ring shape the Console actually sees, not an idealised screen.

Minimum fixtures: one complete Devin turn with several tool blocks, a truncation marker and a
spinner; one turn interrupted with `INTERRUPT`; one plain bash Channel proving fail-open.
Fixtures are scrubbed (paths, tokens, URLs) before commit (AGENTS §9).

## 8. Evidence / Real-data Gate

- Playwright runs against the real Console and a real tmux Channel. Screenshots are named
  `v<issue>-<step>-<sha7>.png`; the report lists sha256 per file. Any before/after pair with
  identical hashes is a mechanical REJECT.
- DOM assertions: after settle, zero top-level `.tool-card`, exactly one `.trace-sum` per
  turn; expand / collapse keeps the answer node identity; no horizontal scroll at 375 / 390 /
  420; raw text equals `/api/channels/:id/raw`.
- Real-time: during a long-output turn, record SSE delta arrival minus `read.captured_at`,
  report p50 / p95 (target p95 <= 1.5 s); a frame sequence proves in-place increments.
- Final authority: the user opens their own real Channel on a physical device in standalone
  mode; the #111 shell floor is re-verified on device.

## 9. Task split

| Task | Depends on | Separation points touched | Must not touch |
|---|---|---|---|
| T1 freeze prototype: PR `docs/prototypes/web-console-reading-first/` @ `6f05885` into `main` | - | S5 reference | any code |
| T2a projection + generic adapter + adaptive cadence + unit tests | - | S2 (control), S3, S4 identity | S1, Ring logic, DOM |
| T2b recorder + Devin fixtures + `parse` + unit tests | - | S4 (devin) | S2, S3, S5 |
| T3 UI port and binding: 6f05885 -> `console/public`, SSE real data, adapter selection, incremental rendering | T1, T2a (T2b may follow) | S5, S6 | interface shapes of S1-S4 |
| T4 Real-data Gate e2e + `:8080` cutover with rollback + #111 floor re-verified | T3 | S7 | product semantics |

T1, T2a and T2b run in parallel because the S3/S4 interfaces are fixed before implementation;
T3 depends on T2a but not T2b because generic is the identity adapter.

Housekeeping in parallel: close #111 with a state block; set #90 body to `status:done`;
re-scope #116 as the parent of this design or close it; #26 -> NOT_PLANNED.

## 10. Leak checklist for reviewers

Any of the following in a Candidate is a separation leak and a REVISE:

- `src/**` gains a parameter, field or tool that exists to serve the Console -> S1
- `history.ts` / `observer.ts` contain `⏺`, `❭`, spinner patterns, "Devin", or any line filtering -> S2
- `projection.mjs` reads output text to decide turn boundaries -> S3
- `parse.mjs` imports DOM, fetch, or depends on Hub state -> S4
- the renderer calls `/api` to decide pull frequency -> S5
- server or configuration maps session names to adapters -> S6
- a review comment cites screenshots without hashes, or hashes not compared with the previous version -> S7

## 11. Decisions (closed)

1. **Where `settleHint` is combined.** Decided: the rendering caller combines
   `settled && hint != 'busy'`. Projection stays adapter-agnostic and pure; S3 does not depend
   on the S4 interface. The rejected alternative (Projection taking the adapter as a parameter)
   is recorded here so it is not re-proposed without new reasons.
2. **Raising `CONSOLE_TAIL_LINES`.** Decided: no value is fixed by this design. T2a must record
   the chosen value and its rationale as an explicit sub-decision in its Execution Report
   (bounded by `TMUX_READ_MAX_LINES`), because it changes how often `truncated` appears on
   the reading surface.

## 12. Risks

| Risk | Mitigation |
|---|---|
| Folded / alternate-screen content unavailable | `truncated` segment + Terminal View; never fabricate |
| 400-line tail misses long output | `truncated` flag; T2a evaluates `CONSOLE_TAIL_LINES` (<= `TMUX_READ_MAX_LINES`) |
| Busy cadence amplifies redraw noise | Devin adapter merges; generic shows; raw unchanged |
| Devin release changes TUI format | fixtures named per version; only the `⏺ │ └ ❭` anchors are relied on; fail-open |
| Direct tmux input has no turn boundary | attributed to the previous turn; documented limitation |
| Falling back into the mock loop | from T3 on, mock is not evidence; reviewers must diff hashes |
