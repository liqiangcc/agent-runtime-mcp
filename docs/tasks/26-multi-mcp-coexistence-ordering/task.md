# Issue #26 — Same-conversation multi-MCP / plugin coexistence timing diagnostic

## Status

Diagnostic Contract only. No product implementation is authorized by this Task.

## Goal

Reproduce and attribute the real failure where one provider is used successfully in a GPT conversation, the conversation remains alive/idle for a meaningful period, and a second provider later becomes unavailable in that **same conversation**.

The key correction is:

```text
provider ordering alone
!= historical reproducer

historical reproducer
= first provider use
→ elapsed/idle period
→ first use of second provider in same conversation
```

Immediate same-conversation controls already passed and are preserved as Evidence; they do not prove the delayed failure is fixed.

## Why this Task exists

Issue #22 proved only a narrower server-side property:

```text
agent-runtime-mcp real stdio child
→ pre-initialize tools/list
→ child survives
→ same connection can initialize
```

Issue #22 does **not** prove ChatGPT can keep multiple providers/bindings usable across conversation age or idle time.

Issue #26 initially tested immediate ordering only. Fresh Row C and Row D both passed:

```text
C0: agent-runtime-mcp → immediately GitHub = PASS/PASS
D0: GitHub → immediately agent-runtime-mcp = PASS/PASS
```

Those results show ordering alone is not a deterministic reproducer. The historical failure includes elapsed/idle time and the Contract is revised accordingly.

## Authority

- live Issue #26/comments: current diagnostic state and append-only observations;
- this `task.md`: frozen reproduction/attribution Contract;
- `prompt.md`: exact staged row bootstraps;
- `docs/tasks/handoffs/fresh-gpt-matrix.md`: execution profile;
- fresh GPT conversations: primary runtime Evidence;
- GitHub Actions/local stdio tests: supplemental only;
- original Coordinator: records sanitized results and decides attribution.

## Environment / route

```text
environment: env:fresh-gpt-matrix
route: coordinator-observed-fresh-conversation-matrix
```

Rows are observation probes, not ordinary repository Worker Attempts. A normal GitHub-first claim would alter the provider order under test.

No product/source mutation is allowed during matrix collection.

## Primary Use Case

An operator expects a provider used earlier in a conversation not to prevent a different provider from being invoked later merely because the conversation aged or remained idle.

```text
fresh GPT conversation
→ provider A succeeds at T0
→ conversation remains the same
→ no provider B invocation during idle interval
→ after Δt, provider B is invoked for the first time
→ provider B should remain callable
```

## Time/idle Evidence rule

Delayed rows must record:

```text
T0 = time first provider succeeds
T1 = time second provider is first invoked
Δt = T1 - T0
conversation = same conversation
second provider invoked before T1 = no
idle condition = whether the conversation was left untouched or had non-provider chat activity
```

The first delayed probe should use a **material idle interval of at least 10 minutes**. This is a diagnostic starting threshold, not a product timeout specification.

If the 10-minute delayed probes pass, do not conclude the historical problem is fixed solely from that result. Outcome remains diagnostic until either:

- a delayed failure is reproduced and attributed; or
- a longer idle interval reasonably representative of the historical failure also passes and no other trigger is identified.

Do not make the model pretend to wait in the background. Delayed rows are two-stage interactions in the same GPT conversation: Stage 1 invokes the first provider and stops; the user later returns to the same conversation for Stage 2.

## Frozen Matrix

### Row A — GitHub-only baseline

Fresh conversation → actual GitHub read.

### Row B — agent-runtime-mcp-only baseline

Fresh conversation → actual read-only public call (`health` preferred).

### Row C0 — immediate agent → GitHub control

Already observed PASS/PASS in a fresh conversation. Preserve as control Evidence; do not need to repeat unless evidence changes.

### Row D0 — immediate GitHub → agent control

Already observed PASS/PASS in a different fresh conversation. Preserve as control Evidence.

### Row C-delayed — primary delayed reproducer

Two stages in the **same fresh GPT conversation**.

Stage C1:

```text
fresh conversation
→ actual agent-runtime-mcp health/list_channels succeeds at T0
→ DO NOT invoke GitHub
→ stop
```

Then leave the conversation idle for at least 10 minutes.

Stage C2, later in the same conversation:

```text
record T1 / actual Δt
→ first actual GitHub read in that conversation
→ PASS / FAIL + failure class
```

If GitHub fails, immediately run the survivor probe in that same conversation:

```text
agent-runtime-mcp same read-only tool again
→ PASS / FAIL
```

