# Task 32 — bounded Channel event wait (frozen implementation Contract)

> **Activation condition:** this Contract is frozen for implementation preparation, but remains non-claimable until the Coordinator passes the Publication Gate, moves Issue #32 to `status:ready`, and the authorized Codex executor successfully claims an Attempt.

## Metadata

```text
GitHub Issue: #32
Task ID: 32-bounded-channel-event-wait
Task kind: combined implementation + verification (frozen Contract; activation pending)
Target feature version: v0.2.0
Base commit: 1f2ad6579d4fb18cdbb8f7cb2c92630aa5d100d6
Candidate commit: n/a (design branch only)
Session bootstrap: docs/tasks/32-bounded-channel-event-wait/prompt.md
Executor route: coordinator-authorized-codex-a (the existing tmux `a` session)
Environment: env:codex
Handoff profile: docs/tasks/handoffs/codex.md (reference for the post-claim execution)
Required capabilities: github-read-write, repository-code-authoring, github-actions-evidence, real-tmux-host-evidence
Hard dependencies: Coordinator approval of the public-contract extension; canonical-main alignment before publication
```

Live Task state belongs in GitHub Issue/comments, not this file.

## Goal

Add one backend-neutral, bounded `wait_channel_event` capability that waits for mechanically observed Channel output activity to become quiet, while preserving explicit Channel addressing, bounded reads, external endpoint lifecycle, and upper-layer interpretation. The operation must never claim application completion or success.

## Primary Use Case

```text
Actor: upper-layer Coordinator/client using an existing terminal Channel
Trigger: a caller is about to write a command and wants one bounded wait after it
         without polling read_channel in a tight loop
Preconditions:
  - the endpoint already exists within the configured backend scope;
  - the caller obtains an observation cursor before write_text;
  - the caller keeps the opaque cursor and Channel instance context;
  - the caller is prepared to call read_channel after a mechanical wait result.
Main flow:
  1. get_channel({channel_id, observe:true}) creates/joins the shared observer and
     returns an opaque cursor baseline;
  2. the upper layer calls write_text (outside this wait operation);
  3. the upper layer calls wait_channel_event with that cursor, an idle threshold,
     and a finite timeout;
  4. the observer reports a new mechanically observed activity interval, then
     output_idle after the threshold; the caller calls read_channel and interprets
     the bounded text outside the MCP.
Success outcome:
  - an activity event after the supplied cursor was observed and the observer saw
    no further snapshot activity for idle_ms; the result carries the next cursor.
Failure outcome:
  - continuity loss, cursor expiry/gap, backend/server identity change, or an
    unproven pane disappearance/reappearance is explicit and never rebound;
  - a confirmed endpoint disappearance may return channel_closed;
  - malformed arguments or resource limits return structured errors.
Degraded outcome:
  - timeout is a normal mechanical result, not an execution failure; it preserves
    the caller's unconsumed cursor so a continuation can wait again;
  - snapshot observation is explicitly best-effort: it cannot prove byte-level
    silence, capture every repeated byte, or distinguish all redraws;
  - unsupported host cancellation/long-wait behavior remains NOT_VERIFIED until
    tested with a real client/server/backend host.
Authoritative evidence:
  - exact Candidate SHA and Actions jobs for unit/integration/MCP checks;
  - real tmux/Linux host evidence for sampling and endpoint lifecycle cases;
  - a real MCP client/server/backend timing probe for the wait upper bound;
  - canonical product contract and discovery evidence after the explicit surface
    extension is accepted.
```

## Why this is one coherent Task

Cursor acquisition, bounded waiting, observer lifetime, continuity handling, public-tool discovery and the tmux sampling adapter jointly define one externally visible wait capability. Splitting them would permit an unsafe cursor contract (or a wait tool that cannot prove what it observed) to be accepted independently of the public MCP surface and backend evidence.

## Separation Points

```text
upper-layer orchestration | Channel MCP
```

The upper layer chooses when to observe, write, wait again, read, interpret output, retry, recover or stop. The MCP only reports bounded mechanical observation facts. No `completed`, `success`, `done`, `blocked` or application-specific reason crosses this boundary.

```text
observation cursor/state | terminal output正文
```

The cursor is an opaque capability/watermark, not a read offset and not a request to return terminal text. `read_channel` remains the bounded output path.

