# Convoy and Integration Branch UI Analysis

**Date:** 2026-03-13 (updated 2026-03-13)
**Context:** Researching how to expose convoy creation and integration branch workflows in the gastownui, based on [Gas Town integration branch docs](https://github.com/steveyegge/gastown/blob/main/docs/concepts/integration-branches.md) and BeadBoard's convoy stepper pattern.

---

## How Integration Branches Work

Integration branches solve the problem of landing epic-scoped work **atomically** rather than piecemeal. Instead of merging each child task's MR directly to `main`, all MRs merge into a shared integration branch, which lands back to main as a single merge commit when all work is complete.

### The Problem They Solve

Without integration branches, epic work lands piecemeal:

```
Child A ──► MR ──► main     (lands Tuesday)
Child B ──► MR ──► main     (lands Wednesday, breaks A's work)
Child C ──► MR ──► main     (lands Thursday, depends on A+B together)
```

With integration branches, all work batches on a shared branch and lands atomically:

```
Child A MR ──┐
Child B MR ──┼──► integration/epic-name ──► main (single merge commit)
Child C MR ──┘
```

**Key advantages:** safe cross-child dependencies, single rollback point (one merge commit), CI runs once on combined work instead of per-MR.

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

### Auto-Detection Algorithm

Integration branches work **without manual targeting**. When `gt done` or `gt mq submit` runs:

| Step | Action | Result |
|------|--------|--------|
| 1 | Check `integration_branch_refinery_enabled` config | If false, skip detection |
| 2 | Get current issue ID from branch name | e.g., `gt-auth-tokens` |
| 3 | Walk parent chain (max 10 levels) | Find ancestor epics |
| 4 | For each epic: read `integration_branch:` from metadata | Get stored branch name |
| 5 | Fallback: generate name from template | e.g., `integration/{title}` |
| 6 | Check if branch exists (local, then remote) | Verify it's real |
| 7 | If found, target MR at that branch | Instead of main |

**UI implication:** The UI should never expose a "target branch" field. Auto-detection handles this. Show the detected target as read-only info.

### Branch Naming

Template variables available:

| Variable | Description | Example |
|----------|-------------|---------|
| `{title}` | Sanitized epic title (lowercase, hyphenated, max 60 chars) | `add-user-authentication` |
| `{epic}` | Full epic ID | `RA-123` |
| `{prefix}` | Epic prefix before first hyphen | `RA` |
| `{user}` | From `git config user.name` | `klauern` |

**Precedence:** `--branch` flag (highest) > `integration_branch_template` in config > default `"integration/{title}"` (lowest).

If two epics produce the same branch name, a numeric suffix from the epic ID is appended automatically.

### CLI Commands

| Command | Purpose | JSON output |
|---------|---------|-------------|
| `gt mq integration create <epic-id>` | Create integration branch | No |
| `gt mq integration status <epic-id>` | Branch status, MR progress, ready-to-land | Yes (`--json`) |
| `gt mq integration land <epic-id>` | Merge integration branch to base | No |

**`status` output includes:** branch name, creation date, commits ahead of main, merged/pending MRs, child issue progress, ready-to-land flag, auto-land config.

**Ready-to-land criteria** (all must be true):
1. Integration branch has commits ahead of main
2. Epic has children
3. All children are closed
4. No pending MRs (all submitted work is merged)

**`land` process:** acquires file lock → creates temp worktree → merges `--no-ff` → runs tests → pushes → deletes branch → closes epic. **Idempotent:** if land crashes after push but before cleanup, rerunning is safe.

### Safety Guardrails (Three Layers)

| Layer | Type | What It Does | Limitation |
|-------|------|-------------|------------|
| 1. Formula/Role instructions | Soft | Forbid raw git pushes of integration branches | AI agents can ignore instructions |
| 2. Pre-push hook | Hard | Blocks pushes to default branch containing integration branch content (ancestry-based detection) | Only matches `integration/*` prefix; env var is policy-based |
| 3. Authorized code path | Hard | `gt mq integration land` sets `GT_INTEGRATION_LAND=1` to bypass hook | Requires hook to be active (`core.hooksPath` configured) |

**UI implication:** Never expose "force push" or manual branch operations. The three-layer safety model means the UI should only offer the `land` action through the proper CLI command.

### Configuration

All settings in `<rig>/settings/config.json` under `merge_queue`:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `integration_branch_polecat_enabled` | `*bool` | `true` | Polecats auto-source worktrees from integration branches |
| `integration_branch_refinery_enabled` | `*bool` | `true` | `gt done` auto-detects integration branches as MR targets |
| `integration_branch_template` | `string` | `"integration/{title}"` | Branch name template |
| `integration_branch_auto_land` | `*bool` | `false` | Refinery patrol auto-lands when all children closed |

**`*bool` semantics:** `null`/omitted = use default. Must set explicitly to `false` to disable.

**`default_branch`** (rig-level, not under `merge_queue`): Controls where work merges when no integration branch is active. Also the default base branch for new integration branches. Supports `develop`, `master`, etc.

### Auto-Landing

When enabled (`integration_branch_auto_land: true`), the Refinery patrol automatically lands ready integration branches during each cycle:
1. Lists all open epics
2. Checks each epic's integration branch status
3. If `ready_to_land: true`: runs `gt mq integration land`
4. If not ready: skips

**UI implication:** Show auto-land status on the integration branch panel. If enabled, show "Will auto-land when ready". If disabled, show manual "Land" button.

### Build Pipeline

Integration branches inherit the rig's 5-command build pipeline (auto-injected into formulas):

1. **setup** — Install dependencies (e.g., `pnpm install`)
2. **typecheck** — Static type checking (e.g., `tsc --noEmit`)
3. **lint** — Code style and quality
4. **test** — Run test suite
5. **build** — Compile/bundle

Empty commands are skipped silently. Polecats on integration branches inherit this automatically — no per-branch config needed.

**UI implication:** The integration branch status panel should show which gates are configured and their last results.

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

### 1. Creating Integration Branch After Slinging Children (CRITICAL)

**Problem:** If children are slung before the integration branch exists, their MRs target `main` instead of the integration branch. This defeats the entire purpose. The upstream docs explicitly call this out as an anti-pattern.

**UI mitigation:** The convoy creation wizard should create the integration branch FIRST, then allow slinging. Warn if user tries to sling without an integration branch. Consider disabling the "Sling" action on epic children until an integration branch exists.

### 2. Manual Branch Targeting

**Problem:** Users manually targeting the integration branch in `gt done` or MR creation. The auto-detection algorithm (walks parent chain up to 10 levels, checks epic metadata, falls back to template) handles this. Manual targeting causes conflicts and bypasses the detection safeguards.

**UI mitigation:** Don't expose "target branch" in the sling or work completion UI. Let auto-detection handle it. Show the detected target branch as read-only info. If the user thinks auto-detection is wrong, direct them to verify: (a) the integration branch exists, (b) `integration_branch_refinery_enabled` is not false, (c) the issue is a child/descendant of the epic.

### 3. Force-Landing Partial Epics

**Problem:** Using `--force` to land an integration branch when not all children are closed. This merges incomplete work to main. The upstream docs say: "This defeats the purpose. If you need to land early, close or remove the incomplete children first."

**UI mitigation:** The "Land" button should be disabled (grayed out with tooltip) when there are open/in-progress children. Require explicit override with confirmation dialog. Show the 4 ready-to-land criteria: (1) commits ahead of main, (2) epic has children, (3) all children closed, (4) no pending MRs.

### 4. Convoy Stall Without Visibility

**Problem:** A convoy stalls because a bead is blocked but nobody notices. The Deacon's auto-feed only dispatches ready work -- it doesn't resolve blockers.

**UI mitigation:** Prominently show blocked beads in the convoy dashboard. Add a "blocked triage" action that shows the blocker chain and offers resolution options (close blocker, remove dependency, reassign). Add a "stranded" indicator — this means there's ready (unblocked) work but no workers assigned.

### 5. Integration Branch Divergence

**Problem:** The integration branch falls behind `main` as other work lands. Polecats spawning from it may work against stale code.

**UI mitigation:** Show "commits behind main" indicator on the integration branch status panel. The `gt mq integration status --json` command provides this data. Note that the Refinery handles rebase automatically — the UI should show divergence as informational, not alarming.

### 6. Orphaned Integration Branches

**Problem:** A convoy is abandoned or all its work is deferred, but the integration branch lingers. The `land` command includes branch cleanup (deletes local + remote), but only runs when landing succeeds.

**UI mitigation:** Show integration branch age and last activity. Warn if branch has no MR activity in > 7 days. Provide a "cleanup" action to delete the branch. Note: the UI should NOT directly run `git branch -D` — it should wrap a CLI command for safety.

### 7. Hook Configuration Missing

**Problem:** The pre-push hook (Layer 2 safety) requires `core.hooksPath` to be configured. Existing rigs may not have this set, meaning the hard enforcement layer is missing. `gt doctor --fix` configures this.

**UI mitigation:** The Health Check view (already exists via `doctor.js`) should flag missing hook configuration. When showing integration branch features, check and warn if hooks aren't configured.

### 8. Custom Branch Templates Bypass Hook

**Problem:** The pre-push hook only catches branches under the `integration/` prefix (the default template). Custom templates like `"{user}/{epic}"` produce branches that the hook can't detect. In that case, only Layer 1 (formula instructions) protects against accidental pushes.

**UI mitigation:** When configuring custom templates in any future settings UI, show a warning that custom templates reduce safety enforcement. Recommend keeping the `integration/` prefix.

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
| `/api/convoy/:id/integration-branch/status` | GET | `gt mq integration status --json` | Branch status, MR progress, ready-to-land |
| `/api/convoy/:id/integration-branch/land` | POST | `gt mq integration land` | Land integration branch |
| `/api/convoy/:id/integration-branch/land` | POST (dry-run) | `gt mq integration land --dry-run` | Preview land without changes |
| `/api/beads/dependencies` | GET | `bd deps` (bulk) | Dependency graph data |
| `/api/beads/blocked` | GET | `bd blocked --json` | Blocked chains for triage |

**Note on `integration status` response shape:** The CLI returns branch name, creation date, commits ahead, merged/pending MR counts, child progress (closed/total), ready-to-land boolean, and auto-land config. The UI endpoint should pass this through as-is.

---

## Mobile Considerations

- Convoy dashboard: cards stack vertically, progress bars work well on mobile
- Convoy creation wizard: step-by-step modal works on mobile (one step per screen)
- Integration branch status: collapsible panel, text-based info (no complex visuals)
- Dependency graph within convoy: falls back to indented list view on mobile (same approach as the main dependency graph -- see `beads-ui-integration.md`)
- Action buttons: ensure 44px minimum touch targets
- Consider bottom sheet pattern for convoy detail on mobile
