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

### CSS Architecture

New views should use the existing CSS custom property system in `variables.css`. Kanban columns use CSS grid. Graph view uses an SVG container with absolute positioning.
