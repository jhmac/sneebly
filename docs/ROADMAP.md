# Sneebly v3 Roadmap

4-6 week plan to extract Sneebly v2.0 from AnimAItion, make it
project-agnostic, add vertical-slice discipline, and modernize for
Opus 4.6/4.7.

Authored 2026-05-16 after deep-dive into v2.0's SPEC.md. Supersedes
the prior ROADMAP.md (commit eb37890) which was based on an incomplete
reading of v2.0 capabilities. See 2026-05-15-spec-md-deep-dive.md for
the finding that drove this rewrite.

---

## North Star

Sneebly is a tool that:
- Drops into any Node.js project (not just Express, not just AnimAItion-shaped)
- Reads the project's identity files (SOUL, AGENTS, GOALS, SETUP, etc.)
- Runs an autonomy loop: identify constraint or pick slice, plan, execute,
  verify, learn, repeat
- Provides ELON for app-improvement constraints, slice-cycle for
  greenfield feature building
- Tracks all of this in the admin dashboard
- Stays within budget, security, and identity-protection guardrails
- Checks in with the human roughly hourly via NEEDS-ATTENTION.md
- Gets smarter over time via regression tracker and memory

User experience: install Sneebly in your project, fill in identity files,
start the heartbeat or ELON loop, walk away, come back periodically,
review and approve.

---

## Three guiding decisions (unchanged from prior roadmap)

1. Sneebly first, Plumb later. Get Sneebly perfect on small projects
   before stress-testing on Plumb.
2. Use Opus 4.6 / 4.7. Modernize v2.0's model tiers.
3. Hourly check-ins is the cadence target.

---

## The strategy

v2.0 already implements ~70% of v3's target. The work is refactor and
extension, not rebuild. Specifically:

**Keep from v2.0:**
- Identity system (7 markdown files with SHA-256 protection)
- Security layer (InputSanitizer, OutputValidator, CommandValidator,
  AuthRateLimiter, OwnerVerification)
- Memory and persistence (daily logs, decisions, error registry,
  long-term MEMORY.md)
- Subagent dispatcher (5+ specialized agents with model tiering)
- Code engine (backup, fuzzy match, syntax verify, runtime validate,
  atomic multi-file changes)
- Ralph Loop (iterative spec executor with retry-with-context and
  stuck detection)
- Orchestrator/Heartbeat (full cycle with budget management)
- ELON Strategic Constraint Solver (Theory of Constraints applied to
  app improvement)
- Site Crawler (Playwright with authenticated session support)
- Integration Health Monitor (Shopify, Nylas, Claude, DB, WebSocket)
- Scenario Test Runner (predefined e2e journeys)
- Regression Tracker (escalation scoring for recurring failures)
- Dependency Index (routes/services/schema/pages graph)
- Admin Dashboard (full web UI)
- CLI commands (init, status, heartbeat, elon, crawl, continuous)
- Data directory structure (.sneebly/)

**Modify for v3:**
- Make Express middleware optional (support Hono, Fastify, raw Node,
  non-server projects)
- Add SLICE-CYCLE.md as 8th identity file
- Add vertical-slice discipline rule to planner-agent.ts prompt
- Make planner project-agnostic (remove hardcoded AnimAItion paths)
- Upgrade subagent dispatcher model tiers to Opus 4.6/4.7
- Replace per-project codebase-intel prompts with template-driven ones

