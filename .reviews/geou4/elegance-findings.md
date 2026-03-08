# Elegance Review

## Summary

The gastownui codebase shows a clear architectural direction: a Gateway → Service → Route layered backend with DI, and a vanilla JS frontend with a simple reactive state store. The refactored modules (`server/`) are well-structured with consistent patterns, strong input validation (SafeSegment), and safe CLI execution (execFile, no shell). However, the migration from the monolith `server.js` is incomplete — roughly half the endpoints remain inline, using a parallel set of helper functions (`executeGT`, `executeBD`, `getCached`) that duplicate the refactored infrastructure. This creates two competing patterns that would confuse new contributors and make it unclear which approach to follow.

The frontend is straightforward vanilla JS, but the innerHTML-based rendering and global state store have scaling limits that are already showing in the larger components. The codebase would benefit most from completing the server.js extraction and standardizing the caching approach.

## Critical Issues

(P0 - Must fix before merge)

_None identified._ The codebase is functional, secure, and has no correctness bugs that would block a merge.

## Major Issues

(P1 - Should fix before merge)

### 1. Dual execution/caching systems in server.js

**server.js:92-123** defines an inline `cache` Map with `getCached`/`setCache` helpers and TTL constants.
**server.js:382-448** defines inline `executeGT`/`executeBD` wrappers around `execFileAsync`.

Meanwhile, the refactored backend has:
- `CacheRegistry` (server/infrastructure/CacheRegistry.js) — a proper cache with `getOrExecute()` stampede protection
- `CommandRunner` (server/infrastructure/CommandRunner.js) — safe `exec`/`spawn` wrappers
- `GTGateway`/`BDGateway` — proper gateway classes that use CommandRunner

The inline endpoints (mail, agents, nudge, rigs, crews, doctor, services, polecat control) use the old `executeGT`/`executeBD`/`getCached` path. The refactored endpoints (status, convoys, beads, work, formulas, github, targets) use the Gateway → Service → Route path.

**Impact:** Two competing patterns for the same operations. A developer adding a new endpoint has no clear guidance on which to use. The inline cache lacks stampede protection (`getOrExecute`). `executeGT` re-implements error heuristics (`looksLikeError`) that the Gateway layer handles more cleanly.

**Suggested fix:** Extract remaining inline endpoints into Service/Route modules. This is the single highest-leverage refactoring for the codebase.

### 2. Inconsistent input validation on inline endpoints

**server.js:534-544** (POST /api/mail) passes `to`, `subject`, `message` directly to `executeGT` args without SafeSegment validation. While `execFile` prevents shell injection, the values are still passed as CLI arguments without validation.

**server.js:636** (POST /api/nudge) validates `message` exists but not `target`.

**server.js:1127** (POST /api/rigs) validates `name` and `url` exist but doesn't use SafeSegment on `name`.

Compare with refactored endpoints where `AgentPath` and `SafeSegment` enforce validation consistently.

**Impact:** The inline endpoints have weaker validation guarantees than the refactored ones. While `execFile` mitigates the worst risks, malformed inputs can still cause confusing CLI errors rather than clean 400 responses.

### 3. The `/api/bead/:beadId/links` endpoint is a 90-line monolith

**server.js:719-813** performs bead lookup, rig listing, git remote resolution, GitHub PR search, and time-based heuristic matching all in a single route handler. This violates the Gateway → Service → Route pattern established elsewhere and contains embedded business logic (the 1-hour time window heuristic at line 783).

**Impact:** Untestable without a running `gt`/`bd`/`gh` environment. The time-window heuristic (`const oneHour = 60 * 60 * 1000`) is a magic number embedded in route logic.

### 4. FormulaService instantiated late and uses a different cache adapter

**server.js:1608-1621** creates a `formulaCache` adapter that wraps the inline `getCached`/`setCache`/`cache.delete`. All other refactored services use `CacheRegistry` injected via constructor. FormulaService bridges two worlds by adapting the inline cache to the service interface.