```text
observer | waiters
```

One bounded observer is shared per Channel instance. Waiters register against it and are independently cancellable. A waiter does not create a second sampler or mutate the endpoint.

```text
backend identity/continuity | tmux mechanics
```

The TmuxBackend supplies structural identity and snapshot samples. A tmux server restart, pane disappearance, or unproven pane recreation invalidates the observer; it must not silently attach a cursor to a reused pane ID.

```text
execution evidence | acceptance authority
```

GitHub Actions and real host runs provide evidence. The Coordinator decides whether the Contract and evidence are accepted; an observed idle interval is not Task acceptance.

## Single Responsibilities

```text
get_channel(observe=true) = establish/return observation baseline and lease
wait_channel_event        = bounded wait over an existing cursor; no writes
shared observer            = sample bounded backend activity and retain finite history
cursor validator           = enforce scope/service/observer/channel-generation continuity
TmuxBackend                = map structured tmux facts and bounded snapshots
read_channel               = return bounded terminal text after the wait
upper layer                = write, interpret, retry/recover and decide workflow meaning
GitHub Actions / host      = execute verification and provide evidence
Coordinator                = freeze contract, review evidence and accept/revise/block
```

## Logic / Control Separation

Logic/data path owns:

- cursor format validation and binding to service instance, observer epoch, Channel instance and sequence watermark;
- activity sampling and the definition of `output_idle` under the selected observation model;
- monotonic-clock timeout/idle calculations;
- bounded event history, continuity/gap detection and mechanical errors;
- cancellation cleanup of a waiter;
- structured wait result with no terminal正文.

Control/orchestration owns:

- when to create an observation baseline and when to call `write_text`;
- whether and how to continue after `timeout`;
- whether to call `read_channel`, interpret output, retry a wait, or recover an endpoint;
- endpoint/process lifecycle and any application/Task meaning;
- release/Review/Publication Gate decisions.

## Proposed Public Contract (requires Coordinator freeze)

### Surface

1. Extend `get_channel` with optional `observe: boolean` (default `false`). Existing calls retain their current response shape and behavior when omitted/false. With `observe:true`, the server returns a bounded observation lease and cursor.
2. Add exactly one public tool: `wait_channel_event`.
3. Add `observe` to a Channel's advertised capabilities only when the configured backend can supply the selected observation model. Update discovery expectations from six to seven tools as one atomic contract change; do not claim “six tools unchanged”.

The proposed seven public tools are:

```text
list_channels
get_channel
read_channel
write_text
send_control
health
wait_channel_event
```

### Cursor acquisition

```text
get_channel {
  channel_id: string,
  observe?: boolean
}

get_channel(observe=true) response addition {
  observation: {
    cursor: string,                 // opaque; never parsed by callers
    channel_instance: string,       // opaque correlation value
    model: "snapshot_change",
    issued_at: string,              // UTC ISO-8601 wall time
    valid_until: string,            // UTC ISO-8601 wall time; finite lease expiry
    continuity: "complete"
  }
}
```

The `channel_instance` is not an application identity. It binds only the observed backend endpoint generation. A fresh `observe:true` call is required after service restart, observer expiry, continuity gap, server restart, or any uncertain pane disappearance/recreation.

### Wait input

```text
wait_channel_event {
  channel_id: string,
  after_cursor: string,
  idle_ms: integer,                // bounded, finite, monotonic-clock based
  timeout_ms: integer               // bounded server-side hard deadline
}
```

The v0.2.0 implementation waits for `output_idle`; an `output_changed` filter is deliberately not part of the minimum API because continuously emitting Channels would otherwise cause repeated immediate returns. `idle_ms` is default 1,000 ms with range 250..60,000; `timeout_ms` is default 30,000 ms with range 100..60,000. These are server limits to verify on the Candidate, not a promise about any web host.

### Wait result

```text
{
  reason: "output_idle" | "timeout" | "channel_closed",
  channel_id: string,
  channel_instance: string,
  observed_at: string,                // UTC ISO-8601 wall time; monotonic time is internal
  next_cursor: string,               // caller continuation/acknowledgement cursor
  activity_observed: boolean,
  first_activity_at?: string,         // UTC ISO-8601 wall time
  last_activity_at?: string,          // UTC ISO-8601 wall time
  observation_model: "snapshot_change",
  idle_ms: integer,
  timeout_ms: integer
}
```

