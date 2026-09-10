# Issue #32 — proposed bounded Channel event-wait contract

This document is the detailed design companion to `task.md`. It is intentionally a proposal: canonical product documents remain unchanged until the Coordinator approves the surface and runs the Publication Gate.

## Recommendation in one sentence

Use optional `get_channel(observe:true)` to establish a lease-bound opaque cursor, add one `wait_channel_event` tool that waits for `output_idle` only after new `snapshot_change` activity, and share one bounded observer per Channel instance.

## Public shape

The existing six tools remain mechanically compatible except for the explicit additive contract update:

```text
list_channels
get_channel
read_channel
write_text
send_control
health
wait_channel_event
```

`get_channel` accepts `observe?: boolean = false`. `observe:false` has the existing shape. `observe:true` returns:

```json
{
  "channel": { "channel_id": "...", "capabilities": ["read", "write-text", "control", "observe"] },
  "observation": {
    "cursor": "opaque",
    "channel_instance": "opaque",
    "model": "snapshot_change",
    "issued_at": "2026-...Z",
    "valid_until": "2026-...Z",
    "continuity": "complete"
  }
}
```

`wait_channel_event` accepts:

```json
{
  "channel_id": "...",
  "after_cursor": "opaque",
  "idle_ms": 1000,
  "timeout_ms": 30000
}
```

The first release supports a fixed wait purpose: output activity followed by observed quiet. It does not expose a generic predicate, regex, command completion, or `wait_until_done` alias.

## Cursor and acknowledgement model

The cursor is a capability token containing (or mapping to) service-instance, observer-epoch, scope, tmux-server generation, Channel-instance and bounded sequence state. It is opaque and must be unguessable/authenticated.

The caller saves the pre-write cursor. The observer is already running or is started as part of cursor acquisition, so output that occurs before the wait request reaches the server is still eligible if it is retained in the bounded history.

Wait does not make the caller's watermark advance merely because it sampled something:

| wait outcome | `activity_observed` | `latest_cursor` | `next_cursor` | continuation |
|---|---:|---|---|---|
| `output_idle` | true | latest sample | latest sample | activity acknowledged |
| `timeout` | false or true | latest sample | original `after_cursor` | call again with original cursor |
| `channel_closed` | false or true | latest before close | original cursor, then invalid | fresh observe required |
| cancelled | n/a | n/a | n/a | original cursor remains usable |

This prevents a timeout from silently consuming a fast command's activity. `latest_cursor` is informational; only `next_cursor` is an acknowledgement cursor.

## State machine

```text
baseline cursor
     │
     ├─ no post-cursor activity ───────────────┐
     │                                         │ deadline
     │                                         └─ timeout (cursor unchanged)
     │
     ├─ activity retained in history ─→ activity-seen
     │                                  │
     │                                  ├─ new activity → refresh last activity
     │                                  ├─ quiet >= idle_ms → output_idle (advance)
     │                                  ├─ same-instance endpoint loss → channel_closed
     │                                  ├─ gap/identity uncertainty → explicit error
     │                                  ├─ cancel → release waiter
     │                                  └─ deadline → timeout (cursor unchanged)
     │
     └─ expiry/restart/gap → explicit error; never rebind
```

Priority is cancellation, continuity error, confirmed closure, idle threshold, timeout. Cancellation is a transport event and has no successful result body. A gap always wins over a potentially stale quiet interval.

## Observation model

The recommended tmux implementation samples structural pane identity and a bounded `capture-pane` snapshot at a fixed interval. A digest change is an activity event. This is a useful bounded signal for “something visibly changed” but not a raw byte stream.

The contract must explicitly state:

- two identical writes may be invisible if the bounded snapshot is unchanged;
- ANSI redraw/spinner behavior can create changes without durable output;
- high-rate output can be coalesced or missed between samples;
- sampling failure, overrun or ring eviction is a continuity gap;
- output_idle means “the sampler observed no snapshot change for the interval after at least one post-cursor change”, not “the process emitted no bytes”.

An exact byte observer is not required for this design draft and should be a separate decision because it changes buffering, lifecycle and security properties.

## Identity and fail-closed behavior

Do not use `%pane_id` as the sole identity:

1. bind the observer to the configured scope fingerprint;
2. record tmux server identity/generation in each sample;
3. record pane structural identity (pane ID plus session/window facts);
4. invalidate the observer on server restart or any uncertain sample gap;
5. if a pane disappears and later appears without proof of the same instance, return `CHANNEL_INSTANCE_CHANGED` (or equivalent) and require a new `observe:true` call.

