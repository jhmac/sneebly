# Session note — 2026-05-17: Execution path decision

## The decision

Sneebly v3 uses the JavaScript execution path exclusively. The TypeScript
files in v2.0's `src/` directory are dead code from when Sneebly was
embedded inside AnimAItion. All 26 TS files in `src/` will be deleted
during Week 1 extraction work.

## How we reached this decision

Block 2 today: read `src/subagents/spec-executor.js` (the JS-path's executor
glue, 251 lines) and `templates/subagents/spec-executor.md` (its system
prompt, 113 lines).

Block 3 today: read `templates/subagents/elon-builder.md` (the JS-path's
build-mode planner prompt, 71 lines).

Block 4 verification today (Block 4a):
- Cloned v2.0's main branch to `~/projects/sneebly-v2-readonly/`
- Ran grep tests to determine which files import the TS files
- Ran tests to determine if any CLI command (bin/) or npm script invokes
  the TS path
- Read the top of `src/self-modify.ts` to understand its purpose
- Checked `src/safety.js` to verify it's distinct from the deleted
  TS-path `path-safety.ts`

## Evidence

### Evidence 1: TS files form a self-contained cluster

Grep results show every TS file's imports either reference:
- Other TS files in src/
- External packages (fs, path, etc.)

**No JS file in src/ imports any TS file.** The cross-codebase dependency
graph has zero edges from JS to TS.

### Evidence 2: No CLI command invokes the TS path

`bin/` contains 6 JS commands: apppilot.js, continuous.js, crawl.js,
elon.js, heartbeat.js, sneebly.js.

`grep -rn "autonomy-loop|self-modify|builder-agent|planner-agent" bin/`
returned no matches. Every user-facing command uses the JS path.

### Evidence 3: No npm script invokes the TS path

