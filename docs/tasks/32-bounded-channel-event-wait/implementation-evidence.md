# Attempt 1 implementation evidence

The implementation is bound to the Candidate SHA reported in the Issue execution report and PR for Attempt 1.

Implemented surface:

- `get_channel({observe:true})` returns an opaque leased cursor, channel instance and `snapshot_change` model.
- `wait_channel_event` is the sole seventh public tool. It uses shared per-channel sampling, bounded ring history and `next_cursor` continuation semantics.
- Tmux sampling brackets a bounded capture with pane/server `/proc` identity and visibility checks. Missing panes use scoped inventory bracketed by stable server-generation checks; no capture is attempted for an absent pane.
- Waiters enforce idle/timeout bounds, per-channel/global limits, cancellation cleanup and explicit continuity/backend errors.

Evidence commands executed on Linux with tmux and the pinned MCP SDK:

```text
npm run typecheck
npm test
npm run test:integration
npm run test:discovery
npm run test:dogfood
git diff --check
```

The real-host integration emits `TDX_WAIT_EVIDENCE` with `output_idle`, `snapshot_change`, elapsed quiet window and an advancing continuation cursor. A dedicated real stdio/tmux run (`STDIO_60S_TIMEOUT_EVIDENCE`) performs an uncancelled `timeout_ms=60000` wait with client timeout 65000, returns `timeout` at about 60006 ms, and preserves the cursor. The stdio discovery test emits `STDIO_WAIT_EVIDENCE` for the same observe → write → wait → read flow, then uses a fresh baseline and a pending barrier for cancellation; re-admission of two waiters proves the cancelled waiter was released. The cancellation envelope assertion requires an actual rejected call (or no structured result). It also records transport-disconnect timing. A test-only in-memory MCP server harness emits `SERVER_DISCONNECT_CLEANUP_EVIDENCE` from an instrumented backend counter before shutdown (`admitted:1, cleaned:1, active:0`), proving server-side waiter cleanup without a public diagnostic tool. Unit evidence includes serialized two-batch sampling across distinct observer creation, concurrent observe coalescing, slow-sampler gap persistence, quiet-threshold completion coverage, active expiry/eviction, pre-aborted cancellation, scope revalidation, replacement-safe disposal, bounded token acquisition and a negative control that would violate the closed-observer invariant when disposal is disabled. Web-host wake-up behavior remains unverified by design.
