# Sneebly v3 Roadmap

8-week plan to working v3 on small/medium greenfield projects.
Authored 2026-05-15 after deep dive into v2.0's autonomy architecture
and one Auto Mode trial on Plumb.

---

## North Star

Sneebly is a tool that:
- Drops into any Node.js project
- Reads GOALS.md
- Picks the next vertical slice (Pocock pattern)
- Builds the slice through every layer
- Verifies it
- Commits it
- Picks the next slice
- Repeats with hourly human check-ins

User experience: paste prompt, walk away, come back in an hour, review
what got built, approve or correct, walk away again.

Target cadence: hourly check-ins on small/medium greenfield projects.
Larger projects (Plumb-scale) come later as a stress test.

---

## Three guiding decisions

1. Sneebly first, Plumb later. Get Sneebly perfect on small projects
   before stress-testing on Plumb (60+ tables, monorepo, Replit-shaped).
2. Use Opus 4.6 / 4.7. v2.0 was built before these models. Modern Opus
   needs less hand-holding, fewer scaffolding layers, lighter prompts.
3. Hourly check-ins is the cadence target. Achievable for slices that
   complete in 30-50 minutes with 10-15 minutes of human review.

---

## What we keep from v2.0

After reading autonomy-loop.ts, planner-agent.ts, verify-agent.ts:

Keep verbatim or close:
- verify-agent.ts — contextual verification logic (health, syntax, TS,
  file-type-specific checks, Playwright browser smoke)
- The session journal pattern (.sneebly/session-journal.json)
- Auto-rollback mechanism (file backups, restore on verify fail)
- Safety guards (rate limit, max cycles, max errors, budget cap)
- NEEDS-ATTENTION.md output format
- The encoded rule-set from planner-agent's prompt (the genuine moat)

