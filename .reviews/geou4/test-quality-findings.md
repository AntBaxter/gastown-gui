# Test Quality Review

## Summary

The gastownui test suite (33 test files) has significant quality gaps that undermine confidence in the codebase. While a few files demonstrate excellent testing practices (quoteArg, formattingTime, eventBus), the majority suffer from three systemic problems: (1) over-mocked services where tests can never fail because mocks always return success, (2) pervasive use of weak assertions that check existence/type but not actual values, and (3) near-total absence of negative test cases covering error paths, invalid inputs, and edge cases.

The E2E and integration tests are particularly concerning. They rely heavily on arbitrary `sleep()` delays (60+ instances), use silent `.catch(() => {})` patterns that suppress real failures, and employ conditional assertions that pass regardless of outcome (e.g., `expect([200,201,400,500]).toContain(status)`). Several tests literally cannot fail under any circumstances.

## Critical Issues

### P0-1: E2E smoke test is meaningless (e2e.test.js:592-815)

The 200+ line smoke test uses `safeOptionalClick` and `.catch(() => {})` patterns throughout. Every interaction silently passes if the element doesn't exist, click fails, or element is detached. The test would pass even if 90% of the UI was deleted.

**Impact:** Zero regression detection for the entire UI surface.
**Fix:** Remove silent catch patterns. Use `waitForSelector` with strict mode. Assert outcomes, not just element existence.

### P0-2: endpoints.test.js has assertions that accept any status code (endpoints.test.js:193-228)

```js
expect([200, 201, 400, 500]).toContain(status)  // lines 203, 213, 227
```

These assertions pass for literally any HTTP response. The "should create a new convoy" test passes whether the endpoint succeeds, fails validation, or throws a server error.

**Impact:** Endpoint behavior regressions are undetectable.
**Fix:** Assert specific expected status codes. Test success and failure paths separately.

### P0-3: Route tests use hardcoded-success mocks (statusRoutes, targetRoutes, workRoutes, githubRoutes, beadRoutes, convoyRoutes)

All route test files mock their service layer to always return success. The route implementation could be deleted entirely and tests would still pass because the mock bypasses all routing logic.

Files affected:
- `statusRoutes.test.js:13-19` - mock always returns `{ ok: true }`
- `targetRoutes.test.js:14-18` - mock always returns `[{ id: 'mayor' }]`
- `workRoutes.test.js:15-40` - all methods hardcoded to succeed
- `githubRoutes.test.js:15-35` - all methods return fixed success data
- `beadRoutes.test.js:15-34` - mock service always succeeds
- `convoyRoutes.test.js:16-27` - mock service always succeeds

**Impact:** Route-level validation, error handling, and status code mapping are completely untested.
**Fix:** Add tests where mock services return errors/throw exceptions. Verify routes return correct HTTP status codes and error response bodies.

### P0-4: Integration tests with conditional assertions that always pass (integration.test.js)

Multiple tests return early or pass without assertions:
- Lines 258-289: "should show issue tree in expanded convoy" returns early (line 276-279) if expanded is false. Test passes even if convoy expansion is broken.
- Lines 152-174: "should show autocomplete dropdown" passes if `beadInput` doesn't exist.

**Impact:** Core UI features appear tested but aren't actually verified.
**Fix:** Remove conditional early returns. Tests should fail if prerequisites aren't met.

## Major Issues

### P1-1: Gateway tests only verify arguments, not behavior (bdGateway, githubGateway, gitGateway, gtGateway)

All gateway tests follow the same pattern: mock the command runner, call the gateway method, assert the args array matches expectations. None verify:
- Error handling when commands fail (non-zero exit codes)
- JSON parse errors from malformed output
- Timeout behavior
- Signal/process termination

Files:
- `bdGateway.test.js` - 10 tests, all happy path only
- `githubGateway.test.js` - 3 tests, all happy path, default queue always succeeds
- `gitGateway.test.js` - 1 single test, happy path only
- `gtGateway.test.js` - 7 tests, all happy path

