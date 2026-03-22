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
| **CSS custom properties** | The design token system (`variables.css`) is solid. Light/dark theming already works. |
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

## 6. Agent Interaction and Communication

### 6.1 The problem

The current UI surfaces agent status (grid view, start/stop controls) but
provides no way to *interact* with agents. The human overseer has to drop
to the CLI (`gt mail send`, `gt nudge`, `gt seance`) to communicate. This
is the single biggest gap between "monitoring dashboard" and "control center."

### 6.2 Communication primitives available

Gas Town has three communication mechanisms, each with different trade-offs:

| Mechanism | Latency | Persistence | Cost | Best for |
|-----------|---------|-------------|------|----------|
| **Nudge** (`gt nudge`) | Real-time (3 modes: wait-idle, queue, immediate) | Ephemeral | Zero (no Dolt commit) | Quick messages, status checks, unblocking |
| **Mail** (`gt mail send`) | Async (agent reads at next turn boundary) | Permanent (creates bead + Dolt commit) | 1 Dolt commit per message | Structured handoffs, escalations, work assignments |
| **Seance** (`gt seance --talk`) | Interactive | Session-scoped | Spawns new Claude subprocess | Interrogating past sessions, debugging decisions |

### 6.3 What "talk to the Mayor" could look like

The desire is to have a meaningful conversation with the Mayor (or any agent)
through the UI. Here's the honest assessment of what's feasible:

**Option A: Nudge-based messaging (feasible now)**

The simplest approach: a chat-like panel that sends nudges to agents and
displays their responses from the feed. This is **not** a real conversation —
it's fire-and-forget messaging with visible activity.

```
+------------------------------------------+
| Mayor — Online                     [···] |
+------------------------------------------+
| [You] Check status of auth convoy        |
| [Mayor] ← (activity appears in feed)    |
|                                          |
| [Type a message...]          [Send]      |
+------------------------------------------+
```

**Limitations:** Nudges are one-way. The agent receives the message but its
"response" is just whatever it does next (visible in the activity feed). There's
no request-response pattern — you can't ask a question and get an answer back
in the UI.

**Option B: Mail-based conversation (feasible, but clunky)**

Mail supports replies (`--type reply`), so a threaded conversation is possible.
The UI could show a mail thread view with send/reply. But mail is **async** —
the agent processes mail when it checks its inbox, which may not happen for
minutes. And every message costs a Dolt commit, so chatty conversations would
pollute the database.

**Option C: Seance-style interactive session (future, requires new infrastructure)**

The most compelling but hardest option: spawn a conversational subprocess that
has the agent's full context and can answer questions interactively. This is
what `gt seance --talk` does for predecessor sessions, but extending it to
*live* agents would require:

1. A way to fork an agent's context into a read-only conversational session
2. WebSocket streaming of the conversation (not just events)
3. Clear UX distinction between "talking about the agent's work" vs "giving
   the agent new instructions"

**Recommendation:** Start with **Option A** (nudge panel) in v2.0. It's cheap,
uses existing infrastructure, and covers 80% of the use case (sending
instructions to agents). Add mail threading in v2.1. Explore seance-style
interactive conversations as a v3 feature if demand warrants it.

### 6.4 Agent detail improvements

Beyond messaging, the agent detail view should surface more of what agents are
actually doing:

- **Current hook/assignment** — what bead is this agent working on?
- **Recent activity timeline** — commits, bead updates, mail sent/received
- **Session health** — context usage, time since last activity, heartbeat status
- **Quick actions** — nudge, restart, unsling, reassign work
- **Molecule progress** — if working a formula, show checklist progress

---

## 7. Alternative Agent Harnesses

### 7.1 What Gas Town already supports

Gas Town is **not Claude-only**. The `gt sling` command accepts an `--agent` flag
that selects which agent harness to use, and `gt config agent` manages harness
definitions. As of now, Gas Town ships with these built-in harnesses:

| Harness | Command | Notes |
|---------|---------|-------|
| **claude** | `claude --dangerously-skip-permissions` | Default. Claude Code CLI. |
| **gemini** | `gemini --approval-mode yolo` | Google Gemini CLI agent |
| **codex** | `codex --dangerously-bypass-approvals-and-sandbox` | OpenAI Codex CLI |
| **copilot** | `copilot --yolo` | GitHub Copilot agent |
| **cursor** | `cursor-agent -f` | Cursor's agent mode |
| **amp** | `amp --dangerously-allow-all --no-ide` | Sourcegraph AMP |
| **auggie** | `auggie --allow-indexing` | Auggie agent |
| **omp** | `omp --hook .omp/hooks/gastown-hook.ts` | OMP with GT hooks |
| **opencode** | `opencode` | Open Code agent |
| **pi** | `pi -e .pi/extensions/gastown-hooks.js` | Pi with GT extensions |

