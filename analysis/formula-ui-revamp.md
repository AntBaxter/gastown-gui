# Proposal: Formula UI Revamp

## Problem Statement

The current Formulas tab has several usability issues:

1. **All cards show "No template"** — Formulas are TOML-based workflow definitions with steps, vars, and types. The UI looks for a `template` field but formulas use `steps[]`, `vars{}`, and `description`. Only the raw TOML source has a "template" concept for legacy formulas. The `gt formula list --json` response provides `name`, `type`, `description`, `source`, `steps` (count), and `vars` (count) — no `template` field.

2. **Can't scroll to see all formulas** — `.view` has `overflow: hidden` (`css/layout.css:406`) and `.formula-list` has no `overflow-y: auto`, so with 43 formulas the grid overflows and is clipped.

3. **"Transcript" and "auto refresh" are meaningless** — These concepts don't exist in the formula domain. Formulas are static TOML definitions; they have no transcript or auto-refresh semantics.

4. **`mol-` prefixed formulas clutter the view** — 28 of 43 formulas are internal `mol-*` system molecules (patrol loops, sync workflows, session GC, etc.). Users should rarely see or modify these. Allowing deletion of `mol-*` formulas could break the system.

5. **No type differentiation** — Formulas have 4 types (workflow: 37, convoy: 4, expansion: 1, aspect: 1) but the UI shows them all identically with a generic science icon.

