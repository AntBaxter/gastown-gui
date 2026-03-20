# Beads UI Integration Analysis

**Date:** 2026-03-13 (updated 2026-03-20)
**Context:** Investigating how to enhance the gastownui beads interface with kanban boards, dependency graphs, bead type creation, graph insights, and patterns from [BeadBoard](https://github.com/zenchantlive/beadboard) and [beads_viewer](https://github.com/Dicklesworthstone/beads_viewer).

---

## Current State

### What We Have (as of 2026-03-20)

The gastownui frontend provides:

**Views (all functional):**
- **Kanban board** (default) -- CSS grid with 5 status columns, epic filter, priority sorting, ready/blocked badges
- **Work list** -- linear card list with status/rig filters
- **Dependency graph** -- SVG-based DAG with Dagre layout, pan/zoom, click-to-detail
- **Epic detail** -- child tasks with progress bar, "Sling All Ready" bulk action
- **Convoy dashboard** -- expand/collapse cards, issue trees, progress bars

**Bead creation** includes type dropdown (task, bug, epic, feature, research), description, rig selection, priority, labels, parent, and "sling now" checkbox.

**Backend** is well-structured: `BDGateway` wraps the `bd` CLI, `BeadService` handles business logic, `beads.js` routes expose REST endpoints. Real-time updates flow via WebSocket from `gt feed`.

### What's Still Missing

- ~~No kanban/board view~~ DONE
- ~~No dependency graph visualization~~ DONE (core)
- ~~No bead type selection during creation~~ DONE
- ~~No convoy management UI~~ DONE (core)
- ~~No blocked-chain visibility~~ DONE (on kanban cards)
- Dependency graph mobile fallback (indented tree for small screens)
- Cycle detection in dependency graphs
- Blocked chain triage modal (dedicated UI for unblocking)
- Integration branch status/management in convoy detail
- Multi-step convoy creation wizard
- Graph insights dashboard (critical path, bottleneck detection, project health)
- Export capabilities (Mermaid diagrams, Markdown summaries)
- No agent pool monitor / "needs agent" queue
- No project scope switching (single vs aggregate workspace)

---

## BeadBoard Reference Analysis

[BeadBoard](https://github.com/zenchantlive/beadboard) is a Next.js 15 / React 19 / TypeScript dashboard built on the same `bd` CLI. Its full technology stack includes Tailwind CSS, Radix UI, Framer Motion, XYFlow + Dagre, Zod validation, and Chokidar file watchers.

### Complete Feature Inventory

| Category | Feature | Description |
|----------|---------|-------------|
| **Work Management** | Kanban board | Columns per status with drag/drop |
| | DAG graph | XYFlow + Dagre for dependency visualization |
| | Cycle detection | Graph analysis catches circular dependencies |
| | Task/dependency tabs | Toggle between task-centric and dependency-centric views |
| **Agent Coordination** | Social view | Agent session cards with liveness indicators |
| | Agent Pool Monitor | Archetypes, templates, capacity overview |
| | "Needs Agent" queue | Unassigned work surfaced for dispatch |
| | Pre-assigned queue | Reserved tasks waiting for specific agents |
| | Squad roster | Active team member display |
| **Communication** | Conversation threading | Thread builder merging events + mail per bead |
| | Message lifecycle | Unread → read → acked state tracking |
| | Acknowledgment flow | High-signal messages require explicit ack |
| | Activity timeline | Chronological event stream with type filters |
| **Coordination** | Blocked triage | Modal with full blocker chain + unblock actions |
| | Swarm panel | Archetype/template pickers, convoy stepper |
| | Project scope switching | Single-project vs aggregate workspace toggle |
| | Project registry | Scanner-backed project discovery |
| **Real-time** | SSE updates | Server-Sent Events from Chokidar file watchers |
| | Mutation feedback | Writeback confirmation in operational surface |

### Directly Relevant Patterns (What to Adopt)

| Feature | BeadBoard Approach | Our Adaptation |
|---------|-------------------|----------------|
| **Kanban board** | React columns per status | Vanilla JS, CSS grid columns per status |
| **DAG graph** | XYFlow + Dagre auto-layout | Dagre for layout, SVG for rendering (no React dep) |
| **Agent session cards** | Social view with liveness | Extend existing `agent-grid.js` component |
| **Blocked triage** | Modal with blocker context | Add to existing modal system in `modals.js` |
| **Activity timeline** | Filtered event stream | Enhance existing `activity-feed.js` with filter chips |
| **Conversation threading** | Thread builder (events + mail) | New component, data from existing mail + feed endpoints |
| **Swarm coordination** | Convoy stepper | New convoy management panel (see `convoy-integration-branches.md`) |
| **Needs Agent queue** | Unassigned work surface | Add "unassigned" filter to kanban board view |
| **Cycle detection** | Graph analysis | Add to dependency graph (Dagre detects cycles natively) |

### What NOT to Adopt from BeadBoard

| Feature | Why Skip |
|---------|----------|
| **Project registry + scanner** | Gas Town uses rigs (already discoverable via `gt rig list`) |
| **Message ack workflow** | Adds protocol complexity; our nudge system is lighter-weight |
| **Agent archetypes/templates** | Gas Town formulas serve this purpose already |
| **Global project scope switching** | Our rig filter already handles this; full aggregate view is premature |
| **Framer Motion animations** | CSS animations + `animations.css` are sufficient for our needs |

### Key Architectural Differences

BeadBoard is a full Next.js app that directly accesses Dolt and the filesystem. We are a vanilla JS SPA talking to Express endpoints wrapping CLI commands. This means:

- **We can't adopt their React components directly** -- must reimplement in vanilla JS
- **Our data access is more constrained** -- everything goes through `bd` CLI, which is actually more secure (SafeSegment validation)
- **Their SSE approach vs our WebSocket** -- both work; our WebSocket is already implemented and bidirectional
- **Their Tailwind + Radix UI** -- we use plain CSS with custom properties; visual patterns are transferable
- **Their direct Dolt queries** -- we avoid this for security; CLI wrapping adds latency but prevents injection
- **Their Chokidar watchers** -- we use `gt feed --json` piped through WebSocket; same real-time effect, different mechanism

---

## beads_viewer Reference Analysis

[beads_viewer (bv)](https://github.com/Dicklesworthstone/beads_viewer) is a Go-based graph-aware TUI for the beads issue tracker. Unlike BeadBoard (a web app), bv is a terminal tool that treats projects as dependency graphs and computes graph-theoretic metrics.

### Key Capabilities

| Category | Feature | Description |
|----------|---------|-------------|
| **Graph Analysis** | 9 graph metrics | PageRank, betweenness centrality, HITS, critical path, eigenvector, degree, density, cycle detection, topological sort |
| **Views** | Multiple modes | List, kanban, graph visualization, insights dashboard, history |
| **AI Integration** | Robot mode | `--robot-triage`, `--robot-next`, `--robot-plan` for structured agent output |
| **Export** | Multiple formats | Mermaid diagrams, DOT, JSON, HTML interactive graphs |
| **Health** | Automated alerts | Stale items, cascading blocks, priority misalignment |
| **History** | Time-travel | Compare bead state across git revisions |

### What to Adopt from beads_viewer

| Feature | bv Approach | Our Adaptation |
|---------|-------------|----------------|
| **Critical path** | Longest dependency chain computation | Server-side computation, highlight in graph view + sidebar list |
| **Bottleneck detection** | In-degree analysis (what blocks most work) | "Top blockers" ranked list, "blocks N" badge on kanban cards |
| **Cycle detection** | Graph cycle finder | Warning overlay on dependency graph when cycles found |
| **Stale item detection** | Age-based alerts | Configurable threshold, surface in insights panel |
| **Mermaid export** | `--export-graph` command | Copy-to-clipboard button on dependency graph view |
| **Project health** | Density, status distribution | Counters + simple charts in insights panel |

### What NOT to Adopt from beads_viewer

| Feature | Why Skip |
|---------|----------|
| **PageRank / eigenvector centrality** | Full spectral analysis is overkill for web UI; degree + critical path covers 80% of value |
| **HITS algorithm** | Hub/authority less useful when we have explicit epic/task hierarchy |
| **Topological sort display** | Mainly useful for agent consumption; our API already serves structured data |
| **Robot mode** | Our REST API endpoints already serve structured JSON to agents |
| **Time-travel / history** | High effort, low value; `git log` + timestamps sufficient |
| **Token-optimized output (TOON format)** | Agent-specific optimization not needed in web UI |

### Key Architectural Differences

bv is a single-binary Go TUI reading `.beads/beads.jsonl` directly. We are a web SPA talking to Express endpoints wrapping CLI commands. This means:

- **We can't reuse their Go graph algorithms** -- must reimplement critical path / cycle detection in JS (server-side)
- **Their direct file access vs our CLI wrapping** -- we trade speed for security (SafeSegment validation)
- **Their Bubble Tea TUI vs our browser UI** -- completely different rendering, but the analytical concepts transfer
- **Their file watcher vs our WebSocket** -- same real-time effect, different mechanism

---

## Recommended Features (Priority Order)

### Phase 1: Kanban Board View -- COMPLETE

Implemented: CSS grid with 5 status columns, epic filter, priority sorting, ready/blocked badges, view toggle, real-time WebSocket updates.

### Phase 2: Bead Type Selection -- COMPLETE

Implemented: Type dropdown in creation modal, full API chain, color-coded type badges.

### Phase 3: Dependency Graph View -- PARTIALLY COMPLETE

Implemented: Dagre-based SVG rendering, pan/zoom, click-to-detail, dependency CRUD endpoints.
Remaining: Mobile fallback (indented tree), cycle detection, convoy-scoped graphs.

### Phase 4: Blocked Chain Triage (Medium Value, Medium Effort)

**What:** Dedicated modal for triaging blocked beads with full chain visualization and one-click unblock actions.

**Status:** Data layer done (blocked API, kanban badges). Triage modal UI remaining.

### Phase 5: Graph Insights Dashboard (High Value, Medium Effort) -- NEW

**What:** Project health metrics inspired by beads_viewer's graph analysis engine.

**Why:** Understanding which beads are critical bottlenecks and the overall health of the dependency graph helps prioritize unblocking work. Especially valuable in multi-agent Gas Town where blocking cascades determine system throughput.

**Key features:**
- Critical path computation and display (longest dependency chain)
- Bottleneck detection ("blocks N items" badges, ranked blocker list)
- Project health counters (by status, dependency density, stale items)
- Insights panel or tab for drill-down

### Phase 6: Export and Sharing (Medium Value, Low Effort) -- NEW

**What:** Export dependency graphs as Mermaid diagrams and views as Markdown summaries.

**Why:** Useful for documentation, PR descriptions, and sharing project state outside the UI.

### Phase 7: Enhanced Activity Feed (Low Value, Low Effort)

**What:** Add type-based filtering (beads, work, agents, rigs, system) and conversation threading per bead.

**Approach:**
- The activity feed already exists -- add filter chips at the top
- For threading: group events by bead ID, show as expandable conversation
- Merge activity events with mail messages for unified bead timeline

---

## What We Should NOT Do

1. **Don't adopt React/Next.js.** The codebase is vanilla JS with no build step. Introducing a framework would be a massive architectural change with cascading test/build/deploy impacts. The patterns from BeadBoard are transferable without the framework.

2. **Don't implement SSE to replace WebSocket.** Our WebSocket system works. SSE is simpler but we'd be replacing working infrastructure for marginal gain.

3. **Don't build a full swarm orchestration UI yet.** BeadBoard's swarm workspace is impressive but premature for us. Focus on bead visibility first (kanban + graph), then coordination features.

4. **Don't add direct Dolt queries.** Our architecture wraps the `bd` CLI for security. Bypassing it for performance would create a parallel data access path and security concerns.

5. **Don't try to make the dependency graph mobile-first.** Graph visualization on small screens is a poor experience. Provide a list-based fallback for mobile and invest graph effort in the desktop experience.

6. **Don't implement drag-and-drop in Phase 1.** It's nice but complex (especially cross-column state transitions with validation). Ship the kanban as read-only first, add DnD as a follow-up.

---

## Technical Considerations

### Adding New Endpoints

For each new endpoint, update BOTH `server.js` (or `server/routes/`) AND `test/mock-server.js`.

### Bead Data Shape

Current bead objects from `bd list --json` include: id, title, description, type, status, priority, assignee, owner, labels, created_at, updated_at, dependencies. This is sufficient for kanban and basic graph views.

For full dependency graphs, we need to call `bd deps <id>` per bead or add a bulk dependency endpoint. Consider caching dependency data on the server side to avoid N+1 CLI calls.

### Performance

- Kanban: fine with client-side grouping for < 500 beads
- Graph: Dagre layout computation is O(V+E), fast for < 200 nodes
- Real-time: existing WebSocket handles updates; kanban/graph should subscribe to bead events and re-render affected cards/nodes

---

## Performance Investigation: Bead Loading Speed (2026-03-20)

### Problem

`/api/beads?rig=all` takes 20-26 seconds to respond. This makes the beads UI unusable for planning and managing work.

### Root Cause Analysis

The bottleneck is the **HQ (town-level) database query** when `bd list --all --json` runs from `cwd: /home/gastown/gt` without a `--rig` flag.

**Data profile of the HQ database:**
- 2214 total beads (1944 closed, 255 hooked, 15 open)
- 1512 epics (mostly molecule wisps from formula execution)
- Only 15 beads are actually open

**Timing breakdown for `/api/beads?rig=all` (no status filter):**

| Stage | Time | What happens |
|-------|------|--------------|
| `gt status --fast` (get rig names) | ~4-5s | StatusService calls CLI to discover rigs |
| `bd list --all --json` (HQ, no `--rig`) | ~20-24s | Queries town-level DB: 2214 beads, ~0.01s/bead |
| `bd list --all --rig gastownui` | ~0.5s | 47 beads, fast |
| `bd list --all --rig vsbel` | ~1s | 114 beads, fast |
| **Total (parallel rig queries)** | **~24s** | Dominated by HQ query |

**Why HQ is slow:** The `bd list --all` command from the GT_ROOT directory hits the town-level Dolt database which has accumulated 2214 beads over time. Performance scales linearly at ~0.01s/bead. Even `--rig hq` takes 16s because it resolves to the same large database.

**Why rig-specific queries are fast:** Each rig's `.beads/` database contains only its own beads (47 for gastownui, 114 for vsbel), so queries complete in <1s.

**Comparison with status filter:**

| Endpoint | Time | Why |
|----------|------|-----|
| `/api/beads?rig=all&status=open` | ~4.4s | Only 15 open HQ beads + rig open beads |
| `/api/beads?rig=all` (no filter) | ~21-26s | All 2214 HQ beads fetched |
| `/api/beads?rig=gastownui` | ~0.5s | Small rig DB, no HQ overhead |
| `/api/beads?status=open` (no rig) | ~0.3s | Only open beads from HQ |

### Code Path

1. `GET /api/beads?rig=all` → `server/routes/beads.js:6` → `BeadService.list({ rig: 'all' })`
2. `BeadService.list()` calls `_getRigNames()` → `StatusService.getStatus()` → `gt status --fast` (~4s)
3. `_aggregateRigs(['hq', 'gastownui', 'vsbel'])` runs `bd list` per rig via `Promise.allSettled`
4. HQ query: `BDGateway.list({ all: true })` → `bd list --all --json` from `cwd: GT_ROOT` → **24s bottleneck**

### Proposed Solutions

#### Solution 1: Exclude HQ from `rig=all` aggregation (Quick Win)

The `rig=all` query should only aggregate named rigs (gastownui, vsbel), not the town-level HQ database. HQ beads are coordination/molecule beads that aren't useful in kanban planning views. If users need HQ beads, they can select the "hq" rig specifically.

**Impact:** `/api/beads?rig=all` drops from ~24s to ~5s (dominated by `gt status --fast`).

**Implementation:** In `BeadService.list()`, change the `rig === 'all'` branch:
```js
// Before:
return this._aggregateRigs(status, ['hq', ...rigNames], all);
// After:
return this._aggregateRigs(status, rigNames, all);
```

#### Solution 2: Cache rig names (Quick Win)

`_getRigNames()` calls `gt status --fast` on every `rig=all` request (~4-5s). The StatusService already has a 5s cache, but this is too short. Rig names change very rarely.

**Impact:** Eliminates 4-5s overhead on most `rig=all` calls.

**Implementation:** Cache rig names with a longer TTL (60-300s), or read from a config file instead of calling `gt status`.

#### Solution 3: Default to open beads, not all (Quick Win)

The `BeadService.list()` method passes `--all` to `bd list` when no status filter is provided. This fetches all 2214 beads including 1944 closed ones. Instead, default to fetching only actionable statuses (open, in_progress, blocked, hooked).

**Impact:** HQ query drops from 24s to <1s (only ~270 non-closed beads).

**Implementation:** In `BeadService.list()`:
```js
// Only pass --all when explicitly requested via status='all'
// Default (no status): fetch actionable beads only
const all = status === 'all';
```
Frontend already defaults `workFilter` to `'open'`, so this only affects the "All" filter toggle.

#### Solution 4: Server-side bead list caching (Medium effort)

Cache the aggregated bead list with a 10-30s TTL. Invalidate on WebSocket bead events (bead_created, bead_updated). This amortizes the cost across multiple rapid page loads and tab switches.

**Impact:** Subsequent requests within TTL window are instant.

**Implementation:** Add a cache layer in BeadService similar to StatusService's existing pattern.

#### Solution 5: Pagination with `bd list -n <limit>` (Medium effort)

The `bd list` command supports `-n` (limit, default 50) and could support offset-based pagination. For initial page load, fetch only the first 50-100 beads, then lazy-load more on scroll.

**Impact:** Caps worst-case query time regardless of database size.

**Implementation:** Add `limit` and `offset` query params to `/api/beads`, pass `-n` to `bd list`. Frontend implements infinite scroll or "Load More" button.

#### Solution 6: Progressive loading via WebSocket (Higher effort)

Instead of waiting for all rigs to respond, stream per-rig results to the frontend via WebSocket as they complete. The kanban board renders incrementally.

**Impact:** First results appear in <1s. Full aggregation still takes same time but UX is responsive.

### Recommended Implementation Order

1. **Solution 1 + Solution 3** (immediate, ~30 min): Exclude HQ from `rig=all` and default to actionable statuses. Combined, this drops `/api/beads?rig=all` from ~24s to ~5s.
2. **Solution 2** (immediate, ~15 min): Cache rig names longer. Drops `rig=all` from ~5s to ~1s.
3. **Solution 4** (next sprint): Add server-side caching for repeat loads.
4. **Solution 5** (next sprint): Add pagination for scalability as bead counts grow.
5. **Solution 6** (future): Progressive loading for best UX.

### CSS Architecture

New views should use the existing CSS custom property system in `variables.css`. Kanban columns use CSS grid. Graph view uses an SVG container with absolute positioning.