Cursor consumption rules are part of the safety contract:

- `output_idle` requires at least one activity observation strictly after `after_cursor`; `next_cursor` advances to the last retained activity sequence and acknowledges the interval.
- `timeout` never acknowledges activity. `next_cursor` remains equal to `after_cursor`, even if the observer internally sampled changes. A caller may continue with the same cursor; it must not be forced to skip activity merely because the waiter deadline elapsed. No `latest_cursor` is exposed.
- `channel_closed` is returned only when disappearance is mechanically confirmed within the same backend instance. The cursor is not reusable after closure; if reappearance cannot be proven to be the same Channel instance, the next operation fails explicitly.
- Cancellation returns no successful wait result. The waiter is removed, and a later call may reuse the original cursor. The observer itself remains alive within its finite lease.

The bounded history retains an `evicted_through` sequence `E`. A cursor `c` is valid at the ring boundary when `c >= E` (subject to binding and lease checks); `c < E` returns `OBSERVATION_GAP`. If the first retained event is `E+1`, cursor `E` remains valid. A pre-event baseline cursor `0` remains valid before event `1`. Eviction invalidates only affected old cursors/waiters; it does not invalidate the whole observer.

### State machine and precedence

```text
NO_OBSERVATION
  └─ get_channel(observe=true) → OBSERVING(cursor, instance, lease)

OBSERVING
  ├─ activity after cursor → ACTIVITY_SEEN(first_at, last_at)
  ├─ cursor/lease/gap/identity failure → EXPLICIT_ERROR (no rebind)
  ├─ confirmed same-instance endpoint loss → CLOSED
  └─ lease expires → EXPLICIT_ERROR (fresh observe required)

ACTIVITY_SEEN
  ├─ new activity → refresh last_at, remain ACTIVITY_SEEN
  ├─ now - last_at >= idle_ms → OUTPUT_IDLE (advance next_cursor)
  ├─ confirmed same-instance loss → CLOSED
  ├─ continuity gap/identity uncertainty → EXPLICIT_ERROR
  ├─ cancellation → waiter released, cursor unconsumed
  └─ deadline before idle → TIMEOUT (keep after_cursor)
```

Deterministic race precedence at a sampling boundary is:

```text
cancellation observed first → no result
continuity/identity failure → explicit error
confirmed channel closure → channel_closed
idle threshold satisfied → output_idle
deadline reached → timeout
```

Every sample carries monotonic `sample_started`, `sample_captured` and `sample_completed` timestamps. The waiter has an absolute monotonic deadline (`wait_started + timeout_ms`); a sample completed after that deadline cannot satisfy idle, even if its captured snapshot is quiet. A successful sample completion gap or sample-batch duration above 1,000 ms invalidates observation. A stale sample whose capture age exceeds the 1,000 ms freshness/overrun tolerance is a continuity gap. If the quiet threshold timestamp is not strictly before the deadline, `timeout` wins and `next_cursor` remains the input cursor; blocked backend calls cannot extend the deadline.

## Observation model and feasibility

### Recommended first model: bounded snapshot change

The shared tmux observer periodically samples a bounded, structured endpoint snapshot (for example, pane structural identity plus a bounded `capture-pane` view) and records a digest/change event with an internal monotonic timestamp. Public response times remain UTC ISO-8601 wall time. The public contract must say `snapshot_change`, not “all output bytes”.

Snapshot limitations are explicit:

- bounded capture cannot capture every byte emitted between samples;
- repeated identical output can produce no digest change;
- ANSI cursor movement/repainting can change a snapshot without representing new durable text;
- a snapshot that is unchanged does not prove that no bytes were emitted;
- sampler/backend failure creates a continuity gap, never a false idle result.

An exact byte-stream observer (for example a carefully isolated tmux pipe) is a separate design option and must not be smuggled in as an implementation detail. It would require its own lifecycle, buffering, security, and cleanup review.

### Channel-instance binding

The first tmux adapter must make identity executable on the supported Linux host. Each sample is read in this order:

