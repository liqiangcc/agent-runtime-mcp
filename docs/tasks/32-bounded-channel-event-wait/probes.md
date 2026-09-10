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

Reproduction snippet (the harness owns the temporary socket; `trap` only terminates that disposable tmux server):

```bash
probe_dir=$(mktemp -d)
sock="$probe_dir/tmux.sock"
trap 'tmux -S "$sock" kill-server >/dev/null 2>&1 || true' EXIT
tmux -S "$sock" -f /dev/null new-session -d -s probe 'sleep 60'
pane=$(tmux -S "$sock" list-panes -t probe -F '#{pane_id}' | head -n1)
row=$(tmux -S "$sock" display-message -p -F \
  '#{pid}|#{session_id}|#{window_id}|#{pane_id}|#{pane_pid}|#{session_name}|#{window_index}|#{pane_index}')
pid=${row%%|*}
statline=$(cat "/proc/$pid/stat")
rest=${statline#*) }
starttime=$(printf '%s\n' "$rest" | awk '{print $20}')
boot=$(cat /proc/sys/kernel/random/boot_id)
printf '%s|server_starttime=%s|boot_id=%s\n' "$row" "$starttime" "$boot"
tmux -S "$sock" kill-server
sleep 0.2
tmux -S "$sock" -f /dev/null new-session -d -s probe 'sleep 60'
tmux -S "$sock" display-message -p -F \
  '#{pid}|#{session_id}|#{window_id}|#{pane_id}|#{pane_pid}|#{session_name}|#{window_index}|#{pane_index}'
```

## Sampling cost probe

On the same disposable endpoint, 100 iterations were measured with `/usr/bin/time`:

```text
display-message identity + capture-pane: real 0.99 s, user 0.20 s, sys 0.48 s
capture-pane only:                        real 0.50 s, user 0.10 s, sys 0.24 s
display-message identity only:            real 0.49 s, user 0.09 s, sys 0.25 s
```

This is approximately 9.9 ms wall time and 6.8 ms CPU per identity-plus-snapshot pair on this host. A 100 ms multi-subprocess sampler is therefore not a free default: concurrency must be bounded. The v0.2.0 contract fixes a 250 ms interval with two global sampling subprocess batches; this is an implementation ceiling, not a web-host performance claim.

Reproduction loop:

```bash
/usr/bin/time -f 'display+capture_100 real=%e user=%U sys=%S' sh -c \
  'for i in $(seq 1 100); do tmux -S "$1" display-message -p -t "$2" -F "#{pid}|#{pane_id}|#{pane_pid}|#{session_id}|#{window_id}" >/dev/null && tmux -S "$1" capture-pane -p -J -t "$2" -S -200 >/dev/null; done' \
  sh "$sock" "$pane"
```

## Cancellation / disconnect probe

Pinned SDK packages: `@modelcontextprotocol/server@2.0.0` and `@modelcontextprotocol/client@2.0.0`. A synthetic tool callback registered with `McpServer` waited on `ctx.mcpReq.signal` over an `InMemoryTransport` linked pair.

Client abort after a deliberate 100 ms delay produced (the post-trigger field is the measured cleanup latency):

```text
client error: SdkError (reason "probe cancel", code REQUEST_TIMEOUT)
handler entered: true
handler signal aborted: true
total from start: 104 ms; post-trigger cleanup: 2 ms
```

Closing the client transport while the callback was pending, after the same deliberate 100 ms delay, produced:

```text
handler entered: true
handler signal aborted: true
total from start: 101 ms; post-trigger cleanup: 1 ms
```

The SDK source confirms that stdio/in-memory cancellation sends `notifications/cancelled`, the server maps it to the matching request `AbortController`, and transport close aborts all in-flight handlers. The implementation must register waiter removal on `ctx.mcpReq.signal`; inability to deliver that signal on a supported transport is a blocker, not a degraded success path. These probes use `InMemoryTransport` only; they are not stdio or web-host acceptance.

Reproduction snippet (Node 22 + SDK 2.0.0):

```bash
node --input-type=module -e 'import { McpServer } from "@modelcontextprotocol/server"; import { Client, InMemoryTransport } from "@modelcontextprotocol/client"; import { z } from "zod"; const [ct,st]=InMemoryTransport.createLinkedPair(); const server=new McpServer({name:"probe",version:"0"}); server.registerTool("wait_probe",{inputSchema:z.object({})},async (_args,ctx)=>await new Promise(resolve=>ctx.mcpReq.signal.addEventListener("abort",()=>resolve({content:[{type:"text",text:"aborted"}],isError:true}),{once:true}))); await server.connect(st); const client=new Client({name:"probe",version:"0"}); await client.connect(ct); const ac=new AbortController(); const pending=client.callTool({name:"wait_probe",arguments:{}},{signal:ac.signal}).catch(e=>e); setTimeout(()=>ac.abort("probe cancel"),100); console.log((await pending).name); await server.close();'
```

## Probe limits

These are feasibility observations, not implementation or acceptance evidence. They do not prove the final wait hard maximum, client/tunnel timeout, exact snapshot coverage, or application completion. A later implementation Evidence run must repeat the probes against the supported real MCP/backend host and record exact Candidate SHA.
