# Web Console — Reading-first static prototype (Issue #90)

**PROTOTYPE ONLY.** Self-contained static HTML/CSS/JS with mock data. No backend,
no real terminal, no MCP calls. Mock interactions do not validate real MCP,
Console, or Devin-protocol semantics — they exist purely to review the proposed
mobile-first Chat-first / Reading-first information architecture before
production implementation.

Serve the directory with any static file server, e.g.:

```bash
python3 -m http.server --bind <addr> <port> -d docs/prototypes/web-console-reading-first
```

## Architecture (prototype-level)

```text
shared Reading-first shell (app.js, index.html, style.css)
  session/channel navigation · drawer · sticky composer · recovery UI
  context-transfer shell · raw transcript fallback · overflow affordances
        │
        ├─ adapters/devin.js    — deep-adaptation sample (mock profile)
        └─ adapters/generic.js  — fallback; also the default rendering path
```

- **Shared shell** owns all navigation, composer, recovery, transfer, raw, and
  transport-safety affordances. Adapters only decide how an `output` entry's
  body is rendered.
- **`devin` adapter** parses a stable *mock* activity format (`«thinking»`,
  `«run»`, `«read»`, `«result»` block markers) into dedicated collapsible
  cards. Execution trace is collapsed by default; user messages and the
  latest agent content keep reading priority. A Reading/**Focus** toggle
  hides tool cards entirely and slightly enlarges reading text.
- **`generic` adapter** renders entry text as-is (proportional for
  conversation, monospace reserved for raw/tool content) and is used
  whenever no adapter applies **or adapter parsing fails** — original
  content is never dropped and no state is fabricated.
- **Profile switching is explicit only**: `?agent=devin` query param or
  overflow → "Demo profile". Nothing is inferred from terminal text.
- **Mock streaming**: reply deltas arrive on timers as discrete events.
  Adapter `createLive()` updates segments IN PLACE — cards and answer text
  are never re-appended or duplicated. Scroll auto-follows only when the
  view is pinned to the bottom. A scripted CURSOR_EXPIRED interrupts the
  stream mid-answer and requires explicit Re-observe to resume — gaps are
  never presented as seamless. Composer typing is local-only; Send is the
  only mutation boundary and each user turn shows a state machine:
  `sending → delivered`, or `failed`, or `timeout — ambiguous` (no
  auto-retry). Per-keystroke streaming exists only inside the Advanced
  Terminal sheet.
- **Post-send hierarchy (#112)**: a user turn is a compact right-aligned
  bubble with NO meta row; transport state is a subtle caption under the
  bubble (`sending… / ✓ delivered / ✕ failed — not sent / ? timeout —
  may have been delivered (no auto-retry)`), never a banner. The agent
  reply couples tightly beneath (user→output adjacency tightened);
  collapsed activity rows sit between the turn and the dominant
  Markdown answer. A user turn opens a new visual beat (26px top), so a
  completed turn settles with the answer dominant and tool noise
  receded. Raw transcript stays reachable via overflow → raw view.

## Installable / standalone display mode

- `manifest.webmanifest` declares `display: "standalone"` with
  `start_url`/`scope`, theme/background colors and 192/512 icons. On a
  valid-HTTPS origin this enables browser "Install app" / Add to Home
  Screen; launched standalone, the URL bar and toolbars are gone.
- iOS HTTP fallback (verified path): the legacy
  `apple-mobile-web-app-capable` + `apple-mobile-web-app-status-bar-style`
  + `apple-touch-icon` metas give an app-like standalone window via
  "Add to Home Screen" even without a fetchable manifest — this works on
  the current `http://100.73.234.114:8090` tailnet endpoint.
- `viewport-fit=cover` + `env(safe-area-inset-*)` are applied to the
  topbar, prototype badge, drawer (top+bottom), composer and bottom
  sheets, so the notch/Dynamic Island/Home Indicator never cover content.
- Canonical shell model (v15): in standalone, `--app-vh` commits
  ASYMMETRICALLY — grows freely, but a smaller innerHeight/clientHeight
  is adopted ONLY on explicit lifecycle resets (pageshow /
  orientationchange / visibilitychange→visible). Keyboard-path events
  (vv.resize/vv.scroll/resize/blur/interaction) can never shrink the
  shell — iOS standalone shrinks AND restores all layout metrics
  silently, so a smaller live value is never trusted on those paths.
  Browser (non-standalone) keeps natural both-direction tracking.
- Keyboard occlusion is a separate `--kb-inset` =
  committedShell − (vv.height + vv.offsetTop), clamped ≥0, applied ONLY
  to composer padding and conversation scroll padding. It commits only
  while an editable is focused or a shrink transition is observed;
  editable blur/focusout suppresses it immediately (no focused editable
  = no keyboard). While the inset is committed a bounded 300ms watcher
  re-samples vv and clears+stops when it reads ~0 — zero cost when the
  keyboard is closed.
- Interaction-flush reconciliation: ANY pointerdown/touchstart/scroll
  (debounced) schedules bounded re-samples (rAF/250ms/600ms) that
  re-read all metrics and re-commit — iOS flushes stale viewport state
  on user interaction, so post-interaction samples heal stale commits
  of EITHER variable. Not gated on keyboard state; zero cost between
  interactions. All lifecycle listeners (pageshow/visibility/orientation/
  resize/vv.resize/vv.scroll/blur) retained. Safe-area applied exactly
  once via env() padding. CSS fallback: `var(--app-vh, 100dvh)` ->
  `100dvh` -> `100vh` -> `-webkit-fill-available`. Conversation is the
  only flexible region; collapsed Advanced panel reserves zero height
  ("+" button).
- Diagnostics: `?debug=viewport` adds a live readout
  (src/innerHeight/deadBottom); overflow → Debug → "Copy viewport/input
  diagnostics" copies a bounded 120-entry ring buffer (timestamps,
  events, all viewport candidates, shell/composer rects, deadBottom,
  focus + composition flag + draft LENGTH only — never draft content,
  chosen source + kbInset per event).
- Composer input: `compositionstart`/`compositionend` are tracked; the
  field is never mutated (height/value) mid-composition so iOS IME
  cannot drop/duplicate characters. Send submits the EXACT visible
  draft at most once; failed/ambiguous outcomes never auto-retry.
- `@media (display-mode: standalone)` marks the badge and hides the
  optional "Enter fullscreen" menu item. The Fullscreen API remains a
  user-triggered enhancement in browser mode only; browser chrome is
  never script-hidden.
- **No service worker is registered** — deliberate choice: nothing is
  cached, so no channel/API data can ever be cached; the prototype is
  static assets only. If production ever adds one, it must be
  static-asset-only.
- Known blocker for a real iPhone install: `tailscale serve`/`cert`
  cannot issue HTTPS certs on this tailnet (feature disabled, needs
  tailnet admin). Until then, the verified path is the apple-* meta
  standalone window over HTTP; manifest install requires HTTPS.

## Production boundary note (frozen rule for any future implementation)

- Presentation parsing of agent-specific output formats belongs ONLY in a
  UI adapter layer — never in runtime/core.
- Production must NOT guess agent type from terminal text. The agent-type
  metadata/config/selection source is frozen only after user approval and
  may need a separate Publication Gate if it touches the backend or public
  contract.
- Adapter parse failure must fall back to raw/generic rendering.
- If production real streaming ever needs a backend/public event contract
  beyond the existing observer/SSE path, that requires a separate
  Publication Gate and must not be smuggled into #90 presentation work.

## Covered by the mock

- minimal header: menu + session name + ultra-light status chip +
  overflow only (prototype marker, agent profile, Focus toggle and all
  secondary affordances live inside the overflow menu — no overlay
  chrome, first content baseline is never under the header)
- sessions drawer (ChatGPT-style canvas-translation model on narrow
  screens, static sidebar ≥900px): the drawer is a fixed dark surface
  (~72vw / ~302px at 420) beneath the app; opening translates the whole
  conversation canvas right as one continuous surface with a 28px rounded
  leading corner — the active conversation stays visible on the right and
  is never rebuilt. Swipe-right on the reading area tracks the finger
  progressively and settles open/closed on distance (35%/25%) + velocity
  (0.45px/ms) thresholds; swipe-left on the drawer or the exposed canvas
  strip closes it; the explicit ☰ button remains the accessibility
  fallback. Gestures require clear horizontal intent (|dx| > 14px and >
  1.6×|dy|); vertical scroll, code/table horizontal scroll, text selection
  and interactive elements always win, and the outermost 28px left edge is
  a guard zone so the browser's back gesture is never fought. Drawer
  open/close never rebuilds the transcript or disturbs scroll, stream,
  recovery or composer-draft state.
- reading-first conversation flow (generic: reading/translation scenario;
  devin: mock code-review conversation with Thinking / Running command /
  Read shell / Tool result activity rows — light single-line headers by
  default (no card chrome); only the expanded body is a restrained dark
  surface. In-progress state is an accent icon, never a loud pulse/border.
  Markdown answers are never wrapped inside a tool card)
- sticky bottom composer hugging the bottom safe area; Send primary;
  no-submit + Stop/Enter/Escape under the "+" Advanced panel (zero height
  when collapsed)
- compact observation-recovery strip for needs_reobserve / error / closed:
  a single 38px row (status + ⓘ gap-details expander + one Re-observe
  action); the header only carries the state chip. Re-observe transitions
  in place (interrupted → Re-observing…/Attaching… → live) with no scroll
  jump or transcript rebuild; simulated via overflow "Demo states",
  never auto-retries
- secondary affordances: raw transcript view, copy, bookmarks, search,
  terminal (marked Advanced), lifecycle, refresh — all mock
- context-transfer modal mock: source → target → preview → confirm
