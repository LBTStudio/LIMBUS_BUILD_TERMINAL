---
name: interface-review
description: Reviews a change (diff/PR/working tree) across UI, typography, layout, color, writing and accessibility. Resolves scope, expands blast radius, classifies findings as Introduced/Regression/Pre-existing.
---

# Change review

This skill reviews a change rather than a screen. It resolves the scope, expands the changed files to the surfaces they affect, reads both sides of the diff and classifies every finding.

Scope is all it owns. Domain rules belong to the `better-*` skills. Severity, consolidation, coverage, the cap and the verdict belong to `better-interface`, which this skill hands the review to.

Correctness, tests, security and performance belong to the project's general code review. Name the concern once and move on.

## The change, not the codebase

The author is asking "did I make this worse?". Report what the change caused and stay mostly quiet about what it merely touched. Three pre-existing findings is a courtesy; thirty is a different review and one nobody asked for.

Read the change before forming an opinion of it. The stated intent decides what counts as incomplete, and a skimmed diff produces findings about code the next hunk already fixed.

## Core principles

### 1. Resolve the change scope first

The whole invocation is the target, so `/interface-review pr 482` reviews pull request 482.

With no target supplied, resolve in this order and stop at the first match:

1. `HEAD` is ahead of `git merge-base origin/<default-branch> HEAD`: that range **plus** any uncommitted changes, with the commit count and the uncommitted file count stated separately.
2. The working tree is dirty: the uncommitted changes.
3. Neither: there is no change to review. Stop and ask.

Order matters. Check the working tree first and one stray formatting edit shadows a twelve-commit branch, with the report still claiming full coverage.

Exclude lockfiles, snapshots, generated output, vendored code and binaries, and name what you excluded.

### 2. With no change, ask rather than invent one

A clean tree with nothing ahead of the merge base means the user asked to review a change that does not exist. Never fall back to `HEAD~1..HEAD` on your own.

State the repository facts you found, then offer the routes and wait:
- The last commit, `HEAD~1..HEAD`, named by short SHA and subject
- A target they name: `pr <n>`, a branch, a ref, or a range
- A whole-repository interface audit (hand to `better-interface`)

### 3. A diff is not a surface

A changed file is evidence, not the review subject. Its **blast radius** is the set of surfaces it renders in; review those.

Expand the blast radius one hop by default: the direct importers and callers. Expand a second hop only for design tokens, theme values and shared primitives, where one line reaches the whole product.

Review at most five consumers, then state how many you did not expand.

### 4. Read the removed lines

Regressions are invisible in the post-change state. Read the `-` side of every hunk.

A signal is a lead, not a finding. A removal is only a regression when nothing in the change replaces it. Route each unmatched removal to its domain skill, report only what that skill confirms and status it `Regression`.

### 5. Classify every finding

Give every finding one status:

- `Introduced`: the change created it.
- `Regression`: the change weakened something previously correct.
- `Pre-existing`: present in the touched code but not caused by this change.

Status by what the diff touched, not by which file it sits in: a line the change never touched is `Pre-existing` even three lines from a hunk. Confirm against the base ref when it matters:

```bash
git blame -L <line>,<line> "$BASE" -- path/to/file
```

### 6. Hold the change to its stated intent

Read the pull request title and body, the linked issue and the commit messages, then review whether the interface delivers what they claim.

This is what surfaces the **incomplete** change. A surface review cannot see it, because it inspects the states that are present, and here the point is the ones that are absent:

- A new variant, size, or theme applied to some states but not all: hover, focus, active, disabled, loading, selected.
- A new user-facing string with no entry in the translation catalogue the project maintains.
- A new component with no empty, loading, error, disabled, or narrow-width state.
- A control added to one surface but not to the siblings that already carry its peers.

Do not report scope creep. Whether a change does too much is a process question, not an interface one.

### 7. Never mutate the working tree

A change review is read-only, including the checkout. Fetch pull request refs; never check them out. `git fetch` writes only to `.git` and is permitted. `gh pr checkout`, `git checkout`, `git switch` and `git stash` rewrite the files the author has open.

Rendered verification is opt-in. Mark visual and runtime claims **Not verified** unless the project exposes a cheap preview or the user asks for a rendered review.

## Before you finish

| Mistake | Fix |
| --- | --- |
| One stray edit reviewed instead of the branch | Check `merge-base` before the working tree, and report both counts |
| The last commit reviewed because there was no change | State the facts and offer the last commit, a named target, or a repository audit |
| Hunks reviewed without their consumers | Expand one hop, two for tokens and primitives, and name what you skipped |
| Only the `+` side of the diff read | Search the `-` side for removed accessibility, focus, motion and text signals |
| An equivalent replacement reported as a regression | Route the removal to its owner; report only what it confirms |
| A line near a hunk statused `Introduced` | Status by what the diff touched, confirmed with `git blame` against the base ref |
| A pull request checked out to review it | Fetch the ref and review it in place |
| Correctness, test, or security findings in the report | Name the concern once, point at the project's code review and drop it |

## Review output format

Open with the scope block:

| Field | Value |
| --- | --- |
| Target | `branch`, `working`, `staged`, `pr 482`, or the range as entered |
| Base ref | `origin/main` at `a1b2c3d` |
| Head ref | `refs/remotes/pr/482` at `e4f5g6h` |
| Commits | 7 committed, 2 files uncommitted |
| Files in scope | 12 after exclusions |
| Excluded | `pnpm-lock.yaml`, `src/__snapshots__/`: lockfile and snapshots |
| Surfaces expanded | `CheckoutPage`, `SettingsPanel`; 3 further `Button` consumers not expanded |

Then the findings, with a `Status` column per **Classify every finding**:

| Severity | Domain | Status | Location | Before | After | Why |
| --- | --- | --- | --- | --- | --- | --- |

With no `Introduced` or `Regression` findings, omit the table and state "No actionable interface findings in this change."

Then `Pre-existing` findings, at most three, highest severity first, stated plainly as not this change's responsibility. Omit the section when there are none.

End with `Block` when any `HIGH` remains and `Approve` otherwise, leaving the remaining findings in the table as work to do.