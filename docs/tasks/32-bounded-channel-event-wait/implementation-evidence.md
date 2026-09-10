# Attempt 7 implementation evidence

The implementation is bound to the Candidate SHA reported in the Issue execution report and PR for Attempt 7.

Current package metadata and lockfile declare v0.2.0, matching the frozen feature target. The historical v0.1.1 release note is preserved; no tag or formal release is created by this Attempt.

Implemented surface:

- `get_channel({observe:true})` returns an opaque leased cursor, channel instance and `snapshot_change` model.
- `wait_channel_event` is the sole seventh public tool. It uses shared per-channel sampling, bounded ring history and `next_cursor` continuation semantics.
- Tmux sampling brackets a bounded capture with pane/server `/proc` identity and visibility checks. Missing panes use scoped inventory bracketed by stable server-generation checks; no capture is attempted for an absent pane.
- Waiters enforce idle/timeout bounds, per-channel/global limits, cancellation cleanup and explicit continuity/backend errors. Request lifetime has independent deadline and poll timers; both are cleared on every completion. Sampling work is serialized through a cancellable, bounded global queue, and completion validation rechecks expiry, freshness, failure, closure and sequence before returning idle.

Evidence commands executed on Linux with tmux and the pinned MCP SDK:

```text
npm run typecheck
npm test
npm run test:integration
npm run test:discovery
npm run test:dogfood
git diff --check
```

The real-host integration emits `TDX_WAIT_EVIDENCE` with `output_idle`, `snapshot_change`, elapsed quiet window and an advancing continuation cursor. A dedicated real stdio/tmux run (`STDIO_60S_TIMEOUT_EVIDENCE`) performs an uncancelled `timeout_ms=60000` wait with client timeout 65000, returns `timeout` and preserves the cursor. The stdio discovery test emits `STDIO_WAIT_EVIDENCE` for the same observe → write → wait → read flow, then uses a fresh baseline and a pending barrier for cancellation. Attempt 5's fixture-only SIGTERM evidence is superseded: Attempt 6 runs the real production entrypoint with a test-only Unix-socket lifecycle observer and verifies both raw stdin EOF and SIGTERM independently; each records `admitted → cleaned(active=0) → child exit` before harness teardown. The production entrypoint now installs one idempotent shutdown path shared by EOF and signals, and closes the test observer socket during shutdown. The in-memory harness remains separately labeled `SERVER_DISCONNECT_CLEANUP_EVIDENCE` and is not used as stdio evidence. Unit evidence includes serialized two-batch sampling across distinct observer creation, concurrent observe coalescing, held-validation deadline/cancellation, independent timer cleanup, multi-wake serialization, cancellable queue saturation, slow-sampler gap persistence, quiet-threshold completion coverage, active expiry/eviction, pre-aborted cancellation, scope revalidation, replacement-safe disposal, bounded token acquisition and a disposal-disabled negative control. Web-host wake-up behavior remains unverified by design.