6. **Create/Edit forms are wrong** — The "New Formula" modal asks for a name + free-text template. Real formulas are structured TOML with `[[steps]]`, `[vars]`, `type`, and `version`. The edit modal writes malformed TOML (`FormulaService.update()` at line 117-123 writes a `[formula]` table that doesn't match the actual TOML schema).

## How Formulas Actually Work

### Storage
- TOML files in `~/.beads/formulas/<name>.formula.toml`
- Managed by `gt formula` CLI commands
- Installed formulas tracked in `.installed.json`

### Types

| Type | Purpose | Example | Count |
|------|---------|---------|-------|
| **workflow** | Sequential step checklists for agents | `shiny`, `mol-polecat-work` | 37 |
| **convoy** | Parallel multi-agent coordination | `code-review`, `design` | 4 |
| **expansion** | Step-expander (adds sub-steps to existing steps) | `rule-of-five` | 1 |
| **aspect** | Cross-cutting concern (AOP-style advice) | `security-audit` | 1 |

### Structure (workflow example: `shiny`)
```toml
description = "Engineer in a Box..."
formula = "shiny"
type = "workflow"
version = 1

[[steps]]
id = "design"
title = "Design {{feature}}"
description = "Think carefully about architecture..."

[[steps]]
id = "implement"
title = "Implement {{feature}}"
needs = ["design"]

[vars.feature]
description = "The feature being implemented"
required = true
```

### Usage Flow
1. A formula is "run" against a rig: `gt formula run shiny --rig gastownui`
2. This creates a **molecule** (instantiated formula) attached to a bead
3. The molecule's steps become a checklist for the assigned agent
4. Steps have dependencies (`needs`) forming a DAG
5. Agents close steps as they complete them

### Two Categories

**User formulas** — Reusable templates users create/manage:
- `shiny`, `shiny-enterprise`, `shiny-secure`
- `towers-of-hanoi-*` (benchmarks)
- `beads-release`, `gastown-release`
- `code-review`, `design` (convoy)
- `rule-of-five` (expansion)
- `security-audit` (aspect)

**System molecules** (`mol-*`) — Internal machinery:
- `mol-polecat-work`, `mol-polecat-lease`, `mol-polecat-code-review`
- `mol-witness-patrol`, `mol-refinery-patrol`, `mol-deacon-patrol`
- `mol-dog-*` (Dolt maintenance)
- `mol-shutdown-dance`, `mol-town-shutdown`
- `mol-convoy-feed`, `mol-convoy-cleanup`
- `mol-session-gc`, `mol-orphan-scan`

System molecules are the internal "firmware" of Gas Town. They should be viewable for debugging but not editable or deletable by users.

## Proposed Changes

### 1. Fix scrolling (CSS bug)

Add `overflow-y: auto` to `.formula-list` or change `.view` overflow handling for the formulas view. This is a one-line fix.

### 2. Replace card content with real formula data

Each formula card should show:

```
┌─────────────────────────────────────────┐
│ [icon by type]  shiny            workflow│
│ Engineer in a Box - the canonical...    │
│                                         │
│ 5 steps · 2 vars                        │
│                                         │
│ [View Steps]  [Run]             [Delete]│
└─────────────────────────────────────────┘
```

**Fields to display:**
- **Name** (from `name`)
- **Type badge** with appropriate icon (see below)
- **Description** (from `description`, truncated)
- **Step count** (from `steps`)
- **Variable count** (from `vars`)
- **Remove** the "template" preview — it doesn't exist

**Icons by type:**
- workflow: `account_tree` (step DAG)
- convoy: `groups` (parallel agents)
- expansion: `unfold_more` (expands steps)
- aspect: `layers` (cross-cutting)

### 3. Split user vs system formulas

Add a toggle or filter in the view header:

```
Formulas                    [User ▾] [+ New Formula] [↻]
```

**Default view: User formulas only** (hide `mol-*`)

Filter options:
- **User** — Non-`mol-*` formulas (default)
- **System** — Only `mol-*` formulas (read-only view)
- **All** — Everything

When viewing system formulas:
- Remove Edit and Delete buttons
- Add a "System" badge
- Grey out or visually distinguish as non-editable

### 4. Type-based filtering/grouping

Add type filter tabs or group cards by type:

```
[All] [Workflow] [Convoy] [Expansion] [Aspect]
```

Or group with section headers:
```
── Workflows (12) ──────────────────
  [card] [card] [card]

── Convoy (4) ──────────────────────
  [card] [card]
```

### 5. Improve "View" to show real structure

When clicking "View" on a workflow formula, show the step DAG:

```
Formula: shiny (workflow, v1)
Engineer in a Box - the canonical right way.

Steps:
  1. Design {{feature}}
     └─ Think carefully about architecture...
  2. Implement {{feature}}  [needs: design]
     └─ Write the code...
  3. Review implementation  [needs: implement]
     └─ Check for bugs, security, readability...
  4. Test {{feature}}  [needs: review]
     └─ Unit tests, integration tests...
  5. Submit for merge  [needs: test]
     └─ Final check, commit, push...

Variables:
  feature (required) — The feature being implemented
  assignee — Who is assigned to this work
```

For convoy formulas, show the leg descriptions.
For expansion formulas, show the refinement chain.
For aspect formulas, show the pointcuts and advice.

### 6. Fix or remove Create/Edit

**Option A: Remove create/edit** — Formulas are complex TOML structures. A free-text textarea is insufficient. Users should create formulas via CLI (`gt formula create`) or by editing TOML files directly. The UI should be read-only + run.

**Option B: Guided creation** (more work) — A step-by-step wizard:
1. Name + description + type
2. For workflows: add steps with title, description, dependencies
3. For convoys: define legs
4. Preview generated TOML
5. Save

**Recommendation: Option A** for now. Remove create/edit from the UI. Keep "Run" and "View". This eliminates the broken `FormulaService.update()` that writes malformed TOML. Add create/edit back later with a proper structured editor if there's demand.

### 7. Improve "Run" (Use) modal

The current "Use" modal asks for a target and free-text args. Improve it:

- Show the formula's required variables with labeled inputs
- Auto-populate optional variable defaults
- Validate required vars before submission
- Show a confirmation with the formula description

```
Run Formula: shiny

Target Rig: [gastownui ▾]

Variables:
  feature (required): [________________]
  assignee:           [________________]

[Cancel]  [Run Formula]
```

### 8. Add search/filter

With 43 formulas (15 user, 28 system), add a search box:

```
[🔍 Search formulas...]  [User ▾] [Type ▾]
```

Filter by name and description text matching.

## Implementation Priority

| Priority | Change | Effort | Impact |
|----------|--------|--------|--------|
| P0 | Fix scroll overflow | 1 line CSS | Can't use the page without this |
| P1 | Replace template preview with steps/vars counts | Small JS change | Fixes "No template" on all cards |
| P1 | Hide `mol-*` by default | Small JS change | Declutters from 43 → 15 cards |
| P2 | Type-based icons and badges | Small JS+CSS | Visual clarity |
| P2 | Improve View modal with step DAG | Medium JS | Real utility |
| P3 | Remove or redesign Create/Edit | Small (remove) or Large (redesign) | Prevents broken TOML writes |
| P3 | Improve Run modal with var inputs | Medium JS | Better UX |
| P3 | Add search/filter | Small JS+HTML | Nice to have |

## Files to Modify

| File | Changes |
|------|---------|
| `css/layout.css` | Fix `.view` overflow for formula list |
| `js/components/formula-list.js` | Card rendering, filtering, view modal |
| `index.html` | Filter controls in formula view header |
| `css/components.css` | Type badges, system formula styling |
| `server/services/FormulaService.js` | Remove or fix `update()` method |

## Non-Goals

- Formula version control / history
- Visual TOML editor
- Molecule instance management (that's a separate UI concern)
- Formula composition (applying aspects/expansions to workflows)
