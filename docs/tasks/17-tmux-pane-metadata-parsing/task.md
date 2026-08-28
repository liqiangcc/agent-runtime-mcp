# Task — Fix tmux pane metadata parsing on public `list_channels`

## Metadata

```text
GitHub Issue: #17
Task kind: product defect repair + regression verification
Parent blocker: Issue #12 MVP-003 dogfooding
Environment: env:web-gpt
Preferred worker: web-gpt-worker
Handoff profile: docs/tasks/handoffs/web-gpt.md
Known diagnostic head: 5fd801fb653773c87735cec3fccee919612b33bb
Known failing Actions run: 33145260042
```

Planning method: `docs/tasks/planning-principles.md`.

## Goal

Repair the smallest product-source defect that causes a valid externally prepared tmux pane to fail discovery through the real public stdio MCP `list_channels` path with:

```text
BACKEND_OPERATION_FAILED
Tmux returned malformed pane metadata
```

The fix must preserve the existing six-tool public MCP contract and all accepted product boundaries.

## Primary Use Case

```text
Actor: ordinary MCP client
Precondition: one valid existing tmux pane is visible in configured backend scope
Path: official MCP Client + StdioClientTransport → agent-runtime-mcp → list_channels → TmuxBackend
Expected: valid pane metadata is parsed and returned as one Channel
Current defect: public list_channels returns malformed-pane-metadata error
```

Known Evidence from Issue #12:

- official client connects successfully;
- public tool discovery exposes exactly six accepted Tools;
- public `health` returns `backend_kind=tmux, available=true`;
- external tmux `list-panes` produced a valid seven-field row such as `%0`, scoped session, `@0`, `0`, `0`, title, cwd;
- public `list_channels` fails on the same fixture;
- direct real-tmux integration remains green;
- fixture/socket/environment variants were already eliminated as the primary cause.

## Separation Points

### Product defect repair | dogfooding workflow

Issue #17 fixes only the discovery defect. It does not own the full Issue #12 shell marker / interrupt / lifecycle validation flow.

### Tmux metadata mechanics | Channel semantics

The backend may change how it requests, delimits, normalizes, or parses tmux metadata, but public Channel identity/fields/capabilities must keep their accepted meaning.

### Robust parsing | permissive parsing

A fix must accept valid tmux metadata without silently accepting malformed required identity fields. Required pane/session/window identities remain validated.

### Optional metadata | required identity

Optional/free-text metadata such as title/cwd must not corrupt parsing of required identity fields. If delimiter/escaping behavior is the root cause, choose a robust backend-internal representation rather than weakening identity validation.

### Defect repair | endpoint lifecycle

No session/pane/process creation, restart, recovery or cleanup becomes an MCP capability.

## Single Responsibilities

```text
TmuxBackend metadata path
= request + parse valid tmux pane metadata safely

Channel/MCP layer
= expose unchanged list_channels semantics

bugfix regression harness
= prove real public stdio path now succeeds

Issue #12 dogfood
= resume broader six-capability validation only after this fix is accepted
```

## Root-Cause Requirement

Do not patch by guesswork.

Before final Candidate, identify and record the actual cause of the discrepancy between:

```text
external valid tmux metadata row
vs.
TmuxBackend public list_channels parse failure
```

The Execution Report must state:

- exact root cause;
- why existing direct tmux integration missed it;
- why the chosen fix is the smallest correct repair;
- what regression test would have caught it earlier.

Temporary diagnostic instrumentation is allowed in tests/branch work, but production logs must not dump sensitive terminal metadata unnecessarily.

## In Scope

- `src/tmux-backend.ts` metadata formatting/parsing/listing repair;
- closely related backend helper/type changes if necessary;
- targeted unit tests for the identified root cause;
- a minimal real public stdio MCP regression for `health + list_channels` using an externally prepared disposable tmux pane;
- CI changes needed to run the regression;
- documentation correction only if product behavior was previously described inaccurately.

