# Implementation Plan: Beads UI Enhancements

**Date:** 2026-03-13
**Context:** Phased plan for implementing kanban boards, dependency graphs, bead type creation, convoy management, and integration branch UI in gastownui.

---

## Guiding Principles

1. **Vanilla JS only.** No framework adoption. Patterns from BeadBoard are transferable without React.
2. **CLI as source of truth.** All data flows through `bd`/`gt` CLI wrapping. No direct Dolt access.
3. **Progressive enhancement.** Each phase ships independently and adds value on its own.
4. **Mobile-aware from day one.** Not mobile-first, but every feature must degrade gracefully (see `mobile-friendly-ui.md`).
5. **Existing architecture.** Follow the Gateway -> Service -> Route pattern for new endpoints.

---

## Phase 1: Kanban Board View

**Effort:** Medium | **Value:** High | **Dependencies:** None

### Tasks

1. **New component: `js/components/kanban-board.js`**
   - CSS grid with columns: Open, In Progress, Blocked, Closed/Deferred
   - Reuse card HTML from `work-list.js` (extract shared `renderBeadCard()`)
   - Column headers show count
   - Cards sorted by priority within columns

2. **View toggle in work section**
   - Add list/board toggle buttons to work section header in `index.html`
   - Toggle switches between `renderWorkList()` and `renderKanbanBoard()`
   - Persist preference to localStorage

3. **Backend: grouped bead endpoint (optional optimization)**
   - `GET /api/beads/board` returns beads grouped by status
   - Falls back to client-side grouping of existing `/api/beads` data if not worth the endpoint

4. **CSS: kanban layout**
   - Add to `components.css`
   - Responsive: columns scroll horizontally on < 768px
   - Cards within columns scroll vertically

5. **Real-time updates**
   - Subscribe to existing bead WebSocket events
   - Move cards between columns on status change

### Files Modified
- `index.html` (view toggle buttons)
- `js/components/work-list.js` (extract shared card renderer)
- `js/components/kanban-board.js` (new)
- `js/app.js` (view toggle logic, kanban rendering)
- `css/components.css` (kanban styles)

---

## Phase 2: Bead Type Selection

**Effort:** Low | **Value:** High | **Dependencies:** None

### Tasks

1. **Add type dropdown to creation modal**
   - Add `<select>` for type in `new-bead-modal` section of `index.html`
   - Options: task (default), bug, epic, feature, research
   - Wire through `handleNewBeadSubmit()` in `modals.js`

2. **Pass type through API chain**
   - `api.createBead()` accepts `type` parameter
   - `BeadService.create()` passes type to gateway
   - `BDGateway.create()` adds `--type <type>` to `bd create` call

3. **Type badges on cards**
   - Already partially implemented (cards show type)
   - Ensure consistent styling with color-coded type badges

4. **Update mock server**
   - `test/mock-server.js` must handle type parameter in `POST /api/beads`

### Files Modified
- `index.html` (type dropdown in modal)
- `js/components/modals.js` (form handling)
- `js/api.js` (pass type param)
- `server/services/BeadService.js` (pass type)
- `server/gateways/BDGateway.js` (add --type flag)
- `test/mock-server.js` (update mock)

---

## Phase 3: Convoy Dashboard

**Effort:** Medium | **Value:** High | **Dependencies:** None (but benefits from Phase 1)

### Tasks

1. **New endpoints**
   - `GET /api/convoys` -- list convoys
   - `GET /api/convoy/:id` -- convoy detail with progress
   - Add `ConvoyGateway` wrapping `gt convoy` commands
   - Add `ConvoyService` for business logic
   - Add `server/routes/convoy.js`

2. **New component: `js/components/convoy-dashboard.js`**
   - Convoy cards with: name, progress bar, issue breakdown, integration branch status
   - "Stranded" indicator for convoys with ready but unassigned work
   - Click to expand detail view

3. **Navigation**
   - Add "Convoys" tab to main navigation
   - Wire into app routing in `app.js`

4. **Real-time updates**
   - Subscribe to `convoy_created/updated` events (already handled in `app.js`)
   - Auto-refresh convoy cards on status changes

### Files Modified
- `server/gateways/ConvoyGateway.js` (new)
- `server/services/ConvoyService.js` (new)
- `server/routes/convoy.js` (new)
- `server.js` (mount new route)
- `index.html` (convoy section, nav tab)
- `js/components/convoy-dashboard.js` (new)
- `js/app.js` (convoy tab, data loading)
- `js/api.js` (convoy API methods)
- `js/state.js` (convoy state management -- partially exists)
- `test/mock-server.js` (convoy endpoints)

---

## Phase 4: Convoy Creation Wizard

**Effort:** Medium | **Value:** Medium | **Dependencies:** Phase 3

### Tasks

