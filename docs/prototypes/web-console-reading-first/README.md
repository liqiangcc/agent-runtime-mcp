# Web Console — Reading-first static prototype (Issue #90)

**PROTOTYPE ONLY.** Self-contained static HTML/CSS/JS with mock data. No backend,
no real terminal, no MCP calls. Mock interactions do not validate real MCP or
Console semantics — they exist purely to review the proposed mobile-first
Chat-first / Reading-first information architecture before production
implementation.

Serve the directory with any static file server, e.g.:

```bash
python3 -m http.server --bind <addr> <port> -d docs/prototypes/web-console-reading-first
```

Covered by the mock:

- minimal header: session name + compact state chip + overflow menu
- sessions drawer (off-canvas on narrow screens, static sidebar ≥900px)
- reading-first conversation flow (mock translation/reading scenario)
- sticky bottom composer; Send primary; no-submit + Stop/Enter/Escape under
  an "Advanced input" disclosure
- compact observation-recovery UI for needs_reobserve / error / closed with a
  prominent Re-observe button (state transitions are simulated via the
  overflow menu "Demo states" entries)
- secondary affordances: raw transcript view, copy, bookmarks, search,
  terminal (marked Advanced), lifecycle, refresh — all mock
- context-transfer modal mock: source → target → preview → confirm
