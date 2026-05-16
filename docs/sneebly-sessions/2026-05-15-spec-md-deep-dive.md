# Session note — 2026-05-15 late: SPEC.md deep dive

## What this session did

Read SPEC.md from v2.0 main branch (42KB, 21 sections) after committing
the initial v3 design docs (SLICE-CYCLE.md, ROADMAP.md, error-ledger.md,
pending-observations.md). The read revealed v2.0 is materially more
substantial than the prior reading of autonomy-loop.ts, planner-agent.ts,
and verify-agent.ts had suggested.

This finding requires a rewrite of ROADMAP.md.

---

## What v2.0 actually has (full inventory from SPEC.md)

Beyond the orchestration code I read first, v2.0 includes:

1. **Identity system** — 7 markdown files (SOUL, AGENTS, GOALS, HEARTBEAT,
   IDENTITY, USER, TOOLS) with SHA-256 checksum protection against tampering.
   Last night's design assumed AGENTS.md was the whole identity story.
   It is 1 of 7.

2. **Security layer** — real threat model with multiple defenses:
   - InputSanitizer with 20+ prompt-injection regex patterns
   - OutputValidator blocking writes to identity files, .env, package.json,
     node_modules
   - CommandValidator whitelist (only npm, npx, git, curl with specific
     subcommands; shell metacharacters blocked)
   - AuthRateLimiter (10 failed attempts in 15 min = block)
   - OwnerVerification with timing-safe comparison

3. **ELON — Strategic Constraint Solver** — Theory of Constraints applied
   to autonomous app improvement. Crawl site, run integration health,
   run scenario tests, build dependency index, ask Claude for the single
   biggest limiting factor, generate specs, execute, re-evaluate.
   Materially different from "pick next milestone from GOALS.md."

4. **Site Crawler** — Playwright-based crawler that browses the live app
   like a real user. Supports authenticated crawling via stored Clerk
   session (popup login flow). Visits up to 50 pages, finds 500s/404s/
   console errors/broken UI.

5. **Integration Health Monitor** — probes Shopify, Nylas, Claude API,
   Database, WebSocket on each cycle. Returns healthy/degraded/unhealthy/
   unknown per integration.

6. **Scenario Test Runner** — predefined e2e journeys (Shopify connect,
   clock in/out, schedule management, etc.) executed via Playwright on
   each cycle. Results feed regression tracker.

7. **Regression Tracker** — tracks per-test pass/fail over time with
   escalation scoring: score = consecutiveFailures × failureRate ×
   min(daysSinceFirstFailure / 7, 3). Worst offenders feed ELON.

8. **Dependency Index** — graph of routes → services → schema → pages
   built from import analysis. When ELON finds a constraint, the index
   tells it which files to examine.

9. **Memory & Persistence** — daily logs, decision logs, error log
   (JSONL append-only), known-errors registry with signature
   deduplication, long-term MEMORY.md, metrics snapshots, memory audit
   for injection detection.

10. **Subagent dispatcher** — five purpose-built agents (error-resolver,
    perf-optimizer, codebase-intel, self-improver, spec-executor,
    elon-evaluator) each with their own prompt and model tier
    (Haiku/Sonnet/Opus). Budget tracked per call with auto-skip when
    exhausted.

11. **Code Engine** — file operations with backup-before-write, fuzzy
    matching when exact match fails, syntax verification (bracket
    balancer for JS/TS/JSX/TSX), runtime validation via health endpoint
    polling, multi-file atomic changes (all-or-nothing).

12. **Ralph Loop** — iterative spec executor (up to 10 iterations per
    spec) with retry-with-context, stuck detection (3 consecutive
    stuck = give up), automatic rollback on syntax/test/runtime failure.

13. **Admin Dashboard** — full web UI at /sneebly/dashboard with status
    overview, activity feed, crawl results, integration health,
    scenario tests, regression tracker, dev mode toggle, ELON controls,
    spec queue with approve/reject, ELON settings, crawler auth.

