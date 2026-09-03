#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: deployment/tmux-endpoint-keeper.sh <ensure|status>

Environment:
  TMUX_SOCKET_NAME      tmux -L socket name (default: agent-runtime when no path is set)
  TMUX_SOCKET_PATH      tmux -S socket path (mutually exclusive with TMUX_SOCKET_NAME)
  TMUX_KEEPER_SESSION   reserved keeper session name (default: agent-runtime-keeper)
EOF
}

fail() {
  echo "tmux-endpoint-keeper: $*" >&2
  exit 1
}

command_name="${1:-}"
case "$command_name" in
  ensure|status) ;;
  -h|--help)
    usage
    exit 0
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

socket_name="${TMUX_SOCKET_NAME:-}"
socket_path="${TMUX_SOCKET_PATH:-}"
keeper_session="${TMUX_KEEPER_SESSION:-agent-runtime-keeper}"

if [[ -n "$socket_name" && -n "$socket_path" ]]; then
  fail 'TMUX_SOCKET_NAME and TMUX_SOCKET_PATH are mutually exclusive'
fi
if [[ -z "$socket_name" && -z "$socket_path" ]]; then
  socket_name='agent-runtime'
fi
if [[ ! "$keeper_session" =~ ^[A-Za-z0-9_-]+$ ]]; then
  fail 'TMUX_KEEPER_SESSION must match [A-Za-z0-9_-]+'
fi

endpoint_args=()
if [[ -n "$socket_path" ]]; then
  endpoint_args=(-S "$socket_path")
  endpoint_description="path=$socket_path"
else
  if [[ ! "$socket_name" =~ ^[A-Za-z0-9._-]+$ ]]; then
    fail 'TMUX_SOCKET_NAME must match [A-Za-z0-9._-]+'
  fi
  endpoint_args=(-L "$socket_name")
  endpoint_description="name=$socket_name"
fi

tmux_endpoint() {
  tmux "${endpoint_args[@]}" "$@"
}

keeper_exists() {
  tmux_endpoint has-session -t "=$keeper_session" >/dev/null 2>&1
}

report_status() {
  if keeper_exists; then
    echo "tmux-endpoint-keeper: available endpoint=$endpoint_description keeper_session=$keeper_session"
    return 0
  fi

  if tmux_endpoint list-sessions >/dev/null 2>&1; then
    echo "tmux-endpoint-keeper: degraded endpoint=$endpoint_description keeper_session=$keeper_session reason=keeper-missing" >&2
  else
    echo "tmux-endpoint-keeper: unavailable endpoint=$endpoint_description keeper_session=$keeper_session reason=tmux-endpoint-unavailable" >&2
  fi
  return 1
}

if [[ "$command_name" == 'status' ]]; then
  report_status
  exit $?
fi

if keeper_exists; then
  echo "tmux-endpoint-keeper: unchanged endpoint=$endpoint_description keeper_session=$keeper_session"
  exit 0
fi

# Endpoint/session lifecycle is intentionally owned by this deployment helper,
# not by agent-runtime-mcp. A detached keeper session keeps the tmux server alive
# while application/worker sessions may be created and removed independently.
if tmux_endpoint new-session -d -s "$keeper_session" -n keeper; then
  echo "tmux-endpoint-keeper: created endpoint=$endpoint_description keeper_session=$keeper_session"
  exit 0
fi

# Concurrent supervisors may race to create the same keeper. Treat a confirmed
# winner as success; otherwise expose a real deployment failure.
if keeper_exists; then
  echo "tmux-endpoint-keeper: recovered-after-race endpoint=$endpoint_description keeper_session=$keeper_session"
  exit 0
fi

fail "failed to create keeper endpoint=$endpoint_description keeper_session=$keeper_session"
