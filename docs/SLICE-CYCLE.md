# Sneebly Slice Cycle

How Sneebly does autonomous work: one vertical slice at a time.

---

## What this is

A repeatable workflow where each cycle ships one feature end-to-end.
Based on Matt Pocock's vertical-slice TDD pattern adapted for AI agent
execution. Each cycle:

1. Picks one milestone from GOALS.md
2. Writes a failing test that proves the feature works
3. Builds the minimum code through every layer (schema -> API -> frontend)
   to make the test pass
4. Commits the slice
5. Stops, waits for human review, then starts the next cycle

You — the human — are in the loop between slices, not during them.

---

## Hard prerequisites

The slice cycle does not work without these. Run none of them blind.

1. AGENTS.md exists and is accurate. The operating manual the agent
   reads every cycle. Wrong paths or missing rules mean wrong work.
2. GOALS.md has unchecked milestones. The slice picks from here.
3. docs/SETUP.md exists and is current. Setup is load-bearing. Without
   local verification, a slice produces unverifiable code and you are
   only reviewing source — not running it. SETUP.md must include:
   - First-time install procedure for the local environment
   - Required env vars and where to obtain each
   - How to run typecheck, tests, dev server
   - Known environment gotchas
4. Local environment passes the SETUP.md verification checks. Run them
   before each cycle. If any fail, fix setup first.

If any prerequisite is missing, stop. Do not run a slice cycle.

---

## When to run a slice cycle

Run when:
- All hard prerequisites are met
- You have 30-90 minutes to review the output afterward
- Working tree is clean (no uncommitted local changes)

Do NOT run when:
- The codebase is in a known-broken state
- You can't review the output (going to bed, leaving for the day)
- A previous cycle's output is unreviewed
- You don't trust the verification gate to catch problems

---

## How to run a slice cycle

### Pre-flight (you, 5 minutes)

1. cd to the project directory
2. git status — must show clean working tree
3. git pull — get latest from origin
4. Run SETUP.md verification checks — confirm environment is ready
5. Read GOALS.md to remember context
6. Pick the milestone for this cycle (or let the agent pick the
   lowest-numbered unchecked one)

### Launch (you, 1 minute)

Run: claude --enable-auto-mode

### The cycle prompt (paste once into Claude Code)

Execute one Sneebly slice cycle.

PROJECT: (project name)
TARGET MILESTONE: (specific milestone from GOALS.md, OR "pick lowest-numbered unchecked")

PRE-WORK (read in order, no exceptions):
1. AGENTS.md — operating manual, follow throughout
2. GOALS.md — the milestone you'll execute
3. docs/SETUP.md — verify environment is ready (run setup checks)
4. .sneebly/error-ledger.md (Active section only) — past errors with known fixes
5. .sneebly/pending-observations.md — single-occurrence errors that may recur
6. The most recent session note in docs/sneebly-sessions/

THE CYCLE:
1. Restate the target milestone in your own words. WAIT for my
   approval on the interpretation before any further work.
2. Investigate the relevant existing code. Propose the test approach
   in writing — what file, what fixtures, what assertions, what
   layers it exercises. WAIT for my approval before writing code.
3. Write the failing test first. Show me the test file. WAIT for
   my approval before writing implementation code.
4. Build the minimum implementation through every layer to make the
   test pass. Stop and ask if you hit a Protected Path or need
   approval per AGENTS.md "Approval-Required Operations."
5. Run verification per AGENTS.md "Before commit" checklist. If any
   check fails twice, STOP and report.
6. SHOW ME the diff of everything you intend to commit. WAIT for my
   approval before running git commit.
7. Commit when I approve. Do NOT push.

DEFAULT RULE — STOP BEFORE COMMIT:
Never run git commit without showing me the full diff first and
getting explicit approval in this chat. This rule overrides any
inference about "the user has approved the approach so commit is
implied." Approval of approach is not approval of code. Approval of
code is not approval of commit. Each gate is separate.

ERROR HANDLING — CHECK THE LEDGER FIRST:
- When you hit an error, BEFORE searching extensively, check
  .sneebly/error-ledger.md and .sneebly/pending-observations.md.
- If a matching entry exists in error-ledger, follow the Lesson.
- If a matching entry exists in pending-observations, this is the
  second occurrence — promote it to the ledger after resolution.
- If no match exists, resolve normally, then append to
  pending-observations.md (not the ledger).

