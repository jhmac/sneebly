# V2_findings.md — Cross-File Synthesis & v3 Implications

Companion to V2_analysis.md (per-file analyses). This document distills the
15 file analyses into actionable findings, surfaces cross-file patterns,
and updates the v3 plan based on what reading the code revealed.

Authored 2026-05-16 after Block 2a of the source deep dive.

---

## Executive summary

v2.0 is more substantial and more sophisticated than yesterday's roadmap
assumed. Roughly 70% of what v3 wants to be is already implemented. The
remaining 30% is:

1. Removing AnimAItion couplings from 3-4 specific files
2. Consolidating a parallel JS/TS codebase that emerged historically
3. Adding vertical-slice discipline as a third mode alongside build/fix
4. Modernizing for Opus 4.7 and current Anthropic API features
5. Three small upgrades to specific subsystems

The path forward is "extract + refactor + extend," not "rebuild." The
revised v3 timeline is 4-6 weeks, not 8-9.

---

## The dual-codebase finding — biggest discovery

v2.0 has two parallel autonomous execution paths that coexist in the
codebase:

**JS Path (Active):**
- orchestrator.js — heartbeat cycle entry
- ralph-loop.js — iterative spec executor
- subagents/spec-executor.js — the actual builder (read in Block 2b)
- verify-agent.ts — verification gate
- elon.js — strategic planner generating specs
- code-engine.js — file operations

**TS Path (Possibly Superseded):**
- autonomy-loop.ts — TS-path orchestrator
- planner-agent.ts — TS-path planner generating plans
- builder-agent.ts — TS-path builder executing plans
- verify-agent.ts — shared with JS path

**Evidence the JS path is canonical:**
- orchestrator.js (the file index.js wires into Express via initSneebly)
  calls executeRalphLoop from ralph-loop.js
- ELON generates specs (JSON files) that Ralph Loop consumes
- The approved-queue and pending-queue lifecycle is built around specs,
  not plans

**Evidence the TS path is alive:**
- builder-agent.ts is recently developed (uses claude-opus-4-6, written
  in TS rather than JS)
- planner-agent.ts has encoded rules in its prompt (the moat)
- autonomy-loop.ts has a complete autonomy implementation

**Recommendation for v3 Week 1:**
Read src/autonomy-loop.ts, src/planner-agent.ts, and src/subagents/spec-
executor.js side-by-side. Determine which path is invoked in actual
operation. Likely conclusion: JS path is the production execution flow;
TS path was an earlier prototype or parallel experiment. Extract the
auto-correction rules from builder-agent.ts (these are pure gold) and
move them to AGENTS.md config. Remove the TS path entirely.

If we don't consolidate, v3 ships with dead code, divergent abstractions,
and confused future contributors.

---

## What to keep verbatim (the moat)

These components represent v2.0's hard-won engineering. v3 should preserve
each essentially unchanged:

**Security (src/security.js):**
- IDENTITY_FILES list (add SLICE-CYCLE.md)
- ALLOWED_EXECUTABLES + ALLOWED_COMMANDS whitelist pattern
- DANGEROUS_SHELL_CHARS regex
- 22 INJECTION_PATTERNS — months of attack observation encoded
- IdentityProtection with SHA-256 checksums
- OutputValidator with BLOCKED_PATHS + dangerous-code pattern scanning
- CommandValidator with quoted-vs-unquoted scanning
- AuthRateLimiter sliding window
- OwnerVerification with crypto.timingSafeEqual

**Memory (src/memory.js):**
- The entire MemoryStore class
- Signature-based error deduplication (digits to N, strings to S)
- proper-lockfile concurrency safety
- Smart truncation (_truncateAtParagraph)
- Sanitization at every write point

**Code engine (src/code-engine.js):**
- _fuzzyMatch with min-2-lines AND exactly-1-match safety
- verifySyntax bracket balancer with string/template/comment handling
- backupMultiple/rollbackMultiple atomic multi-file pattern
- verifyRuntimeWithProcess with crash watch + health poll
- CRASH_PATTERNS list
- _checkSafety triple-gate (IDENTITY_FILES, traversal, isPathSafe)

**Ralph Loop (src/ralph-loop.js):**
- The full executor pattern
- consecutiveStuck counter with reset-on-success
- iterationHistory propagation for retry-with-context
- Atomic multi-file change pattern
- Spec lifecycle moves (pending -> in-flight -> completed/failed)
- Spec re-read per iteration

