# Sneebly Error Ledger

Persistent record of errors encountered during slice cycles that have
recurred at least twice. Read by Claude before each slice cycle to avoid
repeating failed approaches.

## How this works

This ledger only contains errors that have happened more than once. The
first time an error appears, it goes to `.sneebly/pending-observations.md`.
The second time it appears, Claude promotes the pending entry to this
ledger with the verified resolution. This keeps the ledger high-signal
and low-noise.

## How to read this

- Entries are sorted with most recent first within each section
- Each entry has a status: Active, Resolved, or Archived
- Active entries are loaded into the slice-cycle prompt automatically
- When you hit an error matching an Active entry, follow the Lesson —
  do not re-investigate from scratch

## How Claude adds to this

When Claude hits an error during a slice cycle:

1. Search `.sneebly/error-ledger.md` (Active section) for matching entries
2. If match found, follow the Lesson
3. If no match, search `.sneebly/pending-observations.md`
4. If pending match found, this is the second occurrence:
   - Apply resolution
   - Create a new Active entry here using the template below
   - Remove the pending entry
5. If no match anywhere, this is the first occurrence:
   - Resolve normally
   - Append to pending-observations.md (not here)

## Entry template

Use this template for new Active entries. Add new entries at the top of
the Active section, not the bottom.

    ### [Short error summary]

    - **Status:** Active
    - **First seen:** YYYY-MM-DD
    - **Last seen:** YYYY-MM-DD
    - **Frequency:** Recurring (N occurrences)
    - **Category:** [pnpm | drizzle | clerk | playwright | env-vars | git | other]
    - **Context:** What was being attempted when this appeared
    - **Error:** Exact error text or paraphrase
    - **Tried (in order):**
      1. [Approach] — [Outcome: worked / failed because X]
      2. [Approach] — [Outcome]
    - **Resolution:** What actually worked (consistent across occurrences)
    - **Lesson:** What to do next time. Abstract from the specific case.
    - **Slice contexts:** Which slice cycles encountered this

## Status meanings

- **Active:** Still occurring. Loaded into slice-cycle prompts.
- **Resolved:** Underlying gap fixed permanently (e.g., SETUP.md now
  covers this). No longer expected to recur. Kept for reference.
- **Archived:** Historical only. No longer relevant (e.g., dependency
  changed, codebase moved past it). Not loaded into prompts.

---

## Active entries

[Most recent first. Empty at launch — entries appear after observations
in pending-observations.md recur.]

---

## Resolved entries

[Permanently fixed, no longer happen, kept for reference]

---

## Archived entries

[Historical, no longer relevant]
