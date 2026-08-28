# Handoff Profile — Fresh GPT Coexistence Matrix

This profile is for compatibility diagnostics whose primary evidence depends on **provider ordering inside fresh ChatGPT conversations**.

It is intentionally different from the normal Web GPT Worker profile because pre-using `@GitHub` inside a matrix row can change the ordering being tested.

## 1. Scope

Use this profile only when the frozen Task explicitly requires fresh-conversation provider-order evidence such as:

```text
fresh conversation
→ provider A
→ provider B in the same conversation
```

This profile does not authorize product implementation.

## 2. Durable authority

GitHub remains the durable Task authority:

```text
Issue / task.md
= frozen matrix and attribution contract

fresh GPT conversations
= external runtime observations

Coordinator
= records sanitized matrix results in GitHub and decides attribution
```

A matrix-row conversation is **not** a repository Worker Attempt and must not claim the Issue before running its ordered row.

## 3. Freshness rule

Each primary row starts in a separate newly created GPT conversation.

Do not reuse a prior row's conversation for another primary row.

Before the first provider action in a row, do not invoke the other provider merely to test availability. That would invalidate the ordering evidence.

## 4. Actual invocation rule

A provider step is PASS only after an actual provider/tool action succeeds.

Examples:

```text
GitHub
→ perform a real read such as fetching the target repository or Issue

agent-runtime-mcp
→ perform a real public call such as health or list_channels
```

Mentioning `@GitHub` / `@agent-runtime-mcp` in prose or seeing a name in the UI is not PASS evidence.

## 5. Failure classification

Record the narrowest observable class without guessing internals:

```text
tool/binding unavailable
provider invocation rejected before a provider response
provider invocation reached provider and returned an error
timeout/connection closed
success
```

Preserve a short sanitized visible error message when available.

Do not persist credentials, auth tokens, full terminal output or unrelated conversation content.

## 6. Row result format

Each row result should contain:

```text
Row: <A/B/C/...>
Fresh conversation: yes
Step 1 provider/action: ...
Step 1 result: PASS | FAIL
Step 2 provider/action: ... | n/a
Step 2 result: PASS | FAIL | n/a
Failure class: ... | none
Sanitized visible error: ... | none
Follow-up probe: ... | n/a
```

## 7. Primary ordering constraint

If the row is:

```text
agent-runtime-mcp first → GitHub second
```

then `@GitHub` must not be called in that row before the successful agent-runtime-mcp invocation.

Likewise, for:

```text
GitHub first → agent-runtime-mcp second
```

agent-runtime-mcp must not be invoked first.

## 8. Recording results

Because a failing row may make GitHub unavailable in that same conversation, the row does not have to persist its own GitHub report.

The original Coordinator records the row result later as a `[MATRIX OBSERVATION]` comment on the Issue, including which facts came directly from the fresh-row observation.

This exception exists only to preserve the ordering under test; it does not permit repository implementation outside the normal Worker lifecycle.

## 9. Attribution boundary

Matrix evidence can establish conversation/order correlation. It cannot by itself invent a server-side root cause.

Product code may change only after separate evidence identifies a concrete `agent-runtime-mcp` causal mechanism.

If evidence instead shows conversation/provider binding failure while agent-runtime-mcp remains usable and a fresh GitHub conversation recovers, classify the failure as external conversation/provider-runtime behavior unless new project-side evidence appears.

## 10. Stop condition

A row stops after the frozen provider sequence and required survivor/recovery probe are recorded. Do not explore unrelated tools or mutate repository state from the row.