### Row D-delayed — reverse delayed control

Two stages in another fresh GPT conversation.

Stage D1:

```text
fresh conversation
→ actual GitHub read succeeds at T0
→ DO NOT invoke agent-runtime-mcp
→ stop
```

After at least 10 minutes idle, Stage D2:

```text
record T1 / actual Δt
→ first actual agent-runtime-mcp read-only call in that conversation
→ PASS / FAIL
```

If agent-runtime-mcp fails, immediately call GitHub again in that same conversation as the survivor probe.

### Fresh recovery probe

If a delayed second provider fails, open a new fresh GPT conversation and invoke that failed provider alone. Record whether it immediately works again.

## Invocation Evidence rule

PASS requires a real provider action to succeed. Do not count provider names in prose, UI visibility, an accepted @mention, or local mocks.

## Failure classes

Record only observable facts:

```text
success
tool/binding unavailable
invocation rejected before provider response
provider returned explicit error
timeout/connection closed
other sanitized visible error
```

Do not claim a request reached a provider unless Evidence shows a provider response.

## Required observation record

For delayed rows record:

```text
Row
Fresh conversation: yes
Same conversation across stages: yes
Stage 1 provider/action
Stage 1 PASS/FAIL
T0
Stage 2 provider/action
Stage 2 PASS/FAIL
T1
Elapsed Δt
Second provider invoked before Stage 2: no
Idle condition
Failure class
Sanitized visible error
Same-conversation survivor probe
Fresh-conversation recovery probe
```

Do not persist secrets, auth material or terminal contents.

## Success Criteria

Diagnostic completion requires:

1. immediate C0/D0 controls are preserved;
2. delayed C and delayed D are executed in independent fresh conversations and the same conversation is reused across each row's two stages;
3. each delayed row records actual elapsed time and keeps the second provider uninvoked until Stage 2;
4. if a delayed failure occurs, same-conversation survivor and fresh-conversation recovery probes are executed;
5. each provider step is an actual invocation;
6. attribution uses the gate below;
7. no product code is changed merely because coexistence fails;
8. a project-side fix is authorized only after a concrete agent-runtime-mcp causal mechanism is identified.

## Attribution Gate

### Outcome P — concrete project-side defect

Use only if Evidence identifies a specific agent-runtime-mcp causal mechanism, such as its process/transport failing or its emitted protocol/schema behavior being directly shown to break coexistence.

Then SPLIT a separate product defect Task with the exact mechanism and regression. Do not implement inside Issue #26.

### Outcome X — conversation/provider binding/runtime defect

Strong pattern:

```text
first provider PASS at T0
→ delayed second provider FAIL at T1
→ first provider still PASS in same failed conversation
→ failed provider PASS in a fresh conversation
```

If this occurs without a project-side causal mechanism, attribute primarily to ChatGPT / Developer-MCP / plugin conversation binding/runtime.

### Outcome T — timing/idle-sensitive but causal layer unresolved

Use when immediate C0/D0 pass but a delayed row fails and survivor/recovery Evidence is incomplete or mixed.

```text
immediate coexistence works
+ delayed coexistence fails
→ timing/idle is a real trigger
→ continue attribution without guessing product ownership
```

### Outcome U — insufficient/inconsistent Evidence

If delayed rows pass or outcomes conflict, remain diagnostic and isolate the minimum remaining variable. Do not close as fixed merely because immediate controls pass.

## Failure / Degradation

Task is not complete when:

- only #22 stdio Evidence is cited;
- only immediate C0/D0 are cited;
- a delayed row invokes the second provider before Stage 2;
- Stage 2 occurs in a different conversation;
- elapsed time is not recorded;
- a local two-client harness substitutes for ChatGPT provider binding;
- product code changes before attribution.

## Separation Points

```text
immediate coexistence
!= delayed/idle coexistence

agent-runtime-mcp stdio lifecycle
!= ChatGPT conversation provider binding lifecycle

elapsed-time correlation
!= server-side causal mechanism

fresh-conversation runtime Evidence
!= GitHub Actions Evidence

diagnostic attribution
!= product fix
```

## Product Change Gate

During Issue #26 diagnostic execution:

```text
src/** changes: forbidden
public Tool/schema changes: forbidden
reconnect/restart workaround APIs: forbidden
provider/tunnel/network/auth changes: forbidden
```

If Outcome P is established, stop and SPLIT a new implementation Task.

## Baseline

The revised Publication Gate must re-read the final docs-only main head and its CI before delayed matrix execution is released.
