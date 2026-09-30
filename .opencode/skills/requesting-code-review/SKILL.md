---
name: requesting-code-review
description: Use when completing tasks, implementing major features, or before merging to verify work meets requirements
compatibility: opencode
---

# Requesting Code Review

Dispatch code-reviewer sub-agent using the `task` tool to catch issues before they cascade. The reviewer gets precisely crafted context for evaluation — never your session's history.

**Core principle:** Review early, review often.

## When to Request Review

**Mandatory:**
- After each task in subagent-driven development
- After completing major feature
- Before merge to main

**Optional but valuable:**
- When stuck (fresh perspective)
- Before refactoring (baseline check)
- After fixing complex bug

## How to Request

**1. Get git SHAs:**
```bash
BASE_SHA=$(git rev-parse HEAD~1)
HEAD_SHA=$(git rev-parse HEAD)
```

**2. Dispatch `code-reviewer` sub-agent using the `task` tool:**

Context to include in your Task tool prompt:
- What you just built (brief summary)
- What it should do (plan or requirements reference)
- Starting commit SHA (`BASE_SHA`)
- Ending commit SHA (`HEAD_SHA`)

**3. Act on feedback:**
- Fix Critical issues immediately
- Fix Important issues before proceeding
- Note Minor issues for later
- Push back if reviewer is wrong (with reasoning)

## Writing the Dispatch Prompt

The reviewer starts with **no context**. What you write is everything they know. The prompt contains, in this order:

1. **What was built** — two sentences
2. **What it should do** — the requirement or plan task text, pasted in full
3. **The diff range** — `BASE_SHA` and `HEAD_SHA`
4. **Where to look** — the files that changed
5. **What you already know** — deviations you made, and why
6. **What you want back** — the report format

**Do not tell them what you think.** State facts, ask for findings.

## Acting on Feedback

| Severity | Action |
|---|---|
| Critical | Fix before doing anything else |
| Important | Fix before the next task |
| Minor | Note it; fix if cheap, defer if not |

**Then re-review.** A reviewer that found issues has not approved the fixes. Re-dispatch with the same context plus what changed.

## Red Flags

**Never:**
- Skip review because "it's simple"
- Ignore Critical issues
- Proceed with unfixed Important issues
- Review uncommitted work — commit first so the diff range is real
- Include your own assessment in the prompt (biases the review)

## Choosing the Reviewer

| Agent | Use when |
|---|---|
| `spec-reviewer` | Does the code match the spec? |
| `code-quality-reviewer` | After spec compliance — decomposition, naming, error handling |
| `code-reviewer` | End of a feature or before merge — production readiness |