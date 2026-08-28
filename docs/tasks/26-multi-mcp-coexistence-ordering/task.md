# Issue #26 — Same-conversation multi-MCP / plugin coexistence ordering diagnostic

## Status

Diagnostic Contract only. No product implementation is authorized by this Task.

## Goal

Reproduce and attribute the real failure where one provider is used successfully in a GPT conversation and a second provider later becomes unavailable in that **same conversation**, without replacing the observation with a narrower local stdio-only test.

Primary observed order:

```text
agent-runtime-mcp first
→ GitHub second
→ GitHub unavailable / cannot connect
```

## Why this Task exists

Issue #22 proved a narrower property:

```text
agent-runtime-mcp real stdio child
→ pre-initialize tools/list
→ child survives
→ same connection can initialize
```

That evidence rules out the historical reading-mcp PR #15 server-process failure class, but it does **not** prove that two separate MCP/plugin providers coexist correctly in one ChatGPT conversation.

This Task freezes the original failure instead of substituting a similar mechanism.

## Authority

- live Issue #26 and comments: current diagnostic state/history;
- this `task.md`: frozen reproduction and attribution Contract;
- `docs/tasks/handoffs/fresh-gpt-matrix.md`: matrix execution profile;
- fresh GPT conversations: external runtime observation source;
- GitHub Actions/local stdio tests: supplemental only, never substitutes for the conversation matrix;
- original Coordinator: records sanitized observations and decides attribution.

## Environment / route

```text
environment: env:fresh-gpt-matrix
route: coordinator-observed-fresh-conversation-matrix
```

The primary matrix rows are not ordinary repository Worker Attempts because calling GitHub first to claim would invalidate the `agent first → GitHub second` ordering.

No source-code mutation is permitted during matrix collection.

## Primary Use Case

An operator expects two independently configured providers to remain usable in one GPT conversation regardless of which one is invoked first.

```text
fresh GPT conversation
→ use provider A successfully
→ use provider B in same conversation
→ provider B should still be callable
```

## Frozen Matrix

Each primary row begins in a **different fresh GPT conversation**.

### Row A — GitHub only baseline

```text
fresh conversation
→ actual @GitHub read
```

Required result: PASS / FAIL + failure class.

### Row B — agent-runtime-mcp only baseline

```text
fresh conversation
→ actual @agent-runtime-mcp public call (health or list_channels)
```

Required result: PASS / FAIL + failure class.

### Row C — agent first, GitHub second

Primary observed failing row.

```text
fresh conversation
→ actual @agent-runtime-mcp call succeeds
→ actual @GitHub read in the SAME conversation
```

If GitHub fails, immediately run Row E in that same conversation before doing unrelated work.

### Row D — GitHub first, agent second

Ordering control.

```text
fresh conversation
→ actual @GitHub read succeeds
→ actual @agent-runtime-mcp call in the SAME conversation
```

### Row E — survivor probe after Row C failure

Conditional on C failing at GitHub:

```text
same failed-C conversation
→ call @agent-runtime-mcp again
```

Purpose: distinguish `agent-runtime-mcp itself died` from `second provider binding became unavailable`.

### Row F — conversation-scope recovery probe

Conditional on C failing:

```text
new fresh conversation
→ actual @GitHub read
```

Purpose: test whether the GitHub failure is scoped to the prior conversation.

### Optional Row G

Run only if simple/deterministic:

```text
fresh conversation
→ GitHub succeeds
→ agent-runtime-mcp succeeds
→ GitHub again
```

## Invocation Evidence Rule

PASS means a real provider action succeeded.

Do not count:

- a provider name appearing in prose;
- an `@` mention being accepted as text;
- a UI item being visible without invocation;
- a local mock standing in for ChatGPT provider binding.

## Failure Classes

Record only observable facts:

```text
success
tool/binding unavailable
invocation rejected before provider response
provider returned explicit error
timeout/connection closed
other sanitized visible error
```

Do not guess that a request reached a provider unless the evidence actually shows a provider response.

## Required Observation Record

For each row:

```text
Row
Fresh conversation: yes/no
Step 1 provider + action
Step 1 PASS/FAIL
Step 2 provider + action
Step 2 PASS/FAIL/n/a
Failure class
Sanitized visible error
Follow-up probe
```

Do not persist secrets, auth material or full terminal contents.

## Success Criteria

Diagnostic completion requires:

1. A, B, C and D are executed from independent fresh conversations;
2. if C fails, E and F are executed;
3. each provider step is an actual invocation, not prose inference;
4. the exact ordering and failure surface are recorded;
5. attribution is made from evidence using the gate below;
6. no product code is changed merely because coexistence fails;
7. a project-side fix is authorized only if a concrete agent-runtime-mcp causal mechanism is identified.

## Attribution Gate

### Outcome P — concrete project-side defect

Use only if evidence identifies a specific causal mechanism in agent-runtime-mcp, for example:

```text
agent-runtime-mcp process/transport actually fails
or its emitted protocol/schema behavior is directly shown to break coexistence
```

Then:

```text
Issue #26 diagnostic result
→ SPLIT/freeze a product defect Task
→ exact mechanism + project-level regression
```

Do not implement the fix inside this diagnostic Task.

### Outcome X — conversation/provider runtime defect

Strong evidence pattern:

```text
A PASS
B PASS
C: agent PASS → GitHub FAIL
E: agent still PASS in failed-C conversation
F: fresh-conversation GitHub PASS
```

D/G may additionally reveal order sensitivity.

Interpretation:

```text
agent server remains usable
+ GitHub recovers in a fresh conversation
+ failure is tied to provider coexistence/order in one conversation
→ primarily ChatGPT / Developer-MCP / plugin binding-runtime behavior
```

Under Outcome X, do not patch agent-runtime-mcp product code without new causal evidence.

### Outcome U — insufficient / inconsistent evidence

If rows conflict or failure class is ambiguous:

```text
remain diagnostic
→ repeat the minimum ambiguous fresh row
→ do not guess root cause
```

## Failure / Degradation

The Task is not complete when:

- only #22 local stdio evidence is cited;
- C is simulated with two local clients rather than ChatGPT providers;
- the matrix row used the second provider before its frozen position;
- a row reuses a previous primary conversation;
- a provider was not actually invoked;
- product code is changed before attribution.

## Separation Points

```text
agent-runtime-mcp stdio lifecycle
!= ChatGPT conversation provider binding lifecycle

provider coexistence/order observation
!= server-side causal mechanism

fresh-conversation runtime evidence
!= GitHub Actions evidence

diagnostic attribution
!= product fix

provider reconnect/runtime ownership
!= Channel MCP capability
```

## Single Responsibilities

### agent-runtime-mcp product

Owns its six Channel tools, protocol responses and server-side mechanics.

### ChatGPT/provider runtime

Owns conversation-level provider/tool binding and coexistence behavior outside this repository unless a project-side mechanism is demonstrated.

### Matrix row

Executes exactly the frozen ordered provider sequence and records observable outcome.

### Coordinator

Publishes the matrix, records sanitized observations durably, decides attribution, and creates a separate product defect only if justified.

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

Publication preparation started from canonical main containing accepted Issues #22 and #23.

The Publication Gate must re-read the final docs-only main head and its CI before matrix execution instructions are released.
