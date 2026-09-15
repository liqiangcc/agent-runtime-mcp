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

## Production boundary note (frozen rule for any future implementation)

- Presentation parsing of agent-specific output formats belongs ONLY in a
  UI adapter layer — never in runtime/core.
- Production must NOT guess agent type from terminal text. The agent-type
  metadata/config/selection source is frozen only after user approval and
  may need a separate Publication Gate if it touches the backend or public
  contract.
- Adapter parse failure must fall back to raw/generic rendering.

## Covered by the mock

- minimal header: session name + compact state chip + overflow menu
- sessions drawer (off-canvas on narrow screens, static sidebar ≥900px)
- reading-first conversation flow (generic: reading/translation scenario;
  devin: mock code-review conversation with Thinking / Running command /
  Read shell / Tool result cards)
- sticky bottom composer; Send primary; no-submit + Stop/Enter/Escape under
  an "Advanced input" disclosure
- compact observation-recovery UI for needs_reobserve / error / closed with a
  prominent Re-observe button (simulated via overflow "Demo states")
- secondary affordances: raw transcript view, copy, bookmarks, search,
  terminal (marked Advanced), lifecycle, refresh — all mock
- context-transfer modal mock: source → target → preview → confirm