1. invoke one structured `tmux -S <configured-socket> display-message -p -t <opaque-target> -F '<pid>|<session_id>|<window_id>|<pane_id>|<pane_pid>|<session_name>|<window_index>|<pane_index>'` command;
2. parse `pid` and read `/proc/<pid>/stat` field 22 (server process starttime) plus `/proc/sys/kernel/random/boot_id`;
3. validate pane fields and configured visibility, compare the complete tuple with the prior sample, then capture at most 200 lines/64 KiB only when the pane is present;
4. immediately repeat the identity and visibility reads; discard the capture and invalidate observation if any identity/scope check fails or changes.

The observer binds each cursor to:

```text
service_instance_id  = generated per MCP process start
observer_epoch       = increments whenever a shared observer is recreated
scope_fingerprint    = configured tmux socket/server visibility scope
tmux_server_identity = socket path + tmux server pid + Linux process starttime + boot_id
pane_identity        = server generation + pane ID (lifetime basis); session/window names and indices are mutable location metadata
sequence             = bounded observer watermark
```

The token is opaque and should be authenticated or unguessable; callers never construct it. Session names and window/pane indices are mutable location metadata, not lifetime identity. Tmux pane IDs alone are insufficient because a server restart can reset/reuse IDs. A pane process replacement is a new Channel instance unless continuity is explicitly proven. If the server identity changes, the observer is invalidated. A command failure or missing pane creates a gap; a later success after that gap cannot prove continuity, even when the pane id is reused, so fail closed with `CHANNEL_INSTANCE_CHANGED`/`OBSERVATION_GAP` and require a fresh cursor. If `/proc` identity reads are unavailable or contradictory, fail closed rather than downgrade identity. For confirmed closure, first perform a scoped inventory query bracketed by stable server-generation reads; if the authorized pane is absent in that inventory, return `channel_closed` without attempting target-specific capture. An unavailable/ambiguous server or unstable generation cannot prove closure and returns `BACKEND_UNAVAILABLE` or a continuity error instead.

Configured visibility is revalidated on every sample and at wait registration/completion. A pane moved or renamed out of the allowlist invalidates the observer and cannot retain authorization from an old lease.

### Observer lifetime and resources

Frozen v0.2.0 server ceilings (to verify on the Candidate; not web-host guarantees):

```text
cursor lease:            5 minutes (per token; never renewed by wait)
observer lifetime cap:   15 minutes from observer creation
sampling interval:       250 ms (fixed; no public tuning)
capture per sample:      200 lines or 64 KiB, whichever first
history per observer:    256 change records or 64 KiB, whichever first
waiters per Channel:     2
observers globally:      8 (one shared observer per Channel)
global active waiters:   16
global sampling batches: 2 subprocess batches
retained observer state: 4 MiB
transient subprocess buffers: separately bounded by implementation
idle_ms:                 250..60,000 (default 1,000)
timeout_ms:              100..60,000 (default 30,000)
```

The observer is created by `observe:true` and remains sampled, with zero waiters, until `valid_until`; a wait call does not extend the lease. A subsequent `observe:true` may extend retention only to `min(now + 5min, observer_created + 15min)` and always issues a new cursor; it never extends an old token. A cursor whose lease expires during an active wait returns `CURSOR_EXPIRED` and does not acknowledge activity. History is a bounded sequence ring with `evicted_through` watermark as defined above. On limit exhaustion, return `RESOURCE_EXHAUSTED`/`WAITER_LIMIT` without mutating the Channel. On cancellation, deadline, continuity failure or lease expiry, remove the waiter and release waiter-specific resources. Sampling is capped at two global batches and one sampler per Channel instance.

## Errors

Existing structured error handling remains in force. Add explicit mechanical categories (names may be normalized during Coordinator review):

```text
OBSERVATION_UNSUPPORTED     // backend cannot supply the selected model
CURSOR_INVALID              // malformed/wrong scope/service/observer binding
CURSOR_EXPIRED              // finite observation lease expired
OBSERVATION_GAP             // ring overflow, sampler overrun, or missed sample
CHANNEL_INSTANCE_CHANGED    // server restart or unproven pane recreation
WAITER_LIMIT                // per-channel/global waiter cap reached
RESOURCE_EXHAUSTED          // observer/history memory cap reached
WAIT_ARGUMENT_INVALID       // idle/timeout outside frozen finite bounds
```

`timeout` is a successful wait result, not a structured error. `channel_closed` is a successful mechanical reason only when same-instance loss is proven. Backend-unavailable or ambiguous disappearance remains an explicit backend/continuity error; it must not be relabeled as closure.

