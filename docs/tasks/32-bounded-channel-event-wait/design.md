# Issue #32 — proposed bounded Channel event-wait contract

This document is the detailed design companion to `task.md`. It records the Coordinator-accepted direction for canonical publication, while implementation, discovery-test execution and Publication Gate readiness remain pending.

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

`issued_at`, `valid_until`, `observed_at`, `first_activity_at` and `last_activity_at` are UTC ISO-8601 wall-clock strings. Monotonic timestamps are internal implementation fields only.

`wait_channel_event` accepts:

```json
{
  "channel_id": "...",
  "after_cursor": "opaque",
  "idle_ms": 1000,
  "timeout_ms": 30000
}
```

The v0.2.0 release supports a fixed wait purpose: output activity followed by observed quiet. It does not expose a generic predicate, regex, command completion, or `wait_until_done` alias. Server limits are `idle_ms` default 1000/range 250..60000 and `timeout_ms` default 30000/range 100..60000.

## Cursor and acknowledgement model

The cursor is a capability token containing (or mapping to) service-instance, observer-epoch, scope, tmux-server generation, Channel-instance and bounded sequence state. It is opaque and must be unguessable/authenticated.

The caller saves the pre-write cursor. The observer is already running or is started as part of cursor acquisition, so output that occurs before the wait request reaches the server is still eligible if it is retained in the bounded history.

Wait does not make the caller's watermark advance merely because it sampled something:

| wait outcome | `activity_observed` | `next_cursor` | continuation |
|---|---:|---|---|
| `output_idle` | true | last retained activity sequence | activity acknowledged |
| `timeout` | false or true | original `after_cursor` | call again with original cursor |
| `channel_closed` | false or true | original cursor, then invalid | fresh observe required |
| cancelled | n/a | no result body | original cursor remains usable |

This prevents a timeout from silently consuming a fast command's activity. There is no public `latest_cursor`; only `next_cursor` is an acknowledgement cursor.

The history keeps `evicted_through = E`. Cursor `c >= E` is valid at the ring boundary; `c < E` returns `OBSERVATION_GAP`. Thus cursor `E` remains valid when the first retained event is `E+1`, and baseline cursor `0` remains valid before event `1`. Eviction affects only cursors/waiters older than `E`; it does not invalidate the observer globally.

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

Priority is cancellation, continuity error, confirmed closure, idle threshold, timeout. Cancellation is a transport event and has no successful result body. A gap always wins over a potentially stale quiet interval. Public response timestamps are UTC ISO-8601 wall time; samples carry monotonic start/capture/completion timestamps internally. Completion after the absolute deadline cannot win, a successful sample gap or batch duration above 1000 ms invalidates observation, and a quiet threshold not strictly before the deadline is `timeout`.

## Observation model

The recommended tmux implementation samples structural pane identity and a bounded `capture-pane` snapshot at a fixed 250 ms interval. A digest change is an activity event. This is a useful bounded signal for “something visibly changed” but not a raw byte stream.

The contract must explicitly state:

- two identical writes may be invisible if the bounded snapshot is unchanged;
- ANSI redraw/spinner behavior can create changes without durable output;
- high-rate output can be coalesced or missed between samples;
- sampling failure, overrun or ring eviction is a continuity gap;
- output_idle means “the sampler observed no snapshot change for the interval after at least one post-cursor change”, not “the process emitted no bytes”.

An exact byte observer is not required for this design draft and should be a separate decision because it changes buffering, lifecycle and security properties.

## Identity and fail-closed behavior

Do not use `%pane_id` as the sole identity:

1. invoke one structured `tmux -S <socket> display-message` query for pid, session/window/pane ids and pane pid;
2. read `/proc/<server-pid>/stat` field 22 and `/proc/sys/kernel/random/boot_id`;
3. compare socket path, server pid/starttime/boot id and pane structural tuple with the prior sample, and revalidate configured visibility;
4. capture at most 200 lines/64 KiB;
5. immediately repeat identity, `/proc` and visibility reads; discard the capture and invalidate observation on any mismatch/failure;
6. invalidate the observer on server restart or any uncertain sample gap;
7. if a pane disappears, return `channel_closed` only when both identity checks succeed, the server generation is unchanged and the authorized pane is absent; otherwise return `BACKEND_UNAVAILABLE`/`CHANNEL_INSTANCE_CHANGED`/`OBSERVATION_GAP`. A later appearance after a gap always requires fresh `observe:true`. Visibility is revalidated at wait registration and completion, so a pane moved/renamed out of the allowlist cannot keep an old lease authorized.