**Orchestrator (src/orchestrator.js):**
- The heartbeat flow sequence
- Identity-tampering hard halt
- App-down diagnosis mode
- Budget-gated subagent calls
- OutputValidator gate before recording actions
- Rate-limit pause between calls
- Counter-based discovery scheduling

**Regression Tracker (src/regression-tracker.js):**
- ENTIRE FILE. Best implementation of "learning ledger" concept.
- Escalation formula (consecutive streak + failure rate + time bonus)
- Currently-passing exclusion from escalated list
- Status flexibility (failed/unhealthy/misconfigured/error)
- 50-observation history cap per entry

**Dispatcher (src/subagents/dispatcher.js):**
- The chokepoint pattern (every LLM call through one function)
- Two-tier definition lookup (project override, template fallback)
- 5-strategy defensive JSON parsing
- Natural-language SPEC_COMPLETE detection (8 patterns)
- Error classification + exp backoff + retry-after
- Output validation gate
- trusted: true flag for task wrapping

**Context Loader (src/context-loader.js):**
- IDENTITY_FILES mapping
- buildSystemPrompt assembly order
- SECURITY_FOOTER mandatory close
- Forgiving missing-file behavior
- parseHeartbeatConfig with defaults

**Integration Health (src/integration-health.js):**
- HTTP helpers (_httpGet, _httpRequest) — clean, no external deps
- Uniform result shape across all checks
- Three-tier status (configured -> reachable -> functional)
- skipExpensive flag pattern
- Severity tagging (high/medium)

**Scenario Runner (src/scenario-runner.js):**
- The 8 step actions (project-agnostic)
- Fresh-context-per-scenario pattern
- Selector OR logic (comma-separated alternatives)
- In-browser fetch for apiCheck
- Auth-aware pass (401/403 = passed for protected)
- Screenshot on failure

**Builder Agent (src/builder-agent.ts) — the rules, not the file:**
- The auto-correction rule-set in autoCorrectStep (pure encoded wisdom)
- The related-files inference rule-set in inferRelatedFiles
- Two-attempt build with effort escalation
- Fix-loop with effort escalation
- Targeted TS error filtering (only NEW errors fail)

Total preserved: roughly 80-85% of v2.0's substance.

---

## What needs project-agnostic refactor

These files are heavily AnimAItion-coupled and need substantial rework.
Listed in order of effort:

**Heavy refactor (Week 2 work, 2-3 days each):**

src/dependency-index.js — #1 candidate.
- Make discovery directories config-driven from AGENTS.md
- Pluggable framework extractors (Express/Hono/Fastify/Next.js)
- Pluggable ORM extractors (Drizzle/Prisma/TypeORM/Mongoose)
- Pluggable frontend extractors (React+RQ, Vue+Pinia, etc.)
- Walk files via .gitignore-respecting traversal, not hardcoded dirs
- Read tsconfig.json paths for alias resolution

src/integration-health.js — #2 candidate.
- Replace hardcoded Shopify/Nylas/Database/WebSocket checks with registry
- Project AGENTS.md declares which integrations exist
- Ship generic built-ins: envVarsCheck, endpointCheck, anthropicCheck,
  postgresCheck
- Update Claude check model to Opus 4.7

src/scenario-runner.js — #3 candidate.
- Move 6 hardcoded scenarios to project config (.sneebly/scenarios.json
  or SCENARIOS.md)
- v3 ships ZERO default scenarios
- Make auth cookie name configurable
- Split dev-mode into separate file

**Medium refactor (Week 2 work, 1 day each):**

src/elon.js _readSourceFiles
- Hardcoded server/index.ts, server/routes.ts, etc. -> AGENTS.md
  core_files: declaration

src/elon.js findExistingRoutes
- Express-only patterns -> framework-pluggable like dependency-index

src/builder-agent.ts autoCorrectStep + inferRelatedFiles
- Hardcoded rules -> AGENTS.md path_rules: and related_files: sections
- Or move rules into the JS path's planner if JS path is canonical
- Either way, these rules MUST survive the refactor — they're the moat

**Light refactor (a few hours each):**

src/code-engine.js
- Default healthUrl from project config (not hardcoded localhost:5000)
- backupsDir default to .sneebly/backups/ (dot prefix)
- Add .cjs to JS_EXTENSIONS

