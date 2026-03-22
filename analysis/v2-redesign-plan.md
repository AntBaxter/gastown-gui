# Gas Town GUI v2 — Redesign Plan

> Analysis requested via ga-mlk. This document evaluates a ground-up redesign of
> the Gas Town GUI, assessing which current ideas have merit, which are traps,
> and how to sequence the work.

## Executive Summary

The current v1 UI is a tab-per-entity dashboard (11 tabs: Overview, Convoys,
Work, Agents, Rigs, Crews, PRs, Formulas, Issues, Mail, Health). It works as an
admin console but suffers from **conceptual sprawl** — many tabs expose internal
Gas Town plumbing that users rarely need to interact with directly. The v2
proposal focuses the experience around **convoys and work items** as the primary
objects, collapses redundant views, embraces mobile-first design, and introduces
formula-driven automation as a first-class interaction pattern.

---

## 1. What's Working (Keep)

| Aspect | Why it works |
|--------|-------------|
| **Vanilla JS, no framework** | Zero build step, fast iteration, no dependency rot. A rewrite should stay vanilla or adopt a minimal framework (Preact/Lit) — not React/Vue/Angular. |
| **Gateway > Service > Route** | Clean backend separation. CLI-as-source-of-truth is the right call. |
| **CSS custom properties** | The design token system (`variables.css`) is solid. Light/dark theming already works. Extending this to support "persona themes" (see Section 6) is straightforward. |
| **WebSocket real-time feed** | Live activity updates are essential for an orchestration dashboard. |
| **Kanban board view** | The kanban view for beads is the strongest interaction pattern in v1 — it maps directly to how people think about work status. |

---

## 2. What's Redundant or Underperforming (Cut or Merge)

### 2.1 Tab consolidation

The 11-tab model fragments attention. Most users care about: *What work exists?
What's its status? What needs my attention?* The internal topology (rigs, agents,
services, crews) is plumbing.

**Proposed v2 navigation (4 primary views):**