No wait result may claim `channel_closed` when the backend is merely unavailable or when disappearance/reappearance cannot be attributed to the same server generation.

## Cancellation and lifetime

The server should pass the MCP request cancellation signal to the waiter. On abort/disconnect/deadline, remove the waiter from the shared observer and release all waiter-specific memory/timers. The observer lease may remain alive for subsequent calls during its finite validity window.

If the SDK/stdio host cannot expose cancellation, the implementation must still enforce its hard deadline and report the capability limitation; it must not retain unbounded abandoned waiters.

## Resource limits (candidate values)

These are proposal values, not verified host guarantees:

```text
idle_ms:       100..60_000
timeout_ms:    100..60_000, default 30_000
lease:         5 min default, 15 min maximum
sample period: 100 ms default, 50 ms minimum
history:       256 records or 64 KiB
waiters:       2 per Channel, 32 global
observer mem:  4 MiB global
```

The Coordinator must revise these values if the real host probe shows a smaller effective MCP/backend/client bound. “Host supports 60 s” cannot be claimed from code or YAML alone.

## Error and result vocabulary

Normal mechanical wait reasons:

```text
output_idle
timeout
channel_closed (only when same-instance closure is proven)
```

Explicit failures:

```text
OBSERVATION_UNSUPPORTED
CURSOR_INVALID
CURSOR_EXPIRED
OBSERVATION_GAP
CHANNEL_INSTANCE_CHANGED
WAITER_LIMIT
RESOURCE_EXHAUSTED
WAIT_ARGUMENT_INVALID
BACKEND_UNAVAILABLE / CHANNEL_NOT_FOUND (existing categories where applicable)
```

The final names may use the repository's existing `ChannelErrorCode` naming, but the distinctions must remain observable. `timeout` must not be encoded as `TIMEOUT` error because it is an expected bounded result.

## Verification matrix

| Area | Case | Expected evidence/result |
|---|---|---|
| contract | discovery | exactly seven tool names; observe capability and observe=false compatibility |
| cursor | baseline | cursor issued before write; service/scope/channel binding visible only through opaque values |
| cursor | fast command | activity before wait registration retained and explainable |
| idle | old static output | no post-cursor activity → timeout, never output_idle |
| idle | activity then pause | output_idle only after monotonic idle threshold |
| idle | continuous output | no immediate repeated returns; timeout or idle after actual quiet |
| observation | repeated text | limitation documented; no exact byte claim |
| observation | ANSI redraw | snapshot-change behavior documented and tested |
| continuation | timeout after activity | next_cursor remains original; continuation can observe pending activity |
| cancellation | client cancel/disconnect | waiter removed; later resource probe shows no leak |
| limits | per-channel/global caps | explicit WAITER_LIMIT/RESOURCE_EXHAUSTED; endpoint untouched |
| cursor lifecycle | expiry/gap | CURSOR_EXPIRED/OBSERVATION_GAP; fresh observe required |
| identity | tmux server restart | CHANNEL_INSTANCE_CHANGED or equivalent; no rebind |
| identity | pane disappears/reappears | fail closed unless same instance proven |
| backend | backend unavailable | explicit BACKEND_UNAVAILABLE, never channel_closed by guess |
| composition | wait→read | real MCP client receives mechanical result then bounded read |
| semantics | long silent command/waiting input | result remains output_idle/timeout only; no completed/success |
| host | supported wait upper bound | exact server/backend/client versions and elapsed timing; unknown if not proven |
| existing | six-tool regression | original read/write/control/health behavior and security tests still pass |
| scope | web wake-up | NOT_VERIFIED / out of scope; no claim of cross-round wake-up |

## Open decisions for Coordinator

1. Is `get_channel(observe:true)` the smallest acceptable acquisition surface, or is an explicit `observe_channel` tool clearer despite adding another public tool?
2. Is `snapshot_change` acceptable for the first backend, or is byte-level activity required before publication?
3. Should `channel_instance` be returned as a separate opaque field or remain only inside cursor/results?
4. Are timeout results with `latest_cursor` plus unchanged `next_cursor` sufficiently clear, or should the result omit `latest_cursor` to prevent accidental acknowledgement?
5. Which MCP SDK cancellation hook is authoritative for stdio and tunnel-hosted clients?
6. What finite idle/timeout/lease/sample/resource values pass the real host probe without exceeding client/tunnel limits?
7. Should an unavailable tmux server be reported as `BACKEND_UNAVAILABLE` even if a waiter had previously observed a pane, reserving `channel_closed` for confirmed same-server loss?
8. Which canonical docs must be changed in the same publication/implementation Task, and how is the seven-tool compatibility/version transition communicated?
