# Code Review Synthesis — gastownui

**Review ID:** geou4
**Date:** 2026-03-08
**Merge Recommendation:** CONDITIONAL MERGE — no P0 code bugs, but test suite quality is critically low

## Executive Summary

Four of ten review legs have completed findings: Elegance, Performance, Test Quality, and Commit Discipline. Six legs remain incomplete (Correctness, Security, Resilience, Style, Wiring, Code Smells).

**Overall assessment:** The gastownui codebase has sound architectural direction — a Gateway → Service → Route backend with DI, safe CLI execution via `execFile`, and input validation via `SafeSegment`. The refactored modules are clean and testable. However, two systemic issues dominate: (1) the server.js monolith is only half-refactored, creating dual competing systems for execution, caching, and validation; and (2) the test suite has critically weak assertions — multiple test files literally cannot fail regardless of code behavior.

The commit discipline is strong, and the codebase is functional. The primary risk is regression blindness: changes could break the application without any test catching it.

## Critical Issues

### P0-1: Test suite provides false confidence — tests that cannot fail
**Found by:** Test Quality leg
**Files:** `e2e.test.js`, `endpoints.test.js`, `integration.test.js`, all route test files

The E2E smoke test uses `.catch(() => {})` patterns that silently pass when elements don't exist. The endpoints test accepts any HTTP status code (`expect([200, 201, 400, 500]).toContain(status)`). Integration tests use conditional assertions that return early without verifying anything. All route tests use hardcoded-success mocks, meaning route logic is never actually exercised.

**Impact:** Zero regression detection for the UI surface and endpoint behavior. The test suite creates an illusion of coverage without delivering it.

**Recommendation:** Before merging further features, fix the highest-impact tests:
1. Remove silent `.catch(() => {})` in E2E tests — use strict `waitForSelector`
2. Assert specific status codes in endpoint tests
3. Add error-path tests for route handlers (mock service failures)
4. Add gateway error-handling tests (mock failed CLI commands)

### P0-2: 60+ arbitrary `sleep()` calls make tests flaky
**Found by:** Test Quality leg
**Files:** `integration.test.js`, `e2e.test.js`, `websocket.test.js`

Fixed-duration sleeps (200ms–4000ms) are used instead of event-driven assertions.

**Impact:** Tests are flaky on slow CI and waste time on fast runners.

**Recommendation:** Replace with `waitForSelector`, polling, or event-driven assertions.

## Major Issues

### P1-1: Dual execution/caching systems — incomplete server.js refactoring
**Found by:** Elegance leg, Performance leg (duplicate finding)

`server.js` retains inline `executeGT`/`executeBD`/`getCached` helpers (~lines 92–448) alongside the refactored `CommandRunner`/`CacheRegistry`/Gateway infrastructure. Approximately half the endpoints (mail, agents, nudge, rigs, crews, doctor, services, polecat control) still use the inline path.

**Impact:**
- Two competing patterns for the same operations confuse contributors
- Inline cache lacks stampede protection (`getOrExecute`)
- Same data fetched through different paths defeats caching (e.g., `gt status --json --fast` called independently by `/api/agents` and `StatusService`)
- Inline endpoints have weaker input validation than refactored ones

**Recommendation:** This is the single highest-leverage refactoring. Extract remaining inline endpoints into Service/Route modules. This would reduce server.js from ~1700 lines to ~200 lines of wiring.

### P1-2: N+1 subprocess pattern in bead links endpoint
**Found by:** Performance leg, Elegance leg (duplicate finding)
**File:** `server.js:719-813`

`/api/bead/:beadId/links` iterates over all rigs, spawning 2N sequential subprocesses (git remote + gh pr list per rig). With 5 rigs, worst-case latency is 75s.

**Impact:** Endpoint timeouts at modest rig counts.

**Recommendation:** Parallelize with `Promise.all()`. Cache rig→repo URL mapping.

### P1-3: Full innerHTML re-render on every state change
**Found by:** Performance leg
**Files:** `js/components/sidebar.js:29`, `js/components/activity-feed.js:73`, `js/app.js:486-507`

Every state notification triggers full container innerHTML replacement. Event listeners are torn down and recreated each cycle. On startup, 20 mayor messages trigger 20 sequential full DOM re-renders.

**Impact:** Layout thrashing, dropped frames during rapid updates. Gets worse at scale.

**Recommendation:** Use incremental `addEventToFeed()` for new events. Batch initial load. Debounce sidebar renders.

### P1-4: state.test.js duplicates the implementation it's testing
**Found by:** Test Quality leg
**File:** `state.test.js:10-131`

The entire state module is copy-pasted into the test file to avoid browser globals. Tests validate the copy, not the real module.

**Impact:** State module changes won't cause test failures.

**Recommendation:** Refactor state module to accept DOM globals via injection.

### P1-5: FormulaService uses adapted inline cache instead of CacheRegistry
**Found by:** Elegance leg
**File:** `server.js:1608-1621`

FormulaService bridges the two cache systems via an adapter wrapping `getCached`/`setCache`. All other services use `CacheRegistry` directly.

**Impact:** If inline cache is cleaned up, FormulaService breaks.

**Recommendation:** Migrate FormulaService to use `backendCache` (CacheRegistry).

## Minor Issues