The known Issue #12 diagnostic branch/head may be read and reused as Evidence. Do not merge the whole dogfood branch merely for convenience.

## Out of Scope

- completing the full Issue #12 dogfood scenario;
- adding/changing public MCP Tools or schemas;
- adding a seventh Tool;
- Worker/Task/application semantics;
- endpoint lifecycle MCP APIs;
- deployment/tunnel/network/auth work;
- raw shell/tmux public command APIs;
- unrelated refactoring.

## Architecture Invariants

1. public Tool surface remains exactly `list_channels/get_channel/read_channel/write_text/send_control/health`;
2. Channel remains the only product domain object;
3. normal callers still use opaque `channel_id`;
4. configured tmux scope/allowlist remains authoritative;
5. valid metadata is accepted; malformed required identity remains a structured backend failure;
6. optional/free-text metadata cannot redefine Channel identity;
7. no lifecycle side effects;
8. no application semantics;
9. no deployment semantics;
10. structured executable/argv process execution remains shell-free.

## Verification Claims

- **C1 Reproduction understood:** root cause is demonstrated from exact/sufficiently equivalent Evidence.
- **C2 Public regression fixed:** official MCP client over stdio can call public `list_channels` on one valid disposable tmux pane and receive one Channel.
- **C3 Health preserved:** public `health` remains mechanical and succeeds independently.
- **C4 Contract preserved:** exact six public Tools and their schemas/semantics remain unchanged.
- **C5 Scope preserved:** tmux socket/session allowlist behavior remains unchanged.
- **C6 Parser safety:** malformed required identity is still rejected; fix is not blanket permissiveness.
- **C7 Optional metadata robustness:** title/cwd or the actual root-cause field shape cannot corrupt required-field parsing.
- **C8 Existing behavior preserved:** unit + existing real tmux integration remain green.
- **C9 No lifecycle/semantic expansion:** no endpoint lifecycle, Task/Worker/application/deployment coupling is introduced.
- **C10 Exact identity:** exact Candidate CI proves the regression and existing suite.

## Verification Plan

### J1 — Root-cause regression

Add the smallest test that reproduces the identified parser/listing defect. Include the valid seven-field real-tmux shape from Issue #12 where relevant.

### J2 — Public stdio discovery regression

GitHub Actions Linux:

```text
external fixture creates isolated tmux pane
→ official MCP Client + StdioClientTransport
→ public health succeeds
→ public list_channels succeeds
→ exactly one expected Channel returned
```

This regression stops after discovery; the broader shell interaction belongs to #12.

### J3 — Negative parser/scope checks

Prove malformed required metadata still fails structurally and configured visibility is not widened.

### J4 — Existing regression suite

Exact Candidate passes:

```text
typecheck
unit
existing real tmux integration
minimal public-stdio discovery regression
static boundary
```

## Success Criteria

Reviewer may ACCEPT only when:

1. root cause is explicit and supported by Evidence;
2. public stdio `list_channels` succeeds on the formerly failing valid fixture class;
3. existing direct tmux integration still passes;
4. malformed required metadata remains rejected;
5. public contract remains exactly six Tools with no schema expansion;
6. no lifecycle/application/deployment coupling appears;
7. exact Candidate CI is green;
8. Issue #12 can be resumed without changing its frozen dogfood Contract solely because of this defect.

## Blocked Rules

BLOCK if the actual root cause requires a canonical Channel contract/public schema change, a new capability, or broader architectural revision. Return Evidence to Coordinator rather than changing those boundaries implicitly.

## Completion Protocol

```text
Worker claim one Attempt
→ root-cause proof + minimal product fix + regression Evidence
→ [EXECUTION REPORT] | [BLOCKER REPORT]
→ status:review | status:blocked + owner:none
→ STOP
→ Coordinator Review
```

Do not resume or complete Issue #12 from this Task.