# Task — Collapse completed execution trace into a compact turn summary (prototype)

## Metadata

```text
GitHub Issue: #114
Task ID: 114-turn-trace-collapse
Task kind: prototype-presentation
Base commit: 5e8d7d96418154646bc48dba8c0a077ec18e2a5f (main); prototype base branch prototype/112-post-send-presentation @ ebf7093b527e761ddeea8ea7ab2f6e142033d0cf
Candidate commit: n/a
Session bootstrap: docs/tasks/114-turn-trace-collapse/prompt.md
Preferred worker: coordinator-authorized-devin
Environment: env:devin
Handoff profile: docs/tasks/handoffs/devin.md
Required capabilities: github-read-write, repository-code-authoring, browser-viewport-screenshots, box-prototype-deploy
Hard dependencies: #112 candidate deployed on :8090 (before/after baseline); #111 deferred — must not block
Prototype Gate: production implementation of #90 remains BLOCKED; prototype-only
```

Live Task state belongs in GitHub Issue/comments, not this file.

## Goal

Make the post-send turn visibly restructure: when an agent turn completes, the
per-step activity rows auto-collapse into one (or very few) lightweight summary
rows — conceptually `思考 6s · 使用 3 个工具 ›` — and the final Markdown answer
becomes the obvious dominant reading surface. The change must be immediately
visible on a phone without pixel-level comparison; spacing/bubble polish alone
fails this slice.

## Primary Use Case

```text
Actor: operator on the mobile prototype (devin adapter)
Trigger: Send → agent turn runs (Thinking/command/read/tool steps) → final answer
Main flow:
1. while running, activity rows stay lightweight single-line and update in place;
2. when the answer is streaming/done, the whole execution trace collapses into a
   single compact summary row (duration + tool count + chevron);
3. the final answer occupies the dominant visual share;
4. expanding the summary reveals the detailed steps; collapsing restores the
   reading view WITHOUT rebuilding the answer DOM or losing scroll.
Success outcome: first-glance hierarchy = user message → one compact summary →
dominant answer; visibly less tool noise than the deployed #112 candidate.
Failure outcome: summary still a stack of persistent rows, answer rebuilt on
expand/collapse, scroll jumps, duplicated turns, or dropped raw bytes.
Degraded outcome: minor visual imperfections that do not hide the answer.
Authoritative evidence: 420×912 before/after screenshots + DOM/state smoke on
the deployed :8090 prototype.
```

## Separation Points

- adapter presentation | runtime semantics — prototype path only; parse
  uncertainty fails open to raw/generic; never drop bytes, never infer agent
  type from terminal text.
- live activity | settled summary — running rows update in place; the settled
  state owns exactly one compact disclosure row per turn.
- primary answer | execution trace — answer is never wrapped in tool chrome.

## In Scope

- `docs/prototypes/web-console-reading-first/**` on branch
  `prototype/114-turn-trace-collapse` (based on
  `prototype/112-post-send-presentation`).
- Auto-collapse of a turn's activity rows into a compact summary row on settle.
- Expand/collapse of the summary preserving answer DOM + scroll position.
- Before/after evidence vs the deployed #112 candidate.

## Out of Scope

- Any production path or semantic change; real `/api/*`; #111; production
  rollout.

## Claims / Verification Plan

- C1: completed turn shows one compact summary row (duration + tool/step count)
  instead of the stack of per-step rows.
- C2: expanding shows detailed steps; collapsing restores the reading view with
  the answer node untouched (same DOM element) and scroll preserved.
- C3: running state still updates activity rows in place; no duplicate
  snapshots; answer tail grows incrementally.
- C4: auto-follow only while pinned; user scroll-up never yanked.
- C5: before/after vs deployed #112 candidate shows a clearly visible reduction
  in tool/process visual weight.
- C6: no page-level h-scroll at 375/390/420; raw fallback reachable.

## Success Criteria

All claims evidenced at the exact Candidate SHA; the difference must be
immediately visible.

## Evidence Contract

- Exact prototype SHA + branch + URL.
- 420×912 screenshots: running turn; first answer delta; completed turn with
  auto-collapsed summary + dominant answer; expanded summary; collapse-back
  state. 390/375 sanity.
- DOM smoke: no duplicate turns/activity; answer node identity preserved across
  expand/collapse; scroll preserved.
- Explicit no-semantics-change statement.

## Architecture / Security Invariants

Seven public MCP tools, channel/cursor/GAP/wait/lifecycle/tmux/mutation
semantics unchanged (no production code touched). Mock never claims real
protocol state. Markdown stays untrusted-safe.
