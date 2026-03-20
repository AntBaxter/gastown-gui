# Implementation Plan: Beads UI Enhancements

**Date:** 2026-03-13
**Updated:** 2026-03-20 (status audit + beads_viewer analysis integrated)
**Context:** Phased plan for implementing kanban boards, dependency graphs, bead type creation, convoy management, graph insights, and integration branch UI in gastownui.

---

## Guiding Principles

1. **Vanilla JS only.** No framework adoption. Patterns from BeadBoard and beads_viewer are transferable without React or Go TUI.
2. **CLI as source of truth.** All data flows through `bd`/`gt` CLI wrapping. No direct Dolt access.
3. **Progressive enhancement.** Each phase ships independently and adds value on its own.
4. **Mobile-aware from day one.** Not mobile-first, but every feature must degrade gracefully (see `mobile-friendly-ui.md`).
5. **Existing architecture.** Follow the Gateway -> Service -> Route pattern for new endpoints.

---

## Existing Convoy Infrastructure (as of 2026-03-13)

> **Important:** The codebase already has substantial convoy support. The following
> components exist and are wired together end-to-end:

**Backend (fully functional):**
- `server/gateways/GTGateway.js` -- convoy methods: `listConvoys()`, `convoyStatus()`, `createConvoy()` (wraps `gt convoy list/status/create`)
- `server/services/ConvoyService.js` -- business logic with caching, list/get/create operations
- `server/routes/convoys.js` -- REST endpoints: `GET /api/convoys`, `GET /api/convoy/:id`, `POST /api/convoy`
- `server.js` (line 157) -- routes mounted via `registerConvoyRoutes()`
- `test/mock-server.js` -- mock convoy endpoints for testing

**Frontend (fully functional):**
- `js/components/convoy-list.js` -- full convoy card component with expand/collapse, issue tree, progress bars, actions (sling, escalate, view detail), event dispatching
- `js/api.js` -- `getConvoys()`, `getConvoy()`, `createConvoy()` methods
- `js/state.js` -- `setConvoys()`, `updateConvoy()` state management
- `js/app.js` -- convoy loading, WebSocket event handling (`convoy_created/updated`), filter toggle (active/all), keyboard shortcuts
- `index.html` -- convoy nav tab, convoy view section, convoy list container, new convoy modal with form, convoy-related tutorial steps

**There is NO separate `ConvoyGateway`** -- convoy is a `gt` command (not `bd`), so methods live in `GTGateway.js` alongside other `gt` wrappers. This is the correct pattern.

**What's NOT yet implemented:**
- Integration branch endpoints (`POST /api/convoy/:id/integration-branch`, status, land)
- Multi-step convoy creation wizard (current modal is simple name/issues/notify form)
- Convoy feeding endpoint (`POST /api/convoy/:id/feed`)
- Integration branch status panel in convoy detail view

---

## Phase 1: Kanban Board View -- COMPLETE

**Effort:** Medium | **Value:** High | **Dependencies:** None | **Status: DONE**

Implemented in full:
- CSS grid with 5 columns: Open, In Progress, Blocked, Closed, Deferred
- Epic filter dropdown for scoped views
- Cards grouped by status, sorted by priority within columns
- Ready/Blocked/Gate badges on cards
- Blocked-by chains displayed on hover
- Full event wiring for card clicks and action buttons
- View toggle (list/board) with kanban as default
- Real-time updates via WebSocket events

**Not yet implemented:** Drag-and-drop card movement between columns (deferred as planned).

---

## Phase 2: Bead Type Selection -- COMPLETE

**Effort:** Low | **Value:** High | **Dependencies:** None | **Status: DONE**

Implemented in full:
- Type dropdown in creation modal (task, bug, epic, feature, research)
- Type passed through full API chain (api.js -> BeadService -> BDGateway -> `bd create --type`)
- Color-coded type badges on cards
- Mock server updated

---

## Phase 3: Convoy Dashboard -- Integration Branch Enhancements

**Effort:** Low-Medium | **Value:** High | **Dependencies:** None | **Status: Core DONE, enhancements remaining**

> Core convoy dashboard is fully implemented (see "Existing Convoy Infrastructure" above).

### Remaining Tasks

