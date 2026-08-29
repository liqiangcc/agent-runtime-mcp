# Bootstrap — Issue #26 delayed same-conversation coexistence matrix

This Task does **not** use the normal Web Worker `@GitHub first → claim` bootstrap for its primary delayed rows.

Read:
- Issue #26
- `docs/tasks/26-multi-mcp-coexistence-ordering/task.md`
- `docs/tasks/handoffs/fresh-gpt-matrix.md`

Immediate Row C0 and D0 have already passed and are controls. The revised primary variable is a real elapsed/idle period between first-provider use and the first invocation of the second provider in the same GPT conversation.

Do not make the model simulate waiting. Each delayed row is executed in two user-driven stages in the same conversation.

## Row C-delayed — Stage C1

Open a **new GPT conversation** and send:

```text
@agent-runtime-mcp

这是 Issue #26 的 delayed Row C，Stage C1。

1. 这个 GPT conversation 必须是全新的。
2. 现在只实际调用 agent-runtime-mcp 的只读 public tool，优先 health；否则 list_channels。
3. 不要调用 GitHub，不要尝试发现/预热 GitHub，不要修改任何仓库。
4. 调用完成后只报告下面字段并停止；不要承诺后台等待。

只报告：
Row C-delayed Stage C1
Fresh conversation: yes
agent-runtime-mcp: PASS | FAIL
Tool: <health/list_channels/...>
T0: <当前可见时间；若无法可靠读取时间则写 user-recorded-needed>
GitHub invoked in this conversation: no
Failure class: <success / tool-binding-unavailable / invocation-rejected / provider-error / timeout / other>
Sanitized visible error: <如有>
```

Stage C1 完成后，保留这个 conversation，不要在其中调用 GitHub。让它自然空闲至少 10 分钟；实际间隔由用户记录。

## Row C-delayed — Stage C2

至少 10 分钟后，回到 **同一个 Stage C1 conversation**，发送：

```text
@GitHub @agent-runtime-mcp

继续 Issue #26 delayed Row C，Stage C2。必须是刚才 Stage C1 的同一个 GPT conversation。

1. 在本条消息之前，这个 conversation 从未实际调用过 GitHub。
2. 第一项实际调用现在必须是 @GitHub：读取 liqiangcc/agent-runtime-mcp 仓库信息。
3. 如果 GitHub 失败，立即再次实际调用 agent-runtime-mcp 的同一个只读 tool，作为 same-conversation survivor probe。
4. 如果 GitHub 成功，不需要 survivor probe。
5. 不要修改 GitHub，不要 write_text/send_control。

只报告：
Row C-delayed Stage C2
Same conversation as C1: yes
GitHub invoked before C2: no
T1: <当前可见时间；若无法可靠读取则写 user-recorded-needed>
User-recorded elapsed Δt: <用户填写实际间隔>
GitHub: PASS | FAIL
GitHub failure class: <success / tool-binding-unavailable / invocation-rejected / provider-error / timeout / other>
Sanitized visible error: <如有>
agent-runtime-mcp survivor probe: PASS | FAIL | n/a
survivor failure class: <...>
```

如果 Stage C2 的 GitHub 失败，再新开一个 conversation 做 GitHub-only fresh recovery probe。

## Row D-delayed — Stage D1

另开一个**全新的 GPT conversation**：

```text
@GitHub

这是 Issue #26 的 delayed Row D，Stage D1。

1. 现在只实际调用 @GitHub，读取 liqiangcc/agent-runtime-mcp 仓库信息。
2. 不要调用 agent-runtime-mcp，不要预热或探测它。
3. 不要修改仓库。

只报告：
Row D-delayed Stage D1
Fresh conversation: yes
GitHub: PASS | FAIL
T0: <当前可见时间；若无法可靠读取则写 user-recorded-needed>
agent-runtime-mcp invoked in this conversation: no
Failure class: <success / tool-binding-unavailable / invocation-rejected / provider-error / timeout / other>
Sanitized visible error: <如有>
```

Stage D1 后保留该 conversation，至少 10 分钟内不要调用 agent-runtime-mcp。

## Row D-delayed — Stage D2

至少 10 分钟后回到同一个 D1 conversation：

```text
@agent-runtime-mcp @GitHub

继续 Issue #26 delayed Row D，Stage D2。必须是刚才 Stage D1 的同一个 GPT conversation。

1. 在本条消息之前，这个 conversation 从未实际调用过 agent-runtime-mcp。
2. 第一项实际调用现在必须是 agent-runtime-mcp 的只读 public tool，优先 health；否则 list_channels。
3. 如果 agent-runtime-mcp 失败，立即再次实际调用 @GitHub 读取仓库，作为 same-conversation survivor probe。
4. 如果 agent-runtime-mcp 成功，不需要 survivor probe。
5. 不要修改 GitHub，不要 write_text/send_control。

只报告：
Row D-delayed Stage D2
Same conversation as D1: yes
agent-runtime-mcp invoked before D2: no
T1: <当前可见时间；若无法可靠读取则写 user-recorded-needed>
User-recorded elapsed Δt: <用户填写实际间隔>
agent-runtime-mcp: PASS | FAIL
Tool: <health/list_channels/...>
Failure class: <success / tool-binding-unavailable / invocation-rejected / provider-error / timeout / other>
Sanitized visible error: <如有>
GitHub survivor probe: PASS | FAIL | n/a
survivor failure class: <...>
```

## Fresh recovery probe after a delayed failure

If a delayed second provider failed, open a brand-new GPT conversation and invoke only that failed provider. Record PASS/FAIL and failure class.

## Existing controls

Preserve these prior observations; do not treat them as delayed tests:

```text
C0 immediate: agent-runtime-mcp → GitHub = PASS/PASS
D0 immediate: GitHub → agent-runtime-mcp = PASS/PASS
```

## Return path

Bring the short Stage results and the user-recorded actual elapsed interval back to the original Coordinator conversation. The Coordinator records `[MATRIX OBSERVATION]` comments and applies the attribution gate.

Row conversations must not modify Issue #26.
