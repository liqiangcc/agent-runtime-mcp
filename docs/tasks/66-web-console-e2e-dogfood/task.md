# Task 66 — Web Console end-to-end dogfood and operator deployment guide

> **Aligned for publication.** Issues #61, #63 and #62 have Final Acceptance. Coordinator decision for this run: #64 Terminal View and #65 lifecycle are **NOT RUN / non-blocking**; they remain optional follow-up slices. This is a verification Task; defects found are split into product/Console fix Tasks rather than repaired here (precedent: Issue #12 → #17).

## Metadata

```text
GitHub Issue: #66
Task ID: 66-web-console-e2e-dogfood
Task kind: verification + documentation
Parent: Issue #60 (Web Console Goal)
Base commit: b022df3ef3fb673cc1800a3f9dc69bd8918356d2
Candidate commit: n/a
Session bootstrap: docs/tasks/66-web-console-e2e-dogfood/prompt.md
Preferred worker: coordinator-authorized-devin
Environment: env:devin
Handoff profile: docs/tasks/handoffs/devin.md
Required capabilities: github-read-write, repository-code-authoring, github-actions-evidence, local-node-tmux-execution, headless-browser-testing
Hard dependencies: Final Acceptance of #61, #63, #62 (satisfied); #64 and #65 explicitly NOT RUN / non-blocking for this publication
```

Requirement authority: `docs/web-console-requirements.md` §2, §6–§8.

## Coordinator publication decisions

```text
Canonical base: b022df3ef3fb673cc1800a3f9dc69bd8918356d2 (#62 merged)
Primary acceptance path: WC-UC1–UC3 only
#64 Terminal View: NOT RUN in this Task; optional follow-up and non-blocking
#65 Session lifecycle: NOT RUN in this Task; optional follow-up and non-blocking
Headless browser: Playwright + Chromium
Browser dependency scope: E2E/CI only; must not enter the Console runtime or runtime deployment bundle
Defect policy: verification failures are SPLIT into a new fix Task; do not patch product/Console behavior inside #66
```

## Goal

Prove, through one **Playwright + Chromium** headless-browser end-to-end flow in GitHub Actions against a real disposable
tmux server, that the Console MVP satisfies the **primary closed loop** (open browser → pick agent → conversation-style history → send message → new output block; WC-UC1–UC3) and, only if accepted, WC-UC4/WC-UC5 as secondary paths while the MCP
product surface, bounds and boundary remain unchanged; and deliver an operator deployment guide
(Tailscale address bind, tailnet ACL guidance, no Console-side auth) as documentation only.

## Primary Use Case

```text
Actor: Coordinator / operator
Trigger: MVP slices accepted individually; need one combined proof and a deployment recipe
Main flow:
  1. harness prepares tmux socket with an allowed and a disallowed session, starts agent-runtime-mcp via the Console
  2. headless browser opens the Console (loopback in CI) → list shows only the allowed session and health=true
  3. PRIMARY LOOP: pick the session → default page is the conversation view with one "earlier output" block
     → type a message in the composer and press Enter → user turn appears → scripted output follows → appears as
     the next output block → "output paused" on idle; a second message opens a new block
  4. no-parsing check: output containing prompt-like/role-like strings stays a single output block
  5. Stop (INTERRUPT) with confirmation during a sleep → next output block shows the prompt returned (as output, not status)
  6. Raw transcript toggle shows the same content unshaped; position kept when scrolled up during a burst
  7. Terminal secondary path: NOT RUN by Coordinator decision (#64 remains optional follow-up)
  8. Lifecycle secondary path: NOT RUN by Coordinator decision (#65 remains optional follow-up)
  9. kill-server → health=false, no recreation, UI shows unavailable
Success outcome: steps 1–6 and 9 pass (primary acceptance); steps 7–8 are recorded NOT RUN and are non-blocking; seven-tool discovery unchanged; boundary guards pass
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

- Playwright + Chromium e2e test harness + dedicated CI job with artifacts; browser tooling is test-only and excluded from the runtime deployment bundle;
- `docs/web-console-deployment.md`: binding to the host's Tailscale address, tailnet ACL examples for restricting who may reach the port, systemd/user-service example, protected sessions, explicit statement that the Console has no user authentication and what is intentionally NOT provided;
- README cross-link from `docs/web-console-requirements.md`;
- boundary re-verification: seven tools, `static-boundary`, console guard, runtime bundle exclusion.

## Out of Scope

- fixing defects found (SPLIT); Terminal View (#64), session lifecycle (#65), agent-specific parsing/identity, annotations, mobile-first redesign; public hosting.

## Claims / Verification

```text
C1: primary-loop steps 1–6 and 9 PASS in Actions on the exact Candidate SHA; secondary steps 7/8 are recorded NOT RUN by Coordinator decision and are non-blocking.
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
4. SC4: acceptance does not depend on Terminal View; the primary loop is proven chat-first.
3. SC3: deployment guide published.

## Failure / Blocked Rules

BLOCK if an upstream slice is not accepted or the CI runner cannot run a headless browser. Never lower a Success Criterion to pass.

## Publication Dependency / Alignment Gate

Coordinator re-read accepted #61/#63/#62 and fixed the decisions above: base `b022df3e…`, #64/#65 NOT RUN, Playwright + Chromium. Publication Gate may proceed after this alignment change lands on `main`.

## Evidence Contract

As in `docs/tasks/task.template.md`; worker identity `coordinator-authorized-devin`; screenshots must not include real secrets; logs exclude terminal payloads.
