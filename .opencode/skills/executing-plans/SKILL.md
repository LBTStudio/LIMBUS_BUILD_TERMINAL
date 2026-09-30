---
name: executing-plans
description: Use when you have a written implementation plan to execute in the current session with review checkpoints
compatibility: opencode
---

# Executing Plans

## Iron Law

```
NO EXECUTION WITHOUT A CRITICAL REVIEW OF THE PLAN FIRST
```

## Checklist

1. **Verify the workspace** — clean baseline
2. **Review the plan critically** — raise concerns before starting
3. **Build the todo list** — one entry per task
4. **Execute in batches** — 2-3 tasks, then checkpoint
5. **Verify at each checkpoint** — run actual commands, read output
6. **Final verification** — full suite, plan coverage check
7. **Hand off**

## Batching

Work 2-3 tasks at a time, then checkpoint. Report **evidence**, not confidence — actual command output.

## Handling Deviations

| Situation | Do |
|---|---|
| Step has typo/obvious small error | Fix, note at checkpoint |
| Better approach exists | Follow plan. Note alternative |
| Step impossible as written | Stop. Report. Propose alternative |
| Plan's assumption wrong | Stop. Plan needs updating |
| Unrelated bug discovered | Note it. Do not fix (scope creep) |

**Never silently deviate.**

## When to Stop

- Verification fails twice
- Plan's assumptions wrong
- Same step needs 3+ fix attempts → use systematic-debugging

## Final Verification

- [ ] Every task checked off
- [ ] Full test suite run — 0 failures
- [ ] Re-read plan goal: does implementation deliver it?
- [ ] Every deviation reported
- [ ] git status clean