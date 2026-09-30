---
name: dispatching-parallel-agents
description: Use when facing 2+ independent tasks that can be worked on without shared state or sequential dependencies
compatibility: opencode
---

# Dispatching Parallel Agents

## Overview

Delegate tasks to specialized agents with isolated context. Each agent gets precisely crafted instructions — never your session's context or history.

**Core principle:** Dispatch one agent per independent problem domain. Let them work concurrently.

## When to Use

- 3+ independent tasks (different files, different subsystems)
- Each task can be understood without context from others
- No shared state between implementations

## When NOT to Use

- Tasks are related (fix one might affect others)
- Need to understand full system state
- Agents would edit the same files

## The Pattern

### 1. Identify Independent Domains
### 2. Create Focused Agent Tasks (specific scope, clear goal, constraints, expected output)
### 3. Dispatch in Parallel
### 4. Review, Check Conflicts, Run Full Test Suite, Integrate

## Agent Prompt Structure

Good agent prompts are:
1. **Focused** — one clear problem domain
2. **Self-contained** — all context needed
3. **Specific about output** — what should the agent return
4. **Constraints** — what NOT to touch

## Verification

After agents return:
1. Review each summary
2. Check for conflicts (same files edited?)
3. Run full test suite
4. Spot check for systematic errors