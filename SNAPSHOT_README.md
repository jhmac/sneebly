# Embedded Sneebly Snapshot

  This branch is a **snapshot** of the Sneebly autonomous-agent system as it exists embedded in the AnimAItion.tools application as of 2026-05-16.

  It is intentionally an **orphan branch** with no shared history with `main`. The canonical standalone Sneebly package lives on `main`.

  ## What's here
  - `server/` — all server-side code, including the Sneebly agents (autonomy-loop, builder, planner, verifier, command-center, chat, team orchestrator, etc.) intermixed with the host app's routes/storage.
  - `scripts/` — the run-elon, heartbeat, and continuous-loop bash entry points.
  - `shared/schema.ts` — full Drizzle schema (host app + Sneebly's `agentTeams` tables).
  - `GOALS.md`, `NEEDS-ATTENTION.md` — Sneebly's input documents.

  ## Why this exists
  A reference snapshot for extracting the embedded Sneebly into the canonical standalone package on `main`. Not intended to be run on its own.
  