**Impact:** Any regression in CLI error handling goes undetected.
**Fix:** Add tests that queue failed responses (`ok: false`, non-zero exit codes, invalid JSON stdout). Verify gateway methods propagate or handle errors correctly.

### P1-2: 60+ arbitrary sleep() calls in integration/E2E tests

Both `integration.test.js` and `e2e.test.js` use fixed-duration `await sleep()` calls extensively:
- `integration.test.js`: sleep(300) to sleep(1000) scattered across 12+ locations
- `e2e.test.js`: sleep(200) to sleep(4000) across 20+ locations
- `websocket.test.js`: 5-second hard timeouts with `setTimeout(() => resolve(false), 5000)`

**Impact:** Tests are flaky on slow CI runners. Fixed delays either waste time (too long) or cause false failures (too short).
**Fix:** Replace sleep() with `waitForSelector`, `waitForFunction`, or event-driven assertions. Use polling with exponential backoff for async state checks.

### P1-3: beadService.test.js has weak deduplication testing (beadService.test.js:100-115)

The deduplication logic test uses tightly-coupled mocks. Line 145 uses `toBeFalsy()` instead of asserting the specific value. No tests for when `bdGateway.list()` returns `ok: false` or when `bdGateway.search()` fails.

**Impact:** Dedup regressions and error paths in the core bead service go undetected.
**Fix:** Assert specific values instead of truthiness. Add error path tests for gateway failures.

### P1-4: state.test.js duplicates implementation instead of importing it (state.test.js:10-131)

The entire state module implementation is copy-pasted into the test file because it uses browser globals. This means the test validates its own copy, not the real module.

**Impact:** If the real state module changes, tests continue passing against the stale copy.
**Fix:** Refactor state module to accept dependencies (DOM globals) via injection, enabling direct import in test environment.

### P1-5: Cache tests don't verify caching behavior (cache.test.js:27-95)

All cache integration tests check `response.ok === true` but never verify that:
- Cached responses are actually served from cache (no call count verification)
- Fresh responses bypass cache
- Cache invalidation works

Line 154: `expect(maxDuration).toBeLessThan(500)` is a timing-based assertion that will be flaky on slow systems.

**Impact:** Cache could be completely bypassed with no test failures.
**Fix:** Track backend call counts. Verify identical responses for cached calls. Assert call count doesn't increase for cached requests.

### P1-6: WebSocket tests don't verify protocol behavior (websocket.test.js:123-173)

Three tests only check `ws.readyState === WebSocket.OPEN` after sending various messages:
- "should handle ping/pong" (line 123) - doesn't verify ping/pong occurred
- "should handle invalid JSON" (line 139) - doesn't verify error handling
- "should handle empty messages" (line 157) - doesn't verify message was processed

**Impact:** WebSocket protocol handling regressions undetectable.
**Fix:** Verify server responses to ping. Verify error events fire for invalid JSON. Check message acknowledgment.

## Minor Issues

### P2-1: Time-based cache TTL tests use manual Date manipulation

Files: `convoyService.test.js:8-32`, `statusService.test.js:62-86`, `githubService.test.js:8-9`

Pattern: `now += 1001` to advance past TTL. Fragile if TTL boundary is off by 1ms.

**Fix:** Use `vi.useFakeTimers()` (as formattingTime.test.js correctly does) instead of manual time injection.

### P2-2: Weak toBeDefined/toHaveBeenCalled assertions in state.test.js

- Line 273: `expect(event.timestamp).toBeDefined()` - should verify ISO format
- Lines 353, 388, 389, 401: `expect(callback).toHaveBeenCalled()` without arg verification

**Fix:** Use `toHaveBeenCalledWith(expectedArgs)` and validate timestamp format.

### P2-3: workRoutes.test.js uses toMatchObject for response validation (line 88)

`toMatchObject` allows unexpected extra fields to pass silently.

**Fix:** Use `toEqual` for exact response shape validation.

