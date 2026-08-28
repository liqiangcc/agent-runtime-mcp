# Session Bootstrap — structured tmux Channel identity

You are a **Web GPT Worker in a separate GPT Web conversation** for Issue #23 in `liqiangcc/agent-runtime-mcp`.

Task Contract:

```text
docs/tasks/23-structured-tmux-channel-identity/task.md
```

Use `@GitHub` live state.

Expected executable state after Publication Gate:

```text
Issue: #23
Status: status:ready
Active owner: none
Environment: env:web-gpt
Worker route: separate-gpt-web-conversation
```

## Frozen purpose

Fix the Channel discovery/target-identification defect by preserving tmux-owned mechanical identity in the public Channel response.

Required additive shape:

```text
backend_metadata.tmux
├── session_name : string
├── window_id    : string
├── window_index : integer >= 0
├── pane_id      : string
└── pane_index   : integer >= 0
```

Every successfully returned `backend_kind: tmux` Channel must expose all five fields.

## Frozen acceptance scenario

```text
host session p1 -> pane %A
host session s2 -> pane %B
same title
same cwd
%B display contains misleading text mentioning p1

public list_channels
→ select p1 ONLY from backend_metadata.tmux.session_name
→ public get_channel returns same identity
→ public write_text(selected channel_id)
→ only %A mutates
→ %B remains untouched
```

Do not use `read_channel`, terminal output, shell prompt, tmux status text, title or cwd to choose the target in the acceptance selector.

A deterministic fake remote/nested-tmux display marker is sufficient; do not add a real SSH dependency merely to simulate misleading output.

## Rules

1. live-read Issue #23/comments, `AGENTS.md`, Task Contract, planning principles, `src/types.ts`, `src/tmux-backend.ts`, Channel/MCP/tmux docs, and relevant tests before claim;
2. confirm Publication Gate PASS, owner none and env:web-gpt;
3. claim exactly one Attempt as `web-gpt-worker`;
4. preserve the exact six public Tool names;
5. keep `channel_id` format and mutation routing unchanged;
6. keep `backend_locator` opaque/diagnostic; do not require callers to parse it;
7. preserve tmux `session_name`, `window_id`, `pane_id` as strings exactly from tmux;
8. parse `window_index` and `pane_index` as non-negative integers and fail closed on malformed required identity;
9. `session_name` is tmux mechanical metadata, never Worker/Task/Agent identity;
10. update canonical Channel/MCP/tmux documentation for the additive public response field;
11. add unit + real-tmux + public-MCP Evidence, including list/get consistency and the misleading-output target-selection/write-isolation scenario;
12. do not add session selectors to `write_text`; caller still mutates by opaque `channel_id`;
13. do not add tmux lifecycle, raw tmux command, application detection, SSH/nested-tmux parsing, Worker/Task mapping or deployment semantics;
14. preserve all existing CI including runtime deployment bundle and public dogfood;
15. finish with `[EXECUTION REPORT]` or `[BLOCKER REPORT]`, set `status:review` or `status:blocked`, clear owner, then STOP.

## Evidence required in report

```text
Base SHA
Candidate SHA
changed files
Tmux metadata field/type proof
list_channels public identity proof
get_channel consistency proof
p1/s2 isolated tmux fixture proof
misleading p1 text in s2 fixture proof
selector used backend_metadata only
write mutated only p1 target
exact six Tool proof
Actions run/jobs
Claims C1-C11
```

Do not Review/ACCEPT/merge/close the Issue yourself. Return Evidence to the Coordinator and STOP.
