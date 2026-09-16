# Task — Refine post-send user turn and agent output/result presentation (prototype)

## Metadata

```text
GitHub Issue: #112
Task ID: 112-post-send-turn-presentation
Task kind: prototype-presentation
Base commit: 5e8d7d96418154646bc48dba8c0a077ec18e2a5f
Candidate commit: n/a
Session bootstrap: docs/tasks/112-post-send-turn-presentation/prompt.md
Preferred worker: coordinator-authorized-devin
Environment: env:devin
Handoff profile: docs/tasks/handoffs/devin.md
Required capabilities: github-read-write, repository-code-authoring, browser-viewport-screenshots, box-prototype-deploy
Hard dependencies: #90 prototype infrastructure (docs/prototypes/web-console-reading-first/) on branch prototype/90-reading-first; #111 deferred — must not block this work
Prototype Gate: production implementation of #90 remains BLOCKED; this Task refines the prototype only and produces no production Console change
```

Live Task state belongs in GitHub Issue/comments, not this file.

## Goal

Refine the post-send interaction in the Reading-first prototype so the visual
hierarchy after Send reads as a conversation/reading surface rather than a
terminal/dashboard dump:

```text
user turn → lightweight transport state → agent activity/progress (secondary)
→ primary answer/result (dominant)
```

## Primary Use Case

```text
Actor: operator using the mobile Reading-first prototype (devin adapter)
Trigger: type in the composer, press Send, watch the agent turn complete
Main flow:
1. the submitted text appears immediately as a compact user turn/bubble with a
   subtle transport state (sending → delivered / failed / timeout-ambiguous);
2. agent activity (Thinking / Running command / Read shell / Tool result)
   renders as lightweight single-line collapsed rows with a muted one-line
   preview; expanded bodies use a restrained dark content surface;
3. the primary answer streams in place onto the reading surface with
   Markdown/GFM rendering and proportional typography — never inside a tool
   card;
4. the completed turn settles visually: answer dominant, tool noise receded.
Success outcome: the post-send sequence reads as one coherent conversation
turn on 420×912; no page-level horizontal scroll; no duplicate turns; tool
process exists but is visually subordinate.
Failure outcome: dashboard-like stacked cards, duplicate full-snapshot appends,
scroll yanking, lost raw bytes, or any change to transport/mutation semantics.
Degraded outcome: minor visual imperfections that do not break the reading
flow may be noted as known limitations.
Authoritative evidence: 420×912 (+390/375 sanity) screenshots and interaction
smoke on the deployed :8090 prototype.
```

## Separation Points

### adapter presentation | runtime semantics

All post-send presentation lives inside the devin adapter prototype
(`docs/prototypes/web-console-reading-first/`). Parse uncertainty must fall
back to raw/generic presentation; never drop original bytes or invent state.
No `console/public/**`, `console/src/**`, `src/**`, or MCP contract changes.

### transport state | message content

`sending/delivered/failed/ambiguous` is a subtle status treatment bound to the
mock transport boundary; it must not render as a large card/banner, and
ambiguous/failed never auto-retries.

### primary answer | execution trace

The primary answer is the dominant visual layer. Tool/activity rows are
secondary single-line affordances between the user turn and the answer;
expanding one reveals the content surface on demand.

## In Scope

- `docs/prototypes/web-console-reading-first/**` only (prototype branch
  `prototype/90-reading-first`).
- User-turn bubble + transport status treatment.
- In-place streaming activity rows and streaming Markdown answer.
- Turn grouping/boundary and settle behavior.
- Mobile-first evidence at 420×912 primary, 390/375 sanity.

## Out of Scope

- Any production Console path or MCP/runtime semantic change.
- Real `/api/*` calls; the prototype remains static/mock.
- The #111 iOS standalone keyboard dead-zone defect (deferred).
- Production rollout of the prototype (separately gated by Final Gate).

## Claims / Verification Plan

- C1: after Send, exact submitted text renders as the user turn with subtle
  status; ambiguous/failed states shown without auto-retry.
- C2: activity rows are single-line when collapsed; expanded bodies use a
  restrained dark surface without nested-card heaviness.
- C3: one agent turn updates in place — no duplicate full snapshots; answer
  tail grows incrementally with stable Markdown and minimal reflow.
- C4: auto-follow only while pinned; user scroll-up is never yanked.
- C5: one turn = coherent group; raw fallback reachable; no original bytes
  dropped under parse uncertainty.
- C6: no page-level horizontal scroll at 375/390/420.

## Success Criteria

All claims evidenced by screenshots and interaction smoke on the deployed
:8090 prototype at the exact Candidate SHA.

## Evidence Contract

- Exact prototype SHA + branch + deployed URL.
- 420×912 screenshots: just-sent user turn; live activity; expanded tool
  result; partial streaming answer; completed answer; failed/ambiguous send.
- 390/375 sanity screenshots.
- Interaction smoke: in-place updates, no duplicate turns, scroll-pin
  behavior, raw fallback reachable.
- Explicit statement that runtime/MCP/cursor/write semantics were not changed.

## Architecture / Security Invariants

- Exactly-seven public MCP tools unchanged; channel identity, cursor/GAP,
  wait/timeout, lifecycle, tmux identity, mutation ambiguity semantics
  unchanged — trivially, since no production code is touched.
- Mock data must never be presented as real Devin protocol state.
- Markdown rendering remains untrusted-safe (no raw HTML/script execution).
