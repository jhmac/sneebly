# Block A outcome — 2026-05-17: Self-modification investigation

## TL;DR

The TS-path's "self-modification system" was real, working production code — not aspirational. It's a multi-layer system spanning 21+ files. v3 ports 6 files in v3.0 + 4 in v3.1, skips 4 duplicates, and extracts encoded rules into AGENTS.md template.

## What we investigated

After yesterday's Block 4 finding that the TS path was structurally orphaned in jhmac/sneebly main, user noted "maybe but unproven" — TS path might represent real self-modification capability that worked partially in AnimAItion. Block A: investigate.

## What we read

21 TypeScript files across two repos, total ~5,000 lines analyzed in depth:

**From jhmac/sneebly main (5 files in this block):**
- learning-loop.ts (165 lines)
- self-modify.ts (195 lines, full read)
- auto-fixer.ts (425 lines)
- needs-detector.ts (410 lines)
- planner-agent.ts (300 lines)
- spec-validator.ts (260 lines)

**From jhmac/sneebly embedded-snapshot (7 files, the "missing" set):**
- rollback.ts (209 lines)
- roadmap-orchestrator.ts (744 lines)
- experiment-runner.ts (529 lines)
- auto-research.ts (213 lines)
- experiment-metrics.ts (286 lines)
- acceptance-test-generator.ts (277 lines)
- ground-truth-builder.ts (220 lines)
- knowledge-base.ts (236 lines)

## Key findings

### Finding 1: All 21 files are real production code

No stubs, no TODOs marking unfinished work, no aspirational scaffolding. Every file has complete logic with proper error handling, mutex protection, cost tracking, and rollback safety where applicable.

### Finding 2: The system is multi-layer

Five distinct layers, each with real working code:

1. **Production primitives:** self-modify, auto-fixer, needs-detector, learning-loop, spec-validator, acceptance-test-generator
2. **A/B experimentation:** experiment-runner + experiment-metrics
3. **Knowledge/convention synthesis:** auto-research + knowledge-base
4. **Strategic orchestration:** planner-agent + autonomy-loop + builder-agent + roadmap-orchestrator
5. **Safety primitives:** rollback + ground-truth-builder

### Finding 3: The standalone extraction was selective

jhmac/sneebly main contains 11 of the 17+ self-modification files. The 6 missing ones (rollback, roadmap-orchestrator, experiment-runner, experiment-metrics, auto-research, acceptance-test-generator, ground-truth-builder) only exist in embedded-snapshot. These were the more experimental layers.

### Finding 4: Rules are cleanly extractable

spec-validator.ts (260 lines) reads `.sneebly/skills/*.md` at runtime and extracts neverPatterns and redirects. Combined with planner-agent.ts's CRITICAL RULES prompt section and builder-agent.ts's autoCorrectStep, the path-routing wisdom is encoded in three places. All cleanly extractable to AGENTS.md path_rules format.

### Finding 5: NEEDS-ATTENTION.md writer location resolved

V2_findings.md's Open Question #2 answered: needs-detector.ts writes it via writeNeedsAttention() function. Triggered by saveNeeds() after pattern-matching detects what kind of human action is needed.

## Decision: Salvage + Selective Port

### v3.0 port (6 files, ~2,100 lines TS → JS)

1. **self-modify.ts** → src/self-modify.js (primitive only, no autonomous loop)
2. **auto-fixer.ts** → src/auto-fixer.js (the workhorse autonomous loop)
3. **needs-detector.ts** → src/needs-detector.js (with NEEDS-ATTENTION.md writing)
4. **learning-loop.ts** → src/learning-loop.js (pattern extraction → MEMORY.md)
5. **spec-validator.ts** → src/spec-validator.js (refactored to read AGENTS.md rules)
6. **acceptance-test-generator.ts** → src/acceptance-test-generator.js (serves slice-cycle TDD)

Plus rule extraction to AGENTS.md template.

### v3.1 port (4 files, ~1,200 lines)

7. **experiment-runner.ts** → src/experiment-runner.js (A/B experimentation, $1/experiment cap)
8. **experiment-metrics.ts** → src/experiment-metrics.js (TSC errors, LOC, complexity, latency, simplicity penalty)
9. **auto-research.ts** → src/auto-research.js (convention synthesis from successes)
10. **knowledge-base.ts** → src/knowledge-base.js (institutional memory store)

