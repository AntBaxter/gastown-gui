# UI Plan: Auth Workflow Support (Epics, Integration Branches, Convoys)

**Date:** 2026-03-15
**Bead:** ga-o0q
**Context:** Plan UI support for the Phase 1 Auth epic (vs-8ke) workflow: epic with 7 child tasks, integration branch (integration/initial-auth), convoy (hq-cv-trorl), dependency DAG.

---

## Audit Summary: What Already Exists

The gastownui codebase has **substantial infrastructure** for this workflow. Here's what's working end-to-end and what's missing.

### Already Implemented (no work needed)

| Capability | Backend | Frontend | Notes |
|------------|---------|----------|-------|
| **Convoy list/detail** | `GET /api/convoys`, `GET /api/convoy/:id` | `convoy-list.js` with expand/collapse, issue tree, progress bars | Fully wired |
| **Convoy creation** | `POST /api/convoy` | Simple modal in `index.html` | Name + issues + notify |
| **Convoy status/progress** | `ConvoyService.get()` with caching | Progress bar, stats, stranded indicator | Real-time via WebSocket |
| **Integration branch status** | `GET /api/convoy/:id/integration-branch/status` | Panel in convoy detail showing branch name, commits ahead/behind, MR count, gates, ready-to-land, land/refresh buttons | Full panel in `convoy-list.js` lines 372-479 |
| **Integration branch create** | `POST /api/convoy/:id/integration-branch` | "Create Integration Branch" button in convoy detail | Wired in `convoy-list.js` |
| **Integration branch land** | `POST /api/convoy/:id/integration-branch/land` | "Land" button with confirmation dialog | Enabled only when ready-to-land |
| **Convoy feeding** | `POST /api/convoy/:id/feed` | N/A (backend only) | Slings ready issues in batch |
| **Sling from convoy** | Sling button on convoy card | Opens sling modal pre-scoped | Via `SLING_OPEN` event |
| **Issue tree in convoy** | Issue data from convoy status | Expandable issue list with status icons, assignee | In convoy detail panel |
| **Kanban board** | `GET /api/beads` | `kanban-board.js` — columns by status | View toggle exists |
| **Bead CRUD** | Full REST API | Create/close/defer/reassign modals | Working |
| **WebSocket events** | `convoy_created`, `convoy_updated`, bead events | Real-time state updates | In `app.js` |
| **Gateway methods** | `GTGateway`: `integrationBranchStatus()`, `integrationBranchCreate()`, `integrationBranchLand()` | N/A | CLI wrappers exist |
| **Convoy creation wizard** | `POST /api/convoy` | Multi-step wizard (4 steps) with epic selection, issue picker, integration branch toggle | Recent addition (commit 33fbda2) |

### Gaps: What's Missing for the Auth Workflow

| # | Gap | Impact | Effort |
|---|-----|--------|--------|
| G1 | **Epic detail view with child task tree** | Can't see vs-8ke and its 7 children as a hierarchy | Medium |
| G2 | **Dependency graph visualization** | Can't see .1 → .2 → .3/.4 → .5/.6 → .7 flow | High |
| G3 | **Ready vs blocked task indicators** | Can't see which tasks are unblocked and ready to sling | Low |
| G4 | **Epic-scoped kanban** | Kanban shows all beads globally, no epic scope filter | Low |
| G5 | **Bulk sling from epic/convoy** | Must sling tasks individually; no "sling all ready" | Low-Medium |
| G6 | **Final review gate visibility** | vs-8ke.7 as "done condition" not visually distinct | Low |
| G7 | **Cross-rig bead visibility** | Auth tasks are in vsbel rig; UI may only show local rig beads | Medium |
| G8 | **`bd deps` / `bd blocked` endpoints** | No backend endpoints for dependency data | Medium |

---

## Recommended Plan: 4 Work Packages

### WP1: Epic Detail View with Child Tasks (Medium Effort)

**Goal:** Click an epic bead and see its children as a tree with status, assignee, dependencies, and actions.

**What to build:**
- **New component: `js/components/epic-detail.js`** — Renders epic metadata + child task tree
  - Tree structure showing parent-child hierarchy
  - Each child shows: status icon, title, ID, assignee, priority, dependency arrows
  - "Ready" badge on unblocked tasks (no open dependencies)
  - "Review gate" badge on terminal tasks (vs-8ke.7)
  - Sling button on each ready child task
  - "Sling All Ready" bulk action button

