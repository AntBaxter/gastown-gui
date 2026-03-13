# Beads UI Integration Analysis

**Date:** 2026-03-13
**Context:** Investigating how to enhance the gastownui beads interface with kanban boards, dependency graphs, bead type creation, and patterns from [BeadBoard](https://github.com/zenchantlive/beadboard).

---

## Current State

### What We Have

The gastownui frontend displays beads as a **flat card list** with status filters (All Work, Open Tasks, Completed Work) and rig filters. Each card shows status icon, title, ID, type, rig badge, assignee, and priority (P0-P4). Actions available: done, park, release, reassign.

**Bead creation** is a simple modal with: title, description, rig selection, priority dropdown, labels, and a "sling now" checkbox.

**Backend** is well-structured: `BDGateway` wraps the `bd` CLI, `BeadService` handles business logic, `beads.js` routes expose REST endpoints. Real-time updates flow via WebSocket from `gt feed`.

### What's Missing

- No kanban/board view (only linear list)
- No dependency graph visualization
- No bead type selection during creation (type is implicit)
- No hierarchy/parent-child visualization
- No convoy management UI
- No integration branch UI
- No blocked-chain visibility

---

## BeadBoard Reference Analysis

[BeadBoard](https://github.com/zenchantlive/beadboard) is a Next.js/React/TypeScript dashboard built on the same `bd` CLI. Key features relevant to us:

### Directly Relevant Patterns

| Feature | BeadBoard Approach | Our Adaptation |
|---------|-------------------|----------------|
| **Kanban board** | React components with columns per status | Vanilla JS, CSS grid columns per status |
| **DAG graph** | XYFlow + Dagre for automatic layout | Lightweight vanilla JS graph library or SVG-based |
| **Agent session cards** | Social view with liveness indicators | Extend existing agent-grid component |
| **Blocked triage** | Dedicated modal surfacing blocker context | Add to existing modal system |
| **Activity timeline** | Chronological event stream with filters | Already have activity-feed.js (enhance filters) |
| **Conversation threading** | Thread builder merging events + mail | New component, data from existing endpoints |
| **Swarm coordination** | Archetype/template pickers, convoy stepper | New convoy management panel |

### Key Architectural Difference

BeadBoard is a full Next.js app that directly accesses Dolt and the filesystem. We are a vanilla JS SPA talking to Express endpoints wrapping CLI commands. This means:

- **We can't adopt their React components directly** -- must reimplement in vanilla JS
- **Our data access is more constrained** -- everything goes through `bd` CLI, which is actually more secure (SafeSegment validation)
- **Their SSE approach vs our WebSocket** -- both work; our WebSocket is already implemented and bidirectional
- **Their Tailwind + Radix UI** -- we use plain CSS with custom properties; visual patterns are transferable

---

## Recommended Features (Priority Order)

### Phase 1: Kanban Board View (High Value, Medium Effort)

**What:** Column-based board with beads grouped by status (Open, In Progress, Blocked, Closed/Deferred).

**Why:** Most impactful single improvement. Transforms the flat list into a spatial overview that immediately shows work distribution and bottlenecks.

**Approach:**
- Add a view toggle (list/board) to the work section header
- CSS grid with columns per status
- Reuse existing bead card HTML from `work-list.js`
- Optional: drag-and-drop between columns (updates bead status via existing API)
- Filter by rig, priority, assignee (reuse existing filter UI)

**Data requirements:** Already have `GET /api/beads?status=<status>` -- just need to fetch all statuses and group client-side, or add a `GET /api/beads/board` endpoint that returns grouped data.

**Mobile consideration:** Columns stack vertically or become horizontally scrollable. Cards already have good mobile sizing from the list view.

### Phase 2: Bead Type Selection (High Value, Low Effort)

**What:** Add a "type" dropdown to the bead creation modal supporting: task, bug, epic, research, spike.

**Why:** Currently all beads are created as implicit type. Users need to categorize work at creation time.

**Approach:**
- Add `<select>` to `new-bead-modal` in `index.html`
- Pass type to `api.createBead()` and through to `BDGateway.create()`
- Add `--type` flag to the `bd create` call
- Update card rendering to show type badge (already partially done -- cards show type)

**Note:** The frontend already filters out internal types (message, convoy, agent, gate, role, event, slot). User-facing types should be: task, bug, epic, feature, research.

### Phase 3: Dependency Graph View (High Value, High Effort)

**What:** Interactive DAG visualization showing bead dependencies, blocked chains, and hierarchy.

**Why:** Understanding "what blocks what" is critical for multi-agent coordination. Currently invisible in the UI.

**Approach options:**

1. **Lightweight SVG-based (recommended for vanilla JS):**
   - Use [Dagre](https://github.com/dagrejs/dagre) for layout computation (no framework dependency)
   - Render nodes and edges as SVG elements
   - Pan/zoom via SVG viewBox manipulation
   - Node cards show: title, status, assignee, priority
   - Edge colors indicate: dependency (gray), blocked (red), resolved (green)
   - Click node to open bead detail modal

2. **Canvas-based (higher performance, more work):**
   - Better for very large graphs (100+ nodes)
   - More complex hit detection and interaction
   - Not recommended unless we know graphs will be large

3. **Adopt XYFlow (BeadBoard's approach):**
   - Requires React -- incompatible with our vanilla JS architecture
   - Would need a React micro-frontend or full framework migration
   - Not recommended for this phase

**Data requirements:** Need a new endpoint `GET /api/beads/dependencies` or `GET /api/bead/:id/links` that returns dependency edges. The `bd` CLI supports `bd deps <id>` and `bd blocked` -- expose these through new gateway methods.

**Mobile consideration:** Graph views are inherently desktop-oriented. On mobile, fall back to a dependency list view (indented tree) rather than trying to render a graph.

### Phase 4: Blocked Chain Visualization (Medium Value, Medium Effort)

**What:** Highlight blocked chains in both kanban and graph views. Show "why is this blocked?" with the full chain back to the root blocker.

**Approach:**
- Add `bd blocked` output to a new endpoint
- In kanban: blocked column cards show blocker chain on hover/click
- In graph: blocked paths highlighted in red with animation
- Add a "blocked triage" modal (inspired by BeadBoard) that lists all blocked beads with their blocker context and one-click unblock actions

### Phase 5: Enhanced Activity Feed (Low Value, Low Effort)

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

### CSS Architecture

New views should use the existing CSS custom property system in `variables.css`. Kanban columns use CSS grid. Graph view uses an SVG container with absolute positioning.
