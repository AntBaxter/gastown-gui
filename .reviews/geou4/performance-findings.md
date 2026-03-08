# Performance Review

## Summary

The gastownui codebase is a vanilla JS SPA backed by an Express server that wraps CLI tools (`gt`, `bd`, `gh`, `tmux`) via `child_process.execFile`. The architecture is fundamentally I/O-bound — most latency comes from spawning CLI subprocesses. The code is generally reasonable for its scale, but several patterns would degrade significantly at 10x-100x scale: full DOM re-renders via innerHTML on every state change, sequential CLI calls where parallel is possible, unbounded in-memory caches, and redundant status fetches. The frontend has performance utilities (debounce, throttle, virtual scroller) available but largely unused by the components that need them most.

## Critical Issues

(P0 - Must fix before merge)

*None identified.* The codebase is a single-user admin GUI, not a high-traffic service. No correctness-breaking performance bugs found.

## Major Issues

(P1 - Should fix before merge)

### 1. Full innerHTML re-render on every state notification — `js/components/sidebar.js:29`, `js/components/activity-feed.js:73`

Every call to `renderSidebar()` replaces the entire sidebar innerHTML including all event listeners (which are then re-attached via `setupServiceControls`). This is triggered on every `status` state change. Similarly, `renderActivityFeed()` at line 73 replaces the entire feed container innerHTML on every event, even though `addEventToFeed()` (line 81) exists for incremental updates but is never called from `state.js` subscriptions.

**Impact:** Layout thrashing and dropped frames during rapid status updates. Event listeners are torn down and recreated on every render cycle. At 10x agents, the sidebar tree grows and each re-render becomes more expensive.

**Suggested fix:** Use the incremental `addEventToFeed()` path for new events instead of full re-render. For sidebar, diff the agent list and only update changed nodes, or at minimum debounce the render.

### 2. Duplicate `gt status --json --fast` calls — `server.js:823` vs `server/services/StatusService.js:84`

The `/api/agents` endpoint at `server.js:823` calls `executeGT(['status', '--json', '--fast'])` directly, bypassing the `StatusService` which has its own cached `getStatus()`. The `StatusService` is used for WebSocket initial status (line 1717) and `/api/status`. This means the same expensive CLI command is executed independently by different code paths, defeating the cache.

**Impact:** At minimum 2x CLI spawns for the same data within the same TTL window. Each `gt status` call spawns a subprocess and hits Dolt.

**Suggested fix:** Route `/api/agents` through `StatusService.getStatus()` and extract agent data from the cached result.

### 3. N+1 pattern in bead links endpoint — `server.js:750-806`

The `/api/bead/:beadId/links` endpoint iterates over all rigs, and for each rig: (1) spawns `git -C ... remote get-url origin`, then (2) spawns `gh pr list --repo ...`. With N rigs, this is 2N subprocess spawns executed sequentially.

**Impact:** With 5 rigs, this endpoint takes 5 × (git timeout + gh timeout) ≈ 5 × 15s = 75s worst case. Already hitting the 30s default timeout for some calls.

**Suggested fix:** Run the git remote lookups in parallel with `Promise.all()`. Cache the rig→repo URL mapping (it rarely changes). Run the `gh pr list` calls in parallel per-repo.

### 4. Redundant `getRunningPolecats()` tmux session parsing — `server.js:295-322`

`getRunningPolecats()` is called from `/api/agents` (line 823) and parses tmux `ls` output. Meanwhile, `StatusService._fetchStatus()` (StatusService.js:84) calls `this._tmux.listSessions()` and parses the same data via `parseTmuxPolecatSessions()`. These are independent code paths doing the same work.

**Impact:** Redundant tmux subprocess spawn. Minor, but contributes to the duplicate-work pattern.

**Suggested fix:** Consolidate through `StatusService`.

### 5. `loadMayorMessageHistory()` O(n) reverse + O(n) addEvent calls — `js/app.js:486-507`

On initial load, up to 20 mayor messages are fetched, then `messages.reverse()` is called (mutating the array), and each message is added via `state.addEvent()` which triggers `notify('events')` → full re-render of the activity feed per message. That's 20 full DOM re-renders in sequence.

**Impact:** 20 sequential innerHTML replacements of the activity feed on startup. Causes visible jank.

**Suggested fix:** Batch the events into `store.events` and call `notify('events')` once at the end.

## Minor Issues

(P2 - Nice to fix)