- **New endpoint: `GET /api/bead/:id/children`** — Returns epic children with dependency info
  - Gateway: Add `BDGateway.children(epicId)` wrapping `bd show <id> --json` (children already in show output) or `bd list --parent <id> --json`
  - Service: `BeadService.getChildren(epicId)` with dependency enrichment
  - Route: Add to `server/routes/beads.js`

- **Modal or panel integration:**
  - Extend existing `BEAD_DETAIL` modal to detect epic type and render the tree view
  - Or: Add dedicated "Epic" tab to convoy detail (since convoy tracks the epic's children)

**Files to modify:**
- `js/components/epic-detail.js` (new)
- `server/routes/beads.js` (add children endpoint)
- `server/services/BeadService.js` (add children method)
- `server/gateways/BDGateway.js` (add children/deps method)
- `js/components/modals.js` (extend bead detail for epic type)
- `test/mock-server.js` (new endpoint)

### WP2: Dependency Graph & Blocked Chain (High Effort)

**Goal:** Visualize the dependency DAG for an epic's children, showing the critical path and blocked chains.

**What to build:**
- **New component: `js/components/dependency-graph.js`** — SVG-based DAG visualization
  - Use [Dagre](https://github.com/dagrejs/dagre) for layout (vendor as `js/vendor/dagre.min.js`)
  - Nodes = bead cards (title, status, assignee)
  - Edges = dependency arrows (gray=dep, red=blocked, green=resolved)
  - Pan/zoom via SVG viewBox
  - Click node → bead detail modal
  - Scoped to a single epic or convoy

- **New endpoints:**
  - `GET /api/beads/dependencies?epic=<id>` — Returns dependency edge list for an epic's children
  - `GET /api/beads/blocked` — Returns blocked beads with blocker chains
  - Gateway: `BDGateway.deps(epicId)` wrapping `bd dep list <id> --json` or similar
  - Gateway: `BDGateway.blocked()` wrapping `bd blocked --json`

- **Integration points:**
  - Embed in epic detail view (scoped graph)
  - Embed in convoy detail panel (when convoy has an associated epic)
  - Mobile fallback: indented dependency list (no graph)

- **Auth workflow example rendering:**
  ```
  [vs-8ke.1: Env Vars] ──► [vs-8ke.2: Schema] ──┬──► [vs-8ke.3: Server JWT]
                                                   ├──► [vs-8ke.4: Frontend Auth] ──┬──► [vs-8ke.5: Gate Editor]
                                                   │                                 └──► [vs-8ke.6: WS Auth]
                                                   └──────────────────────────────────────► [vs-8ke.7: Review Gate]
  ```

**Files to modify:**
- `js/vendor/dagre.min.js` (new, vendored)
- `js/components/dependency-graph.js` (new)
- `server/routes/beads.js` (dependencies + blocked endpoints)
- `server/services/BeadService.js` (dependency methods)
- `server/gateways/BDGateway.js` (deps/blocked CLI wrappers)
- `index.html` (script tag for dagre, graph container)
- `css/components.css` (graph node/edge styles)
- `test/mock-server.js` (new endpoints)

**Risk:** `bd dep list` and `bd blocked` JSON output format needs verification before building. File a bead if `--json` flag is missing.

### WP3: Epic-Scoped Kanban & Filters (Low Effort)

**Goal:** Filter the kanban board and work list to show only an epic's children.

**What to build:**
- **Epic scope filter** in kanban board header
  - Dropdown: "All Work" / "Epic: Initial Auth (vs-8ke)" / etc.
  - When epic selected, kanban shows only that epic's children
  - Filter state stored in `js/state.js`

- **Ready indicator on cards**
  - Green "Ready" badge on bead cards that have no open dependencies
  - Red "Blocked by X" badge on blocked cards with blocker ID
  - Requires dependency data from WP2 endpoints (or bead show --json if it includes dep status)

- **Review gate visual distinction**
  - Cards for review/gate type beads get a distinct visual treatment
  - Dashed border, gate icon, "Final gate" label
  - Shown as the last item in the dependency chain

**Files to modify:**
- `js/components/kanban-board.js` (add epic filter, ready/blocked badges)
- `js/components/work-list.js` (add epic filter, ready/blocked badges)
- `js/state.js` (add epicFilter state)
- `js/app.js` (wire epic filter to data loading)
- `css/components.css` (ready/blocked badge styles, gate card styles)

### WP4: Cross-Rig Visibility (Medium Effort)

**Goal:** Show beads from the vsbel rig (where auth tasks live) in the gastownui dashboard.

**What to build:**
- **Rig filter enhancement** in bead list/kanban
  - Currently filters by rig; needs to support viewing beads from any rig
  - Add "All Rigs" option and per-rig checkboxes
  - Auth tasks in vsbel should be visible when that rig is selected

- **Backend: cross-rig bead queries**
  - `GET /api/beads?rig=vsbel` — Pass rig parameter to `bd list --rig vsbel --json`
  - `BDGateway.list()` already accepts `rig` parameter
  - May need to verify `bd list --rig` works across rig boundaries from gastownui context

- **Convoy cross-rig linking**
  - Convoy hq-cv-trorl tracks vs-* beads (vsbel rig)
  - Convoy detail already renders issue tree from convoy data, which includes cross-rig beads
  - Verify the issue items link correctly to bead detail modal across rigs

**Files to modify:**
- `js/app.js` (rig filter logic)
- `js/components/work-list.js` (multi-rig filter)
- `js/components/kanban-board.js` (multi-rig filter)
- `server/routes/beads.js` (ensure rig param passed through)

---

## Priority Ordering

| Priority | Package | Rationale |
|----------|---------|-----------|
| **1** | WP1: Epic Detail View | Foundation for everything else; gives immediate value for viewing vs-8ke hierarchy |
| **2** | WP3: Epic-Scoped Kanban | Low effort, high usability gain; depends on WP1 for epic awareness |
| **3** | WP4: Cross-Rig Visibility | Required for the auth workflow since tasks are in vsbel rig |
| **4** | WP2: Dependency Graph | Highest effort but most visually impactful; can proceed in parallel |

WP1 and WP3 can potentially be combined into a single implementation bead. WP2 is independent and can be worked in parallel by a different polecat. WP4 may already partially work if convoy data includes cross-rig beads.

---

## What Already Works for This Workflow (No Changes Needed)

These capabilities are ready to use today for the auth workflow:

1. **View convoy hq-cv-trorl** — Convoy tab shows the convoy with progress, issue tree, and actions
2. **See integration branch status** — Expanding the convoy shows integration/initial-auth branch with commits ahead, MR count, gates, ready-to-land
3. **Create integration branch** — Button in convoy detail (if not already created)
4. **Land integration branch** — Land button enabled when all children closed + MRs merged
5. **Sling individual tasks** — Sling button on convoy card opens modal
6. **Create convoys** — Multi-step wizard with epic selection and integration branch toggle
7. **Track progress** — Progress bar and breakdown in convoy card
8. **Stranded detection** — Visual indicator when ready work has no workers

---

## CLI Commands to Verify Before Implementation

| Command | Needed For | Verify | Human Verification |
|---------|-----------|--------|-----------|
| `bd show <id> --json` (children field) | WP1: Epic children | Does output include child bead list? | Yes - child beads appear in "dependents": [ with  "dependency_type": "parent-child" |
| `bd list --parent <id> --json` | WP1: Epic children (alt) | Does this flag exist? | Unsure - the flag exists but I'm not sure what it returns gastown@vmi3125390:~/gt/vsbel$ bd list --parent vs-8ke.7 --json  gastown@vmi3125390:~/gt/vsbel$ bd list --parent vs-8ke --json both return empty arrays |
| `bd dep list <id> --json` | WP2: Dependency edges | Does this return structured dependency data? | Yes calling that from a child shows the parent |
| `bd blocked --json` | WP2: Blocked chains | Does this exist and return JSON? | Yes I believe so but it returns an empty array now, nothing is probably blocked though |
| `bd list --rig vsbel --json` | WP4: Cross-rig beads | Can gastownui query vsbel rig beads? | Yes they can |

**Action:** Verify these commands before dispatching implementation beads. File beads in the beads rig for any missing `--json` support.

---

## Architecture Notes

- **No framework migration needed.** All new components follow existing vanilla JS + innerHTML pattern.
- **No new npm dependencies** except vendored Dagre (for WP2 only).
- **All data flows through CLI wrappers** — no direct Dolt access.
- **Existing WebSocket events** cover convoy and bead updates; no new event types needed.
- **Existing convoy creation wizard** (multi-step) was just added in commit 33fbda2 — no need to rebuild it.
- **Integration branch support** is fully wired (GTGateway → ConvoyService → convoy routes → convoy-list.js frontend).