package.json has only two scripts:
- `npm run build` — runs tsc (compiles TS but doesn't invoke it)
- `npm run dev` — runs tsx on src/index.ts (the JS path's entry point)

### Evidence 4: self-modify.ts paths are broken for standalone Sneebly

`src/self-modify.ts` lines 8-22 list paths Sneebly can self-modify:

    SNEEBLY_SAFE_FILES = [
      "server/auto-fixer.ts",
      "server/planner-agent.ts",
      "server/builder-agent.ts",
      ... (all referenced as server/*.ts)
    ]

These paths reference `server/` — the directory where Sneebly source
lived when EMBEDDED in AnimAItion. In standalone Sneebly (v2.0 main
branch), the files are at `src/`, not `server/`. self-modify.ts
literally cannot find its targets in the standalone layout.

This is conclusive: the TS path was Sneebly's self-modification system
from the embedded era, and the extraction broke it. Nobody updated the
paths because nobody invokes it anymore.

### Evidence 5: ELON is the JS-path's planner

The JS path has its own planner (`templates/subagents/elon-builder.md`)
that does what TS-path's `planner-agent.ts` did — generate specs based
on app spec + roadmap + existing files. ELON's build mode replaced the
TS path's planning capability.

## Files to delete in Week 1

All 26 TypeScript files in v2.0's `src/`:

    src/anthropic-client.ts
    src/auto-db-push.ts
    src/auto-fixer.ts
    src/autonomy-loop.ts
    src/builder-agent.ts
    src/claude-session.ts
    src/command-center.ts
    src/cost-tracker.ts
    src/identity.ts
    src/learning-loop.ts
    src/logging.ts
    src/memory-manager.ts
    src/needs-detector.ts
    src/path-safety.ts
    src/planner-agent.ts
    src/progress-tracker.ts
    src/self-modify.ts
    src/shell-executor.ts
    src/skill-manager.ts
    src/sneebly-hooks.ts
    src/spec-monitor.ts
    src/spec-validator.ts
    src/spec-watcher.ts
    src/sync-from-github.ts
    src/utils.ts
    src/verify-agent.ts

Estimated total: 5000-8000 lines removed.

## What to EXTRACT before deletion

Before deleting these files, extract the encoded wisdom that's worth
preserving:

### 1. Path-routing rules from builder-agent.ts `autoCorrectStep`

The function at lines ~173-225 contains hardcoded redirects:
- create+exists → modify
- modify+missing → create
- schema work targeting server/db.ts → redirect to shared/schema.ts
- route work targeting server/index.ts → redirect to server/routes.ts
- storage work targeting server/db.ts → redirect to server/storage.ts

These represent observed planner mistakes. Extract them to:
- **AGENTS.md template** as a `path_rules:` declarative section, where
  each project can override/extend rules for its own conventions
- **templates/subagents/elon-builder.md** as a "Common Path Mistakes"
  section, so the JS-path planner avoids generating wrong paths in the
  first place

Two homes because the rules are split between project-specific (which
files exist where — goes in AGENTS.md) and generic guidance (don't
target db.ts for schema — goes in elon-builder.md).

### 2. Related-files inference from builder-agent.ts `inferRelatedFiles`

The function contains pattern rules like:
- "if editing routes.ts, include storage.ts and schema.ts in context"
- "if editing client pages, include schema.ts, App.tsx, queryClient.ts"
- "description mentions auth/clerk/user → include schema.ts, routes.ts"

These improve LLM context quality. Extract to:
- **AGENTS.md template** as a `related_files:` declarative section

### 3. NOT extracting: self-modification capability

The TS path's `self-modify.ts` represents a "Sneebly modifies itself"
feature. We are NOT preserving this. Reasons:
- The current implementation is already broken (path mismatch)
- Self-modification is risky for v3.0 — too much can go wrong
- If v3 wants this feature later, it should be REBUILT in the JS path
  with current architecture, not ported from the TS path
- Marked as "future consideration, not v3.0 scope"

## Confirmation: src/safety.js is NOT deleted

I almost missed this in earlier analysis. `src/safety.js` is a JS file
that implements `isPathSafe()` for the JS path. It imports IDENTITY_FILES
from security.js and parses AGENTS.md sections for Safe Paths and
Protected Paths.

`src/safety.js` STAYS. It's load-bearing for code-engine.js's
`_checkSafety()` triple-gate.

The TS file `src/path-safety.ts` (imported by 5 TS files including
builder-agent.ts) IS deleted as part of the TS path removal. The two
files are duplicates of each other — same name, different
implementations.

## Open questions resolved by this decision

- **V2_findings.md Q1 — Dual codebase verdict:** RESOLVED. There was
  never a "dual codebase" — there was the active JS path and historical
  TS artifacts from the embedded era. Not parallel systems, but
  historical layers.
- **V2_findings.md Q6 — Pre-existing TS errors handling:** Becomes
  moot once all TS files are deleted. v3 codebase will be pure JS.
- **V2_findings.md Q7 — Identity file required vs optional:**
  Unchanged; orthogonal to this decision.

## Open questions still pending

- **V2_findings.md Q2 — NEEDS-ATTENTION.md writer location:** Still
  need to find where it gets written. Block 2c.
- **V2_findings.md Q3 — Admin dashboard scope:** Still deferred. Block 2c.
- **V2_findings.md Q4 — Subagent inventory:** Partially answered (we know
  about spec-executor and elon-builder). Block 2b will count the rest.
- **V2_findings.md Q5 — Cost reality vs estimates:** Week 4 modernization.
- **V2_findings.md Q8 — App Specification format in GOALS.md:** Block 2b.

## ROADMAP.md updates needed

Week 1 of v3 work should add explicit steps:

1. Extract `autoCorrectStep` rules from builder-agent.ts to:
   - AGENTS.md template's `path_rules:` section
   - elon-builder.md's "Common Path Mistakes" section
2. Extract `inferRelatedFiles` patterns from builder-agent.ts to:
   - AGENTS.md template's `related_files:` section
3. Delete all 26 TS files in src/
4. Run extraction (spec #19 work)

This is a meaningful change to Week 1's scope. ROADMAP.md to be updated
in Block 5 of today's session.

## Confidence level

99%. The remaining 1% reflects:
- I haven't read every TS file (just the 4 most important plus top of
  self-modify.ts)
- There may be subtle cross-path coupling I missed (e.g., a JS file
  that doesn't import a TS file directly but reads its output)
- The TS path might compile via `npm run build` and serve some purpose
  I haven't identified

These risks are mitigated by:
- Doing the deletion in Week 1 (a focused work block, not casually)
- Testing the JS path still works after deletion (existing test command
  or smoke test)
- The deletions are reversible via git revert if something breaks
