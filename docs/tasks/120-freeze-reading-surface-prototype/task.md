# Task — Freeze accepted reading-surface prototype into main

## Metadata

```text
GitHub Issue: #120
Task ID: 120-freeze-reading-surface-prototype
Task kind: documentation (reference landing)
Base commit: 6094e583e54b1bd687c8aa48da963f2c4459f141 (main)
Candidate commit: n/a
Session bootstrap: docs/tasks/120-freeze-reading-surface-prototype/prompt.md
Preferred worker: coordinator-authorized-devin
Environment: env:devin
Handoff profile: docs/tasks/handoffs/devin.md
Required capabilities: github-read-write, repository-code-authoring, github-actions-evidence
Hard dependencies: none
Parent: #116 · docs/web-console-reading-surface-design.md @ 6094e58
```

Live Task state belongs in GitHub Issue/comments, not this file.

Planning method: `docs/tasks/planning-principles.md`.

## Goal

Land `docs/prototypes/web-console-reading-first/` exactly as it exists on
`prototype/116-gpt-alignment` @ `6f05885` into `main` unchanged, so downstream
Tasks (T2b/T3/T4) can reference a stable visual/interaction reference SHA on
`main` instead of a moving prototype branch.

## Primary Use Case

```text
Actor: Coordinator / Reviewer / Worker of downstream Tasks T2b–T4
Trigger: a Task or review needs the accepted reading-surface reference
Preconditions: prototype/116-gpt-alignment @ 6f05885 exists and is the
  user-accepted state (recorded in #116)
Main flow: create a branch, transplant only the prototype subtree from
  6f05885, open a PR, let CI run, report.
Success outcome: main contains the prototype subtree byte-identical to
  6f05885's version of it.
Failure outcome: subtree content modified, additional files touched, or the
  reference landing silently drifts from the accepted state.
Degraded outcome: none — a docs landing is binary (correct tree or not).
Authoritative evidence: git tree diff on the exact Candidate SHA showing the
  only changed paths are under docs/prototypes/web-console-reading-first/,
  plus a byte-for-byte verification of that subtree against 6f05885.
```

## Separation Points

- product runtime | repository documentation — this Task touches only
  `docs/prototypes/**`; no `src/**`, `console/**`, workflow, or deployment path
  may appear in the diff.
- accepted visual reference | production implementation — landing the
  prototype on `main` is a **reference freeze**, not approval to port it into
  `console/public` (that is T3, gated separately).
- execution evidence | acceptance authority — CI green is Evidence; the
  Coordinator still decides ACCEPT.

## Single Responsibilities

```text
docs/prototypes/web-console-reading-first/ = frozen visual/interaction reference
src/**, console/**, deployment/**        = untouched by this Task
```

## Logic / Control Separation

```text
Logic/data path owns: byte-identical subtree landing.
Control/orchestration owns: PR merge timing and downstream Task gating (Coordinator).
```

## Success / Failure / Degradation

- Success: `git diff 6f05885 -- docs/prototypes/web-console-reading-first/` is
  empty on the Candidate, and the Candidate's non-prototype tree equals base.
- Hard failure: any file outside that subtree changed; any subtree byte differs.
- Safe degradation: none.
- Never inferred: that landing the prototype approves production rollout.
- Never triggers: no lifecycle/deploy action may follow from this Task.

## Required Capabilities

```text
Use Case → transplant an exact subtree → Evidence: git diff/tree hash on
Candidate SHA → Tool mapping: git + GitHub PR only.
```

## In Scope

- One branch + one PR landing `docs/prototypes/web-console-reading-first/**`
  byte-identical to `prototype/116-gpt-alignment` @ `6f05885`.
- The subtree diff at merge-base is confined to that path (verified at
  planning time: 130 files, all under `docs/prototypes/web-console-reading-first/`).

## Out of Scope

- `src/**`, `console/**`, `tests/**`, `.github/**`, `deployment/**`.
- Any edit to the prototype content (bugfixes, renames, comment cleanup all
  belong to later Tasks).
- Deployments on `:8080`, `:8090`, `:8091` — untouched.

## Architecture Invariants

- Seven public MCP tools and all Channel semantics unchanged (no code touched).
- Prototype content stays mock/static; it is a reference, not a claim about
  real protocol state.
- GitHub Actions is Evidence infrastructure, not Task authority.

## Implementation Requirements

1. Branch from `main` (or an up-to-date `origin/main`).
2. Land the subtree with a method that proves byte-identity, e.g.
   `git checkout 6f05885 -- docs/prototypes/web-console-reading-first/` or a
   read-tree/split-equivalent; do not hand-copy files.
3. One PR referencing this Issue; do not merge it yourself.
4. In the Execution Report, include the commands + output proving
   (a) subtree identical to `6f05885`, (b) no non-prototype path changed.

## Claims / Verification

```text
C1: Candidate's docs/prototypes/web-console-reading-first/ tree == 6f05885's
    (e.g. `git diff` empty, or identical tree object/hash).
C2: Candidate contains zero changes outside that subtree.
C3: CI jobs on the exact Candidate SHA are green (they also run the console
    static boundary guard; this Task must not trip it).
```

Record exact Candidate SHA. Do not report PASS for CI jobs not actually read.

## Security Review

```text
Security-sensitive: no
Threats/controls from docs/security.md: none new; screenshot PNGs committed
  with the prototype must not contain secrets — Worker must visually scan the
  9+12 PNGs once and state that in the report (known content: mock UI only).
Remote ingress affected: no
```

## Success Criteria

1. SC1: C1–C3 all evidenced at the exact Candidate SHA.
2. SC2: Report explicitly states the screenshot-files secret-scan result.

## Failure / Blocked Rules

```text
FAIL: diff not confined to the subtree, or subtree not byte-identical.
BLOCKED: prototype branch/SHA unreachable or base moved in a way that changes
         the target subtree.
Resume: fix branch content; same Issue, next Attempt.
```

## Publication Dependency / Alignment Gate

None — all inputs are frozen (`6094e58` design, `6f05885` prototype).

## Evidence Contract

```text
Attempt
Worker identity: coordinator-authorized-devin
Base/Candidate SHA: exact
PR: reference
GitHub Actions run/job: exact links read
Verification commands + output: subtree-identity diff, path-confinement check
Screenshot secret-scan statement
Known limitations: none expected
```

## Completion Protocol

```text
Coordinator/Publisher → status:ready + Devin entry
coordinator-authorized-devin Worker → claim → Attempt N → PR → Actions Evidence
→ [EXECUTION REPORT] | [BLOCKER REPORT]
→ status:review | status:blocked → owner:none → STOP
Coordinator → ACCEPT | REVISE | BLOCK | SPLIT | NOT_PLANNED
```

Contract change returns to draft + Publication Gate. Only Final Acceptance may
set done/close.