### P2-4: Missing boundary tests in beadsShared.test.js and animationsShared.test.js

- No tests for negative priority values, floats, or very large numbers
- No tests for negative stagger indices or float indices

**Fix:** Add boundary value tests for numeric inputs.

### P2-5: formulaRoutes.test.js line 98 uses toBeTruthy for file access rejection

```js
await expect(fsPromises.access(filePath)).rejects.toBeTruthy()
```

Should assert specific error code (ENOENT).

### P2-6: commandRunner.test.js uses real process execution (lines 8-11, 31-41)

Tests spawn actual Node.js processes. The 10ms timeout test (line 40) for a sleep command could be flaky on slow systems.

**Fix:** Consider mocking child_process for unit tests, or increase timeout margins.

## Observations

- **Exemplary test files:** `quoteArg.test.js` (comprehensive injection testing), `formattingTime.test.js` (proper fake timers, exact assertions), `eventBus.test.js` (clean structure, exact value checks), `htmlUtils.test.js` (good edge case coverage including null/0/empty). These should be used as templates for improving other tests.

- **Systemic pattern:** The gateway -> service -> route layering means each layer mocks the one below. But since mocks always succeed, the entire chain is only tested for the happy path. A single gateway error test at each layer would dramatically improve coverage.

- **E2E test architecture:** The `safeClick`/`safeOptionalClick` pattern was likely added to handle flaky selectors, but it masks real failures. A better approach would be strict selectors with proper wait conditions, failing fast when elements are missing.

- **mock-server.js divergence risk:** The mock server (test/mock-server.js) must stay in sync with the real server (server.js + server/routes/). There's no automated check for this. Consider generating mock responses from server schema or adding a sync test.

- **No test for the test infrastructure itself:** globalSetup.js uses ephemeral ports stored in `process.env.PORT` but has no validation that the mock server started successfully. Parallel test execution could cause port conflicts.

## File-Level Summary

| File | Rating | Key Issues |
|------|--------|------------|
| quoteArg.test.js | EXCELLENT | None |
| formattingTime.test.js | EXCELLENT | None |
| eventBus.test.js | GOOD | None |
| htmlUtils.test.js | GOOD | None |
| safeSegment.test.js | GOOD | Minor edge cases |
| githubRepos.test.js | MODERATE | Missing edge cases |
| formulaService.test.js | MODERATE | Limited error coverage |
| agentPath.test.js | MODERATE | Minimal test count |
| beadsShared.test.js | MODERATE | Missing boundary tests |
| animationsShared.test.js | MODERATE | Missing boundary tests |
| state.test.js | WEAK | Duplicated implementation, weak assertions |
| commandRunner.test.js | WEAK | Real process execution, timing sensitivity |
| cacheRegistry.test.js | WEAK | setTimeout-based, missing error paths |
| beadService.test.js | WEAK | Over-mocked, weak dedup testing |
| convoyService.test.js | WEAK | Manual time manipulation, no error paths |
| statusService.test.js | WEAK | Cache timing fragile, no error paths |
| githubService.test.js | WEAK | Over-mocked, timing-based cache test |
| workService.test.js | WEAK | No exception handling tests |
| targetService.test.js | WEAK | Missing edge cases |
| bdGateway.test.js | WEAK | Args-only testing, no error paths |
| githubGateway.test.js | WEAK | Over-mocked, happy path only |
| gitGateway.test.js | WEAK | Single test, happy path only |
| gtGateway.test.js | WEAK | No error scenarios |
| tmuxGateway.test.js | WEAK | Missing error handling tests |
| All route tests (6 files) | WEAK | Hardcoded-success mocks, no error paths |
| cache.test.js | WEAK | Doesn't verify caching, timing-based |
| websocket.test.js | WEAK | Doesn't verify protocol, timeout-based |
| integration.test.js | WEAK | Sleep-heavy, conditional assertions |
| endpoints.test.js | WEAK | Accepts any status code |
| e2e.test.js | POOR | Silent failures throughout, sleep-heavy |
