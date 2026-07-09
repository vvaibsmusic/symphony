---
name: heil-vaib
description: End-of-day workflow triggered by the phrase "heil vaib". Updates history.md with session work, known issues, and optimizes the file for future context.
---

# Heil Vaib - End of Day Session Close

**Trigger:** The user says "heil vaib", meaning all tasks for the current session are completed.

## 1. Gather Session Context
Before writing anything, collect everything done in this session:
- What tasks were completed
- What files were created, modified, or deleted
- What git commits were made (`git log --oneline -10`)
- Any known issues discovered but not fixed

## 2. Update `history.md` - Add Today's Entry
Add a new dated entry at the **top** of the Development Log section in `history.md`.
Use this format:
### **[Brief Title] (Month DD, YYYY)**
- Bullet points describing what was done
- Include specific filenames
- Note any issues found and how they were resolved

**Known Issues:**
- List any unresolved issues that the next agent should know about

| File | Change |
|------|--------|
| `path/to/file` | What changed |

## 3. Optimize `history.md`
Keep `history.md` lean so future agents get signal, not noise:
- Keep the last 30 days of entries in full detail.
- Condense older entries into single-line summaries and remove their file tables.
- Keep a persistent "Known Issues & Gotchas" section at the bottom for active bugs and project quirks.

## 4. Final Verification
- Ensure you have pushed all commits to the remote repository if requested.
- Summarize what was logged for the user and sign off with "Session closed. Heil Vaib!"