### Cancellation feasibility (pinned SDK)

The pinned `@modelcontextprotocol/server` and `@modelcontextprotocol/client` versions are `2.0.0`. A tool callback receives the request abort signal at `ctx.mcpReq.signal`; the client sends `notifications/cancelled` for stdio/in-memory transports, and the server aborts the matching handler controller. Disconnect/transport close also aborts in-flight handlers. The implementation must attach waiter cleanup to this signal and is not permitted to degrade cancellation to timeout-only behavior. The probe evidence is recorded in `probes.md`; any transport that does not deliver the signal remains a publication blocker rather than a silent degradation.

## In Scope

- freeze the wait/cursor public contract and publish the aligned canonical product docs before implementation;
- implement shared bounded observation and one `wait_channel_event` tool;
- add optional observation acquisition to `get_channel` without changing ordinary get behavior;
- update `ChannelCapability`/discovery and exact seven-tool MCP discovery evidence;
- implement tmux snapshot-change sampling with structural identity and fail-closed continuity;
- bound observer leases, history, waiters, sampling and server-side wait time;
- propagate client cancellation through `ctx.mcpReq.signal`; unsupported signal delivery is a blocker, not a degraded wait;
- test old six-tool behavior plus the explicit seven-tool contract and all failure/degradation cases.

## Out of Scope

- ChatGPT/web-session wake-up, notifications, reconnect/rebind or provider lifecycle;
- Worker/Agent/Task/Issue semantics or completion inference;
- any `wait_until_done` or success/completed result;
- raw shell/tmux public APIs;
- endpoint/session/process creation, restart, destruction or recovery;
- permanent terminal transcript/event storage or webhook/event-bus infrastructure;
- exact byte-stream guarantees beyond the selected observation model;
- automatic retry/re-send of non-idempotent writes;
- changing the MCP transport solely to support cancellation;
- claiming unverified host/client long-wait limits as supported.

## Architecture Invariants

- Channel remains the public domain object; no collaboration/application registry is added.
- Wait is read-only and never writes, sends control, creates, restarts or destroys endpoints.
- `output_idle` means observed snapshot quiet after new activity, never completed/success.
- Normal mutation addressing remains opaque `channel_id`; raw tmux target grammar is not exposed.
- Snapshot output is untrusted and bounded; wait results do not include full terminal正文.
- Cursor scope/lease/continuity are validated before returning a result; no silent rebind after tmux server restart or pane recreation.
- One observer is shared per Channel instance and all resource limits are finite.
- GitHub/Task/Worker semantics remain outside product code.

## Implementation Requirements (to freeze after review)

1. Add the public schema and discovery update atomically; list the exact seven tools in canonical docs and tests.
2. Make cursor acquisition explicit before the upper layer writes; document that the wait call itself cannot establish a retrospective baseline.
3. Define and test timeout cursor preservation, success cursor advancement, cancellation cleanup and lease expiry.
4. Bind cursor validation to service/observer/scope/tmux-server/Channel-instance generation and reject gaps/uncertain reappearance.
5. Use a monotonic clock for idle/deadline decisions and finite server-side bounds.
6. Make observer sharing and waiter/history/memory limits observable in tests without leaking terminal正文.
7. Keep snapshot limitations and host wait-capability evidence visible in release/contract docs.
8. Do not add product-owned endpoint lifecycle or application semantics as a workaround for observation gaps.

## Claims / Verification

```text
C1: The proposed seven-tool contract and get_channel(observe=true) shape are explicit and backward-compatible for observe=false.
C2: A cursor acquired before write detects activity that occurs before wait registration, subject to the selected snapshot model.
C3: output_idle requires new activity after the cursor; old static output or pre-cursor silence cannot satisfy it.
C4: timeout/cancel preserve unconsumed activity and do not retry or resend writes.
C5: cursor expiry, ring gap, service restart, tmux server restart and unproven pane reappearance fail explicitly without rebinding.
C6: one shared observer and finite leases/history/waiter/global memory caps prevent unbounded resource growth; cancellation releases waiters.
C7: snapshot_change limitations are documented and no exact byte-level silence claim is made.
C8: original six tools retain behavior while discovery and public surface are updated consistently to seven tools.
C9: real MCP client/server/backend evidence proves supported wait windows and read-after-wait composition; unsupported web-host wake-up remains unverified.
```