src/security.js
- Add SLICE-CYCLE.md to IDENTITY_FILES
- Remove sneebly/subagents/ and sneebly/src/ from BLOCKED_PATH_PREFIXES
- Add pnpm + yarn to ALLOWED_EXECUTABLES
- Make ALLOWED_COMMANDS extensible via config

src/orchestrator.js
- Unify appUrl/healthUrl defaults across all files (single source)
- Move subagent imports to registry pattern (lazy load)
- Add per-subagent timeout

src/index.js
- Add initSneeblyHeadless(config) for non-Express
- Add runSliceCycle(config) export
- Ship index.d.ts with TypeScript types

---

## What needs Opus 4.7 modernization

These are bounded changes that take advantage of model and API capabilities
that didn't exist (or weren't as good) when v2.0 was built.

src/subagents/dispatcher.js:
- MODEL_MAP: update opus to claude-opus-4-7 (and check if Anthropic has
  newer Haiku/Sonnet versions to use)
- COST_ESTIMATES: recompute for current pricing
- Switch to token-based cost tracking via response.usage
- Enable prompt caching (cache_control) for repeat system prompts —
  significant cost reduction
- Add structured outputs / tool use option for subagents with defined
  schemas (eliminates JSON parsing fragility)

src/builder-agent.ts (if kept):
- Update claude-opus-4-6 -> claude-opus-4-7

src/integration-health.js:
- Update checkClaudeHealth model from claude-sonnet-4-20250514 to current

src/context-loader.js:
- Bump MEMORY_TAIL_LIMIT from 4000 to 16000 or 32000 chars (Opus 4.7 has
  larger context window)

src/elon.js, src/orchestrator.js:
- Add extended-thinking support for hard planning tasks (Opus 4.7 feature)
- Tighten subagent prompts where they had verbose hand-holding for older
  model generations

---

## What overlaps with yesterday's design (consolidate)

Yesterday we designed .sneebly/error-ledger.md and .sneebly/pending-
observations.md as a two-tier learning system. The threshold rule was
"don't promote to ledger until 2nd occurrence."

src/regression-tracker.js implements this concept more sophisticatedly:
- Tracks per-test pass/fail history (50 observations per entry)
- Computes escalation score (streak + rate + time bonus, max 15)
- Filters out currently-passing entries from escalated list
- The escalation score replaces the "2nd occurrence" heuristic

**v3 implication:** Drop the two-file design. Use regression-tracker.json
as the data store. Optionally generate a human-readable error-ledger.md
view by exporting escalated entries periodically. The pending-observations
concept disappears — observations are tracked in history with low
escalation scores; they "promote" to high-priority simply by accumulating
more failures.

**What this means concretely for the v3 branch:**
- Yesterday's .sneebly/error-ledger.md and .sneebly/pending-observations.md
  files we committed to the v3 branch are NOT what v3 will use.
- They represent an earlier design that's been superseded by reading the
  code.
- Don't delete them yet (they document yesterday's thinking) but they're
  not load-bearing for the v3 architecture.

---

## Architecture diagram