1. **Multi-step modal**
   - Step 1: Name + epic selection
   - Step 2: Issue selection (checkboxes, dependency indicators)
   - Step 3: Integration branch toggle + config
   - Step 4: Review + create

2. **New endpoints**
   - `POST /api/convoy` -- create convoy
   - `POST /api/convoy/:id/integration-branch` -- create integration branch

3. **Wizard state management**
   - Local state within modal (not global state)
   - Step validation before advancing
   - Back/forward navigation

### Files Modified
- `index.html` (wizard modal HTML)
- `js/components/modals.js` (wizard logic)
- `js/api.js` (create convoy, create integration branch methods)
- `server/services/ConvoyService.js` (create methods)
- `server/gateways/ConvoyGateway.js` (create commands)
- `server/routes/convoy.js` (POST endpoints)

---

## Phase 5: Dependency Graph View

**Effort:** High | **Value:** High | **Dependencies:** None (but integrates with Phase 3)

### Tasks

1. **Add Dagre dependency**
   - Include Dagre via CDN or vendor into `js/vendor/`
   - No build step -- script tag inclusion

2. **New endpoint: dependency data**
   - `GET /api/beads/dependencies` -- returns all bead dependency edges
   - Server calls `bd deps` for each bead (or `bd list --json` with deps included)
   - Cache on server with TTL to avoid N+1 CLI calls

3. **New component: `js/components/dependency-graph.js`**
   - SVG-based rendering
   - Dagre computes layout (node positions, edge paths)
   - Node cards: title, status badge, assignee, priority
   - Edge colors: gray (dependency), red (blocked), green (resolved)
   - Pan via mouse drag on SVG background
   - Zoom via scroll wheel (adjust viewBox)
   - Click node to open bead detail

4. **View integration**
   - Add "Graph" view toggle alongside list/board
   - Or: dedicated "Dependencies" tab in main nav
   - Convoy detail view embeds a scoped graph (only convoy's beads)

5. **Mobile fallback**
   - On < 768px, show indented dependency list instead of graph
   - Tree view with expandable nodes

### Files Modified
- `js/vendor/dagre.min.js` (new, vendored)
- `js/components/dependency-graph.js` (new)
- `js/app.js` (graph view integration)
- `index.html` (graph container, view toggle)
- `css/components.css` (graph styles)
- `server/routes/beads.js` (dependency endpoint)
- `server/services/BeadService.js` (dependency logic)
- `server/gateways/BDGateway.js` (dependency commands)

---

## Phase 6: Blocked Chain Triage

**Effort:** Medium | **Value:** Medium | **Dependencies:** Phase 5 (graph) or Phase 1 (kanban)

### Tasks

1. **Blocked chain data**
   - `GET /api/beads/blocked` -- returns blocked beads with their blocker chains
   - Wraps `bd blocked --json`

2. **Blocked triage modal**
   - List of all blocked beads
   - For each: show full blocker chain (A blocked by B blocked by C)
   - Actions: close blocker, remove dependency, reassign
   - Filters: by rig, by depth

3. **Visual indicators**
   - Kanban: blocked column cards show chain depth badge
   - Graph: blocked paths highlighted in red

### Files Modified
- `js/components/modals.js` (triage modal)
- `index.html` (modal HTML)
- `server/routes/beads.js` (blocked endpoint)
- `server/gateways/BDGateway.js` (`bd blocked` wrapper)

---

## Phase Summary

| Phase | Feature | Effort | Value | Mobile Impact |
|-------|---------|--------|-------|---------------|
| 1 | Kanban board | Medium | High | Horizontal scroll columns |
| 2 | Bead type selection | Low | High | Already modal-friendly |
| 3 | Convoy dashboard | Medium | High | Card stacking works |
| 4 | Convoy creation wizard | Medium | Medium | Step-per-screen modal |
| 5 | Dependency graph | High | High | List fallback required |
| 6 | Blocked chain triage | Medium | Medium | Modal-based, works well |

**Recommended order:** Phase 2 (quick win) -> Phase 1 (most visual impact) -> Phase 3 (convoy visibility) -> Phase 5 (graph) -> Phase 4 (convoy creation) -> Phase 6 (triage).

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| `bd` CLI doesn't have `--json` for all needed commands | Blocks endpoint development | Audit CLI capabilities first; file beads for missing features |
| Dagre library size/compatibility with no-build vanilla JS | Blocks graph view | Test vendored inclusion early; fallback to simple force-directed SVG |
| Convoy CLI commands may be unstable/changing | Breaks convoy endpoints | Pin to known-working command signatures; add integration tests |
| Performance with large bead sets (> 500) | Slow kanban/graph rendering | Paginate kanban; limit graph to 200 nodes with "show more" |
| WebSocket event format changes upstream | Breaks real-time updates | Event parsing is already defensive; add version detection |
