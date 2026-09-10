# Issue #32 feasibility probes

These probes are design evidence only. They used disposable tmux sockets/directories created by the harness; no configured production socket, the existing `a` channel, or another working session was queried or changed.

## Identity / restart probe

Host: Linux, Node `v22.23.2`, tmux `3.4`, 2026-09-10.

The harness created a private socket and one `probe` session, then sampled:

```text
tmux -S <socket> display-message -p -F
  '#{pid}|#{session_id}|#{window_id}|#{pane_id}|#{pane_pid}|#{session_name}|#{window_index}|#{pane_index}'
```

Before restart:

```text
server pid 1662237, server starttime 87996463, boot_id 5b25a75f-0de3-4b8e-9700-45b211325751
session $0, window @0, pane %0, pane pid 1662238
```

After `kill-server` and creating the same named session again:

```text
server pid 1662267, server starttime 87996492, boot_id 5b25a75f-0de3-4b8e-9700-45b211325751
session $0, window @0, pane %0, pane pid 1662268
```

Elapsed restart/recreate interval: `241 ms` in the first run and `~0.2 s` in this identity-source run. The pane id `%0`, session id `$0`, and window id `@0` were reused while the server pid and `/proc/<pid>/stat` starttime changed. Therefore pane id/session name/indexes cannot be lifetime identity. The probe read `/proc/<server-pid>/stat` field 22 and `/proc/sys/kernel/random/boot_id`; a failed or contradictory read is fail-closed.

## Sampling cost probe

On the same disposable endpoint, 100 iterations were measured with `/usr/bin/time`:

```text
display-message identity + capture-pane: real 0.99 s, user 0.20 s, sys 0.48 s
capture-pane only:                        real 0.50 s, user 0.10 s, sys 0.24 s
display-message identity only:            real 0.49 s, user 0.09 s, sys 0.25 s
```

This is approximately 9.9 ms wall time and 6.8 ms CPU per identity-plus-snapshot pair on this host. A 100 ms multi-subprocess sampler is therefore not a free default: concurrency must be bounded and the interval must remain provisional. The revised draft uses `250 ms` default / `100 ms` minimum and two global sampling subprocess batches as candidate values only; advertised support requires a real host acceptance probe.

## Cancellation / disconnect probe

Pinned SDK packages: `@modelcontextprotocol/server@2.0.0` and `@modelcontextprotocol/client@2.0.0`. A synthetic tool callback registered with `McpServer` waited on `ctx.mcpReq.signal` over an `InMemoryTransport` linked pair.

Client abort after 100 ms produced:

```text
client error: SdkError (reason "probe cancel", code REQUEST_TIMEOUT)
handler entered: true
handler signal aborted: true
abort latency from start: 106 ms
```

Closing the client transport while the callback was pending produced:

```text
handler entered: true
handler signal aborted: true
abort latency from start: 102 ms
```

The SDK source confirms that stdio/in-memory cancellation sends `notifications/cancelled`, the server maps it to the matching request `AbortController`, and transport close aborts all in-flight handlers. The implementation must register waiter removal on `ctx.mcpReq.signal`; inability to deliver that signal on a supported transport is a blocker, not a degraded success path.

## Probe limits

These are feasibility observations, not implementation or acceptance evidence. They do not prove the final wait hard maximum, client/tunnel timeout, exact snapshot coverage, or application completion. A later implementation Evidence run must repeat the probes against the supported real MCP/backend host and record exact Candidate SHA.