How the surviving v2.0 components fit together (the JS path):

    User installs Sneebly in their project
    Adds identity files (SOUL, AGENTS, IDENTITY, GOALS, etc.)
    Adds SETUP.md (new in v3) describing local install requirements
    Adds SLICE-CYCLE.md (new in v3) describing slice discipline

    Host app: app.use(sneeblyMiddleware) via initSneebly()
    [src/index.js wires Express integration]

    Heartbeat cycle launched (CLI or interval):
    [src/orchestrator.js]

      1. IdentityProtection.verify() — hard gate
         [src/security.js]

      2. MemoryStore.processErrorLog() — JSONL to known-errors with dedup
         [src/memory.js]

      3. loadContext() + buildSystemPrompt()
         [src/context-loader.js]

      4. _checkAppHealth() — hard gate
         [src/orchestrator.js]

      5. Optional crawl via Playwright
         [src/subagents/site-crawler — not yet read]

      6. Error triage:
         delegateToSubagent('error-resolver', task, options)
         [src/subagents/dispatcher.js -> src/subagents/error-resolver]

      7. Performance check:
         delegateToSubagent('perf-optimizer', stats, options)

      8. Optional codebase discovery (counter-triggered):
         delegateToSubagent('codebase-intel', context, options)
         Updates src/dependency-index.js's dependency-index.json

      9. ELON cycle (if triggered):
         [src/elon.js]
         - getElonMode(): build or fix
         - Build mode: parseAppSpec + parseRoadmapMilestones
                       + delegateToSubagent('elon-builder', ...)
                       Result: specs in approved-queue/
         - Fix mode: integration-health + scenario-runner
                     + regression-tracker.getEscalatedIssues()
                     + delegateToSubagent('elon-evaluator', constraint)
                     Result: specs in approved-queue/ or queue/pending/

      10. Approved-queue processing:
          For each spec in dataDir/approved-queue/:
            executeRalphLoop(spec, context, budget, options)
            [src/ralph-loop.js]
              - Loop up to 10 iterations:
                - delegateToSubagent('spec-executor', spec + history)
                - Apply via CodeEngine.applyChange / multi-file
                  [src/code-engine.js]
                - Verify syntax, run tests, runtime validate
                - Rollback if failure
              - Move spec to completed/ or failed/

      11. Weekly: codebase-intel (Monday), self-improver (Friday)

      12. NEEDS-ATTENTION.md write (v3 addition)

      13. Dashboard status update

    [src/middleware/admin-dashboard.js] presents live state
    Owner reviews via /sneebly/admin (or whatever path is configured)
    Approves pending specs (some auto-approved per SENSITIVE_CATEGORIES)
    Next heartbeat picks up approved specs


v3 additions to this flow (Week 3):
- New ELON mode: slice (third mode alongside build/fix)
- New SLICE-CYCLE.md identity file influencing planner prompt
- New SETUP.md identity file (operational-only) checked before each cycle
- Pre-cycle SETUP.md verification gate
- NEEDS-ATTENTION.md written explicitly after each slice

---

## Updated v3 roadmap implications

The ROADMAP.md committed this morning at 7eb5026 was based on partial
information. The 5-week plan in that file is roughly correct but a few
adjustments based on what reading code revealed:

**Week 1 additions:**
- Read remaining source files (subagents/spec-executor.js is #1 priority,
  then the other subagents, then TS-path supporting files)
- Decide JS path vs TS path — likely conclusion: JS path canonical, remove
  TS path
- Extract auto-correction rules from builder-agent.ts to AGENTS.md template

**Week 2 specifically:**
- Heavy refactor targets: dependency-index.js, integration-health.js,
  scenario-runner.js (the three most AnimAItion-coupled files)
- Light refactors: code-engine.js, security.js, orchestrator.js, index.js
  (the four with minor AnimAItion couplings)

**Week 3 additions:**
- Add slice mode to elon.js as third option
- Add SLICE-CYCLE.md and SETUP.md as identity files
- Add NEEDS-ATTENTION.md writer to orchestrator
- Drop yesterday's error-ledger.md and pending-observations.md design
  in favor of regression-tracker.js (already in v2.0)

**Week 4 — modernization for Opus 4.7:**
- Dispatcher MODEL_MAP and COST_ESTIMATES update
- Token-based cost tracking
- Prompt caching
- Optional structured outputs / tool use
- Update Claude API health check model

**Weeks 5-6 — first real-use validation on small greenfield project:**
- Same as ROADMAP.md
- Each session reveals failure modes
- Each failure becomes a fix or rule-set entry in AGENTS.md template

**Week 7+:** Plumb stress test as originally planned.

The total timeline is roughly the same (4-6 weeks to working v3 on small
projects) but the work in each week is now better specified.

---

## Open questions remaining

These didn't resolve from reading the 15 files. Most need a single
additional file or grep to answer:

**Q1 — Dual codebase verdict:**
Which path (JS via orchestrator.js + ralph-loop.js or TS via autonomy-
loop.ts + builder-agent.ts) is invoked in actual heartbeat operation?
- Resolution: read subagents/spec-executor.js and grep for "autonomy-loop"
  callers
- Decision point: Week 1 of v3 work
- Impact: removes ~1000 lines of dead code if one path is unused

**Q2 — NEEDS-ATTENTION.md writer:**
SPEC.md describes NEEDS-ATTENTION.md output. Orchestrator.js doesn't
write it. Where does it get written?
- Resolution: grep for "NEEDS-ATTENTION" across src/ and templates/
- Decision point: Week 1 of v3 work
- Impact: shapes how slice-cycle cadence is communicated to humans

