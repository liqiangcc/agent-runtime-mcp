# Task — Web Console explicit context transfer between sessions

## Metadata

```text
GitHub Issue: #84
Task ID: 84-web-console-context-transfer
Task kind: implementation
Base commit: c8021a64cd8e0230257e309c348005317d6dc0d9
Candidate commit: n/a
Session bootstrap: docs/tasks/84-web-console-context-transfer/prompt.md
Preferred worker: coordinator-authorized-devin
Environment: env:devin
Handoff profile: docs/tasks/handoffs/devin.md
Required capabilities: github-read-write, repository-code-authoring, github-actions-evidence, browser-e2e, console-security-review
Hard dependencies: Web Console Goal #60 and slices #61/#62/#63 Final Accepted; #81 Final Accepted
```

Live Task state belongs in GitHub Issue/comments, not this file.

Planning method: `docs/tasks/planning-principles.md`.

## Goal

Add one explicit, human-controlled Context Transfer interaction to the already accepted Chat-first Web Console: a human can select terminal output from one visible Channel, choose another currently visible Channel, preview exactly what will be sent, explicitly confirm, and deliver the context to the target by reusing the existing target `write_text` path. The MCP product surface and semantics must not change.

## Primary Use Case

```text
Actor: human operator already using the tailnet-scoped Web Console
Trigger: the operator sees useful terminal output in one source Channel and wants another agent/session to receive it as context
Preconditions:
- source and target Channels are both currently visible through the existing MCP list/get surface;
- the selected source text is already present in the Console-owned bounded history shown to the operator;
- normal Console write authority to the target already exists under the documented tailnet trust model.
Main flow:
1. operator explicitly selects source terminal text from an earlier_output or output_block presentation;
2. operator invokes “Send to session…”;
3. Console requires an explicit target Channel chosen from the current visible Channel list;
4. Console shows a preview containing source identity metadata and the exact selected text;
5. no mutation has happened yet;
6. operator explicitly confirms the send;
7. browser reuses the existing target text mutation route / public MCP write_text path exactly once;
8. the target’s existing user-turn/history machinery records the send like any other Console message.
Success outcome: the target receives one ordinary-text send containing the previewed context; the source remains unchanged; no other Channel is touched.
Failure outcome: invalid/missing target, vanished Channel, rejected selection, authority failure, MCP error or rejected mutation is surfaced explicitly and causes no fallback lifecycle/control action.
Degraded outcome: a write TIMEOUT remains transport_result=ambiguous and is never automatically retried; stale target lists require user re-selection/refresh rather than inference.
Authoritative evidence: exact-SHA GitHub Actions plus true-browser E2E proving no pre-confirm mutation and one target send after confirmation.
```

This is one coherent capability slice because selection, destination choice, preview and confirmation are all safety stages of the same cross-session data-flow action. Automatic routing, summarization and workflow handoff are independent future Tasks.

## Separation Points

### Web Console | Channel MCP

The Console owns why the text is copied between sessions, source/target presentation, preview and confirmation. The MCP owns only bounded ordinary-text transport to a target Channel through the already public `write_text` contract.

Must not cross the boundary:
- no new MCP tool, schema or Channel semantic for “context transfer”;
- no `src/` change for Console convenience;
- no raw tmux target accepted by the UI;
- no lifecycle action as part of transfer.

### observation | interpretation

Source content is mechanically observed terminal output. The Console may let the human select it, but it must not infer whether it is a command, answer, secret, task result, user message, assistant message or “important context”.

### untrusted source data | mutation authority

Terminal output is untrusted and may contain secrets or adversarial instructions. Transfer therefore requires explicit human selection, explicit destination, preview and confirmation. No output text may itself select the destination, initiate a transfer or change transfer policy.

### browser interaction | server/MCP mutation

Selection/destination/preview state is presentation state. The actual send reuses the existing `/api/channels/:target/text` mutation and MCP `write_text`; do not create an alternate direct tmux or shell path.

### execution evidence | acceptance authority

