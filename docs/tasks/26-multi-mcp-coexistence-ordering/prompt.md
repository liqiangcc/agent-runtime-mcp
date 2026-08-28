# Bootstrap — Issue #26 fresh GPT coexistence matrix

This Task does **not** use the normal Web Worker `@GitHub first → claim` bootstrap for its primary matrix rows.

Read the durable Contract first:

- Issue #26
- `docs/tasks/26-multi-mcp-coexistence-ordering/task.md`
- `docs/tasks/handoffs/fresh-gpt-matrix.md`

The original Coordinator owns GitHub state and attribution. Each matrix row is run in a separate fresh GPT conversation and must preserve the exact provider order.

## Row A prompt — GitHub only

```text
@GitHub

这是 Issue #26 的 fresh-conversation matrix Row A。
不要调用 agent-runtime-mcp。

请实际读取 liqiangcc/agent-runtime-mcp 的仓库信息，证明 @GitHub provider/tool invocation 是否成功。

只报告：
Row A
Fresh conversation: yes
GitHub actual invocation: PASS | FAIL
Failure class: <success / tool-binding-unavailable / invocation-rejected / provider-error / timeout / other>
Sanitized visible error: <如有>

不要执行仓库修改。
```

## Row B prompt — agent-runtime-mcp only

```text
@agent-runtime-mcp

这是 Issue #26 的 fresh-conversation matrix Row B。
不要调用 GitHub。

请实际调用 agent-runtime-mcp 的 public tool（优先 health；如果没有 health 则 list_channels），证明 provider/tool invocation 是否成功。

只报告：
Row B
Fresh conversation: yes
agent-runtime-mcp actual invocation: PASS | FAIL
Tool used: <health/list_channels/...>
Failure class: <success / tool-binding-unavailable / invocation-rejected / provider-error / timeout / other>
Sanitized visible error: <如有>

不要执行终端写入或控制。
```

## Row C + E prompt — agent first, GitHub second

```text
@agent-runtime-mcp @GitHub

这是 Issue #26 的 fresh-conversation matrix Row C，必须严格保持顺序。

1. 第一项实际调用必须是 agent-runtime-mcp public tool（优先 health；否则 list_channels）。在它成功之前，不要调用 GitHub。
2. agent-runtime-mcp 成功后，在同一个 GPT 会话中实际调用 @GitHub 读取 liqiangcc/agent-runtime-mcp 仓库信息。
3. 如果 GitHub 失败，立即执行 Row E：在同一个会话再次实际调用 agent-runtime-mcp 的同一个只读 public tool，判断它是否仍可用。
4. 不要修改 GitHub 仓库，不要 write_text/send_control。

只报告：
Row C
Fresh conversation: yes
Step 1 agent-runtime-mcp: PASS | FAIL
Step 1 tool: <...>
Step 2 GitHub: PASS | FAIL
Step 2 failure class: <success / tool-binding-unavailable / invocation-rejected / provider-error / timeout / other>
Sanitized visible error: <如有>
Row E survivor probe: PASS | FAIL | n/a
Row E failure class: <...>
```

## Row D prompt — GitHub first, agent second

```text
@GitHub @agent-runtime-mcp

这是 Issue #26 的 fresh-conversation matrix Row D，必须严格保持顺序。

1. 第一项实际调用必须是 @GitHub：读取 liqiangcc/agent-runtime-mcp 仓库信息。在 GitHub 成功之前，不要调用 agent-runtime-mcp。
2. GitHub 成功后，在同一个 GPT 会话中实际调用 agent-runtime-mcp 的只读 public tool（优先 health；否则 list_channels）。
3. 不要修改 GitHub 仓库，不要 write_text/send_control。

只报告：
Row D
Fresh conversation: yes
Step 1 GitHub: PASS | FAIL
Step 2 agent-runtime-mcp: PASS | FAIL | n/a
Step 2 tool: <...>
Failure class: <success / tool-binding-unavailable / invocation-rejected / provider-error / timeout / other>
Sanitized visible error: <如有>
```

## Row F prompt — GitHub fresh-conversation recovery

Run only after Row C failed at GitHub.

```text
@GitHub

这是 Issue #26 的 fresh-conversation matrix Row F。
Row C 的另一个会话里 GitHub 已失败；这个会话必须是全新 GPT conversation。

请实际读取 liqiangcc/agent-runtime-mcp 仓库信息，判断 GitHub 是否在新会话立即恢复。
不要调用 agent-runtime-mcp。

只报告：
Row F
Fresh conversation: yes
GitHub actual invocation: PASS | FAIL
Failure class: <success / tool-binding-unavailable / invocation-rejected / provider-error / timeout / other>
Sanitized visible error: <如有>
```

## Return path

把每个 row 的简短结果带回原 Coordinator 会话。

原 Coordinator 将把结果作为 `[MATRIX OBSERVATION]` 写入 Issue #26，并按 `task.md` 的 Outcome P / X / U Attribution Gate 判定下一步。

不要让 row conversation 自己修改 Issue #26；尤其 Row C 不能先用 GitHub claim，因为那会破坏主要复现顺序。
