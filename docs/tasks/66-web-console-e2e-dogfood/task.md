# Task 66 — Web Console end-to-end dogfood and operator deployment guide

> **Draft.** Non-claimable until Issues #61–#64 are accepted (and #65 if the Coordinator includes lifecycle in the MVP acceptance). This is a verification Task; defects found are split into product/Console fix Tasks rather than repaired here (precedent: Issue #12 → #17).

## Metadata

```text
GitHub Issue: #66
Task ID: 66-web-console-e2e-dogfood
Task kind: verification + documentation
Parent: Issue #60 (Web Console Goal)
Base commit: to be recorded at publication
Candidate commit: n/a
Session bootstrap: docs/tasks/66-web-console-e2e-dogfood/prompt.md
Preferred worker: coordinator-authorized-devin
Environment: env:devin
Handoff profile: docs/tasks/handoffs/devin.md
Required capabilities: github-read-write, repository-code-authoring, github-actions-evidence, local-node-tmux-execution, headless-browser-testing
Hard dependencies: Final Acceptance of #61, #62, #63, #64; #65 optional per Coordinator decision
```

Requirement authority: `docs/web-console-requirements.md` §6–§8.

## Goal

Prove, through one headless-browser end-to-end flow in GitHub Actions against a real disposable
tmux server, that the Console MVP satisfies WC-UC1–WC-UC4 (and WC-UC5 if included) while the MCP
product surface, bounds and boundary remain unchanged; and deliver an operator deployment guide
(Tailscale address bind, tailnet ACL guidance, no Console-side auth) as documentation only.

## Primary Use Case

```text
Actor: Coordinator / operator
Trigger: MVP slices accepted individually; need one combined proof and a deployment recipe
Main flow:
  1. harness prepares tmux socket with an allowed and a disallowed session, starts agent-runtime-mcp via the Console
  2. headless browser opens the Console (loopback in CI) → list shows only the allowed session and health=true
  3. browse view follows a scripted output burst; position kept when scrolled up
  4. write text with submit → visible in browse; INTERRUPT with confirmation → prompt returns
  5. terminal view types a key sequence → effect visible; closing view leaves no tmux client
  6. (optional) lifecycle create/kill via allowlisted profile
  7. kill-server → health=false, no recreation, UI shows unavailable
Success outcome: all steps pass; seven-tool discovery unchanged; boundary guards pass
Failure outcome: any step fails → defect recorded and SPLIT into a fix Task; this Task is not the place to fix product code
Authoritative evidence: exact-SHA Actions run of the e2e job + artifacts (screenshots, logs without payloads)
```

## Separation Points

```text
verification | implementation             → defects are split, not patched here
Console deployment guide | MCP deployment → guide covers the Console ingress; MCP stays stdio child of the Console
evidence | acceptance                     → Actions success is evidence; Coordinator accepts
```

## In Scope

- e2e test harness (headless browser) + CI job with artifacts;
- `docs/web-console-deployment.md`: binding to the host's Tailscale address, tailnet ACL examples for restricting who may reach the port, systemd/user-service example, protected sessions, explicit statement that the Console has no user authentication and what is intentionally NOT provided;
- README cross-link from `docs/web-console-requirements.md`;
- boundary re-verification: seven tools, `static-boundary`, console guard, runtime bundle exclusion.

## Out of Scope

- fixing defects found (SPLIT); Future items (Chat View, agent type, annotations, mobile-first redesign); public hosting.

## Claims / Verification

```text
C1: e2e flow steps 1–5 (and 6 if included) PASS in Actions on the exact Candidate SHA.
C2: after kill-server the Console shows unavailable and tmux list-sessions proves no recreation.
C3: test:discovery still reports exactly seven tools; static-boundary and console guard pass; bundle excludes console/.
C4: deployment guide reviewed against docs/web-console-requirements.md §8 and docs/deployment.md; no secrets or hostnames persisted.
```

## Security Review

```text
Security-sensitive: yes (documents the tailnet-only ingress posture; verifies the bind guard end to end)
Remote ingress affected: documentation only
```

## Success Criteria

1. SC1: C1–C4 PASS with evidence.
2. SC2: any defect is recorded with reproduction and split into a new Task; none patched silently.
3. SC3: deployment guide published.

## Failure / Blocked Rules

BLOCK if an upstream slice is not accepted or the CI runner cannot run a headless browser. Never lower a Success Criterion to pass.

## Publication Dependency / Alignment Gate

Coordinator re-reads accepted #61–#64 (and #65 decision), fixes the exact step list and the headless browser tooling choice, then runs the Publication Gate.

## Evidence Contract

As in `docs/tasks/task.template.md`; worker identity `coordinator-authorized-devin`; screenshots must not include real secrets; logs exclude terminal payloads.