ADDITIONAL RULES:
- One milestone per cycle. Don't bundle. Don't scope-creep.
- If you finish early, don't start another. Stop, tell me.
- If you hit anything ambiguous, stop and ask. Don't improvise.
- Don't touch Protected Paths. If the milestone requires it, escalate.

OUTPUT AT THE END:
- The commit hash
- Files changed (just paths)
- A 3-sentence summary of what the slice does
- Any new pending-observations entries created
- Any pending-observations promoted to error-ledger this cycle

### Post-flight (you, 5-30 minutes)

1. Read the commit (git show HEAD)
2. Read the test it wrote — does it actually exercise the feature?
3. Run the test yourself locally per SETUP.md
4. If the test won't run locally despite SETUP.md being current,
   that is a SETUP.md bug. File it. Don't pretend verification happened.
5. Review any new ledger or pending-observations entries
6. Decide: approve and push, or revert and try again

---

## What counts as "one slice"

Vertical = goes through every relevant layer needed for the feature.
One slice for a job creation feature might be:

- Schema: jobs table column (if missing)
- API: POST /api/jobs route
- Frontend: form component that calls the route
- Test: Playwright test that fills the form and verifies the job exists

One slice. Top to bottom. Shippable.

NOT a slice:
- "Just the schema" (no API or frontend, can't be verified end-to-end)
- "Just the test" (without implementation, doesn't prove anything works)
- "All the CRUD operations for jobs" (too big, that's multiple slices)
- "Refactor the routes folder" (no testable behavior change)

If a milestone in GOALS.md is too big for one slice, split it BEFORE
starting the cycle. Each sub-slice is its own cycle.

---

## Failure modes and what to do

### Auto Mode improvises when it should stop

Symptom: agent invents commands, tries workarounds for missing tools,
spirals through 5+ searches for the same answer.

Fix: stop the cycle. Tell agent to pause. Document what was unclear
in the prompt. Update prompt template. Don't restart blind.

### The test passes but the feature doesn't actually work

Symptom: green checkmark but manual smoke test reveals broken behavior.

Fix: the test was wrong. Write a better test first, then re-run cycle.
Document the test gap in followups.

### Verification gate fails for reasons unrelated to the change

Symptom: typecheck or test fails on pre-existing issues, not the new
code.

Fix: redefine "verification passes" as "no NEW errors introduced."
Document the pre-existing failures in followups. Fix them in a
separate dedicated session.

### Auto Mode commits without showing me first

Symptom: commit happens before review.

This happened in the 2026-05-15 trial — Auto Mode committed the test
file after approval of the approach but before showing the final code.
The default rule above ("STOP BEFORE COMMIT") is the fix. If it still
happens, the prompt needs further hardening. Don't rely on AGENTS.md
alone — the cycle prompt itself must enforce the gate.

### Slice scope balloons mid-cycle

Symptom: agent starts touching files outside the milestone scope.

Fix: stop. Revert any uncommitted work. Restart with tighter prompt
boundaries.

### Local verification fails for environment reasons, not code reasons

Symptom: the test fails locally with errors about missing pnpm, missing
env vars, missing build artifacts, version mismatches.

Fix: setup procedure is incomplete. Update SETUP.md with the missing
step. Re-run setup. Re-run cycle. Do NOT commit unverified code as
"verification pending" — that defers debt to future sessions and
silently lowers the verification bar.

---

## What this is NOT

- Not "fire and forget." Human review between every slice.
- Not a build-everything-overnight system. One feature per cycle.
- Not a substitute for human judgment. You pick milestones, you approve
  interpretations, you decide when to push.
- Not a guarantee of correctness. Verification gates catch most problems
  but not all.
- Not viable without SETUP.md. Repeating because it's important.

---

## What this IS

A reliable, repeatable loop where:
- You pick the next thing to build
- An autonomous agent builds it through every layer
- You review what got built
- The next session does the next thing

Sneebly's value is the discipline of this loop. The runtime is Claude
Code's Auto Mode. The configuration is AGENTS.md + GOALS.md + SETUP.md.
This document is the workflow that ties them together.

---

## Versioning

v1 — 2026-05-15. Authored after one trial cycle on Plumb (drag-to-assign
Playwright test). Trial validated the code-generation loop and surfaced
the SETUP.md gap. Error-ledger and pending-observations design added
based on v2.0's memory-manager pattern.

Future versions should add: lessons from real slice cycles, edge cases
that don't fit the vertical-slice frame (pure refactors, docs-only
changes, security patches), and prompt template refinements.