## Security Review

```text
Security-sensitive: yes
Threats: stale/replayed cursor, cross-scope/channel confusion, observer memory exhaustion, sensitive output leakage, endpoint identity confusion
Remote ingress affected: no new ingress; existing authentication/authorization boundary remains authoritative
```

Controls:

- opaque unguessable/authenticated cursor bound to configured scope and process/observer/channel generation;
- bounded capture, history, leases, sampling, waiters and hard deadlines;
- no full terminal output in wait responses or default logs;
- cancellation/deadline cleanup and fail-closed continuity errors;
- no lifecycle side effects and no raw tmux/shell API;
- real host verification records evidence limits rather than expanding claims.

## Success Criteria (freeze after Coordinator review)

1. SC1 — Design contract explicitly defines the proposed public tool, cursor acquisition, result reasons, state machine, error taxonomy, cancellation and resource bounds.
2. SC2 — Canonical product docs define the seven-tool target before implementation publication; discovery-test changes and runtime evidence accompany the later implementation Candidate.
3. SC3 — Pre-write cursor + fast output before wait registration yields an explainable result; old silence alone never returns `output_idle`.
4. SC4 — `output_idle` requires new post-cursor activity and monotonic quiet duration; `timeout` preserves the original continuation cursor.
5. SC5 — Cancellation, waiter cleanup, observer lease expiry, limits, cursor expiry/gap and continuity races are verified.
6. SC6 — Tmux server restart, pane disappearance/recreation and pane-ID reuse are fail-closed with no silent binding.
7. SC7 — Snapshot limitations are tested/documented; no exact byte-stream guarantee is claimed.
8. SC8 — Existing six-tool behavior/security regression passes and updated discovery exactly matches the seven-tool contract.
9. SC9 — Real MCP client/server/backend host evidence verifies the supported wait window, wait→read flow and mechanical-only semantics; web-host wake-up remains explicitly NOT_VERIFIED.

## Failure / Blocked Rules

The implementation Attempt must return to the Coordinator with a `[BLOCKER REPORT]` when:

- the Coordinator has not frozen the public-contract/canonical-doc revision;
- the MCP SDK does not expose a safe cancellation signal or transport cleanup hook;
- the backend cannot provide a bounded, auditable observation model;
- server/pane identity continuity cannot be established after restart or disappearance;
- Candidate/host evidence cannot verify the frozen server ceilings or required supported-host behavior;
- a required test would need endpoint lifecycle or application semantics inside MCP.

Do not lower SCs or label snapshot quiet as exact silence to avoid a blocker. A host/web timeout limitation is recorded as `NOT_VERIFIED`, not PASS.

## Publication Dependency / Alignment Gate

This is a frozen v0.2.0 implementation Contract. Canonical contract/design documents are published on this branch; seven-tool discovery tests, runtime wait acceptance, and host-support claims accompany the later implementation Candidate. The current six-tool implementation remains the baseline until that Candidate adds the seventh tool.

Activation requires the Coordinator to:

1. re-read the accepted `get_channel(observe=true)`/`wait_channel_event` direction and frozen cursor/error semantics;
2. confirm the aligned canonical documents and implementation Evidence route;
3. confirm no current main changes alter the Channel identity or six-tool baseline;
4. Confirm the Evidence route can verify frozen limits; actual Candidate verification occurs during implementation acceptance.
5. pass Publication Gate and transition the Issue to `status:ready + owner:none` before the authorized Codex executor in the `a` session claims an implementation Attempt.

## Evidence Contract

The future Worker Execution Report must include:

```text
Attempt / exact Candidate SHA / branch / PR
canonical docs changed and exact discovery contract
unit state-machine and cursor/continuity tests
MCP client/server cancellation evidence
real tmux snapshot/restart/recreate evidence
per-channel/global resource-limit and cleanup evidence
exact host wait probe: server/backend/client versions, bounds, elapsed timings
six-tool regression plus exact seven-tool discovery result
explicit snapshot limitations and web-host capability NOT_VERIFIED status
```

This frozen Contract contains no product Candidate or runtime PASS. Any later implementation must produce exact-SHA Actions and host evidence before Coordinator Review.