14. **CLI commands** — sneebly init, sneebly status, sneebly heartbeat,
    sneebly-elon, sneebly-crawl, sneebly-continuous.

---

## Why this matters for v3 direction

Last night's ROADMAP.md assumed v3 was a near-from-scratch rebuild with
Claude Code Auto Mode as the runtime. That assumption is wrong.

The right framing is:

- v2.0 already does ~70% of what v3 needs
- The gaps are: it's AnimAItion-embedded, it uses v2.0's own builder
  (not Claude Code), it lacks vertical-slice discipline, it's Express-
  coupled
- Spec #19 (the extraction plan you got from Replit) is the actual week
  1 work, not the "build slice-picker.ts" from last night's roadmap

Two real paths emerge:

**Path A: v3 = v2.0 made standalone + slice-disciplined + modernized**
- Take embedded snapshot, apply spec #19 extraction
- Add vertical-slice rule to planner prompt
- Add SETUP.md to identity files (8 instead of 7)
- Make Express middleware optional
- Upgrade subagent dispatcher to Opus 4.6/4.7 tier
- 4-6 weeks of focused work
- Preserves the moat: ELON, Regression Tracker, encoded rules, security
  layer, integration health, scenario tests

**Path B: v3 = SLICE-CYCLE on Claude Code (last night's plan)**
- Throw away most of v2.0
- Build thin orchestrator around Claude Code Auto Mode
- 8-9 weeks of focused work
- Result: Sneebly that does ~30% of what v2.0 does, but uses Claude Code

Path A is materially better. Less work, more capability, preserves the
hard-won lessons. Last night's recommendation toward Path B was made
before reading SPEC.md and is now reversed.

---

## Specific items in last night's ROADMAP.md that are wrong

1. "Replace builder agent with Claude Code Auto Mode entirely" — premature.
   v2.0's spec-executor has retry-with-context, related-files context,
   intelligent sectioning for large files, multi-file atomic changes.
   These are not trivially replaceable.

2. "8-week plan" — too long. With v2.0 as foundation, ~4-6 weeks is
   realistic.

3. "Target ~2-3k lines of TypeScript" — wrong direction. v2.0 is
   probably 10-15k lines. v3 should be similar size or larger, not
   smaller. Trying to shrink would mean discarding real capability.

4. "Drop Plan/Build/Verify/Review terminology" — wrong. That IS the
   autonomy loop. Slice-cycle is a refinement of Plan, not a
   replacement.

5. "Drop per-step retries with fail counts" — wrong. Per-step retry
   with retry-with-context is how the planner avoids stuck loops.
   Removing it removes a real safety mechanism.

6. The "8-week plan" weeks 1-4 listed work that's mostly already done
   in v2.0 (verify-agent, journal pattern, rollback) and missed the
   actual week 1 work (extracting from AnimAItion per spec #19).

---

## What this finding does NOT change

- SLICE-CYCLE.md design is still good. Vertical-slice discipline is
  the right addition to v2.0's existing planner.
- Error-ledger and pending-observations files are still good (or can
  be replaced by v2.0's existing regression-tracker — they overlap).
- "Sneebly first, Plumb later" decision still holds.
- "Use Opus 4.6/4.7" decision still holds.
- "Hourly check-ins target" still holds.

---

## What to do tomorrow

1. Rewrite ROADMAP.md based on this finding. Path A scope, 4-6 week
   timeline, spec #19 as week 1.

2. Read the rest of v2.0 source before committing 4-6 weeks of refactor:
   - src/elon.js (ELON implementation)
   - src/code-engine.js (file operation engine)
   - bin/sneebly.js (CLI entry)
   - templates/SOUL.md, IDENTITY.md, USER.md, HEARTBEAT.md, TOOLS.md
     (the other 6 identity files)
   - INSTALL-WITH-REPLIT.md (installation flow)
   - src/middleware.js, src/memory.js, src/security.js, src/subagents/
     (the layers I haven't read)

3. Then decide: commit to Path A and begin extraction work, OR find
   reasons Path A is wrong and adjust.
