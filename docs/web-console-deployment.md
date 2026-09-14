# Web Console — operator deployment guide

This guide describes how to run the Web Console (`console/`) as a tailnet-facing
service. It is the operational counterpart of `docs/web-console-requirements.md`
and `docs/deployment.md`.

```text
browser (any tailnet device)
   ↓ HTTP over the Tailscale tailnet
Console server (console/)  ── stdio ──▶ agent-runtime-mcp (MCP child, seven public tools)
                                        ──▶ existing tmux panes in the configured scope
```

## 1. Trust model — read first

**The Console implements no user authentication, no roles, and no TLS of its
own.** Access control is delegated entirely to the Tailscale tailnet
(Coordinator decision, Issue #60; `docs/web-console-requirements.md §8`):

- Everyone who can reach the Console port can **read, write, control, attach
  (when Terminal View lands), and — if a lifecycle adapter is enabled —
  manage sessions**. There is no weaker "viewer" tier.
- Tailscale already provides device/user identity, WireGuard encryption, and
  ACLs; the Console deliberately does not re-implement them.
- The only Console-side control is the **bind guard**: the process refuses to
  listen on anything except loopback or an address assigned to a local
  Tailscale interface (`100.64.0.0/10`, `fd7a:115c:a1e0::/48`). There is no
  override flag.
- `Origin`/`Host` checks on read and mutation routes prevent an unrelated
  website open in the same browser from driving the Console; they are a CSRF
  defense, **not** authentication.

If you need per-user permissions or a non-tailnet audience, put the Console
behind your own authenticating proxy on the tailnet — that is outside this
repository.

## 2. Prerequisites

- Node.js >=20 on the host (same ordinary user account as tmux; **no root**).
- `tmux` installed; the agent panes already exist (the MCP and the Console
  never create endpoints — see `docs/deployment.md §6`).
- `tailscaled` running and the host joined to your tailnet (`tailscale status`).
- Built artifacts:

```bash
npm ci && npm run build          # repository root → dist/src/server.js
cd console && npm ci && npm run build   # → console/dist/src/server.js
```

## 3. Bind to the host's Tailscale address

Find the machine's Tailscale IPv4 address and give it to the Console:

```bash
TS_IP="$(tailscale ip -4)"          # e.g. 100.x.y.z
CONSOLE_BIND="$TS_IP" CONSOLE_PORT=8080 \
  TMUX_SOCKET_NAME=agents \
  TMUX_ALLOWED_SESSIONS='devin,codex,claude' \
  node console/dist/src/server.js
```

Bind rules (enforced at startup — the process refuses to start otherwise):

| `CONSOLE_BIND` | Result |
|---|---|
| `127.0.0.1` (default) | loopback only — for local use or an SSH port-forward |
| the host's assigned `100.64.0.0/10` or `fd7a:115c:a1e0::/48` address | reachable from the tailnet |
| `0.0.0.0`, `::`, or any non-Tailscale LAN/WAN address | **refused** — no override |

Because the bind is a *specific interface address*, the Console is reachable
only through Tailscale even on a multi-homed host — it never listens on the
public interface.

## 4. Restrict who may reach it — tailnet ACLs

Tailnet membership alone lets every device on the tailnet reach the port. Use
an ACL to narrow that. Example (`tailscale policy file`) granting only a
specific group access to tagged Console hosts on port 8080:

```json
{
  "tagOwners": { "tag:console": ["group:ops"] },
  "groups": { "group:console-users": ["alice@example.com", "bob@example.com"] },
  "acls": [
    {
      "action": "accept",
      "src": ["group:console-users"],
      "dst": ["tag:console:8080"]
    }
  ]
}
```

Then run tailscaled on the Console host with `--advertise-tags=tag:console`
(and set `tag:console` on the node via `tailscale up --advertise-tags=tag:console`
or the admin console). Everyone else on the tailnet gets no route to the port.

Alternatives that stay inside the deployment layer:

- `tailscale serve` / an authenticating reverse proxy in front of
  `CONSOLE_BIND=127.0.0.1` for SSO-style access;
- SSH port-forward (`ssh -L 8080:127.0.0.1:8080 host`) for ad-hoc single-user
  access — keep `CONSOLE_BIND=127.0.0.1` in that case.

## 5. tmux scope and protected sessions

The Console passes `TMUX_*` variables through to its MCP child — the same
configuration the MCP documents (`docs/deployment.md`):

| Variable | Meaning |
|---|---|
| `TMUX_SOCKET_NAME` (or `TMUX_SOCKET_PATH`) | which tmux server/socket the Console may see |
| `TMUX_ALLOWED_SESSIONS` | comma-separated session allowlist; everything else is invisible |

Run the Console and the agent panes under a dedicated socket
(`tmux -L agents …`) so the Console can only ever see that socket, and keep
the allowlist explicit — the session list, history, sends, and controls are
all bounded by it. The deny-by-default posture means a session not on the
list is unreachable even if someone guesses its `channel_id`.

## 6. systemd user service

A per-user unit (no root), started after tailscaled:

```ini
# ~/.config/systemd/user/web-console.service
[Unit]
Description=agent-runtime-mcp Web Console
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=%h/agent-runtime-mcp
# this host's Tailscale IP
Environment=CONSOLE_BIND=100.x.y.z
Environment=CONSOLE_PORT=8080
Environment=TMUX_SOCKET_NAME=agents
Environment=TMUX_ALLOWED_SESSIONS=devin,codex,claude
ExecStart=/usr/bin/node console/dist/src/server.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now web-console
loginctl enable-linger "$USER"   # keep it running without a login session
journalctl --user -u web-console -f
```

A *user* manager does not order against the system `tailscaled.service` unit,
so no `tailscaled.service` appears above: operators must ensure Tailscale is
up and the address is assigned before the Console starts — otherwise the bind
guard refuses to listen (fail-safe, not a silent fallback). Adjust for distro
paths (`/usr/bin/node`). `Restart=on-failure` only restarts the Console
process — it never causes tmux endpoint recreation; endpoints stay owned by
the deployment layer.

## 7. Configuration reference

| Variable | Default | Notes |
|---|---|---|
| `CONSOLE_BIND` | `127.0.0.1` | loopback or an assigned Tailscale address only |
| `CONSOLE_PORT` | `8080` | 1–65535 |
| `CONSOLE_MCP_ENTRY` | `../dist/src/server.js` | path to the built MCP server |
| `CONSOLE_MCP_REQUEST_TIMEOUT_MS` | `10000` | adapter timeout, ≤ 120000 ms |
| `CONSOLE_HISTORY_MAX_LINES` / `CONSOLE_HISTORY_MAX_BYTES` | `5000` / `2 MiB` | per-Channel in-memory history ring |
| `CONSOLE_HISTORY_MAX_CHANNELS` | `4` | simultaneously observed Channels (≤ 8) |
| `CONSOLE_OBSERVE_IDLE_MS` | `1000` | `wait_channel_event` idle bound (250–60000) |
| `CONSOLE_OBSERVE_TIMEOUT_MS` | `15000` | `wait_channel_event` timeout bound (100–60000) |
| `CONSOLE_OBSERVE_POLL_MS` | `2500` | polling fallback interval |
| `CONSOLE_TAIL_LINES` / `CONSOLE_TAIL_BYTES` | `400` / `256 KiB` | per-read tail bounds; bytes ≤ 1 MiB (public `read_channel` limit) |

## 8. Privacy and logs

- Console history is a **bounded in-memory ring per Channel** — nothing is
  written to disk. A restart clears it.
- Terminal output may contain secrets (T5); the Console never logs terminal
  payloads, request bodies, or auth material.
- Browser-side state stays on the device: bookmarks persist via localStorage;
  search text and scroll/reading position are in-page state only. None of it
  is sent to or stored by the server.

## 9. What is intentionally NOT provided

- **No authentication/authorization/users/roles** — the tailnet is the access
  boundary (see §1). Add an authenticating proxy if you need more.
- **No Console-managed TLS** — WireGuard encryption is provided by Tailscale.
- **No session creation/restart/destroy** — endpoints are prepared outside
  (`docs/deployment.md §6`); the Console never recreates them, even on failure.
- **No public Internet exposure** — the bind guard makes non-tailnet listens
  impossible; do not front it with a public ingress.
- **No WebSocket terminal attach** — the browser push path is read-only SSE;
  interactive Terminal View is a separate optional slice (#64).
- **No agent-aware parsing** — output is mechanical text; no prompt/role/task
  inference is performed or trusted.

## 10. Quick checklist

```text
[ ] host joined to tailnet; tailscale status shows healthy
[ ] dedicated tmux socket prepared (tmux -L agents) with agent panes running
[ ] TMUX_ALLOWED_SESSIONS lists only the sessions the Console may see
[ ] CONSOLE_BIND = the host's own tailscale ip -4 (or 127.0.0.1 + SSH/proxy)
[ ] tailnet ACL restricts dst to the Console host:port
[ ] systemd --user unit enabled; journal shows "refusing to listen" never fires
[ ] browse http://<tailscale-ip-or-MagicDNS>:8080 — session list shows allowed sessions only
    (plain HTTP inside the tailnet; HTTPS only if you add an operator proxy — see §4)
[ ] kill the tmux server once: UI shows backend unavailable and nothing is recreated
```
