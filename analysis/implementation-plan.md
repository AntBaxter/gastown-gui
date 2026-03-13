# Implementation Plan: Beads UI Enhancements

**Date:** 2026-03-13
**Updated:** 2026-03-13 (verified against codebase — corrected Phase 3/4 to reflect existing convoy infrastructure)
**Context:** Phased plan for implementing kanban boards, dependency graphs, bead type creation, convoy management, and integration branch UI in gastownui.

---

## Guiding Principles

1. **Vanilla JS only.** No framework adoption. Patterns from BeadBoard are transferable without React.
2. **CLI as source of truth.** All data flows through `bd`/`gt` CLI wrapping. No direct Dolt access.
3. **Progressive enhancement.** Each phase ships independently and adds value on its own.
4. **Mobile-aware from day one.** Not mobile-first, but every feature must degrade gracefully (see `mobile-friendly-ui.md`).
5. **Existing architecture.** Follow the Gateway -> Service -> Route pattern for new endpoints.

---

## Existing Convoy Infrastructure (as of 2026-03-13)

> **Important:** The codebase already has substantial convoy support. The following
> components exist and are wired together end-to-end:

**Backend (fully functional):**
- `server/gateways/GTGateway.js` — convoy methods: `listConvoys()`, `convoyStatus()`, `createConvoy()` (wraps `gt convoy list/status/create`)
- `server/services/ConvoyService.js` — business logic with caching, list/get/create operations
- `server/routes/convoys.js` — REST endpoints: `GET /api/convoys`, `GET /api/convoy/:id`, `POST /api/convoy`
- `server.js` (line 157) — routes mounted via `registerConvoyRoutes()`
- `test/mock-server.js` — mock convoy endpoints for testing

**Frontend (fully functional):**
- `js/components/convoy-list.js` — full convoy card component with expand/collapse, issue tree, progress bars, actions (sling, escalate, view detail), event dispatching
- `js/api.js` — `getConvoys()`, `getConvoy()`, `createConvoy()` methods
- `js/state.js` — `setConvoys()`, `updateConvoy()` state management
- `js/app.js` — convoy loading, WebSocket event handling (`convoy_created/updated`), filter toggle (active/all), keyboard shortcuts
- `index.html` — convoy nav tab, convoy view section, convoy list container, new convoy modal with form, convoy-related tutorial steps

**There is NO separate `ConvoyGateway`** — convoy is a `gt` command (not `bd`), so methods live in `GTGateway.js` alongside other `gt` wrappers. This is the correct pattern.

**What's NOT yet implemented:**
- Integration branch endpoints (`POST /api/convoy/:id/integration-branch`, status, land)
- Multi-step convoy creation wizard (current modal is simple name/issues/notify form)
- Convoy feeding endpoint (`POST /api/convoy/:id/feed`)
- Integration branch status panel in convoy detail view

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

## Phase 3: Convoy Dashboard — Integration Branch Enhancements

**Effort:** Medium | **Value:** High | **Dependencies:** None (but benefits from Phase 1)

> **Status:** Core convoy dashboard is ALREADY IMPLEMENTED (see "Existing Convoy Infrastructure" above).
> This phase now focuses on adding integration branch visibility and convoy feeding.

### What Already Exists (no work needed)
- ✅ `GET /api/convoys` and `GET /api/convoy/:id` endpoints (in `server/routes/convoys.js`)
- ✅ Convoy gateway methods in `GTGateway.js` (`listConvoys`, `convoyStatus`, `createConvoy`)
- ✅ `ConvoyService` with caching (`server/services/ConvoyService.js`)
- ✅ Frontend convoy list component (`js/components/convoy-list.js`) with expand/collapse, issue tree, progress bars
- ✅ Convoy nav tab, view section, filters in `index.html`
- ✅ Convoy loading, WebSocket events, state management in `app.js`/`state.js`/`api.js`
- ✅ Mock convoy endpoints in `test/mock-server.js`

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

**Effort:** Medium | **Value:** Medium | **Dependencies:** Phase 3

> **Status:** Basic convoy creation (name + issues + notify) is ALREADY IMPLEMENTED
> via the simple modal in `index.html` (`#new-convoy-modal`) and `POST /api/convoy`.
> This phase upgrades the simple modal to a multi-step wizard with integration branch support.