### 6. Unbounded legacy cache Map — `server.js:93`

The legacy `cache` Map at line 93 has a cleanup interval (line 153) but entries are never bounded by count. The `CacheRegistry` at line 58 is a proper implementation with TTL, but the legacy cache is still used by most inline endpoints.

**Impact:** With many unique cache keys (e.g., `rig-config:*` per rig), memory grows unbounded until GC of expired entries. Not a practical concern at current scale but a code smell.

### 7. WebSocket `broadcast()` serializes JSON per-broadcast, not per-client — `server.js:191-198`

`broadcast()` calls `JSON.stringify(data)` once then sends the same string to all clients. This is actually correct and efficient. However, there's no backpressure handling — if a client's send buffer is full, `client.send()` silently buffers or throws. With many rapid events and slow clients, this could cause memory growth.

**Impact:** Low risk at current scale (single-user GUI). Would matter at 100+ WebSocket clients.

### 8. `store.events` array copy on trim — `js/state.js:109-111`

When events exceed `MAX_EVENTS` (500), `store.events.slice(0, MAX_EVENTS)` creates a new array copy. Combined with finding #5 (re-render per addEvent), this means 500-element array copies during rapid event ingestion.

**Impact:** Minor GC pressure. Would be noticeable at 1000x event rate.

**Suggested fix:** Use `store.events.length = MAX_EVENTS` for in-place truncation instead of `slice()`.

### 9. `memoize()` in `js/utils/performance.js:189` uses unbounded Map

The `memoize()` utility creates a `Map` cache with no eviction policy. If used with high-cardinality inputs, it grows forever.

**Impact:** Currently unused by any component (available but not imported). No immediate impact, but a trap for future use.

### 10. `refreshMayorOutput()` regex replacements on every 2s poll — `js/app.js:1154-1159`

When the Mayor output panel is open, `refreshMayorOutput()` runs every 2 seconds and applies 4 regex replacements to the entire output string, then sets innerHTML with the result. The output can be up to 80 lines.

**Impact:** Minor — 4 regex passes over ~80 lines every 2s. Not a bottleneck, but the innerHTML assignment with embedded HTML from regex replacement is both a performance and XSS concern (output from CLI is trusted, but the pattern is fragile).

### 11. `env` object spread in `CommandRunner.exec()` — `CommandRunner.js:22`

Every CLI call creates a new object via `{ ...this._baseEnv, ...env }`. The base env (`process.env`) typically has 50-100 keys. This creates a shallow copy on every subprocess spawn.

**Impact:** Negligible at current call rates. Would matter if spawning 100+ commands/second.

### 12. `DOMBatcher` and `VirtualScroller` exist but are unused — `js/utils/performance.js`

The codebase has a `DOMBatcher` class for batching reads/writes and a `VirtualScroller` for large lists, but neither is used by any component. The activity feed (up to 500 items) and agent grid would benefit from virtual scrolling at scale.

**Impact:** No current impact, but represents missed optimization opportunity for when lists grow large.

## Observations

- **Architecture is fundamentally CLI-bound.** The biggest performance factor is subprocess spawn latency for `gt`/`bd`/`gh`/`tmux` commands. No amount of JS optimization will fix a 500ms `gt status` call. The caching layer is the right approach.

- **Two cache systems coexist.** The legacy `cache` Map (server.js:93) and the refactored `CacheRegistry` (CacheRegistry.js) serve the same purpose. The legacy one is used by inline endpoints, the new one by refactored services. This duplication creates subtle cache-miss bugs when the same data is fetched through different paths.

- **Frontend rendering is innerHTML-based.** Every component renders by replacing container.innerHTML with template literals. This works fine for small DOM trees but causes full subtree teardown/rebuild. Event listeners must be re-attached after every render. At current scale (10-50 agents, 10-20 convoys) this is acceptable. At 100+ items, consider DOM diffing or virtual scrolling.

- **`Promise.allSettled` is used well** in `loadInitialData()` (app.js:406) to parallelize independent fetches without blocking on failures. Good pattern.

- **The `getOrExecute` dedup in CacheRegistry** (line 52-71) correctly prevents thundering herd for concurrent requests to the same cache key. Well implemented.

- **No connection pooling for subprocess spawns.** Each API request spawns a new subprocess. For Dolt-backed commands (`bd`), this means a new connection per request. A persistent connection or IPC channel to the CLI tools would dramatically improve latency, but that's an architectural change beyond the current scope.
