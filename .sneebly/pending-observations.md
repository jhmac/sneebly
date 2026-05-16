# Pending Observations

Errors seen once during slice cycles. Promoted to `.sneebly/error-ledger.md`
if encountered again.

## How this works

Claude appends here when it encounters an error for the first time during
a slice cycle. The next time the same error appears, Claude finds the
pending entry, promotes it to `error-ledger.md` with the consistent
resolution, and removes the pending entry from here.

This two-tier structure keeps the permanent ledger high-signal — only
errors that genuinely recur become permanent entries.

## How Claude uses this

When Claude hits an error during a slice cycle:

1. Check `.sneebly/error-ledger.md` (Active section) for a match
2. If no match there, check this file
3. If match found here, this is the second occurrence:
   - Apply the resolution
   - Promote to error-ledger.md with verified Lesson
   - Remove the entry from this file
4. If no match anywhere, resolve normally and append a new pending
   entry here

## Curation

Entries older than 30 days with no second occurrence are archived to
the bottom of this file under "Aged out — likely one-offs". They were
probably one-time issues that the underlying environment fix resolved
permanently (e.g., SETUP.md updates).

## Entry template

    ### [Short error summary]

    - **First seen:** YYYY-MM-DD
    - **Context:** What was being attempted
    - **Error:** Exact error text or paraphrase
    - **Resolution applied:** What worked this time
    - **Category:** [pnpm | drizzle | clerk | playwright | env-vars | git | other]
    - **Notes:** Anything that might help if this recurs
    - **Slice context:** Which slice cycle / project encountered this

---

## Pending entries

### pnpm not on PATH after fresh Mac mini clone

- **First seen:** 2026-05-15
- **Context:** Trying to run `pnpm --filter @workspace/plumb run typecheck`
  in Claude Code during first slice-cycle trial on Plumb. Plumb is a pnpm
  monorepo. Mac mini had Node installed but pnpm never installed.
- **Error:** `(eval):1: command not found: pnpm`
- **Resolution applied:** Asked user to run `which node` in a separate
  terminal (confirmed Node installed at /usr/local/bin/node), then
  `npm install -g pnpm` in same terminal. pnpm 11.1.2 installed at
  /Users/mister/.npm-global/bin/pnpm. Then `which pnpm` from Claude Code
  found it.
- **Category:** pnpm
- **Notes:** Auto Mode wasted 4 `find`/`ls` commands searching for pnpm
  on disk before this was resolved. Faster path is to confirm
  installation status with `which` first, then install via npm if absent.
  Don't spelunk pnpm-store paths.
- **Slice context:** Plumb / 2026-05-15 Auto Mode trial / drag-to-assign test

### drizzle-kit fails with esbuild version mismatch in pnpm workspace

- **First seen:** 2026-05-15
- **Context:** After installing pnpm globally and node_modules existed,
  ran drizzle-kit push directly from lib/db/ via local node_modules/.bin
  to bypass the preinstall hook.
- **Error:** `Cannot start service: Host version "0.27.3" does not match
  binary version "0.27.7"`
- **Resolution applied:** Did NOT resolve. Tried `pnpm install
  --ignore-scripts` which completed but didn't refresh esbuild. Workaround
  attempts using direct binary path also failed. Punted local migration.
- **Category:** drizzle
- **Notes:** pnpm hoists esbuild incorrectly when multiple workspace
  projects depend on different versions. Possible fix: pin esbuild
  version in lib/db/package.json, or `rm -rf node_modules pnpm-lock.yaml
  && pnpm install --ignore-scripts` for full rebuild. Untested.
- **Slice context:** Plumb / 2026-05-15 / setup phase, never reached
  actual slice work

### Plumb preinstall hook blocks every pnpm command with newer pnpm versions

- **First seen:** 2026-05-15
- **Context:** Trying any `pnpm` command in Plumb (install, run, exec).
  Plumb's root package.json has a preinstall hook that checks
  `$npm_config_user_agent` matches `pnpm/*` and fails otherwise. Newer
  pnpm versions appear not to set this env var correctly for subshells.
