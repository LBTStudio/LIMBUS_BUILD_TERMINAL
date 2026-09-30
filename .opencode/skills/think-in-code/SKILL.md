---
name: think-in-code
description: Use when analyzing, comparing, or verifying data larger than ~100 items. Write a script instead of reading manually. Catches what eyes miss and costs fewer tokens than sequential reading.
compatibility: opencode
---

# Think in Code (from smolagents)

## The Principle

When you need to understand, compare, or verify a non-trivial amount of data, **write a script that does the analysis**, then read its output. Manual reading is:
- Slow (thousands of tokens per pass)
- Error-prone (eyes skip lines)
- Non-reproducible (can't re-run the check)

A script is:
- Exact (string comparison, not visual matching)
- Reproducible (re-run when data changes)
- Token-efficient (output is just the delta/diff/summary)

## When to Use

**Always** when you're about to:
- Read more than ~100 lines of data to "check if it looks right"
- Compare two versions of something (before/after, raw/parsed, old/new)
- Count or enumerate items matching a pattern
- Verify that data survived a transformation (parse → export → re-import)

**Especially when**:
- Debugging "something is missing" (write a diff script, not a scan)
- Validating an import/export round-trip
- Checking data integrity after a migration or format change

## The Pattern

### 1. Identify the comparison
What is "input" and what is "expected output"? Define it precisely.

### 2. Write the script
```javascript
// tmp_verify.js — one-off analysis script
const input = /* load raw data */;
const output = /* load processed data */;
// Compare: normalize both, find diffs, count matches
// Output: PASS/FAIL per item, with specifics on failures
```

### 3. Run it, read the summary
```bash
node tmp_verify.js
# Output: "[0] ✓ | [1] ✗ MISSING | [2] ✓ ..."
```

### 4. Delete the temp script after use (or promote it to a test)

## Real Example (from this project)

**Task**: Verify Garasumado → LBT import doesn't lose data.

**Manual approach** (~2000+ tokens, error-prone):
- Read raw Firestore JSON
- Read parsed LBT output
- Eyeball 9 tactics × 5 fields × 307 chars each

**Code approach** (~50 tokens output, exact):
```javascript
// Compare raw effect text vs parsed (effect + dice effects)
const normalize = (s) => (s || "").replace(/\s+/g, "").replace(/：/g, ":");
const rawNorm = normalize(rawEffect);
const parsedNorm = normalize(parsedParts.join("\n"));
console.log(`[${i}] ${rawNorm === parsedNorm ? "✓" : "✗"} (${rawEffect.length} chars)`);
// Also: check each line of raw against parsed, report MISSING lines
```

**Result**: Proved 8/9 complete matches, identified exact 3-char diff in 1 item, found the 2nd passive in secondaryPassive, all in one run.

## Anti-Patterns

| Wrong | Why | Right |
|---|---|---|
| Read 500 lines "to see if it looks right" | Eyes skip, ~2000 tokens | Script: `if (a === b) pass() else diff(a,b)` |
| "Let me check a few samples" | Survivorship bias | Script: check ALL items |
| Visual diff of two JSON blobs | Whitespace noise | Script: `JSON.stringify(sort(obj)) === expected` |
| "I already read it earlier in this conversation" | Context may be stale | Script: re-read from disk, fresh |

## Integration with Other Skills

- **systematic-debugging**: Phase 1 (Root Cause) — write a script to reproduce, not just "try it manually"
- **verifying-before-completion**: Write the verification script BEFORE claiming done
- **test-driven-development**: One-off analysis scripts can be promoted to permanent tests

## Bottom Line

```
Data > 100 items → Write a script
Data < 100 items → Read it, but be suspicious
"Something feels off" → Write a diff script, find it exactly
```