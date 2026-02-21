# Sneebly v2.0

Enterprise-grade, framework-agnostic autonomous AI agent installable in any Node.js application.

## Architecture

Sneebly uses a simplified 3-step autonomy loop based on patterns from Devin, Cursor, and SWE-agent research:

```
Plan (Opus) → Build (Opus medium→high) → Verify (6 checks) → Review & Refactor → Next Plan
```

### Key Components

| File | Purpose |
|------|---------|
| `autonomy-loop.ts` | Orchestrator: Plan → Build → Verify → Review cycle |
| `planner-agent.ts` | Opus-powered planning from GOALS.md |
| `builder-agent.ts` | Opus medium→high effort code generation with rollback |
| `verify-agent.ts` | 6-check verification: health, syntax, TypeScript, API, schema, browser |
| `auto-fixer.ts` | Sonnet-powered auto-fix on failures |
| `claude-session.ts` | Claude API wrapper with prompt caching & cost tracking |
| `cost-tracker.ts` | Real token-based pricing with cache discounts |
| `identity.ts` | Reads SOUL.md, AGENTS.md, IDENTITY.md, TOOLS.md, HEARTBEAT.md |
| `path-safety.ts` | Glob-based file safety boundaries |
| `progress-tracker.ts` | GOALS.md parser & completion tracking |
| `command-center.ts` | Web dashboard for monitoring |

### Identity System

Sneebly's behavior is driven by markdown files:

- **SOUL.md** — Core personality, values, communication style
- **IDENTITY.md** — Name, role, capabilities, boundaries
- **AGENTS.md** — Sub-agent definitions and coordination rules
- **TOOLS.md** — Available tools and safety constraints
- **HEARTBEAT.md** — Runtime config: budget limits, cycle intervals, safe paths
- **GOALS.md** — North star goals that drive autonomous planning

### Safety Features

- **Budget enforcement**: Pre-call `checkBudgetOrThrow()` on every API call
- **Path safety**: Glob-based allow/deny lists for file modifications
- **Rollback**: Automatic file backup & restore on build/verify failures
- **Max cycles**: Configurable session limits
- **Rate limiting**: Minimum interval between cycles

## Installation

1. Copy `src/` files into your project's server directory
2. Copy `templates/` markdown files to your project root
3. Customize the identity files for your project
4. Set up Anthropic API credentials
5. Import and initialize in your Express app

```typescript
import { initSneebly } from './sneebly';
import express from 'express';

const app = express();
initSneebly(app, { projectRoot: process.cwd() });
```

## Configuration

Set in `HEARTBEAT.md`:

```markdown
## Budget
- max: $25.00

## Cycle Interval
- 120000ms

## Safe Paths
- client/src/**
- server/**
- shared/**

## Never Modify
- .env
- package-lock.json
```

## API Endpoints

All endpoints require the Sneebly key (`?key=YOUR_KEY` or `x-sneebly-key` header):

- `GET /api/sneebly-cc/autonomy/state` — Current loop state
- `POST /api/sneebly-cc/autonomy/start` — Start the loop
- `POST /api/sneebly-cc/autonomy/stop` — Stop the loop
- `POST /api/sneebly-cc/autonomy/pause` — Pause
- `POST /api/sneebly-cc/autonomy/resume` — Resume
- `POST /api/sneebly-cc/autonomy/trigger` — Trigger single cycle
- `GET /sneebly/dashboard` — Web dashboard
- `GET /sneebly/command-center` — Full command center

## Cost Tracking

Real token-based pricing with prompt caching:

| Model | Input | Output | Cache Read | Cache Write |
|-------|-------|--------|------------|-------------|
| Opus 4.6 | $15/MTok | $75/MTok | 90% discount | 25% premium |
| Sonnet 4.5 | $3/MTok | $15/MTok | 90% discount | 25% premium |
| Haiku 3.5 | $1/MTok | $5/MTok | 90% discount | 25% premium |

## Data Storage

All data in `.sneebly/` directory (JSON/JSONL/Markdown):
- `session-journal.json` — Cycle history
- `cost-ledger.json` — Spend tracking
- `current-plan.json` — Active plan
- `progress.json` — Goal completion
- `memory/` — Persistent memory
- `backups/` — File rollback snapshots

## License

MIT
