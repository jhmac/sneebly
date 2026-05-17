# Sneebly v3 Session Log

This is the single living tactical document for Sneebly v3 work. Read top-to-bottom for current state and today's agenda. Append new sessions at the bottom of the "Session history" section as work progresses.

Last updated: 2026-05-17

---

## What Sneebly is

Sneebly is an autonomous coding agent framework. You install it in a Node.js project. You define the project's identity (SOUL.md, AGENTS.md, GOALS.md, etc.). You start the heartbeat loop. Sneebly reads the goals, plans work, executes code changes, verifies them, learns from failures, and writes hourly check-in summaries. The human reviews and approves between cycles.

Sneebly v2.0 (on `main` branch) is the working but AnimAItion-embedded version. Sneebly v3 (on this branch) is the refactor: standalone, project-agnostic, modernized for Opus 4.7, with vertical-slice discipline added.

Three core capabilities (from v2.0's ELON module):
1. **Build mode** — reads GOALS.md, generates specs to build the next unbuilt milestone in the current phase, executes them via Ralph Loop
2. **Fix mode** — crawls the running app, identifies the single biggest constraint (Theory of Constraints), generates fix specs
3. **Slice mode** (new in v3) — vertical-slice TDD discipline; each cycle ships one feature end-to-end through every layer

Target user experience: paste a "start cycle" prompt, walk away, return in an hour, review what got built, approve or correct, walk away again.

---

## What Sneebly is NOT

- Not a code assistant in the IDE (Claude Code/Cursor handle that)
- Not a CI/CD system (it generates code; CI/CD runs after)
- Not a substitute for human review — every slice has an approval gate
- Not "fire-and-forget" for entire applications (target is hourly check-ins, not daily)
- Not running on Plumb yet — Plumb is the future stress test, not the first test
- Not framework-agnostic for non-Node projects — explicitly Node.js / TypeScript only
- Not yet — v3 doesn't exist as a working tool. v2.0 exists but is AnimAItion-embedded. v3 work is in progress.

---

## Current state (as of 2026-05-17 start of day)

**Repos and branches:**
- `github.com/jhmac/sneebly` main — v2.0 standalone (Feb 2026, last commit `5c559e4`)
- `github.com/jhmac/sneebly` embedded-snapshot — embedded Sneebly from AnimAItion (orphan branch, commit `438aa30`)
- `github.com/jhmac/sneebly` v3 — design foundation and analysis (current working branch, HEAD `1054831`)

**v3 branch contents:**
- `docs/ROADMAP.md` — 5-week plan, current canonical
- `docs/SLICE-CYCLE.md` — vertical-slice workflow doc
- `docs/V2_analysis.md` — 884-line per-file analysis of 15 v2.0 src files
- `docs/V2_findings.md` — 560-line cross-file synthesis with v3 implications
- `docs/sneebly-sessions/2026-05-15-spec-md-deep-dive.md` — SPEC.md session note
- `docs/SESSION-LOG.md` — this file
- `.sneebly/error-ledger.md` — template (superseded by v2.0's regression-tracker concept)
- `.sneebly/pending-observations.md` — 6 lessons from May 15 Auto Mode trial (also superseded)

**Architecture findings to date:**
- v2.0 has ~70% of what v3 needs; v3 is refactor + extension, not rebuild
- Dual codebase finding: v2.0 has parallel JS path (orchestrator → Ralph Loop → spec-executor) AND TS path (autonomy-loop → planner-agent → builder-agent). JS path is likely canonical; TS path possibly dead. Decision pending.
- ELON's build mode IS the "build an app from GOALS.md" capability
- Yesterday's error-ledger design is superseded by regression-tracker.js (already in v2.0)

**Plumb state:**
- All May 15 commits pushed (test file, gitignore, session note already at origin/main, HEAD `7567db2`)
- Local environment has known broken state (drizzle-kit esbuild mismatch never resolved — will need SETUP.md when Plumb stress-test time comes)
- Plumb is NOT the current focus — addressed via planned "Sneebly first, Plumb later" decision

---

## Active blockers / decisions pending

1. **Dual codebase verdict (JS vs TS path)** — PARTIALLY RESOLVED 2026-05-17. The TS path is structurally orphaned in v2.0 main (no JS-to-TS imports, no CLI invocations, broken paths in self-modify.ts). HOWEVER, user notes the TS path may represent real self-modification capability that worked partially in AnimAItion. Investigation deferred to Week 1. See docs/sneebly-sessions/2026-05-17-execution-path-decision.md (note revision at end).

2. **Auto-correction rule preservation** — Required for Week 1 REGARDLESS of TS path keep/delete decision. Extract autoCorrectStep rules to AGENTS.md path_rules section AND elon-builder.md Common Path Mistakes section. Extract inferRelatedFiles patterns to AGENTS.md related_files section. These rules represent encoded wisdom that should be in declarative config either way.

3. **Identity file requirement policy** — current code allows missing AGENTS.md (silent failure). v3 should fail-closed. Decision: when in extraction work to apply this fix.

4. **Subagent inventory** — need to count exactly what subagent .md template files exist in v2.0's `templates/subagents/`. Affects v3 subagent registry design.

5. **NEEDS-ATTENTION.md writer location** — orchestrator.js doesn't write it but SPEC.md describes it. Need to grep to find where it's written, or add it explicitly in v3.


6. **Self-modification capability investigation** - added 2026-05-17. The TS path (26 files in src/) may represent a real self-improvement feature. Investigation block in Week 1 reads learning-loop.ts, self-modify.ts (full), needs-detector.ts, skill-manager.ts, progress-tracker.ts. Three outcomes: keep+integrate (plan v3.1), salvage+delete, delete+forget.
---

## Three guiding decisions (committed)

These shaped the v3 roadmap and should not be revisited casually:

1. **Sneebly first, Plumb later.** Get Sneebly perfect on small projects before stress-testing on Plumb.

2. **Use Opus 4.6 / 4.7.** Modernize v2.0's model tiers. v2.0 was built before these models existed.

3. **Hourly check-ins is the cadence target.** Slices that complete in 30-50 min with 10-15 min human review.

---

## Today's session — 2026-05-17 (Path A: finish architecture analysis)

5-block agenda. Update status as each block completes.

### Block 0: Create SESSION-LOG.md
- Status: IN PROGRESS
- Time: 15 min
- Output: this file committed to v3 branch

### Block 1: Plumb housekeeping
- Status: DONE - May 15 commits were already pushed; SESSION-LOG corrected
- Time: 15 min
- Tasks:
  - cd to `~/Sneebly-V3/projects/Plumb`
  - Run `git log --oneline -5` to confirm 3 unpushed commits look right
  - `git push`
- Why: clears mental overhead, easy warmup, closes yesterday's loop

### Block 2: Read src/subagents/spec-executor.js
- Status: DONE - read spec-executor.js (251 lines), spec-executor.md (113 lines), elon-builder.md (71 lines)
- Time: 60-90 min
- Tasks:
  - User pastes URL: `https://github.com/jhmac/sneebly/blob/main/src/subagents/spec-executor.js`
  - Claude reads file in full
  - Append analysis section to V2_analysis.md
  - Note specifically: auto-correction rules? related-files inference? pre-existing TS error handling?
- Why: settles whether JS path is canonical (most likely yes); is the single most important file we haven't analyzed

### Block 3: Determine if TS path is dead code
- Status: DONE - cloned v2.0 main to ~/projects/sneebly-v2-readonly, ran 14 verification greps, confirmed no JS-to-TS imports and no CLI invocations of TS path
- Time: 30-45 min
- Tasks:
  - User pastes URL: `https://github.com/jhmac/sneebly/blob/main/src/autonomy-loop.ts`
  - Search v2.0 codebase for imports of autonomy-loop.ts (grep or read related files)
  - Determine: does any production code path invoke it?
- Why: definitive test for "TS path is dead vs alive"; resolves blocker #1 above

### Block 4: Architectural decision + session note
- Status: DONE WITH REVISION - committed 4ce3b1c (original decision) then eede1f3 (revision: defer deletion, add Week 1 investigation)
- Time: 15-30 min
- Tasks:
  - Based on Blocks 2-3, decide: JS path canonical (remove TS) OR both alive (consolidate later) OR something else
  - Extract auto-correction rules from builder-agent.ts if removing TS path
  - Write session note: `docs/sneebly-sessions/2026-05-17-execution-path-decision.md`
  - Update active blockers (mark #1 resolved)
- Why: commits the decision so future sessions don't relitigate

### Block 5: Update ROADMAP.md if needed (conditional)
- Status: DEFERRED to next session - Week 1 scope depends on self-modification investigation outcome
- Time: 30 min (only if needed)
- Tasks:
  - Only execute if Block 4 surfaced something that changes the 5-week plan
  - If skipping, mark "N/A" and note why
- Why: keep ROADMAP.md as the canonical strategic doc

### Block A: Self-modification investigation (added mid-session)
- Status: IN PROGRESS
- Time: 60-90 min
- Tasks:
  - Read 5 TS files in order: learning-loop.ts, self-modify.ts (full), needs-detector.ts, skill-manager.ts, progress-tracker.ts
  - Per file: purpose, mechanisms, completeness, AnimAItion couplings
  - Decide outcome: keep+integrate (plan v3.1), salvage+delete, delete+forget
- Why: blocker #6 resolution; decides whether self-modification is real feature or pipe dream

### End-of-day: Update this SESSION-LOG.md
- Append "what got done" to today's session
- Update "Current state" section if state changed
- Update "Active blockers" — mark resolved, add new ones
- Commit and push

---

## Session history

### 2026-05-15 (Day 1)

**Plumb work:**
- Audited Plumb codebase, rewrote AGENTS.md, fixed GOALS.md
- First Auto Mode trial: drag-to-assign Playwright test (verification-pending due to environment gaps)
- Discovered Mac mini setup gaps: pnpm not installed, drizzle-kit esbuild mismatch, Plumb preinstall hook issue, missing env vars

**Sneebly discoveries:**
- Discovered the two-Sneeblys problem (`~/Sneebly-V3/` local install not in git vs `github.com/jhmac/sneebly` v2.0 standalone)
- Pushed embedded-snapshot to GitHub
- Read v2.0's SPEC.md (43KB) — revealed v2.0 is far more substantial than assumed
- Reversed strategy from Path B (Claude Code rebuild) to Path A (v2.0 refactor)

**Artifacts created:**
- v3 branch on `jhmac/sneebly`
- `docs/SLICE-CYCLE.md` (v1)
- `docs/ROADMAP.md` (8-week plan, later superseded)
- `.sneebly/error-ledger.md` template
- `.sneebly/pending-observations.md` with 6 lessons
- `docs/sneebly-sessions/2026-05-15-spec-md-deep-dive.md`

### 2026-05-16 (Day 2)

**Morning — strategic finalization:**
- Rewrote ROADMAP.md based on SPEC.md findings: 5-week refactor plan replacing 8-week rebuild plan
- Committed and pushed

**Afternoon — deep code dive:**
- Read 15 v2.0 source files in detail with per-file analysis (~6 hours focused):
  - src/elon.js (1834 lines) — two-mode Strategic Constraint Solver
  - src/code-engine.js (405 lines) — file operations engine
  - src/security.js (414 lines) — full security layer (5 classes, injection patterns, etc.)
  - src/memory.js (462 lines) — persistence layer with signature-based dedup
  - src/context-loader.js (210 lines) — identity file loader
  - src/middleware.js (242 lines) — Express middleware
  - src/ralph-loop.js (290 lines) — iterative spec executor
  - src/orchestrator.js (485 lines) — heartbeat cycle conductor
  - src/regression-tracker.js (140 lines) — escalation scoring
  - src/dependency-index.js (262 lines) — static dependency graph (most AnimAItion-coupled)
  - src/integration-health.js (372 lines) — external integration probes
  - src/scenario-runner.js (514 lines) — Playwright e2e runner
  - src/index.js (116 lines) — public package API
  - src/builder-agent.ts (515 lines) — second autonomous execution path (TS)
  - src/subagents/dispatcher.js (381 lines) — LLM call chokepoint
- Wrote V2_analysis.md (884 lines, 2 commits) — per-file analyses
- Wrote V2_findings.md (560 lines, 1 commit) — cross-file synthesis with v3 implications

**Key discoveries:**
- Dual codebase finding (JS path vs TS path)
- ELON's two modes already cover autonomous app building (build) and bug fixing (fix); slice mode is a small addition
- Auto-correction rules in builder-agent.ts are encoded wisdom — the real moat
- Defensive JSON parsing in dispatcher.js has 5 fallback strategies (months of LLM-quirk lessons)
- Yesterday's error-ledger design is superseded by regression-tracker.js (already in v2.0)
- 4 files need heavy AnimAItion-decoupling refactor: dependency-index, integration-health, scenario-runner, and the path rules in builder-agent
- 6 files need light refactor (small AnimAItion couplings)
- 3 modernizations for Opus 4.7: dispatcher MODEL_MAP, token-based cost tracking, prompt caching

**End-of-day v3 branch state:** 9 commits ahead of main, all pushed to origin.

---

## Files NOT yet read (for future reference)

Still on the to-read list for Block 2b/2c or as part of Week 1 extraction:

**src/ TS-path supporting files:**
- src/path-safety.ts
- src/identity.ts
- src/utils.ts
- src/shell-executor.ts

**src/subagents/ (most are unread):**
- src/subagents/spec-executor.js — Block 2 today
- src/subagents/error-resolver.js
- src/subagents/perf-optimizer.js
- src/subagents/codebase-intel.js
- src/subagents/self-improver.js
- src/subagents/elon-evaluator.js
- src/subagents/elon-builder.js (if exists)
- src/subagents/site-crawler.js (if exists)

**Already-read in earlier sessions (don't re-read):**
- src/autonomy-loop.ts — read 2026-05-15 (will re-skim in Block 3 today)
- src/planner-agent.ts — read 2026-05-15
- src/verify-agent.ts — read 2026-05-15
- SPEC.md — read 2026-05-15

**Other unread:**
- src/middleware/admin-dashboard.js — full admin UI (deferred to Block 2c)
- bin/sneebly.js, bin/heartbeat.js, bin/elon.js — CLI entry points (Block 2c)
- templates/*.md identity templates (Block 2b)
- INSTALL-WITH-REPLIT.md — installation flow (Block 2c)
- README.md, package.json — meta (Block 2c)

---

## For tomorrow-Claude (or fresh-eyes-Claude)

If you're picking this up cold:

1. Read this file top-to-bottom first
2. Then ROADMAP.md for strategic plan
3. Then V2_findings.md for architecture context
4. Only read V2_analysis.md if drilling into specific files
5. Run `git log --oneline -10` to see recent work
6. Run `cat ~/projects/sneebly-v3/docs/SESSION-LOG.md | head -100` to verify state

The three guiding decisions (Sneebly first / Opus 4.6-4.7 / hourly check-ins) are committed and shouldn't be relitigated.

The dual-codebase question is the top open issue — resolve before Week 1 extraction.

ROADMAP.md describes the 5-week path; Week 1 is extraction of Sneebly from AnimAItion per spec #19.
