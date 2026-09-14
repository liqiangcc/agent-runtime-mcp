# Task 63 — Web Console: send text and explicit control with write authorization

> **Draft.** Non-claimable until Issue #61 is accepted and the Alignment Gate below is re-read by the Coordinator.

## Metadata

```text
GitHub Issue: #63
Task ID: 63-web-console-text-control-input
Task kind: implementation + verification
Parent: Issue #60 (Web Console Goal)
Base commit: to be recorded at publication (must contain accepted #61 Candidate)
Candidate commit: n/a
Session bootstrap: docs/tasks/63-web-console-text-control-input/prompt.md
Preferred worker: coordinator-authorized-devin
Environment: env:devin
Handoff profile: docs/tasks/handoffs/devin.md
Required capabilities: github-read-write, repository-code-authoring, github-actions-evidence, local-node-tmux-execution
Hard dependencies: Issue #61 Final Acceptance; #62 recommended but not required
```

Requirement authority: `docs/web-console-requirements.md` (WC-UC3).

## Goal

Let an authenticated `write`-role human deliver ordinary text (`write_text`, optional `submit`)
or exactly one explicit control (`send_control`: `ENTER | INTERRUPT | ESCAPE`) to one Channel from
the browser, with CSRF protection, confirmation for `INTERRUPT`, and honest handling of ambiguous
mutation timeouts — no new key grammar, no retry.

## Primary Use Case (WC-UC3)

```text
Actor: human with write role
Trigger: wants to answer an agent prompt or interrupt a running command
Preconditions: #61 Console running; Channel available; write role granted
Main flow:
  1. human types text in the composer (multi-line allowed), chooses submit or not, sends
  2. Console validates role + CSRF, forwards to write_text through the adapter unchanged
  3. for controls, human presses ENTER / ESCAPE directly or INTERRUPT after confirmation
  4. Console shows mechanical result: delivered | rejected(INVALID_ARGUMENT…) | ambiguous timeout
Success outcome: text/control reaches the pane exactly once; UI states "delivered (transport only)"
Failure outcome: read-only role → 403; invalid Cc control chars → the MCP's INVALID_ARGUMENT shown verbatim; Channel missing → explicit error
Degraded outcome: TIMEOUT after send → "ambiguous: may have been delivered" with no automatic retry; user decides
Authoritative evidence: Actions integration test writing to a real tmux pane and reading back
```

## Separation Points

```text
Console composer | MCP input safety   → Console does not pre-sanitize beyond size hint; MCP rejects, Console displays
ordinary text | explicit control      → separate UI affordances, separate API routes, never merged
write authorization | channel op      → role check happens before the adapter call; the adapter has no auth logic
mutation result | application meaning → "delivered" is transport only
```

## Single Responsibilities

```text
console/api/write     = authz + CSRF + one write_text call
console/api/control   = authz + CSRF + one send_control call with the closed enum
console/ui/composer   = text entry, submit toggle, control buttons, confirmation, result display
```

## Logic / Control Separation

Logic: request shape, enum enforcement (mirror of the MCP enum, no extension), error/timeout mapping.
Control (human): when to send, whether to retry after an ambiguous timeout.

## Success / Failure / Degradation

Success proves: a human write path exists behind authz, mapped 1:1 to the two MCP mutation tools.
Hard failure: any extra key grammar; auto-retry; write without role; missing CSRF; logging of text.
Degradation: ambiguous timeout is explicit; backend unavailable disables the composer.
Never inferred: whether the agent "accepted" the input.

## In Scope

- authz middleware use for `write` role; CSRF token for state-changing routes; `Origin` check;
- API routes `POST /api/channels/:id/text` and `POST /api/channels/:id/control`;
- composer UI with submit toggle, size indicator (1 MiB hard bound is the MCP's; Console shows a soft hint), control buttons, INTERRUPT confirmation, result banner;
- logging: operation, channel_id, result category, byte size — never the text;
- tests: authz denial, CSRF denial, enum rejection of anything but the three values, write→read-back on real tmux, timeout mapping (mocked adapter).

## Out of Scope

- terminal attach (#64), lifecycle (#65);
- key macros, paste history, templates;
- any `src/` change or MCP enum extension.

## Architecture Invariants

- Ordinary text and explicit control remain separate.
- Closed control enum identical to the MCP's.
- Non-idempotent mutations are never blindly retried.
- No terminal text in logs.

## Claims / Verification

```text
C1: read-role user receives 403 on both mutation routes. (unit)
C2: request without valid CSRF token is rejected. (unit)
C3: control value outside ENTER|INTERRUPT|ESCAPE is rejected before reaching the adapter. (unit)
C4: text with submit=true appears in the pane and read_channel shows the marker; submit=false shows no extra newline execution. (integration, real tmux)
C5: INTERRUPT after a sleep command returns the pane to prompt; UI required confirmation. (integration + UI test)
C6: adapter TIMEOUT is surfaced as ambiguous and no second call is made. (unit with mocked adapter)
C7: logs contain no text payload. (unit)
```

## Security Review

```text
Security-sensitive: yes (remote write/control path; T2, T6, T5, CSRF/Origin)
Remote ingress affected: yes — write role required; loopback default from #61 unchanged
```

## Success Criteria

1. SC1: C1–C7 PASS on the exact Candidate SHA in Actions.
2. SC2: no `src/` change; console static guard passes (no `send-keys` in console/).
3. SC3: `console/README.md` documents write role and the ambiguity rule.

## Failure / Blocked Rules

BLOCK if authz roles from #61 are insufficient → Coordinator decides whether to REVISE #61 or amend this Contract. Never bypass authz to pass.

## Publication Dependency / Alignment Gate

Re-read accepted #61 (auth/role API, adapter signatures, UI stack) and update this file before the Publication Gate.

## Evidence Contract

As in `docs/tasks/task.template.md`; worker identity `coordinator-authorized-devin`; no terminal transcripts or tokens persisted.