**Impact:** If the inline cache is cleaned up, FormulaService breaks. It should use `backendCache` (CacheRegistry) directly like StatusService and GitHubService do.

## Minor Issues

(P2 - Nice to fix)

### 5. `parseJSON` / `parseJsonOrNull` defined in 4 places

- **server.js:442** — `parseJSON(output)`
- **server/gateways/GTGateway.js:1** — `parseJsonOrNull(text)`
- **server/gateways/BDGateway.js:3** — `parseJsonOrNull(text)` (duplicate)
- **server/services/WorkService.js:1** — `parseJsonOrNull(text)` (duplicate)

All do the same thing: `try { return JSON.parse(text) } catch { return null }`. Should be a shared utility.

### 6. `quoteArg` in server.js is unused by refactored code

**server.js:200-208** defines `quoteArg` for shell argument quoting. But all refactored code uses `execFile` (no shell), making `quoteArg` unnecessary. It's only referenced by inline endpoints that also use `execFile`. This is dead code that signals a previous design where shell execution was used.

### 7. Duplicate tmux abstraction

**server.js:220-235** defines inline `tmuxExec`/`isSessionRunning` functions.
**server/gateways/TmuxGateway.js** provides a proper gateway for tmux operations.

The inline polecat/agent endpoints (start, stop, restart at lines 964-1052) use the inline `tmuxExec` rather than `TmuxGateway`, creating another dual-system problem.

### 8. Mayor message history is an in-memory singleton

**server.js:237-257** defines `mayorMessageHistory` as a module-level mutable array with `addMayorMessage`. This global state would ideally be part of a service class for testability.

### 9. `hideLoadingState` is a documented no-op

**js/app.js:78-81** — `hideLoadingState` does nothing and has a comment explaining it does nothing. Should be removed rather than kept "for clarity."

### 10. Service control endpoints (up/down/restart) repeat validation boilerplate

**server.js:1465-1585** — The three service endpoints repeat the same `validServices` array, `needsRig` check, and error response pattern. This is a textbook candidate for middleware or a shared validation function.

### 11. Frontend state store mutates objects in place

**js/state.js:129-135** — `markMailRead` mutates the mail object directly (`mail.read = true`) rather than creating a new reference. For a reactive store, this can cause subtle bugs where subscribers miss updates if they compare by reference.

### 12. Activity stream uses `spawn` directly instead of CommandRunner

**server.js:1637** — `activityProcess = spawn('gt', ['feed', ...])` bypasses the `CommandRunner` infrastructure. This is understandable since it's a long-lived streaming process, but it means the activity stream doesn't benefit from centralized process management.

## Observations

(Non-blocking notes and suggestions)

- **Architecture direction is sound.** The Gateway → Service → Route pattern with DI and constructor validation is clean and testable. The refactored modules (StatusService, BeadService, WorkService, etc.) are well-structured.

- **SafeSegment + AgentPath are good domain values.** They provide strong validation at the boundary. Consistent use across all endpoints would eliminate an entire class of bugs.

- **CacheRegistry's `getOrExecute` with pending-request dedup** is a nice pattern that prevents cache stampedes. The inline cache in server.js lacks this.

- **The frontend's simplicity is a feature.** Vanilla JS with no build step means zero tooling overhead. However, innerHTML rendering will become harder to maintain as components grow.

- **`server.js` line count (1769)** is high for a file that's supposed to be partially refactored. The refactored route files total ~200 lines. Moving the remaining inline endpoints out would reduce server.js to ~200 lines of wiring code.

- **Test coverage appears good.** 31 unit test files covering all refactored layers, plus integration and E2E tests. The dual system means inline endpoints may have less test coverage than refactored ones.

- **The `parseGitHubUrl` function** (server.js:325) is duplicated from what `GitHubGateway` likely handles. Should live in a shared utility or the gateway.

- **`resolveSessionName`** (server.js:261-292) uses the inline `getCached`/`executeGT` path. It's a candidate for TmuxGateway or StatusService.
