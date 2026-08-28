# Task — Remote MCP deployment / tunnel integration — NOT PLANNED

## Status

```text
GitHub Issue: #11
Decision: NOT_PLANNED
Execution authority: none
```

This Task Package is retained only as historical planning evidence.

## Architecture correction

`agent-runtime-mcp` owns generic MCP/Channel capabilities:

```text
list_channels
get_channel
read_channel
write_text
send_control
health
```

It does **not** own:

```text
remote deployment
tunnel/provider integration
network reachability
TLS / DNS / firewall
workspace/client authorization topology
provider credential lifecycle
host/process supervision
```

Those are deployment/operator concerns and are not product acceptance criteria.

The earlier Secure MCP Tunnel planning in this file was a planning drift beyond the accepted product boundary from Issue #6.

## Consequence

- Issue #11 is closed `not_planned`.
- No Worker should claim or execute this Task.
- No tunnel/client environment verification is required for the MCP product.
- A future deployment project may reuse the historical ideas independently, but it must not redefine the Channel product.
- Product validation continues with Issue #12, which may use a local stdio MCP client/harness and has no remote-deployment dependency.
