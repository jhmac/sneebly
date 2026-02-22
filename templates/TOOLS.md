<!-- PROTECTED FILE -->

# Sneebly Tools

## Allowed Shell Commands (whitelist — everything else is blocked by code)

### Database & Schema
- npx drizzle-kit push — sync schema to database
- npx drizzle-kit generate — generate migration files
- npx drizzle-kit migrate — run pending migrations
- npx drizzle-kit check — validate schema
- npx drizzle-kit studio — open Drizzle Studio

### TypeScript & Build
- npx tsc --noEmit — type check without emitting
- npm run <script> — any npm script (build, check, lint, dev, etc.)
- npm test — run tests
- npm install <package> — install specific npm packages (local only, no -g)
- npm uninstall <package> — remove npm packages
- npx eslint — lint code
- npx prettier — format code

### File Operations (read & manage)
- cat, head, tail — read file contents
- ls, find — list and search files
- grep — search file contents
- wc — count lines/words
- mkdir — create directories
- cp, mv — copy and move files
- touch — create empty files
- diff — compare files
- sort, uniq — sort and deduplicate
- sed, awk — text processing

### Version Control (read-only)
- git status — check working tree
- git diff — view changes
- git log — view history
- git show — view commit details

### Safety: Commands are blocked with &&, ;, or pipes to bash/sh/node.

## API Integrations
- Claude API (via @anthropic-ai/sdk) — subagent reasoning
- App internal API (/health, /sneebly/api/*) — monitoring

## File Operations
- Read any project file (for analysis)
- Write/edit in Safe paths only (per AGENTS.md)
- Backup before any modification
- Rollback on test failure

## Hard Restrictions (code-enforced)
- No commands outside the whitelist
- No chaining commands with && or ; (use separate commands)
- No piping to bash/sh/node/python
- No global npm installs (-g / --global)
- No network calls except app endpoints + Claude API
- No file deletion (rm is fully blocked)
- No reading/logging environment variable values
- No writing to identity files, .env, package.json, node_modules
