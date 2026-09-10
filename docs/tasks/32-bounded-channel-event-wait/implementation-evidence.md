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

The real-host integration emits `TDX_WAIT_EVIDENCE` with `output_idle`, `snapshot_change`, elapsed quiet window and an advancing continuation cursor. The stdio discovery test emits `STDIO_WAIT_EVIDENCE` for the same observe → write → wait → read flow. Web-host wake-up behavior remains unverified by design.