**Custom agents** can be added with `gt config agent set <name> <command>`.

**Per-sling override:** `gt sling ga-abc myrig --agent gemini` dispatches that
specific piece of work to the Gemini harness instead of the default.

**Default agent:** `gt config default-agent` controls which harness is used
when no `--agent` flag is specified (currently: `claude`).

### 7.2 What the UI should expose

The GUI currently has no visibility into harness configuration. In v2, the
System panel should include:

1. **Harness registry view** — list all available agents (built-in + custom),
   show which is default, allow changing the default
2. **Per-sling harness selection** — when dispatching work from the GUI (via
   the "Run formula" or "Assign work" flows), let the user pick which harness
   to use
3. **Custom harness management** — add/edit/remove custom agent definitions
   (wraps `gt config agent set/remove`)
4. **Agent badges** — show which harness each running agent is using (e.g.,
   a small icon or label on the agent card: "claude", "gemini", etc.)

### 7.3 Custom prompts and configuration

Gas Town manages agent context through several mechanisms:

- **CLAUDE.md / AGENTS.md** — project-level instructions injected into every
  agent session. These work for Claude Code; other harnesses have their own
  equivalents (e.g., `.cursorrules` for Cursor).
- **Formula variables** — `gt sling --var key=value` passes structured data
  to formulas, which template it into agent instructions.
- **Sling messages** — `gt sling --message "context"` and `--args "instructions"`
  provide per-assignment context.
- **Mail** — structured messages delivered to agent sessions.

For non-Claude harnesses, Gas Town integrates via hooks (see `omp` and `pi`
harness definitions). Each harness needs its own hook implementation to
participate in the Gas Town protocol (heartbeats, nudge delivery, etc.).

**UI opportunity:** A "Harness Configuration" section that shows the current
project instructions (CLAUDE.md contents, formula variables) and allows editing
them through the GUI. This makes it easier for non-technical users to customize
agent behavior without touching files directly.

---

## 8. What We Should NOT Do

### 8.1 Don't adopt a heavy framework

React, Vue, Angular, Svelte — all would require a build step, a bundler, a
package ecosystem, and framework-specific knowledge. The current vanilla
approach is a strength: any developer (or AI agent) can read and modify the
code without framework expertise. If we need better DOM performance, use
`morphdom`. If we need components, use web components (Lit) or just keep
vanilla JS with better update patterns.

### 8.2 Don't build a general-purpose project management tool

Gas Town is an **agent orchestration system**, not Jira. The UI should expose
Gas Town's unique capabilities (formula-driven automation, autonomous agents,
real-time orchestration) rather than replicating generic PM features (Gantt
charts, resource allocation, time tracking). Every feature should pass the
test: "Does this help someone operate Gas Town, or is this generic PM?"

### 8.3 Don't make the CLI secondary

The CLI is the source of truth and the primary interface for agents. The GUI
is a *window* into the CLI's world, not a replacement. Don't add GUI-only
features that bypass the CLI — this creates state divergence and breaks agent
workflows.

### 8.4 Don't over-automate formula triggers

Auto-running formulas on entity creation is powerful but risky. A misconfigured
auto-trigger could spawn dozens of polecats or create hundreds of beads from
a single action. Always:
- Require explicit opt-in for auto-triggers (not default-on)
- Show a confirmation/undo toast for auto-triggered formulas
- Rate-limit: max 1 auto-trigger per entity per event type per minute
- Log all auto-triggers prominently in the activity feed

### 8.5 Don't ship voice as a core dependency

WhisperFlow/SpeechRecognition is a progressive enhancement. The core flow
(create epic → formula expands it) must work perfectly with typed text input.
Voice is a convenience layer on top. Don't block the redesign on voice
integration.

---

## 9. Areas for Improvement

### 9.1 Search and navigation

The current UI has no global search. In v2, a **command palette** (Cmd+K /
Ctrl+K) should be the fastest way to find anything:

- Search beads by ID, title, or description
- Search convoys by name
- Jump to agent detail
- Run formulas by name
- Filter by status, type, rig

This pattern (VS Code, Linear, Notion) is well-understood and works on both
desktop and mobile (as a search bar).

### 9.2 Notifications and attention management

The current activity feed is a firehose. v2 needs **tiered notifications**:

| Tier | What | How |
|------|------|-----|
| **Critical** | MR failures, agent deaths, blocked convoys | Push notification (if permitted) + persistent banner |
| **Action needed** | Beads assigned to you, review requests | Badge on nav item + inbox-style list |
| **Informational** | Status changes, completions, mail | Activity feed (current behavior) |

### 9.3 Bead relationships

Dependencies are partially visualized (graph view exists). v2 should make
relationships **first-class** in the bead detail:

- "Blocked by" / "Blocks" with direct links
- "Part of convoy" with convoy status
- "Linked PR" with CI status inline
- "Created from formula" with formula name and run history

### 9.4 Batch operations

Currently, actions are one-bead-at-a-time. The kanban selection mechanism
exists (v1 has a floating action bar for multi-select). v2 should expand this:

- Multi-select beads → bulk status change, bulk assign, bulk add to convoy
- Convoy-level actions: "close all completed beads", "re-dispatch all blocked"

### 9.5 Dashboard customization

Different users care about different metrics. A simple widget-based dashboard
where users can add/remove/reorder cards (convoy summary, agent status, recent
activity, blocked beads, PR status) would serve diverse needs without requiring
everyone to use the same fixed layout.

### 9.6 Cost and resource visibility

Gas Town runs multiple AI agent sessions simultaneously, each consuming tokens
and compute. The UI should surface:

- **Per-agent costs** — `gt costs` data visualized as a chart or table
- **Per-convoy costs** — aggregate token usage across all agents working a convoy
- **Cost trends** — are costs increasing? Which convoys are most expensive?
- **Session health metrics** — context window usage, time-to-completion

This is especially important as users experiment with different harnesses
(Section 7) which have different cost profiles.

### 9.7 Convoy lifecycle management

The current convoy view shows status but doesn't help manage the lifecycle:

- **Convoy creation wizard** — guided flow: name, description, select beads,
  assign polecats, pick harness, set merge strategy
- **Convoy completion summary** — when all beads close, show a summary:
  total time, agents used, beads completed, PRs merged
- **Convoy templates** — save convoy configurations for recurring work patterns

---

## 10. Implementation Plan

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

### Phase 4: System Panel & Agent Interaction (1-2 weeks)
- [ ] Collapse Rigs, Agents, Crews, Health into tabbed admin panel
- [ ] Agent status ambient indicator (header/status bar)
- [ ] Service controls (start/stop/restart) in admin panel
- [ ] Nudge-based messaging panel for agent interaction
- [ ] Harness registry view (list/configure agent harnesses)
- [ ] Per-sling harness selection in dispatch UI

### Phase 5: Polish and Progressive Enhancement (1-2 weeks)
- [ ] Command palette refinement
- [ ] Notification tiers (critical/action/info)
- [ ] Dashboard widget customization
- [ ] Cost and resource visibility dashboard
- [ ] Voice input (WhisperFlow) as progressive enhancement on epic creation
- [ ] Mail threading for agent conversations
- [ ] Custom harness management UI

### Phase 6: Migration (ongoing)
- [ ] Feature-flag v2 views alongside v1
- [ ] Gradual cutover: replace one tab at a time
- [ ] Remove v1 code once v2 is stable

---

## 11. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Scope creep from "redesign everything" mentality | High | High | Strict phase gates. Each phase ships independently. |
| Mobile-first breaks desktop experience | Medium | Medium | Test both form factors in every phase. Desktop is still primary. |
| Formula auto-triggers cause runaway automation | Medium | High | Rate limits, confirmation toasts, explicit opt-in, kill switch. |
| Voice integration delays entire project | Low | Medium | Voice is Phase 5 (progressive enhancement), not blocking. |
| Vanilla JS hits complexity ceiling | Medium | Medium | morphdom buys time. Evaluate Lit/Preact at Phase 2 checkpoint. |
| Users resist navigation changes | Medium | Medium | Feature-flag v2, keep v1 accessible during migration. |
| Non-Claude harnesses have inconsistent GT protocol support | Medium | Medium | Test each harness with GT hooks before advertising it. Start with Claude + one alternative. |
| Agent messaging creates Dolt write amplification | Medium | Low | Default to nudge (zero cost), only use mail for persistent conversations. |

---

## 12. Summary of Recommendations

1. **Consolidate 11 tabs into 4 views** — Command Center, Workbench, Mail, System.
2. **Anchor the UX on convoys** — they're the natural top-level object.
3. **Mobile-first layout** — bottom nav, single column default, progressive enhancement to desktop.
4. **Add morphdom** for efficient DOM updates without a framework rewrite.
5. **Formula triggers as contextual actions** — not a separate browsing tab.
6. **Voice-to-epic as progressive enhancement** — text input is the core path.
7. **Agent interaction via nudge panel** — lightweight messaging in the UI, mail threading later.
8. **Expose harness configuration** — Gas Town supports 10+ agent harnesses; the UI should let users see, configure, and select them.
9. **Command palette (Cmd+K)** — the fastest navigation pattern.
10. **Tiered notifications** — not everything is equally important.
11. **Cost visibility** — surface per-agent and per-convoy resource usage.
12. **Ship incrementally** — feature-flag v2 views, migrate one at a time.