1. **Integration branch status endpoints (new)**
   - `GET /api/convoy/:id/integration-branch/status` -- wraps `gt mq integration status --json`
   - Add `integrationBranchStatus(epicId)` method to `GTGateway.js`
   - Add integration branch methods to `ConvoyService.js`
   - Add routes to `server/routes/convoys.js`

2. **Integration branch status panel in convoy detail**
   - Extend `convoy-list.js` `renderConvoyDetail()` to show integration branch info
   - Branch name, commits ahead/behind, MR count, ready-to-land indicator
   - Auto-land status display

3. **Convoy feeding endpoint (new)**
   - `POST /api/convoy/:id/feed` -- wraps `gt sling` for ready convoy issues
   - Add to `server/routes/convoys.js`

4. **"Stranded" indicator**
   - Add visual indicator in convoy cards when ready work has no assigned workers

### Files Modified
- `server/gateways/GTGateway.js` (add integration branch methods)
- `server/services/ConvoyService.js` (add integration branch + feed methods)
- `server/routes/convoys.js` (add integration branch + feed routes)
- `js/components/convoy-list.js` (integration branch panel in detail view)
- `js/api.js` (integration branch + feed API methods)
- `test/mock-server.js` (new endpoints)

---

## Phase 4: Convoy Creation Wizard

**Effort:** Medium | **Value:** Medium | **Dependencies:** Phase 3 | **Status: Basic modal DONE, wizard upgrade remaining**

> Basic convoy creation (name + issues + notify) is already implemented.

### Remaining Tasks

1. **Upgrade to multi-step wizard**
   - Step 1: Name + epic selection
   - Step 2: Issue selection (checkboxes, dependency indicators)
   - Step 3: Integration branch toggle + config
   - Step 4: Review + create

2. **New endpoint for integration branch creation**
   - `POST /api/convoy/:id/integration-branch` -- wraps `gt mq integration create`
   - Add `createIntegrationBranch(epicId)` to `GTGateway.js`
   - Add route to `server/routes/convoys.js`

3. **Wizard state management**
   - Local state within modal (not global state)
   - Step validation before advancing
   - Back/forward navigation

### Files Modified
- `index.html` (upgrade existing `#new-convoy-modal` to wizard steps)
- `js/components/modals.js` (wizard logic)
- `js/api.js` (add `createIntegrationBranch()` method)
- `server/gateways/GTGateway.js` (add `createIntegrationBranch()`)
- `server/services/ConvoyService.js` (add integration branch creation)
- `server/routes/convoys.js` (add `POST /api/convoy/:id/integration-branch`)
- `test/mock-server.js` (new endpoint)

---

## Phase 5: Dependency Graph View -- PARTIALLY COMPLETE

**Effort:** High | **Value:** High | **Dependencies:** None | **Status: Core rendering DONE, mobile fallback and polish remaining**

### What's Done
- Dagre library vendored in `js/vendor/`
- SVG-based rendering with node cards (title, status, assignee, priority)
- Edge coloring by dependency state (gray/red/green)
- Pan/zoom support
- Click-to-detail on nodes
- Dependency data endpoints: `GET /api/beads/dependencies`, `POST /api/bead/:id/dep`, `POST /api/bead/:id/dep/remove`
- Dependency tree endpoint: `GET /api/bead/:id/dep/tree`

### Remaining Tasks

1. **Mobile fallback (< 768px)**
   - Indented tree view as alternative to SVG graph
   - Expandable nodes showing dependency chain

2. **Cycle detection and display**
   - Detect circular dependencies in the graph
   - Visual warning when cycles are found
   - Inspired by beads_viewer's cycle detection feature

3. **Graph polish**
   - Convoy-scoped graph (show only beads within a convoy)
   - Node count / edge count summary
   - Performance optimization for graphs > 200 nodes

### Files Modified
- `js/components/dependency-graph.js` (mobile fallback, cycle detection)
- `css/components.css` (tree view styles)

---

## Phase 6: Blocked Chain Triage

**Effort:** Medium | **Value:** Medium | **Dependencies:** Phase 5 (graph) or Phase 1 (kanban) | **Status: Data layer DONE, triage UI remaining**

### What's Done
- `GET /api/beads/blocked` endpoint exists
- Blocked-by chains displayed on kanban cards (hover)
- BDGateway has `blocked()` method

### Remaining Tasks