| View | Contains | Replaces |
|------|----------|----------|
| **Command Center** | Convoy overview, active work kanban, key metrics, alerts, activity feed | Overview + Convoys + Work |
| **Workbench** | Bead detail, dependency graph, epic trees, PR/issue links, formula triggers | Work (detail) + PRs + Issues + Formulas (run) |
| **Mail** | Inter-agent messaging (keep as-is, it's distinct enough) | Mail |
| **System** | Rigs, agents, crews, services, health — collapsed into an admin panel | Rigs + Agents + Crews + Health |

**Rationale:** PRs and Issues are *artifacts of work*, not independent entities.
They belong in the bead detail view (a PR is linked to a bead; an issue may
generate a bead). Formulas are *actions on work*, not a browsing category — they
should appear as contextual triggers, not a separate tab.

### 2.2 Agent Grid

The agent grid is visually appealing but operationally shallow. You can see
status and restart agents, but you rarely *need* to stare at it. In v2, agent
status should be **ambient** — visible in a status bar or system tray, not a
full-screen view. The agent detail (transcript, output, hook) is useful and
should remain accessible via drill-down from the System panel.

### 2.3 Rig List

Rig management (dock, undock, configure) is an infrequent admin task. It
doesn't warrant a top-level tab. Move to System panel.

---

## 3. The Convoy-Centric Model

### 3.1 Why convoys are the right anchor

Convoys are the highest-level user-facing concept: a named group of related work
with a shared goal, integration branch, and set of assigned polecats. They map
to how humans think about projects — "the auth rewrite", "the mobile push",
"Q2 cleanup". Everything else (beads, agents, PRs, formulas) exists in service
of a convoy.

### 3.2 Command Center layout (mobile-first)

```
+------------------------------------------+
| [Logo] [Search]            [Status] [Me] |  <- Compact header
+------------------------------------------+
| Active Convoys (cards, swipeable on mob)  |
| +--------+ +--------+ +--------+         |
| | Auth   | | Mobile | | Debt   |         |
| | 12/20  | | 3/8    | | 7/7    |         |
| | [====] | | [==  ] | | [done] |         |
| +--------+ +--------+ +--------+         |
+------------------------------------------+
| Attention Required                        |  <- Blocked beads, failed MRs,
| - ga-x42 blocked by ga-x41 (auth)       |    stale work, unread mail
| - MR #37 failed: lint (convoy: Mobile)   |
+------------------------------------------+
| Recent Activity (collapsed on mobile)     |
+------------------------------------------+
```

On mobile, the convoy cards become a **vertically scrollable list** with
progress bars. "Attention Required" becomes the primary view — the thing you
see first when you open the app on your phone is *what needs action*.

### 3.3 Workbench: drill into a convoy or bead

Tapping a convoy opens the **Workbench** filtered to that convoy's beads:

- Kanban board (default) or list view toggle
- Dependency graph (already built in v1)
- Epic tree view for hierarchical work
- Linked PRs and issues inline on bead cards
- Formula trigger buttons (contextual, see Section 5)

Tapping a bead opens a **detail panel** (slide-in on mobile, side panel on
desktop) with full bead info, linked PRs/issues, dependency chain, history,
and available formula actions.

---

## 4. Mobile-First Design

### 4.1 Why mobile matters for Gas Town

Gas Town is an always-on orchestration system. The human operator (the
"Overseer") may need to check status, unblock work, or triage from a phone.
The current UI is desktop-only in practice despite some responsive CSS.

### 4.2 Design principles

1. **Touch targets >= 44px** — already in v1 CSS, enforce everywhere.
2. **Single-column default** — desktop *adds* columns, not mobile *removes* them.
3. **Bottom navigation on mobile** — thumb-reachable primary actions.
4. **Pull-to-refresh** — natural mobile pattern for status polling.
5. **Swipe gestures** — swipe bead cards to change status, swipe between convoys.
6. **Offline indicator** — WebSocket disconnect should be obvious (banner, not just a dot).

### 4.3 Responsive strategy

| Width | Layout |
|-------|--------|
| < 480px | Single column, bottom nav, full-screen modals, stacked cards |
| 480–768px | Single column, bottom nav, side-by-side cards |
| 768–1024px | Two columns (kanban + detail panel), top nav |
| > 1024px | Three columns (nav + kanban + detail/feed), top nav |

### 4.4 Technology consideration

The current vanilla JS + innerHTML approach creates a **full DOM replacement
on every state change**, which is inefficient on mobile and causes scroll
position loss, focus loss, and animation jank. For v2, consider:

- **Lit** (lightweight web components, ~5KB) — incremental DOM updates, no
  build step required, native web components.
- **Preact** (~3KB) — React-compatible virtual DOM, very small, needs a build
  step but could use htm for no-build JSX alternative.
- **Stay vanilla but add targeted DOM diffing** — use `morphdom` (~4KB) to
  diff innerHTML updates. Least disruption to existing code.

**Recommendation:** `morphdom` for v2.0 (minimal change, big perf win), evaluate
Lit for v2.1+ if component complexity grows.

---

## 5. Formula-Driven Automation

### 5.1 The vision: formulas as contextual actions

Currently, formulas live in their own tab — a flat list of 43 templates you
browse and run manually. In v2, formulas should be **contextual triggers
attached to entities and events**.

### 5.2 Formula attachment points

| Attachment | Trigger | Example |
|-----------|---------|---------|
| **Convoy creation** | When a new convoy is created | Auto-generate beads from epic description |
| **Epic creation** | When a new epic bead is created | Expand vague requirements into child tasks |
| **Bead status change** | When a bead moves to a status | Run validation on `in_progress`, notify on `blocked` |
| **Manual (button)** | User clicks "Run formula" on a bead/convoy | One-off formula execution |
| **Scheduled** | Cron-like triggers | Daily health check, weekly stale-bead sweep |

### 5.3 The "one formula = auto-run, many = choose" pattern

This is a good idea. Implementation:

```
Entity has formula hooks → check attached formulas for event type
  → 0 formulas: no action
  → 1 formula: auto-run with confirmation toast ("Running 'expand-epic'... [Undo]")
  → N formulas: show picker modal ("Which formula? [expand-epic] [generate-tests] [skip]")
```

**Pitfall:** Auto-run with undo is safer than silent auto-run. Formulas can
create beads, dispatch polecats, and trigger real work. An accidental auto-run
with no visibility would be chaotic.

### 5.4 Voice-to-epic via WhisperFlow

The idea: dictate vague thoughts → transcribe → create an epic bead → attached
formula expands it into structured child beads with dependencies.

**Implementation path:**

1. **Voice input widget** — browser `MediaRecorder` API → send audio to
   WhisperFlow (or browser's built-in `SpeechRecognition` for quick MVP).
2. **Transcription** → text blob becomes the epic's description field.
3. **Formula trigger** — epic creation fires attached formula (e.g.,
   `expand-epic-from-description`), which uses an LLM to parse the
   description into structured child beads with dependency relationships.
4. **Review step** — show the user the generated bead tree before committing.
   This is critical — blind LLM-generated work decomposition will produce
   garbage often enough that human review is essential.

**Pitfalls:**
- Voice transcription quality varies wildly. The UI should show the
  transcript and let the user edit before triggering expansion.
- The formula that expands epics needs to be *really good* or users will
  stop trusting it. Start with a simple template-based approach before going
  full LLM decomposition.
- Browser speech APIs have inconsistent support. Consider a "paste text"
  fallback as the primary path, with voice as progressive enhancement.

**Recommendation:** Build voice-to-epic as a **progressive enhancement**, not
a core flow. The core flow is: create epic with text description → formula
expands it. Voice is just one input method for the description.

---

## 6. Themeable Naming ("Persona Themes")

### 6.1 The idea

Rename Gas Town's internal concepts (rigs, polecats, convoys, mayor, witness,
refinery) to match a user-selected theme — fairytale, sci-fi, corporate, etc.

Example mappings:

| Concept | Gas Town (default) | Fairytale | Sci-Fi | Corporate |
|---------|-------------------|-----------|--------|-----------|
| Rig | Rig | Kingdom | Station | Department |
| Polecat | Polecat | Knight | Drone | Associate |
| Convoy | Convoy | Quest | Mission | Initiative |
| Mayor | Mayor | King/Queen | Admiral | Director |
| Witness | Witness | Oracle | Sensor | Auditor |
| Refinery | Refinery | Forge | Fabricator | QA |
| Bead | Bead | Deed | Objective | Ticket |

### 6.2 Analysis: mostly bad, but salvageable

**Why it's appealing:**
- Gas Town's naming is idiosyncratic. "Polecat" means nothing to a new user.
  A sci-fi theme at least gives *some* mental model ("drone does tasks").
- Theming is fun and increases engagement for teams that enjoy it.
- It could reduce the learning curve if the metaphor is well-chosen.

**Why it's dangerous:**
- **Documentation divergence.** Every doc, tutorial, error message, CLI output,
  and log message uses Gas Town naming. A theme layer creates a translation
  barrier: "My Knight is stuck" → which polecat? Debugging becomes harder.
- **Cognitive overhead.** Users now have to learn *two* naming systems — the
  theme for the UI and the real names for CLI/logs/docs.
- **Maintenance burden.** Every new concept needs N theme variants. Every UI
  string needs to go through a lookup table. Internationalization is hard
  enough without adding fantasy-language localization.
- **Team confusion.** If Alice uses Fairytale and Bob uses Sci-Fi, they can't
  communicate about the system without a Rosetta Stone.

**Salvageable approach — Persona as onboarding, not runtime:**
Instead of runtime theming, use persona metaphors in the **onboarding/tutorial**
to explain concepts:

> "Think of a Polecat as a knight on a quest — it gets assigned a task (bead),
> works on it autonomously, and reports back when done."

Then use the real names everywhere else. This gets the cognitive benefit
(approachable mental model) without the maintenance and communication costs.

**Alternative — cosmetic theming only:**
Let users change colors, icons, and the system greeting ("Welcome to the
Forge" vs "Welcome to Gas Town") without renaming concepts. This satisfies
the personalization urge without creating a translation layer.

**Recommendation:** Do NOT implement runtime concept renaming. DO invest in
better onboarding that uses relatable metaphors. Optionally allow cosmetic
theming (color schemes, icons, greeting text).

---

## 7. What We Should NOT Do

### 7.1 Don't adopt a heavy framework

React, Vue, Angular, Svelte — all would require a build step, a bundler, a
package ecosystem, and framework-specific knowledge. The current vanilla
approach is a strength: any developer (or AI agent) can read and modify the
code without framework expertise. If we need better DOM performance, use
`morphdom`. If we need components, use web components (Lit) or just keep
vanilla JS with better update patterns.

### 7.2 Don't build a general-purpose project management tool

Gas Town is an **agent orchestration system**, not Jira. The UI should expose
Gas Town's unique capabilities (formula-driven automation, autonomous agents,
real-time orchestration) rather than replicating generic PM features (Gantt
charts, resource allocation, time tracking). Every feature should pass the
test: "Does this help someone operate Gas Town, or is this generic PM?"

### 7.3 Don't make the CLI secondary

The CLI is the source of truth and the primary interface for agents. The GUI
is a *window* into the CLI's world, not a replacement. Don't add GUI-only
features that bypass the CLI — this creates state divergence and breaks agent
workflows.

### 7.4 Don't over-automate formula triggers

Auto-running formulas on entity creation is powerful but risky. A misconfigured
auto-trigger could spawn dozens of polecats or create hundreds of beads from
a single action. Always:
- Require explicit opt-in for auto-triggers (not default-on)
- Show a confirmation/undo toast for auto-triggered formulas
- Rate-limit: max 1 auto-trigger per entity per event type per minute
- Log all auto-triggers prominently in the activity feed

### 7.5 Don't ship voice as a core dependency

WhisperFlow/SpeechRecognition is a progressive enhancement. The core flow
(create epic → formula expands it) must work perfectly with typed text input.
Voice is a convenience layer on top. Don't block the redesign on voice
integration.

### 7.6 Don't rename concepts at runtime

See Section 6.2. The maintenance and communication costs far outweigh the
engagement benefits.

---

## 8. Areas for Improvement

### 8.1 Search and navigation

The current UI has no global search. In v2, a **command palette** (Cmd+K /
Ctrl+K) should be the fastest way to find anything:

- Search beads by ID, title, or description
- Search convoys by name
- Jump to agent detail
- Run formulas by name
- Filter by status, type, rig

This pattern (VS Code, Linear, Notion) is well-understood and works on both
desktop and mobile (as a search bar).

### 8.2 Notifications and attention management

The current activity feed is a firehose. v2 needs **tiered notifications**:

| Tier | What | How |
|------|------|-----|
| **Critical** | MR failures, agent deaths, blocked convoys | Push notification (if permitted) + persistent banner |
| **Action needed** | Beads assigned to you, review requests | Badge on nav item + inbox-style list |
| **Informational** | Status changes, completions, mail | Activity feed (current behavior) |

### 8.3 Bead relationships

Dependencies are partially visualized (graph view exists). v2 should make
relationships **first-class** in the bead detail:

- "Blocked by" / "Blocks" with direct links
- "Part of convoy" with convoy status
- "Linked PR" with CI status inline
- "Created from formula" with formula name and run history

### 8.4 Batch operations

Currently, actions are one-bead-at-a-time. The kanban selection mechanism
exists (v1 has a floating action bar for multi-select). v2 should expand this:

- Multi-select beads → bulk status change, bulk assign, bulk add to convoy
- Convoy-level actions: "close all completed beads", "re-dispatch all blocked"

### 8.5 Dashboard customization

Different users care about different metrics. A simple widget-based dashboard
where users can add/remove/reorder cards (convoy summary, agent status, recent
activity, blocked beads, PR status) would serve diverse needs without requiring
everyone to use the same fixed layout.

---

## 9. Implementation Plan

### Phase 0: Foundation (1-2 weeks equivalent of polecat work)
- [ ] Define v2 information architecture (4-view model from Section 2.1)
- [ ] Create wireframes for Command Center, Workbench, System panel
- [ ] Integrate `morphdom` for efficient DOM updates
- [ ] Implement command palette (Cmd+K) with fuzzy search
- [ ] Refactor `state.js` to support convoy-centric data flow

### Phase 1: Command Center (2-3 weeks)
- [ ] Convoy card grid with progress indicators
- [ ] "Attention Required" aggregation (blocked beads, failed MRs, stale work)
- [ ] Responsive layout: mobile-first single column → desktop multi-column
- [ ] Bottom navigation for mobile
- [ ] Pull-to-refresh for mobile

### Phase 2: Workbench (2-3 weeks)
- [ ] Convoy-scoped kanban with bead detail side panel
- [ ] Inline PR/issue links on bead cards
- [ ] Dependency graph (already built, needs integration into new layout)
- [ ] Epic tree view (already built, needs integration)
- [ ] Formula trigger buttons on beads and convoys

### Phase 3: Formula Automation (1-2 weeks)
- [ ] Formula attachment UI (attach formula to convoy/epic/bead event)
- [ ] Auto-trigger logic with confirmation toast
- [ ] "One = auto-run, many = choose" picker modal
- [ ] Formula run history on entity detail views

### Phase 4: System Panel (1 week)
- [ ] Collapse Rigs, Agents, Crews, Health into tabbed admin panel
- [ ] Agent status ambient indicator (header/status bar)
- [ ] Service controls (start/stop/restart) in admin panel

### Phase 5: Polish and Progressive Enhancement (1-2 weeks)
- [ ] Command palette refinement
- [ ] Notification tiers (critical/action/info)
- [ ] Dashboard widget customization
- [ ] Voice input (WhisperFlow) as progressive enhancement on epic creation
- [ ] Cosmetic theme support (color schemes, not concept renaming)
- [ ] Onboarding refresh with metaphor-based concept explanations

### Phase 6: Migration (ongoing)
- [ ] Feature-flag v2 views alongside v1
- [ ] Gradual cutover: replace one tab at a time
- [ ] Remove v1 code once v2 is stable

---

## 10. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Scope creep from "redesign everything" mentality | High | High | Strict phase gates. Each phase ships independently. |
| Mobile-first breaks desktop experience | Medium | Medium | Test both form factors in every phase. Desktop is still primary. |
| Formula auto-triggers cause runaway automation | Medium | High | Rate limits, confirmation toasts, explicit opt-in, kill switch. |
| Voice integration delays entire project | Low | Medium | Voice is Phase 5 (progressive enhancement), not blocking. |
| Vanilla JS hits complexity ceiling | Medium | Medium | morphdom buys time. Evaluate Lit/Preact at Phase 2 checkpoint. |
| Users resist navigation changes | Medium | Medium | Feature-flag v2, keep v1 accessible during migration. |

---

## 11. Summary of Recommendations

1. **Consolidate 11 tabs into 4 views** — Command Center, Workbench, Mail, System.
2. **Anchor the UX on convoys** — they're the natural top-level object.
3. **Mobile-first layout** — bottom nav, single column default, progressive enhancement to desktop.
4. **Add morphdom** for efficient DOM updates without a framework rewrite.
5. **Formula triggers as contextual actions** — not a separate browsing tab.
6. **Voice-to-epic as progressive enhancement** — text input is the core path.
7. **Do NOT rename concepts at runtime** — use metaphors in onboarding instead.
8. **Command palette (Cmd+K)** — the fastest navigation pattern.
9. **Tiered notifications** — not everything is equally important.
10. **Ship incrementally** — feature-flag v2 views, migrate one at a time.