- **Error:** `Use pnpm instead` followed by ELIFECYCLE and
  `Command failed with exit code 1: pnpm install`
- **Resolution applied:** `pnpm install --ignore-scripts` bypassed the
  preinstall hook. This let dependency install complete but did not
  refresh esbuild version mismatch.
- **Category:** pnpm
- **Notes:** This is a real Plumb bug. Setting `npm_config_user_agent`
  manually on the parent command does not propagate to subshells where
  the preinstall hook runs. The hook regex itself probably needs to be
  loosened or rewritten for newer pnpm versions.
- **Slice context:** Plumb / 2026-05-15 / repeated attempts to run
  drizzle-kit push, typecheck, install

### Mac mini fresh setup missing all Plumb runtime env vars

- **First seen:** 2026-05-15
- **Context:** After installing pnpm + Postgres + creating database,
  attempted to run Playwright e2e test. Environment had no DATABASE_URL,
  CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, or E2E_CLERK_USER_PASSWORD set.
- **Error:** Not a runtime error yet — Auto Mode caught this in pre-flight
  by running `echo "DATABASE_URL=${DATABASE_URL:-NOT SET}"` etc.
- **Resolution applied:** Created `artifacts/api-server/.env` manually
  via heredoc with DATABASE_URL (local Postgres connection string),
  PII keys (generated via `openssl rand -hex 32`), and Clerk test keys
  copied from Clerk dashboard. Added `.env` patterns to `.gitignore`
  before saving.
- **Category:** env-vars
- **Notes:** AGENTS.md said tests need these vars but did not say which
  ones nor how to obtain them. SETUP.md is the right home for this.
  Should include: complete env var list with where to obtain each
  (Clerk dashboard URL, local Postgres setup command), example .env
  template, gitignore reminder before saving real keys.
- **Slice context:** Plumb / 2026-05-15 / Playwright e2e test environment

### Auto Mode commits before showing the final code for review

- **First seen:** 2026-05-15
- **Context:** During the slice-cycle trial on Plumb. User approved the
  test approach in writing. Auto Mode then wrote the test file AND
  committed it before showing the final diff for review. User only saw
  the code after it was already in git.
- **Error:** Not a code error — a workflow error. Auto Mode treated
  approval-of-approach as approval-of-commit.
- **Resolution applied:** Added explicit "DEFAULT RULE — STOP BEFORE
  COMMIT" section to the SLICE-CYCLE.md prompt template. Each gate
  (approach approval, code approval, commit approval) must be separate.
- **Category:** workflow
- **Notes:** Without this explicit instruction, Auto Mode infers commit
  intent from prior approvals. The rule must be in the cycle prompt
  itself, not just in AGENTS.md, because Auto Mode prioritizes the
  immediate prompt over project-level config.
- **Slice context:** Plumb / 2026-05-15 / drag-to-assign test commit

### Heredoc paste in Claude Code truncates at triple backticks

- **First seen:** 2026-05-15
- **Context:** Trying to save SLICE-CYCLE.md draft by pasting a heredoc
  command with markdown content into Claude Code. The markdown contained
  triple-backtick code blocks. Claude Code received only the content up
  to the first triple backtick, treating it as the end of input.
- **Error:** Document arrived truncated. Claude Code asked "do you want
  me to draft the rest of the document?" because it saw an incomplete
  paste.
- **Resolution applied:** Saved the file directly via terminal heredoc
  instead of pasting through Claude Code. Used a custom delimiter
  (SLICEDOC) instead of common ones to avoid collisions. Removed
  triple-backtick code blocks from content where possible.
- **Category:** workflow
- **Notes:** Affects any large markdown paste into Claude Code that
  contains triple backticks. Solutions: (1) paste in a regular terminal
  for file creation tasks, (2) base64-encode the content, (3) use a
  delimiter that won't appear in the content, (4) avoid triple
  backticks in the saved content. Option 1 is simplest.
- **Slice context:** Sneebly v3 / 2026-05-15 / saving SLICE-CYCLE.md
  to disk

---

## Aged out — likely one-offs

[Entries older than 30 days with no second occurrence move here. Empty
at launch.]
