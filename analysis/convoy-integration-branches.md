# Convoy and Integration Branch UI Analysis

**Date:** 2026-03-13
**Context:** Researching how to expose convoy creation and integration branch workflows in the gastownui, based on [Gas Town integration branch docs](https://github.com/steveyegge/gastown/blob/main/docs/concepts/integration-branches.md) and BeadBoard's convoy stepper pattern.

---

## How Integration Branches Work

Integration branches solve the problem of landing epic-scoped work **atomically** rather than piecemeal. Instead of merging each child task's MR directly to `main`, all MRs merge into a shared integration branch, which lands back to main as a single merge commit when all work is complete.

### The Flow

1. Create an epic with child tasks and dependencies
2. `gt mq integration create <epic-id>` -- creates a shared Git branch
3. `gt convoy create "<name>" <child-ids...>` -- creates a tracking dashboard
4. Sling first wave of unblocked children
5. Polecats spawn worktrees from the integration branch (sibling work included)
6. Polecats complete work; Refinery merges MRs into integration branch
7. Convoy status updates; next wave of dependencies unblocks
8. Deacon detects stranded convoy, auto-dispatches work (convoy feeding)
9. Repeat until all children closed
10. Integration branch lands to main (manual or auto-land)
11. Deacon dispatches cleanup to archive convoy and notify Mayor

### Key Mechanics

**Three-stage auto-detection:** The system auto-detects integration branches at:
- `gt done` / `gt mq submit` -- targets MR at integration branch instead of main
- Polecat spawn -- worktree sourced from integration branch
- Refinery patrol -- checks if integration branches are ready to land

**Branch naming:** Default template `integration/{title}` (sanitized epic title). Configurable via `integration_branch_template` in rig settings.

**Safety guardrails:**
- Layer 1 (soft): Formula instructions forbid raw git pushes of integration branches
- Layer 2 (hard): Pre-push hook blocks pushes to default branch with integration branch content
- Layer 3 (hard): Only `gt mq integration land` can bypass the hook

**Configuration:** All settings in `<rig>/settings/config.json` under `merge_queue`:
- `integration_branch_polecat_enabled` (default: true)
- `integration_branch_refinery_enabled` (default: true)
- `integration_branch_template` (default: `"integration/{title}"`)
- `integration_branch_auto_land` (default: false)

---

## How Convoys Work

Convoys are the **tracking and orchestration layer** that complements integration branches. They group related issues under a named tracker and drive automated dispatch.

### Convoy Lifecycle

1. **Create:** `gt convoy create "Auth overhaul" gt-auth-tokens gt-auth-sessions gt-auth-middleware`
2. **Track:** `gt convoy status <convoy-id>` shows progress across all tracked issues
3. **Auto-feed:** When a convoy is "stranded" (ready issues, no workers), Deacon dispatches dogs to sling work
4. **Auto-cleanup:** When all issues closed, Deacon dispatches cleanup to archive and notify

### Convoy + Integration Branch Relationship

These are **complementary but independent** systems:
- **Integration branch** = Git branching strategy (where code goes)
- **Convoy** = Work-tracking/orchestration layer (which issues to dispatch, progress monitoring)

The typical workflow uses both together, but they can be used separately.

---

## Current UI State

The gastownui already has **partial convoy support**:

- `state.js` tracks convoys in global state
- `app.js` loads convoys on startup and handles `convoy_created/updated` WebSocket events
- There are convoy-related endpoints (inline in `server.js`)
- The frontend shows convoy status in some views

**Missing:**
- No convoy creation UI
- No integration branch creation/management UI
- No visual progress tracking (per-convoy gantt/progress bar)
- No "create convoy with integration branch" combined workflow
- No convoy feeding/dispatch visibility

---

## Recommended UI Design

### Convoy Creation Wizard

A multi-step modal (inspired by BeadBoard's `convoy-stepper.tsx`):

**Step 1: Name and Scope**
- Convoy name (text input)
- Epic selection (dropdown of existing epics, or create new)
- Target rig (dropdown)

**Step 2: Select Issues**
- List of child beads under the selected epic (checkboxes)
- Or: search/filter to add individual beads
- Show dependency relationships between selected beads
- Visual indicator of which beads are ready vs blocked

**Step 3: Integration Branch (Optional)**
- Toggle: "Create integration branch for this convoy"
- Branch name (auto-generated from convoy name, editable)
- Base branch selection (defaults to main)
- Show config status: is `integration_branch_refinery_enabled` on?

**Step 4: Review and Create**
- Summary of convoy: name, issue count, dependency graph preview
- Integration branch name (if enabled)
- "Create" button

**Backend requirements:**
- `POST /api/convoy` -- create convoy (wraps `gt convoy create`)
- `POST /api/convoy/:id/integration-branch` -- create associated integration branch (wraps `gt mq integration create`)
- `GET /api/convoy/:id/status` -- convoy progress (wraps `gt convoy status`)

### Convoy Dashboard View

A dedicated view (new tab or sub-view under Work) showing:

**Per-convoy card:**
- Name, epic ID, creation date
- Progress bar (closed/total issues)
- Issue breakdown: open, in-progress, blocked, closed
- Integration branch name and status
- "Stranded" indicator (ready work, no workers)
- Actions: view details, feed convoy (manual sling), land integration branch

**Convoy detail view (click to expand):**
- Full issue list with status, assignee, priority
- Mini dependency graph of convoy issues
- Timeline of convoy events (created, issues completed, waves dispatched)
- Integration branch: commit log, MR status, gate results

### Integration Branch Status Panel

Within the convoy detail view, show:
- Branch name and base branch
- MR count (merged / pending / total)
- Latest gate results (build, test, lint, typecheck)
- "Ready to land" indicator (all children closed, all MRs merged)
- Manual "Land" button (calls `gt mq integration land`)
- Auto-land status (enabled/disabled)

---

## Pitfalls to Avoid

### 1. Creating Integration Branch After Slinging Children

**Problem:** If children are slung before the integration branch exists, their MRs target `main` instead of the integration branch. This defeats the entire purpose.

**UI mitigation:** The convoy creation wizard should create the integration branch FIRST, then allow slinging. Warn if user tries to sling without an integration branch.

### 2. Manual Branch Targeting

**Problem:** Users manually targeting the integration branch in `gt done` or MR creation. The system auto-detects integration branches -- manual targeting can cause conflicts.

**UI mitigation:** Don't expose "target branch" in the sling or work completion UI. Let auto-detection handle it. Show the detected target branch as read-only info.

### 3. Force-Landing Partial Epics

**Problem:** Using `--force` to land an integration branch when not all children are closed. This can merge incomplete work to main.

**UI mitigation:** The "Land" button should be disabled (grayed out with tooltip) when there are open/in-progress children. Require explicit override with confirmation dialog.

### 4. Convoy Stall Without Visibility

**Problem:** A convoy stalls because a bead is blocked but nobody notices. The Deacon's auto-feed only dispatches ready work -- it doesn't resolve blockers.

**UI mitigation:** Prominently show blocked beads in the convoy dashboard. Add a "blocked triage" action that shows the blocker chain and offers resolution options (close blocker, remove dependency, reassign).

### 5. Integration Branch Divergence

**Problem:** The integration branch falls behind `main` as other work lands. Polecats spawning from it may work against stale code.

**UI mitigation:** Show "commits behind main" indicator on the integration branch status panel. Add a "rebase" action (or note that Refinery handles this automatically).

### 6. Orphaned Integration Branches

**Problem:** A convoy is abandoned or all its work is deferred, but the integration branch lingers.

**UI mitigation:** Show integration branch age and last activity. Warn if branch has no MR activity in > 7 days. Provide a "cleanup" action to delete the branch.

---

## What We Should Do

1. **Start with convoy visibility** -- a read-only convoy dashboard showing status of existing convoys. This is low-risk and immediately useful.

2. **Add convoy creation wizard** -- the multi-step modal described above. This is the highest-value interactive feature.

3. **Integrate integration branch status** into the convoy dashboard rather than building it as a separate view. They're tightly coupled in practice.

4. **Use the existing WebSocket system** for real-time convoy updates. The server already handles `convoy_created/updated` events.

5. **Expose `gt convoy status` output** through a new API endpoint. This is the data backbone for the dashboard.

6. **Keep the CLI as the source of truth.** Don't try to implement convoy logic in the UI server -- wrap the CLI commands as we do for everything else.

## What We Should NOT Do

1. **Don't build convoy orchestration logic in the UI.** The Deacon handles auto-feeding and cleanup. The UI should observe and trigger, not orchestrate.

2. **Don't expose raw rig config editing.** Integration branch settings (`integration_branch_*`) are rig-level config that should be managed by operators, not through the GUI.

3. **Don't implement branch operations (rebase, merge, delete) in the UI.** These are dangerous and should remain CLI-only or Refinery-managed.

4. **Don't try to visualize real-time git operations.** Showing "polecat X is rebasing onto integration branch Y" is technically complex and low value. Show the outcome (MR merged), not the process.

5. **Don't couple convoy creation to integration branches.** Keep the integration branch step optional in the wizard. Some convoys are just tracking groups without a shared branch.

---

## Required New Endpoints

| Endpoint | Method | Wraps | Purpose |
|----------|--------|-------|---------|
| `/api/convoys` | GET | `gt convoy list --json` | List all convoys |
| `/api/convoy` | POST | `gt convoy create` | Create convoy |
| `/api/convoy/:id` | GET | `gt convoy status --json` | Convoy detail + progress |
| `/api/convoy/:id/feed` | POST | `gt sling` (batch) | Manual convoy feeding |
| `/api/convoy/:id/integration-branch` | POST | `gt mq integration create` | Create integration branch |
| `/api/convoy/:id/land` | POST | `gt mq integration land` | Land integration branch |
| `/api/beads/dependencies` | GET | `bd deps` (bulk) | Dependency graph data |

---

## Mobile Considerations

- Convoy dashboard: cards stack vertically, progress bars work well on mobile
- Convoy creation wizard: step-by-step modal works on mobile (one step per screen)
- Integration branch status: collapsible panel, text-based info (no complex visuals)
- Dependency graph within convoy: falls back to indented list view on mobile (same approach as the main dependency graph -- see `beads-ui-integration.md`)
- Action buttons: ensure 44px minimum touch targets
- Consider bottom sheet pattern for convoy detail on mobile