Modernize for Opus 4.7:
- Planner prompt (tighter, use extended thinking)
- Builder agent (replace with Claude Code Auto Mode entirely)
- Auto-fixer (mostly unnecessary — Auto Mode self-corrects)
- Opus review step (simpler with 4.7's improved review capability)

Drop entirely:
- Plan/Build/Verify/Review terminology (became two macro steps)
- Per-step retries with fail counts (Auto Mode handles within session)
- The 50-cycle max, 2-minute interval (replace with slice-based pacing)

---

## What is new in v3

1. Vertical-slice discipline baked into the planner. Each slice must
   produce a working end-to-end behavior through every layer.
2. Project-agnostic templates: AGENTS-template.md, GOALS-template.md,
   SETUP-template.md, SLICE-CYCLE.md.
3. Hourly check-in cadence. NEEDS-ATTENTION.md written after every slice.
4. Claude Code as the agent runtime. Sneebly orchestrates, doesn't build.
5. Error ledger + pending observations. Two-tier learning system that
   only promotes errors to the permanent ledger after they recur.

---

## Architecture

The user pastes a "start slice cycle" prompt.

Sneebly Orchestrator:
  Step 1. Read GOALS.md, AGENTS.md, SETUP.md
  Step 2. Read session journal (last failures)
  Step 3. Read error-ledger.md and pending-observations.md
  Step 4. Opus 4.7 picks next slice
  Step 5. Validate slice scope (vertical, bounded)

Launch Claude Code Auto Mode with:
  - SLICE-CYCLE prompt template
  - slice spec
  - AGENTS.md context
  - relevant ledger entries

Auto Mode handles: investigate, propose, test, implement, self-correct.

Sneebly Orchestrator resumes:
  Step 6. Run verify-agent on changed files
  Step 7. Rollback if verify fails
  Step 8. Auto-refactor pass (Opus 4.7 reviews)
  Step 9. Write NEEDS-ATTENTION.md entry
  Step 10. Append to pending-observations or promote to error-ledger
  Step 11. Git commit (do not push)
  Step 12. Update session journal
  Step 13. Pause for hourly check-in window

Then loop or wait.

Sneebly code surface:
- bin/sneebly.js — CLI entry point
- src/orchestrator.ts — the main loop
- src/slice-picker.ts — Opus 4.7 picks next slice from GOALS.md
- src/claude-code-launcher.ts — spawns Claude Code Auto Mode sessions
- src/verify-agent.ts — adapted from v2.0
- src/journal.ts — adapted from v2.0
- src/rollback.ts — adapted from v2.0
- src/ledger.ts — error-ledger + pending-observations management
- templates/ — template MD files
- skills/ — the 5 Sneebly skills

Target: ~2-3k lines of TypeScript total. Fraction of v2.0's size.

---

## 8-week plan

### Week 1: Architecture decision and scaffolding

- Decide canonical v3 repo structure (this branch, or new)
- Read remaining v2.0 files: SPEC.md, builder-agent.ts, learning-loop.ts,
  memory-manager.ts, spec-validator.ts
- Extract verify-agent.ts, journal pattern, rollback from v2.0
- Write slice-picker.ts (Opus 4.7 reading GOALS.md, picking next slice)
- Finalize SLICE-CYCLE.md based on what reading v2.0 revealed

### Week 2: Claude Code launcher + first end-to-end test

- claude-code-launcher.ts: spawn Auto Mode with right prompt, monitor
  for completion, handle timeout, capture output
- First end-to-end test: pick slice, run slice, verify, commit on a tiny
  test project (5-10 tables, fresh codebase)
- Will reveal 10+ things that do not work

### Week 3: Fix what broke in week 2

- Stuck-loop detection (probably the hardest problem)
- Better failure context propagation
- Better slice-scoping (the planner will pick badly at first)
- Error-ledger and pending-observations mechanics

### Week 4: Templates and project agnostic

- Template MD files for new projects (AGENTS, GOALS, SETUP)
- Test Sneebly on a SECOND small project to validate it is not just
  shaped for the first test project
- Each project differences become template knobs

### Weeks 5-8: Iterate based on real use

- Run Sneebly on a real small greenfield project for actual work
- Each session reveals failure modes
- Each failure mode gets a fix or a rule-set entry in templates
- By end of week 8: Sneebly should handle hourly check-ins on a small
  project with 60-70% slice success rate

### Week 9+: Try Sneebly on Plumb

- Only after Sneebly works reliably on smaller projects
- Expect to discover Plumb-specific gaps
- These become Sneebly improvements, not Sneebly failures

---

## Realistic ceiling

For a small greenfield project (5-10 tables, fresh codebase, clear
GOALS.md), with full v3 working: probably 2-4 substantial check-ins
per day, gap of 1-2 hours between check-ins, 60-70% slice success rate.

For Plumb-scale: not reliable in 2026. Plumb is too established, too
complex, too coupled to Replit-specific patterns. Sneebly on Plumb
would need careful per-cycle scoping.

For a second project after Plumb: plausibly more reliable, because
Sneebly will have learned from Plumb's failures.

---

## Honest uncertainties

1. Whether v2.0's verify-agent.ts works for project-agnostic Sneebly
   (current verifier has Drizzle/Express assumptions baked in)
2. Whether Opus 4.7's stuck-loop failure rate is genuinely lower than
   prior model generations
3. Whether hourly check-ins is the right cadence (might emerge as 30-min
   or 2-hour based on actual slice duration)
4. Whether Claude Code Auto Mode is reliable as the agent runtime over
   50+ consecutive sessions (single trial today is thin evidence)
5. Whether vertical-slice discipline works in practice for AI agents
   (Pocock proved it for humans, AI adaptation is unproven)

These resolve through running Sneebly on real projects, not through more
architecture work.

---

## What this is and is not

This IS:
- A realistic plan to working v3 in 8-9 weeks of focused work
- An incremental path that produces value at each weekly milestone
- A genuine attempt at Tier 2.5 / Tier 3 autonomy
- An honest accounting of what is keepable from v2.0

This is NOT:
- A promise of working v3 in 8-9 weeks (real-world timing extends)
- A claim that Sneebly will work on Plumb in week 9
- A substitute for v2.0 — v2.0 stays on main as reference
- A finished design — uncertainties resolve through use

---

## Tomorrow's first move

Read SPEC.md from v2.0 main branch (43KB). Contains months of design
decisions. Will reshape this roadmap as needed.

Then push 3 Plumb commits with fresh eyes.

Then either begin week 1 work or defer to next session based on energy.