**Add net new:**
- SETUP.md template + verification gate (load-bearing piece from
  yesterday's discovery)
- Project-agnostic templates for all 8 identity files
- Drop-in test (fresh Express app installs Sneebly, points at GOALS,
  runs successfully)
- INSTALL.md for non-Replit environments (Mac mini, Linux, etc.)

**Remove:**
- AnimAItion-specific paths in planner prompt
- AnimAItion-specific integration checks (replace with config-driven
  integration registry)
- AnimAItion-specific schema rules

---

## What we know we need from yesterday's findings

Yesterday's Auto Mode trial on Plumb produced 6 pending observations:

1. pnpm-not-on-PATH on fresh setup — needs SETUP.md guidance
2. drizzle-kit esbuild mismatch in pnpm workspace — needs SETUP.md
   workaround
3. Plumb preinstall hook fails with newer pnpm — project-specific bug,
   document workaround
4. Mac mini missing Plumb env vars at startup — exactly what SETUP.md
   solves
5. Auto Mode commits before showing final code — STOP BEFORE COMMIT
   default rule in slice prompt
6. Heredoc paste truncates at triple backticks in Claude Code — paste
   files directly from terminal, not via Claude Code

These inform SETUP.md template design and the slice-cycle prompt
hardening.

---

## 5-week plan

### Week 1: Extract Sneebly from AnimAItion (spec #19 work)

This is the work described in the spec doc you got from Replit. The
plan is sound; we execute it.

- Inventory: walk every file under server/, decide Sneebly vs
  AnimAItion vs shared
- Create package layout: sneebly/ directory with src/, templates/,
  schema/, scripts/, docs/
- Move files with import rewrites: relocate Sneebly source, rewrite
  paths to stay internal, replace AnimAItion-specific imports with
  config-driven equivalents
- Build SneeblyConfig type covering: target codebase, GOALS path,
  data directory, anthropic key, model defaults, budget, protected
  paths, allowed commands, optional schema-table overrides, optional
  database client
- Build mountSneebly(app, config) entry point
- Update AnimAItion to use the new package (one mountSneebly call,
  delete scattered imports)
- Drop-in smoke test: fresh Express app installs and runs
- Verify nothing regressed on AnimAItion
- Write install README
- Build publish script (replacing buggy server/github-publisher.ts)
- Push to github.com/jhmac/sneebly main

Output of week 1: Sneebly is a standalone package, still working in
AnimAItion, available on GitHub. Same capabilities as today but
decoupled.

### Week 2: Project-agnostic refactor

After extraction, Sneebly still has AnimAItion shape baked in
(Drizzle schema rules, Express assumptions, Clerk auth assumptions).
Week 2 removes those.

- Replace hardcoded path rules in planner-agent.ts with config-driven
  rules from AGENTS.md
- Make Express middleware optional (Sneebly can run as standalone CLI
  for non-Express projects)
- Make integration health monitor config-driven (project specifies
  which integrations to check, not hardcoded)
- Move AnimAItion-specific scenario tests out of v2.0; ship empty
  templates instead
- Update INSTALL-WITH-REPLIT.md to INSTALL.md with multi-environment
  guidance (Replit, Mac, Linux)
- Generic AGENTS.md template, SOUL.md template, etc.

Output of week 2: Sneebly installable in any Node.js project, not just
AnimAItion-shaped ones.

### Week 3: Slice-cycle discipline + SETUP.md

Add the vertical-slice constraint to the planner and the SETUP.md
load-bearing piece.

- Add SLICE-CYCLE.md as 8th identity file (context-loader reads it,
  planner uses it)
- Modify planner-agent.ts prompt to enforce: each plan must be one
  vertical slice (test through every layer, shippable)
- Build SETUP.md template covering: install procedure, env vars,
  verification commands, known gotchas
- Add pre-cycle verification: heartbeat fails-closed if SETUP.md
  verification doesn't pass
- Modify Ralph Loop to write completed slice summary to NEEDS-ATTENTION.md
  for hourly check-in cadence (not just at plan complete)

Output of week 3: Sneebly plans in vertical slices, verifies setup
before each cycle, writes hourly summaries.

### Week 4: Modernize for Opus 4.6/4.7

- Upgrade subagent dispatcher model tiers (claude-opus-4-6 → claude-
  opus-4-7 where appropriate; refine tier selection)
- Tighten planner prompt for 4.7's better context window use
- Consider replacing auto-fixer with 4.7's self-correction in
  spec-executor
- Audit prompts for verbosity assumptions (older models needed more
  hand-holding)
- Add extended-thinking support for hard planning tasks

Output of week 4: Sneebly uses modern Opus capabilities, costs less
per cycle, plans better.

### Week 5: First real-use validation

- Install v3 in a small greenfield project (5-10 tables, fresh
  codebase, not AnimAItion, not Plumb)
- Fill in identity files for that project
- Run Sneebly autonomously for several cycles
- Each failure becomes a fix or rule-set entry
- Update templates based on what generalizes
- End of week: Sneebly handles small projects with hourly check-ins
  reliably

Output of week 5: Working v3 on a new project. Real evidence Sneebly
can autonomously build features beyond AnimAItion.

### Week 6 (buffer / iteration)

- Whatever week 5 surfaced that needs fixing
- Documentation: README, INSTALL.md, troubleshooting guide
- Push v3 as release candidate

### Week 7+: Try Sneebly on Plumb

- Plumb is the stress test, not the first test
- Expect to discover Plumb-specific gaps (Drizzle codegen, monorepo
  structure, Clerk + Replit deploy quirks)
- These become Sneebly improvements, not Sneebly failures

---

## Realistic ceiling

For a small greenfield project (5-10 tables, fresh codebase), Sneebly
v3 should reach 60-70% slice success rate with hourly check-ins by
end of week 5.

For Plumb-scale (60+ tables, monorepo, complex auth), expect lower
success rate initially, longer cycles, more human intervention. Each
session teaches Sneebly more about that environment.

For projects beyond Plumb (3rd, 4th, etc.), success rate should be
higher because Sneebly will have learned from Plumb's failures.

---

## Honest uncertainties

1. How much AnimAItion coupling is hidden in v2.0 beyond what spec #19
   identified. The extraction may surface more than expected.

2. Whether the spec-executor's intelligent sectioning works as well
   for non-AnimAItion codebases. It was tuned on Express + Drizzle.

3. Whether ELON's constraint-solver model generalizes beyond
   AnimAItion. The crawl + integration health + scenario tests pipeline
   was built for that specific app.

4. Whether vertical-slice discipline works in practice for AI agents.
   Pocock proved it for humans. AI adaptation is unproven.

5. Whether 4-6 weeks is realistic. Schedule slips in software projects
   are universal. Add 50% mentally.

6. Whether the Mac mini local environment can run Sneebly cleanly
   given yesterday's discovery of multiple environmental gaps. SETUP.md
   addresses this but adds time.

These resolve through doing the work, not through more planning.

---

## What this is and is not

This IS:
- A 5-6 week plan that builds on v2.0's hard-won foundation
- An honest reframe based on reading SPEC.md
- A path that preserves the genuine moat (ELON, security, encoded
  rules, regression tracker)
- A faster path to working v3 than rebuilding from scratch

This is NOT:
- A promise of v3 working on Plumb in 6 weeks (Plumb is a later test)
- A claim that no rewriting will be needed inside v2.0 (the planner
  prompts need real work)
- A substitute for SPEC.md (this roadmap is execution; SPEC.md is the
  design reference)

---

## Today's first move (2026-05-16)

Read the rest of v2.0 source before committing to week 1 extraction:

1. src/elon.js — ELON implementation
2. src/code-engine.js — file operation engine
3. bin/sneebly.js — CLI entry
4. templates/SOUL.md, IDENTITY.md, USER.md, HEARTBEAT.md, TOOLS.md
5. INSTALL-WITH-REPLIT.md — installation flow
6. src/middleware.js, src/memory.js, src/security.js
7. src/subagents/dispatcher.js and subagent .md template files

Then either:
- Commit to Path A and begin week 1 extraction
- Or surface concerns from the deeper reading that change direction
