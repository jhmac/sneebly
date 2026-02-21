# Sneebly — Replit Agent Install Prompts

Use these prompts to tell Replit Agent how to install and configure Sneebly in your project. Copy and paste each prompt one at a time.

---

## Prompt 1: Clone and Set Up the Files

```
Clone the Sneebly autonomous agent from https://github.com/jhmac/sneebly into my project. Here's what to do:

1. Clone the repo into a temp folder, then copy the files:
   - Copy everything from src/ into my server/ directory
   - Copy everything from templates/ into my project root (these are markdown files like SOUL.md, IDENTITY.md, GOALS.md, HEARTBEAT.md, AGENTS.md, TOOLS.md)

2. Install the required dependency:
   - @anthropic-ai/sdk

3. Create a .sneebly/ directory in my project root for Sneebly's data storage (session journals, cost tracking, memory, backups).

4. Don't modify any of my existing files yet — just get the Sneebly files in place.
```

---

## Prompt 2: Configure Identity Files

```
Now let's customize Sneebly's identity files for my project. Here's what each file should say:

IDENTITY.md — Update the name, role, and project description to match my app. Keep the safety boundaries section.

GOALS.md — Replace the goals with what I actually want built. Use this format:
## Goal 1: [Name]
- [ ] Sub-task 1
- [ ] Sub-task 2

HEARTBEAT.md — Set these values:
- Budget max: $25.00 (or whatever limit I want)
- Cycle interval: 120000ms (2 minutes between cycles)
- Safe paths: list the directories in MY project that Sneebly is allowed to edit (like client/src/**, server/**)
- Never modify: .env, package-lock.json, node_modules/**, and any other sensitive files

SOUL.md — Keep the defaults or customize the personality/communication style.

AGENTS.md and TOOLS.md — Keep the defaults for now.
```

---

## Prompt 3: Connect Anthropic API

```
Sneebly needs access to Claude (Anthropic's AI). Set up the Anthropic integration:

1. Search for and install the Anthropic AI integration so I get API access through Replit
2. Make sure the anthropic-client.ts file in server/ is configured to use Replit's AI integration (it should import from @anthropic-ai/sdk and use the ANTHROPIC_API_KEY or the Replit AI integration automatically)
3. Verify the connection works by checking that the Anthropic client can be instantiated without errors
```

---

## Prompt 4: Wire Into Express App

```
Now integrate Sneebly into my Express server. In my main server file (probably server/index.ts or server/main.ts):

1. Import registerCommandCenter from the command-center module
2. Import the autonomy loop starter
3. Call registerCommandCenter(app) to add the dashboard and API routes
4. Set up the autonomy loop to be startable via the API (don't auto-start it)

The command center should be accessible at /sneebly/command-center and the API endpoints should work:
- GET /api/sneebly-cc/autonomy/state
- POST /api/sneebly-cc/autonomy/start
- POST /api/sneebly-cc/autonomy/stop
- POST /api/sneebly-cc/autonomy/pause
- POST /api/sneebly-cc/autonomy/resume
- POST /api/sneebly-cc/autonomy/trigger

Make sure these routes don't conflict with my existing routes.
```

---

## Prompt 5: Test It

```
Let's verify Sneebly is installed correctly:

1. Start the server and make sure it runs without errors
2. Visit /sneebly/command-center and confirm the dashboard loads
3. Check that GET /api/sneebly-cc/autonomy/state returns a valid JSON response
4. Trigger one cycle with POST /api/sneebly-cc/autonomy/trigger and check the .sneebly/session-journal.json to see if it recorded the cycle
5. Check .sneebly/cost-ledger.json to verify cost tracking is working

If anything fails, check the server logs for errors and fix them.
```

---

## Prompt 6 (Optional): Start Autonomous Mode

```
Everything looks good — let's start Sneebly in autonomous mode.

Hit POST /api/sneebly-cc/autonomy/start to begin the loop. It will:
1. Read GOALS.md and plan the next piece of work
2. Build it (writing actual code)
3. Verify the changes (health checks, TypeScript, syntax)
4. Review with Opus and auto-refactor if needed
5. Move to the next plan

Monitor it at /sneebly/command-center. If anything goes wrong, hit POST /api/sneebly-cc/autonomy/stop to pause it.

Budget is capped at whatever I set in HEARTBEAT.md so it won't overspend.
```

---

## Quick Reference

| What | Where |
|------|-------|
| Source code | `server/` (all the .ts files from src/) |
| Identity files | Project root (SOUL.md, GOALS.md, etc.) |
| Data storage | `.sneebly/` directory |
| Dashboard | `/sneebly/command-center` |
| API base | `/api/sneebly-cc/` |
| Budget config | `HEARTBEAT.md` |
| Goals config | `GOALS.md` |
| Safety config | `HEARTBEAT.md` (safe paths + never modify) |