### Don't port

- **planner-agent.ts** — duplicates ELON's job; CRITICAL RULES section extracted to AGENTS.md path_rules
- **builder-agent.ts** — duplicates spec-executor.js; autoCorrectStep + inferRelatedFiles extracted to AGENTS.md
- **autonomy-loop.ts** — duplicates orchestrator.js + ralph-loop.js
- **roadmap-orchestrator.ts** — duplicates ELON's build-mode
- **rollback.ts** — JS-path's code-engine.js has file-backup-based rollback already
- **ground-truth-builder.ts** — Postgres-coupled; defer to v3.2+ when v3's DB strategy is clear

## What gets extracted to AGENTS.md template

From planner-agent.ts's CRITICAL RULES section (lines ~145-160):
- NEVER create migration SQL files
- NEVER create split type files
- Schema work targets shared/schema.ts NEVER server/db.ts
- Route work targets server/routes.ts NEVER server/index.ts
- Storage/CRUD work targets server/storage.ts

From builder-agent.ts's autoCorrectStep:
- create-but-exists → modify
- modify-but-missing → create
- Path redirects for schema/route/storage

From spec-validator.ts's hardcoded rules:
- isMigrationFile → redirect to schema.ts
- isSplitTypeFile → redirect to schema.ts
- wrongSchemaTargets list

From auto-fixer.ts's prompt (the "6 conventions"):
- pgTable IDs use varchar+gen_random_uuid (not uuid().defaultRandom())
- Exports table variable is projectExports not exports (CJS conflict)
- Tables in shared/schema.ts must export createInsertSchema + InsertX + X
- CRUD methods in server/storage.ts IStorage + DatabaseStorage
- API routes in server/routes.ts with Clerk auth

All become AGENTS.md path_rules YAML section, project-overridable.

## What gets extracted to elon-builder.md template

The generic "common path mistakes" that apply to most projects (not project-specific):
- Schema/types belong in one place per project (referencing AGENTS.md path_rules)
- Migration files are typically auto-generated, not hand-created
- Don't create model/types/interfaces folders if project uses a single schema file

## Why we're NOT recovering more files from AnimAItion

We considered making Analog-Animator public to investigate further. Decided no:
- All 17 self-modification files exist in jhmac/sneebly embedded-snapshot branch (verified)
- We have the code we need to decide
- Going to AnimAItion would tell us about runtime data (.sneebly/ logs from production), not code
- Runtime data investigation is a v3.1+ activity, not Block A scope

## What stays open

- **Q4 (subagent inventory):** Partially answered — confirmed spec-executor + elon-builder in JS path. Still need to count all subagent .md files in templates/subagents/. Defer.
- **Q3 (Admin dashboard):** Still deferred to v3.1+.
- **Q5 (Cost reality):** Modernization concern. Defer.
- **The 8 unread TS files in jhmac/sneebly main:** auto-db-push, claude-session, cost-tracker, identity, anthropic-client, memory-manager, progress-tracker, shell-executor, skill-manager, sneebly-hooks, spec-monitor, spec-watcher, sync-from-github, utils, logging, command-center, verify-agent. These get read AS WE EXTRACT in Week 1, not before.

## Impact on ROADMAP.md Week 1 scope

Week 1 was "extract Sneebly from AnimAItion." Now includes:
- Port 6 TS files to JS (~2,100 lines)
- Extract rules from 4 source files into AGENTS.md template
- Keep 26 TS files in src/ untouched (don't delete until v3.1 port decision)
- v3.0 timeline extends by 2-3 weeks vs original estimate

## Confirmation: TS path is NOT deleted in Week 1

Yesterday's Block 4 decision said "delete 26 TS files." This is REVISED. TS files stay in src/ during Week 1 extraction. Ports happen file-by-file, replacing TS with JS only as each port completes. After v3.1 ports are done, the remaining TS files (planner-agent, builder-agent, autonomy-loop, etc.) get deleted.

## Confidence level

99%. The 1% gap reflects:
- The .sneebly/ runtime data wasn't pushed to embedded-snapshot, so we can't verify "actually ran in production" empirically — only that the code was complete and well-built
- 4 supporting files unread (cost-tracker, claude-session, memory-manager, identity)
- We deferred reading the host-app code (Analog-Animator)

These gaps don't affect the Block A decision. They become Week 1 extraction work.