1. **Blocked triage modal**
   - List of all blocked beads
   - For each: show full blocker chain (A blocked by B blocked by C)
   - Actions: close blocker, remove dependency, reassign
   - Filters: by rig, by depth

2. **Enhanced visual indicators**
   - Kanban: blocked column cards show chain depth badge
   - Graph: blocked paths highlighted with animation

### Files Modified
- `js/components/modals.js` (triage modal)
- `index.html` (modal HTML)

---

## Phase 7: Graph Insights Dashboard (NEW -- inspired by beads_viewer)

**Effort:** Medium | **Value:** High | **Dependencies:** Phase 5 (dependency graph data)

> Inspired by [beads_viewer](https://github.com/Dicklesworthstone/beads_viewer)'s graph-theoretic
> analysis engine. beads_viewer computes 9 metrics (PageRank, betweenness centrality, HITS,
> critical path, eigenvector centrality, degree, density, cycle detection, topological sort)
> to surface bottlenecks and project health insights.

### Why

Traditional issue trackers treat tasks as independent items. Graph analysis reveals what
truly matters -- not by opinion, but by structure. This is especially valuable for Gas Town's
multi-agent coordination where understanding blocking cascades and critical paths determines
system throughput.

### Tasks

1. **Critical path computation and display**
   - Compute the longest dependency chain (zero-slack path)
   - Highlight critical path in the dependency graph view
   - Show critical path as a sidebar list (ordered sequence of beads)
   - "Critical path length: N" indicator in project health summary

2. **Bottleneck detection**
   - Compute in-degree for each bead (how many things it blocks)
   - Surface "top blockers" -- beads that block the most downstream work
   - Display as a ranked list in an insights panel
   - Badge on kanban cards showing "blocks N items"

3. **Project health metrics panel**
   - Total beads by status (bar chart or counters)
   - Dependency density (edges / nodes ratio) -- high density = tightly coupled
   - Stale item detection: beads in `open` or `in_progress` with no updates > N days
   - Ready queue depth: count of unblocked, unassigned beads

4. **Insights view integration**
   - New "Insights" tab or section in the UI
   - Summary cards for key metrics
   - Drill-down to specific beads from each metric

### What NOT to Adopt from beads_viewer

| Feature | Why Skip |
|---------|----------|
| **PageRank / eigenvector centrality** | Full graph-theoretic metrics are overkill for a web UI; critical path + degree analysis covers 80% of the value |
| **HITS algorithm** | Hub/authority distinction is less relevant when we already have explicit epic/task type hierarchy |
| **Topological sort display** | Useful for agents (beads_viewer's robot mode), not as useful for human UI |
| **Robot mode (--robot-*)** | We already have REST API endpoints serving structured JSON; agents use our API directly |
| **History/time-travel** | `git log` + bead timestamps are sufficient; building a time-travel UI is high effort, low value |
| **TUI framework (Bubble Tea)** | We're a web UI, not a terminal app |

### Files Modified
- `js/components/insights-panel.js` (new)
- `js/app.js` (insights tab wiring)
- `index.html` (insights section)
- `css/components.css` (insights styles)
- `server/services/BeadService.js` (metrics computation -- critical path, staleness)
- `server/routes/beads.js` (metrics endpoint)

---

## Phase 8: Export and Sharing (NEW -- inspired by beads_viewer)

**Effort:** Low | **Value:** Medium | **Dependencies:** Phase 5 (dependency graph)

### Tasks

1. **Mermaid diagram export**
   - Export dependency graph as Mermaid markdown
   - Copy-to-clipboard button on dependency graph view
   - Useful for pasting into docs, PRs, or chat

2. **Markdown summary export**
   - Export current view (kanban, epic, insights) as formatted Markdown
   - Include status counts, blocked items, critical path

### Files Modified
- `js/components/dependency-graph.js` (Mermaid export button)
- `js/shared/export.js` (new -- shared export utilities)

---

## Phase Summary

| Phase | Feature | Effort | Value | Status |
|-------|---------|--------|-------|--------|
| 1 | Kanban board | Medium | High | **COMPLETE** |
| 2 | Bead type selection | Low | High | **COMPLETE** |
| 3 | Convoy dashboard + integration branches | Low-Medium | High | **Core done** -- integration branch enhancements remaining |
| 4 | Convoy creation wizard | Medium | Medium | **Basic modal done** -- wizard upgrade remaining |
| 5 | Dependency graph | High | High | **Core done** -- mobile fallback, cycle detection remaining |
| 6 | Blocked chain triage | Medium | Medium | **Data layer done** -- triage modal remaining |
| 7 | Graph insights dashboard | Medium | High | **Not started** (NEW) |
| 8 | Export and sharing | Low | Medium | **Not started** (NEW) |

**Recommended next priorities:**
1. Phase 5 completion (mobile fallback + cycle detection) -- finishes an existing feature
2. Phase 7 (insights dashboard) -- high value, leverages existing dependency data
3. Phase 6 (blocked triage modal) -- builds on existing blocked data
4. Phase 3 enhancements (integration branch visibility)
5. Phase 8 (export) -- quick win once graph is solid
6. Phase 4 (wizard upgrade) -- lower priority polish

---

## External References

### beads_viewer (bv)

[beads_viewer](https://github.com/Dicklesworthstone/beads_viewer) is a Go TUI for the beads
issue tracker that treats projects as dependency graphs. Key features analyzed for adoption:

**Adopted concepts:**
- Critical path computation and display (Phase 7)
- Bottleneck detection via degree analysis (Phase 7)
- Cycle detection in dependency graphs (Phase 5)
- Stale item detection (Phase 7)
- Mermaid diagram export (Phase 8)

**Not adopted (with rationale):**
- Full graph-theoretic metrics (PageRank, eigenvector, HITS, betweenness) -- overkill for web UI
- Robot mode -- our REST API already serves this purpose
- TUI framework -- we're a web app
- Time-travel / history view -- git log is sufficient
- Agent integration blurb injection -- Gas Town has its own agent context system

### BeadBoard

[BeadBoard](https://github.com/zenchantlive/beadboard) is a Next.js/React dashboard for beads.
See `beads-ui-integration.md` for the full analysis. Key patterns adopted: kanban layout,
DAG graph approach, blocked triage modal concept.

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| `bd` CLI doesn't have `--json` for all needed commands | Blocks endpoint development | Audit CLI capabilities first; file beads for missing features |
| Dagre library size/compatibility with no-build vanilla JS | Blocks graph view | Already vendored and working |
| Convoy CLI commands may be unstable/changing | Breaks convoy endpoints | Pin to known-working command signatures; add integration tests |
| Performance with large bead sets (> 500) | Slow kanban/graph rendering | Paginate kanban; limit graph to 200 nodes with "show more" |
| WebSocket event format changes upstream | Breaks real-time updates | Event parsing is already defensive; add version detection |
| Critical path computation on large graphs | Slow insights loading | Server-side computation with caching; async loading in UI |
| Stale detection thresholds need tuning | False positives annoy users | Make threshold configurable; start conservative (7 days) |
| N+1 CLI calls for dependency graph data | Slow graph loading for large bead sets | Server-side caching with TTL; batch `bd deps` if available |
| `gt mq integration status --json` output shape changes | Breaks integration branch status panel | Pin expected fields; defensive parsing with fallbacks |

---

## CLI Command Audit

Commands needed for full implementation (verify availability before building endpoints):

| Command | JSON flag | Needed for | Status |
|---------|-----------|-----------|--------|
| `bd list --json` | Yes | Kanban board, bead type | **Working** |
| `bd create --type <type>` | N/A | Bead type creation | **Working** |
| `bd dep list <id>` | Verify | Dependency graph | **Working** |
| `bd dep add <id> <dep>` | N/A | Dependency management | **Working** |
| `bd dep remove <id> <dep>` | N/A | Dependency management | **Working** |
| `bd dep tree <id>` | Verify | Dependency tree view | **Working** |
| `bd blocked --json` | Verify | Blocked chain triage | **Working** |
| `gt convoy create` | N/A | Convoy creation | **Working** (wired in GTGateway) |
| `gt convoy list --json` | Yes | Convoy list | **Working** (wired in GTGateway) |
| `gt convoy status --json` | Yes | Convoy detail | **Working** (wired in GTGateway) |
| `gt mq integration create` | N/A | Integration branch creation | Available -- needs gateway method |
| `gt mq integration status --json` | Yes | Integration branch status | Available -- needs gateway method |
| `gt mq integration land` | N/A | Land action | Available -- needs gateway method |