GitHub Actions and E2E provide Evidence only. Coordinator remains Review/Final Acceptance authority.

## Single Responsibilities

```text
Chat UI transfer affordance = collect an explicit source selection, target choice, preview and confirmation
existing Console text mutation = deliver ordinary text once and preserve ambiguity semantics
existing History/Event machinery = record the target send as an ordinary user turn
MCP write_text = bounded ordinary-text transport only, unchanged
Coordinator = acceptance and next-step authority
```

## Logic / Control Separation

```text
Logic/data path owns:
- preserve the selected source text in the preview/send payload;
- resolve the destination only by Channel id from the current visible list;
- reuse existing text mutation validation and error mapping;
- preserve existing non-idempotent timeout/ambiguity semantics.

Control/orchestration owns:
- whether context should be transferred;
- what source text is selected;
- which target is chosen;
- whether the preview is accepted;
- whether to retry after an ambiguous result.
```

The Console must never make those control decisions from terminal output.

## Success / Failure / Degradation

Success proves an explicit browser-driven cross-session text transfer without expanding MCP authority.

Hard failures include:
- any transfer before explicit confirmation;
- destination derived from terminal text or raw tmux grammar;
- any implicit `send_control`, terminal attach, create/kill/restart or fan-out;
- mutation to more than one target for one confirmation;
- public MCP surface growth or `src/` product changes;
- payload persistence or logging of selected terminal text.

Safe degradation:
- source/target no longer visible → show explicit failure and require a fresh human choice;
- target write TIMEOUT → show ambiguous, never retry automatically;
- selected text exceeds the UI transfer bound → refuse or require a smaller selection; never silently truncate.

Never infer agent identity, role, task progress, completion or semantic importance from the selected text.

## Required Capabilities

```text
Use Case: transfer explicitly selected terminal text
→ Capability: source text selection from rendered history
→ Boundary: browser presentation only
→ Evidence: browser test shows only operator-selected text becomes preview payload

Use Case: prevent accidental cross-session disclosure/mutation
→ Capability: explicit destination + preview + confirm before mutation
→ Boundary: human control vs untrusted output
→ Evidence: E2E proves zero target mutations before confirmation

Use Case: deliver to target
→ Capability: reuse existing target write_text route exactly once
→ Boundary: Console orchestration vs Channel transport
→ Evidence: integration/E2E observes one target user turn / terminal delivery
```

## Canonical / Process Sources

Read:
- `AGENTS.md`
- `docs/tasks/planning-principles.md`
- `docs/tasks/collaboration-protocol.md`
- `docs/tasks/issue-state-convention.md`
- `docs/tasks/issue-lifecycle-protocol.md`
- `docs/web-console-requirements.md` (especially §2, §3, §8, §9, §11)
- `console/README.md`
- `docs/security.md` (especially sensitive terminal data, output-as-untrusted-data, bounded mutation, non-idempotent ambiguity)
- `docs/mcp-contract.md`
- Issue #84 live body/comments

## Worker / Verification Route

```text
current ChatGPT conversation = Coordinator / Reviewer
arm-r tmux session = coordinator-authorized Devin executor
GitHub Actions = exact-Candidate verification Evidence
```

The worker claims exactly one Attempt, works on a dedicated branch, opens one PR, reads exact-SHA Actions, posts an execution report, returns the Issue to `status:review` with owner cleared, and stops. It must not self-accept or merge.

## In Scope

- Chat-history UI affordance for selecting terminal output text from `earlier_output` / `output_block` presentation.
- Current visible Channel list as destination chooser; source Channel must not be the only implicit destination.
- Preview that visibly identifies source and target and shows the actual payload before mutation.
- Explicit confirmation gate.
- A deterministic plain-text transfer envelope may add only mechanical provenance (source Channel/session label) around the selected text; the selected text itself must be preserved byte-for-byte as UTF-8 text inside that envelope. No summarization/rewrite.
- A documented finite UI transfer-size limit no larger than the public `write_text` bound; oversize selection must fail visibly, not truncate silently.
- Reuse of existing target text mutation; no new MCP capability.
- Unit/integration/true-browser coverage for positive flow and safety failures.
- Documentation update for the new Console interaction and security warning.