**Q3 — Admin dashboard scope:**
src/middleware/admin-dashboard.js is referenced by index.js but not
read. How big is it? What does it provide beyond the minimal dashboard
in middleware.js?
- Resolution: read in Block 2c
- Decision point: Week 5 (validation week — does the dashboard work for
  non-AnimAItion projects?)
- Impact: probably small (UI, not core architecture)

**Q4 — Subagent inventory:**
How many subagent .md template files exist? The dispatcher loads them by
name; SPEC.md mentioned ~5; the code references error-resolver, perf-
optimizer, codebase-intel, spec-executor, self-improver, elon-evaluator,
elon-builder, site-crawler.
- Resolution: ls templates/subagents/ in Block 2b
- Decision point: Week 1 of v3 work
- Impact: shapes subagent registry design

**Q5 — Cost reality vs estimates:**
COST_ESTIMATES use flat $0.005/$0.02/$0.10. Real token-based costs are
likely 2-5x higher for max-tokens output. Budget allocation may be
significantly off.
- Resolution: add token-based tracking in Week 4 modernization
- Decision point: Week 4
- Impact: budget caps need recalibration

**Q6 — Pre-existing TS errors:**
quickTscCheck in builder-agent.ts filters output to changed files only.
Plumb has 39+ pre-existing TS errors on main. Does the JS-path spec-
executor have the same filtering? Or would it falsely fail on Plumb's
pre-existing errors?
- Resolution: read subagents/spec-executor.js
- Decision point: Week 1 of v3 work
- Impact: critical for "Sneebly works on real codebases with imperfect
  state"

**Q7 — Identity file required vs optional:**
context-loader.js is forgiving — runs with missing files. But CodeEngine's
_checkSafety falls back to "allow by default" if AGENTS.md missing. This
is fail-OPEN security gap.
- Resolution: fix in Week 2 — make AGENTS.md hard-required, fail closed
- Decision point: Week 2 refactor
- Impact: closes a real security hole

**Q8 — Build-mode prompt format for App Specification:**
parseAppSpec extracts ## App Specification section but the prompt format
expected by elon-builder subagent isn't documented. Need to see the
template to understand what the human writes.
- Resolution: read templates/GOALS.md in Block 2b
- Decision point: Week 5 — when first project uses build mode
- Impact: documentation burden for project setup

---

## Three things that surprised me

After 15 files, three findings I didn't expect:

**1. The auto-correction rule-set is hardcoded in builder-agent.ts.**
I previously thought the moat was encoded in the planner-agent.ts PROMPT.
Some of it is. But hard-coded rules in autoCorrectStep are MORE accessible
to extract and refactor — they're TypeScript switch statements, not prompt
text. v3 can pull these into AGENTS.md config more easily than prompt-
encoded rules.

**2. The defensive JSON parsing in dispatcher.js is extraordinary.**
Five fallback strategies including natural-language SPEC_COMPLETE
detection. This represents months of "the LLM said something weird and
we needed to handle it" lessons. v3 should preserve verbatim AND
optionally upgrade to structured outputs for subagents with defined
schemas. The defensive parsing becomes the fallback when structured
outputs aren't used.

**3. The dual codebase (JS + TS paths) is a real concern.**
I thought v2.0 was one coherent system. It's two parallel systems that
overlap heavily. This means v3 has architectural debt to resolve in Week
1 — which is appropriate timing because we don't want to refactor both
paths only to discover one was dead.

---

## Recommended next move

After this synthesis lands and is pushed, take a real break. Today has
been long.

When ready to resume Sneebly work, the next session should:

1. Read src/subagents/spec-executor.js. This is the canonical JS-path
   builder and the single most important file we haven't analyzed.
2. Read src/autonomy-loop.ts more carefully. Determine if any production
   code path invokes it.
3. Make the JS-path-vs-TS-path decision.
4. Update ROADMAP.md if needed based on that decision.

Then begin Week 1 extraction work: applying spec #19 to separate Sneebly
from AnimAItion, with the decisions from steps 1-3 baked in.

Estimated time for steps 1-3 above: half a session (3-4 hours focused).
Then Week 1 extraction begins.

---

## What this document is NOT

This is execution guidance, not a finished specification. v3 will surface
issues not captured here. The roadmap will adjust. The architecture
diagram will shift. That's normal.

What this document IS: a record of what reading 15 files revealed,
distilled into actionable categories for v3 work. Future sessions should
treat it as the operating context, not a contract.