Session names and indices are mutable metadata, not lifetime identity. No wait result may claim `channel_closed` when the backend is merely unavailable or when disappearance/reappearance cannot be attributed to the same server generation. Exact probe output is in `probes.md`.

## Cancellation and lifetime

The server must pass the MCP request cancellation signal at `ctx.mcpReq.signal` to the waiter. On abort/disconnect/deadline, remove the waiter from the shared observer and release all waiter-specific memory/timers. The observer lease may remain alive for subsequent calls during its finite validity window. Pinned SDK 2.0.0 cancellation/disconnect probes passed; unsupported signal delivery is a blocker, not a timeout-only degradation.

If a supported SDK/transport cannot expose cancellation, the implementation Attempt is blocked; it must not silently degrade cancellation to timeout-only behavior. Deadline cleanup remains mandatory as an independent bound.

## Resource limits (v0.2.0 frozen ceilings)

These are frozen v0.2.0 server ceilings to verify on the Candidate, not web-host guarantees:

```text
idle_ms:       250..60_000, default 1_000
timeout_ms:    100..60_000, default 30_000
lease:         5 min default, 15 min maximum
sample period: 250 ms fixed, no public tuning
capture:       200 lines or 64 KiB per sample
history:       256 records or 64 KiB
observers:     8 global, one shared per Channel
waiters:       2 per Channel, 16 global
sampling:      2 global subprocess batches
observer mem:  4 MiB retained state; transient subprocess buffers separately bounded
```

The observer starts at `observe:true`, remains alive with zero waiters until `valid_until`, and a wait never renews it. A later `observe:true` can extend retention only to `min(now + 5 min, observer_created + 15 min)` and issues a new cursor; it never extends an old token. Lease expiry during an active wait returns `CURSOR_EXPIRED`; history eviction advances `evicted_through` and an older cursor returns `OBSERVATION_GAP`. A successful sample gap or batch overrun above 1000 ms invalidates observation. These ceilings are verified on the Candidate; they are not web-host support claims.

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
| continuation | timeout after activity | no latest cursor is exposed; next_cursor remains original and continuation can observe pending activity |
| ring boundary | `evicted_through=E`, cursor `E` | valid; first retained event `E+1` is observable |
| ring boundary | cursor `E-1` | `OBSERVATION_GAP`; unaffected cursors/observer remain usable |
| ring baseline | cursor `0` before event `1` | valid baseline |
| cancellation | client cancel/disconnect | waiter removed; later resource probe shows no leak |
| limits | per-channel/global caps | explicit WAITER_LIMIT/RESOURCE_EXHAUSTED; endpoint untouched |
| cursor lifecycle | expiry/gap | CURSOR_EXPIRED/OBSERVATION_GAP; fresh observe required |
| identity | tmux server restart | CHANNEL_INSTANCE_CHANGED or equivalent; no rebind |
| identity | pane disappears/reappears | fail closed unless same instance proven |
| identity | identity/visibility changes before or after capture | discard sample; explicit continuity error |
| closure | stable server, authorized pane absent before/after capture | confirmed `channel_closed` |
| backend | backend unavailable | explicit BACKEND_UNAVAILABLE, never channel_closed by guess |
| composition | wait→read | real MCP client receives mechanical result then bounded read |
| semantics | long silent command/waiting input | result remains output_idle/timeout only; no completed/success |
| host | supported wait upper bound | exact server/backend/client versions and elapsed timing; frozen server ceilings remain distinct from host support |
| existing | six-tool regression | original read/write/control/health behavior and security tests still pass |
| scope | web wake-up | NOT_VERIFIED / out of scope; no claim of cross-round wake-up |

## Resolved direction and remaining decisions

Coordinator direction is resolved: use `get_channel(observe:true)` plus exactly one `wait_channel_event`; use `snapshot_change`; expose opaque `channel_instance`; omit `latest_cursor`; preserve the input cursor on timeout; and keep `BACKEND_UNAVAILABLE` distinct from confirmed same-server `channel_closed`.

Remaining Publication Gate work is verification of the frozen v0.2.0 ceilings and canonical read-back. Seven-tool discovery/runtime tests and advertised host wait bounds belong to the later implementation Evidence, not this design publication.