### What Already Exists (no work needed)
- ✅ `POST /api/convoy` endpoint (in `server/routes/convoys.js`)
- ✅ `createConvoy()` in `GTGateway.js`, `ConvoyService.js`, and `js/api.js`
- ✅ Simple creation modal in `index.html` with name, issues textarea, notify dropdown
- ✅ Modal handling in `js/components/modals.js`

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

| Phase | Feature | Effort | Value | Mobile Impact | Status |
|-------|---------|--------|-------|---------------|--------|
| 1 | Kanban board | Medium | High | Horizontal scroll columns | Not started |
| 2 | Bead type selection | Low | High | Already modal-friendly | Not started |
| 3 | Convoy dashboard + integration branches | Low-Medium | High | Card stacking works | **Core done** — integration branch enhancements remaining |
| 4 | Convoy creation wizard | Medium | Medium | Step-per-screen modal | **Basic modal done** — wizard upgrade remaining |
| 5 | Dependency graph | High | High | List fallback required | Not started |
| 6 | Blocked chain triage | Medium | Medium | Modal-based, works well | Not started |

**Recommended order:** Phase 2 (quick win) -> Phase 1 (most visual impact) -> Phase 3 enhancements (integration branch visibility) -> Phase 5 (graph) -> Phase 4 (wizard upgrade) -> Phase 6 (triage).

**Note on Phase 3/4:** The core convoy infrastructure (backend endpoints, frontend component,
state management, WebSocket events, nav tab, creation modal) already exists and is functional.
Remaining work is adding integration branch visibility (Phase 3) and upgrading the simple
creation modal to a multi-step wizard (Phase 4). This significantly reduces the remaining effort.

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| `bd` CLI doesn't have `--json` for all needed commands | Blocks endpoint development | Audit CLI capabilities first; file beads for missing features |
| Dagre library size/compatibility with no-build vanilla JS | Blocks graph view | Test vendored inclusion early; fallback to simple force-directed SVG |
| Convoy CLI commands may be unstable/changing | Breaks convoy endpoints | Pin to known-working command signatures; add integration tests |
| Performance with large bead sets (> 500) | Slow kanban/graph rendering | Paginate kanban; limit graph to 200 nodes with "show more" |
| WebSocket event format changes upstream | Breaks real-time updates | Event parsing is already defensive; add version detection |
| Pre-push hook not configured on existing rigs | Safety Layer 2 inactive | Check via `gt doctor` status; warn in Health Check view |
| Custom branch templates bypass hook detection | Reduced safety for non-default templates | Warn in UI; recommend keeping `integration/` prefix |
| `gt mq integration status --json` output shape changes | Breaks integration branch status panel | Pin expected fields; defensive parsing with fallbacks |
| N+1 CLI calls for dependency graph data | Slow graph loading for large bead sets | Server-side caching with TTL; batch `bd deps` if available |
| Integration branch auto-land enabled without awareness | Work lands unexpectedly | Show prominent auto-land indicator on convoy dashboard |

---

## CLI Command Audit

Commands needed for full implementation (verify availability before building endpoints):

| Command | JSON flag | Needed for | Status |
|---------|-----------|-----------|--------|
| `bd list --json` | Yes | Kanban board, bead type | Likely available |
| `bd create --type <type>` | N/A | Bead type creation | Verify `--type` flag exists |
| `bd deps <id>` | Verify | Dependency graph | Check if returns structured data |
| `bd blocked --json` | Verify | Blocked chain triage | Check availability |
| `gt convoy create` | N/A | Convoy creation | **Already wired** in `GTGateway.createConvoy()` |
| `gt convoy list --json` | Yes | Convoy list | **Already wired** in `GTGateway.listConvoys()` |
| `gt convoy status --json` | Yes | Convoy detail | **Already wired** in `GTGateway.convoyStatus()` |
| `gt mq integration create` | N/A | Integration branch creation | Available per docs — needs gateway method |
| `gt mq integration status --json` | Yes | Integration branch status | Available per docs — needs gateway method |
| `gt mq integration land` | N/A | Land action | Available per docs — needs gateway method |
| `gt mq integration land --dry-run` | Verify | Preview land | Check flag availability |

**Action:** Before starting Phase 5+ implementation, run `bd deps` and `bd blocked` to verify flags and output format. File beads for any missing `--json` support. Convoy commands are already verified and wired.