### P2 — Code Quality (from Elegance leg)
- `parseJsonOrNull` duplicated in 4 files — extract to shared utility
- `quoteArg` in server.js is dead code (all code uses `execFile`, no shell)
- Duplicate tmux abstraction: inline `tmuxExec` + `TmuxGateway`
- `mayorMessageHistory` is an in-memory singleton — should be a service
- `hideLoadingState` is a documented no-op — remove it
- Service control endpoints repeat validation boilerplate — extract middleware
- Frontend `markMailRead` mutates objects in-place (fragile for reactive store)
- Activity stream `spawn` bypasses `CommandRunner`

### P2 — Performance (from Performance leg)
- Legacy cache Map is unbounded by count (only TTL expiry)
- `store.events` array copies on trim — use in-place truncation
- `memoize()` utility has unbounded Map cache (currently unused)
- `refreshMayorOutput()` runs 4 regex passes every 2s (minor)
- `DOMBatcher` and `VirtualScroller` exist but are unused — missed optimization

### P2 — Test Quality (from Test Quality leg)
- Manual `Date` manipulation in cache TTL tests — use `vi.useFakeTimers()`
- Weak `toBeDefined`/`toHaveBeenCalled` without argument verification
- `toMatchObject` used where `toEqual` would catch unexpected fields
- Missing boundary tests for numeric inputs
- `commandRunner.test.js` spawns real processes — flaky on slow systems

## Wiring Gaps

**Leg incomplete.** The Wiring Review (ga-vc9) has not been dispatched. No findings available.

**Observable from other legs:**
- `DOMBatcher` and `VirtualScroller` are defined in `js/utils/performance.js` but never imported by any component (found by Performance leg)
- `memoize()` utility exists but is unused (Performance leg)
- `quoteArg` defined but unnecessary since `execFile` is used everywhere (Elegance leg)

## Commit Quality

**Rating: Strong** (from Commit Discipline leg)

- All 11 commits use conventional prefixes (`feat:`, `fix:`, `chore:`)
- Bead issue IDs included for traceability (10/11 commits)
- Generally atomic — one logical change per commit
- Descriptive commit bodies explaining rationale
- Clean progression, no WIP/throwaway commits
- Tests co-located with feature commits

Minor notes:
- One large cross-cutting commit (`2dac4d6`, 14 files) could have been split
- One feature commit (`e7519a1`) has no body text
- Root commit uses `fix:` prefix for what is clearly an initial import

## Test Quality

**Rating: Weak overall** (from Test Quality leg)

The test suite has 33 files. A few are exemplary (`quoteArg.test.js`, `formattingTime.test.js`, `eventBus.test.js`), but the majority suffer from:

1. **Over-mocked services** — mocks always return success, so tests can't detect regressions
2. **Weak assertions** — checking existence/type instead of actual values
3. **Missing negative tests** — almost no error path coverage
4. **Silent failure patterns** — E2E tests suppress errors that would reveal real bugs

**File ratings:** 4 EXCELLENT/GOOD, 5 MODERATE, 16 WEAK, 1 POOR

## Positive Observations

1. **Architecture direction is sound.** Gateway → Service → Route with DI, constructor validation, and `SafeSegment` input sanitization is a clean, testable pattern.
2. **CacheRegistry's `getOrExecute` with pending-request dedup** prevents thundering herd — well implemented.
3. **`execFile` everywhere** — no shell execution, eliminating an entire class of injection vulnerabilities.
4. **Commit discipline is strong** — clear, atomic, traceable commits with conventional format.
5. **`Promise.allSettled` in `loadInitialData()`** — correct pattern for parallel independent fetches.
6. **No build step** — vanilla JS with zero tooling overhead is appropriate for this admin GUI.
7. **Existing test exemplars** — `quoteArg.test.js` and `formattingTime.test.js` demonstrate the team knows how to write good tests, providing templates for improvement.

## Recommendations

**Priority order by impact × effort:**

1. **Fix the test suite (HIGH impact, MEDIUM effort):** The test suite is the #1 risk. Start with the 6 route test files — add error-path tests where mock services throw. Then fix the E2E smoke test to use strict assertions. This alone would transform confidence from "false" to "moderate."

2. **Complete server.js extraction (HIGH impact, HIGH effort):** Extract remaining inline endpoints into Service/Route modules. This eliminates the dual-system confusion, strengthens validation consistency, and reduces server.js to pure wiring. Do this incrementally — one endpoint group per PR.

3. **Fix N+1 bead links endpoint (MEDIUM impact, LOW effort):** Parallelize subprocess calls with `Promise.all()`. Quick win.

4. **Batch initial event loading (MEDIUM impact, LOW effort):** In `loadMayorMessageHistory()`, add all events to array first, then notify once. Quick win.

5. **Extract shared utilities (LOW impact, LOW effort):** Move `parseJsonOrNull` to a shared module. Remove dead `quoteArg`. Quick wins during other refactoring.

6. **Complete remaining review legs:** Correctness, Security, Resilience, Style, Wiring, and Code Smells legs have not produced findings yet. The Security leg in particular should be prioritized given this is a GUI that wraps CLI commands.

---

## Appendix: Leg Status

| Leg | Assignee | Status | Findings |
|-----|----------|--------|----------|
| Elegance | rictus | Complete | `.reviews/geou4/elegance-findings.md` |
| Performance | capable | Complete | `.reviews/geou4/performance-findings.md` |
| Test Quality | nux | Complete | `.reviews/geou4/test-quality-findings.md` |
| Commit Discipline | nux | Complete | `.reviews/geou4/commit-discipline-findings.md` |
| Correctness | — | Open | No findings |
| Security | — | Open | No findings |
| Resilience | dementus | Hooked | No findings |
| Style | nux | Hooked | No findings |
| Wiring | — | Open | No findings |
| Code Smells | slit | In Progress | No findings |
