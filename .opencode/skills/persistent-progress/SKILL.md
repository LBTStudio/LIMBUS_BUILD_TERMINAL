---
name: persistent-progress
description: Use for multi-session tasks or long plans. Saves checkpoint state to a file so the next session resumes without re-reading the full conversation history.
compatibility: opencode
---

# Persistent Progress (from LangGraph checkpointing)

## The Principle

Long tasks span multiple conversation turns. Context gets compacted. Details get lost. **Write progress state to a file** so any future session can resume in one read instead of re-deriving from conversation history.

## When to Use

- Multi-phase plans (e.g., "Phase 1-4 architecture migration")
- Tasks that will outlive the current context window
- After completing a significant milestone
- When the user says "継続" (continue) — read the progress file first

## The Pattern

### Progress File Format

```markdown
# PROGRESS.md (or tmp_progress.md)

## Current Task
Phase 2: core.js migration

## Completed
- Phase 1a: regex hoist (commit 6b9db06)
- Phase 1b: db minify (commit 6b9db06)
- Phase 1c: items.json version sync (commit 6b9db06)

## In Progress
- [ ] Phase 2a: core.js creation (committed f46dd24, pending test)
- [ ] Phase 2b: state.js migration

## Key Decisions
- Decided NOT to change composeGarasumadoDraft output format (test compat)
- Decided to use hasDash1 detection for 1-based convention (98738af)

## Blockers
- None

## Next Steps
1. Run full test suite
2. If pass, proceed to Phase 2b
3. If fail, check tests/sync-max.test.mjs first (known dependency)
```

### Checkpoint Triggers

Write/update the progress file at these points:
1. **After each commit** — update "Completed" and "Next Steps"
2. **Before asking user a question** — save state so the answer can be applied in a fresh session
3. **When context is getting long** — proactively save
4. **When hitting a blocker** — save before investigating, so if the investigation runs long, the original state isn't lost

### Resume Protocol

When starting a new session (or user says "continue"):
1. Check for `PROGRESS.md` or `tmp_progress.md`
2. Read it fully — this replaces re-reading conversation history
3. Verify current git state matches expectations (`git log --oneline -5`)
4. Resume from "Next Steps"

## Anti-Patterns

| Wrong | Why | Right |
|---|---|---|
| Keeping state only in conversation memory | Context compaction loses it | Write to file |
| Progress file only lists "done" items | No direction for next session | Include "Next Steps" and "Key Decisions" |
| Giant progress file | Reading it costs tokens too | Keep it under ~50 lines |
| Progress file never cleaned up | Stale info misleads | Delete after task completes, or mark as ARCHIVED |

## Integration with Other Skills

- **executing-plans**: Progress file replaces the in-conversation todo list for cross-session plans
- **think-in-code**: Verification script results go into the progress file
- **verifying-before-completion**: "Completed" items must reference commit SHAs (evidence)

## Bottom Line

```
Multi-session task → Write PROGRESS.md at every milestone
"Continue" command → Read PROGRESS.md before anything else
Task complete → Delete or archive the progress file
```