## Out of Scope

- automatic context routing, subscriptions, fan-out or background forwarding;
- agent-to-agent autonomous collaboration;
- role/prompt/agent-protocol parsing;
- semantic summarization, relevance ranking, secret detection/redaction or policy classification;
- files/attachments/image transfer;
- persistent clipboard/history/indexing;
- context transfer to a raw tmux target or a Channel outside current MCP visibility;
- transfer of control actions (`ENTER|INTERRUPT|ESCAPE`), terminal keystrokes or lifecycle operations;
- public MCP tool/schema changes or `src/` changes;
- user/role auth redesign.

## Architecture Invariants

- Web Console remains an upper-layer component; MCP remains exactly seven public tools.
- `console/` imports no product internals from `src/`.
- terminal output is untrusted data, never policy or workflow authority.
- a transfer can touch exactly one explicitly selected target Channel per confirmation.
- no mutation occurs before explicit confirmation.
- only `channel_id` from visible MCP Channels identifies the destination; raw tmux grammar is never accepted.
- non-idempotent write ambiguity is preserved; no automatic retry.
- transfer payload is memory/browser transient only and absent from logs.
- failure never creates/restarts/kills/attaches an endpoint.

## Implementation Requirements

1. Add a source-selection affordance only for terminal-output history entries (`earlier_output` / `output_block`), not for drop markers or hidden/unseen text. A normal browser text selection is acceptable if its selection is constrained to one source output entry; otherwise provide an explicit entry-copy selection interaction.
2. Before any mutation, require a target chosen from the current visible Channel list and render a preview containing: source session/channel identity, target session/channel identity, and the exact actual text payload that will be sent.
3. The confirmation control must be disabled until source selection and target are both valid. Cancel closes the transfer UI with zero mutation.
4. The transfer action must invoke the existing target text route and therefore existing MCP `write_text`; do not add a server path that bypasses existing mutation safety. One confirmation produces at most one call.
5. The target send uses ordinary text only. It must not invoke `send_control`, Terminal attach or lifecycle adapters.
6. If a deterministic provenance wrapper is used, it must be visible in preview, contain only mechanical source identifiers/labels, preserve selected text exactly, and never claim semantic role/status/completion.
7. Enforce a finite transfer-size limit at UI/controller level; it must not exceed 1 MiB UTF-8. Oversize is a visible validation error and sends nothing. Do not silently truncate.
8. Existing `504 TIMEOUT` handling remains `ambiguous`; the transfer UI must not retry automatically or pretend failure/success certainty beyond the existing result.
9. Do not log selected/payload terminal content and do not persist transfer state to disk/localStorage. Browser in-memory state only for the active preview is sufficient.
10. Add unit tests and true-browser E2E covering: happy path; cancel/zero mutation; invalid/vanished target; oversize selection; one-confirmation/one-target-send; TIMEOUT ambiguity behavior if practical at the existing harness boundary; no control/lifecycle side effects; existing primary Chat-first loop still passes.
11. Update `console/README.md` (and only other docs justified by implementation) to describe the manual transfer flow and warn that selected terminal content may contain secrets/untrusted instructions.
12. Keep existing Console/MCP static boundary guards green and public discovery at seven tools.

## Claims / Verification

```text
C1: No target mutation occurs until explicit preview confirmation; cancel produces zero mutation.
C2: One confirmed transfer sends exactly one ordinary-text payload to exactly one explicitly selected visible target through the existing write_text path.
C3: Selected source text is preserved exactly inside the previewed payload; no semantic parsing/summarization/hidden rewrite occurs.
C4: Oversize/invalid/vanished-target cases fail visibly with no silent truncation, fallback target, control action or lifecycle side effect.
C5: Existing write TIMEOUT ambiguity/non-retry semantics are preserved.
C6: No selected/payload terminal content is persisted or logged by the new capability.
C7: `src/` and public MCP schema remain unchanged; discovery still reports exactly seven tools and existing Console primary-loop tests remain green.
C8: exact Candidate SHA GitHub Actions are green, including true-browser evidence for the transfer safety gate and happy path.
```

Record exact Candidate SHA for all code-dependent evidence. Do not report PASS without reading the actual Actions results for that SHA.

## Security Review

```text
Security-sensitive: yes
Threats/controls:
- T5 sensitive terminal data: explicit source selection + target + preview + confirmation; no persistence/log payload.
- T8 semantic authority leak: output cannot trigger or configure transfer; no parsing/meaning inference.
- mutation authority: reuse existing tailnet/Origin/Host/write_text path; no alternate write authority.
- non-idempotent mutation: ambiguous timeout stays explicit; no auto-retry.
Remote ingress affected: no new ingress/auth model; existing Console tailnet trust boundary remains.
```

Anyone who can already reach the Console can already read/write visible Channels under the documented trust model. This Task must not expand that authority; it only adds a safer explicit UX composition of an already-authorized read followed by an already-authorized write.

## Success Criteria

1. SC1: In a true browser, select output in source A, choose target B and open preview; before confirm, B receives zero writes. Cancel also produces zero writes.
2. SC2: Confirm once; B receives exactly one ordinary-text send matching the preview and source A is not mutated.
3. SC3: Target history records the transfer through existing user-turn machinery; no special MCP/agent semantic state is introduced.
4. SC4: invalid/vanished target and oversize payload are explicit no-send failures; there is no fallback target or truncation.
5. SC5: no code under `src/` changes and public discovery remains exactly seven tools.
6. SC6: existing Console unit/integration/E2E primary-loop tests and static boundary checks pass on the exact Candidate SHA.
7. SC7: docs state the manual security boundary: terminal output may contain secrets/untrusted instructions and is never auto-forwarded.

Do not lower these criteria after observing results.

## Failure / Blocked Rules

FAIL if implementation auto-sends before confirmation, parses terminal semantics, silently truncates, accepts raw tmux destination grammar, adds MCP tools, changes `src/`, retries ambiguous writes, logs/persists payloads, or introduces lifecycle/control side effects.

BLOCKED if the accepted Console structure cannot support the capability without changing the frozen seven-tool product boundary or if required true-browser evidence cannot be produced. Minimal resume condition is a Coordinator-reviewed contract revision or restored Actions/E2E capability; do not improvise a boundary violation.

## Publication Dependency / Alignment Gate

Before `status:ready`, Coordinator must re-read latest main and confirm:
- #60/#61/#62/#63/#64/#65/#66 remain Final Accepted and merged;
- #81 fix is in main;
- current history entry model still exposes mechanically observed output separately from user/control entries;
- current mutation route still funnels through MCP `write_text` with explicit ambiguity semantics;
- this Task does not duplicate another live Context Transfer Issue/PR;
- Task package and Issue agree on env:devin / coordinator-authorized-devin.

Publication Gate passes only after the docs PR is green and merged and final live read-back shows `status:ready`, owner none.

## Evidence Contract

```text
Attempt: 1
Worker identity: coordinator-authorized-devin
Base SHA: exact main SHA at claim (must contain c8021a64 or later)
Candidate SHA: required
PR / branch: required
GitHub Actions: exact Candidate push/PR check results required
Browser E2E: required
Claims C1-C8: explicit PASS/FAIL with evidence
Known limitations: explicit
```

Do not persist secrets or unnecessary terminal transcripts in repository/Issue evidence.

## Completion Protocol

```text
Coordinator/Publisher → status:ready
arm-r / coordinator-authorized Devin → claim → Attempt 1 → branch/PR → exact-SHA Actions Evidence
→ [EXECUTION REPORT] | [BLOCKER REPORT]
→ status:review | status:blocked → owner:none → STOP
current ChatGPT Coordinator → ACCEPT | REVISE | BLOCK | SPLIT | NOT_PLANNED
```

Contract changes return to draft + Publication Gate. Only Final Acceptance may close #84.