# Mobile-Friendly UI Analysis & Recommendation

**Date:** 2026-03-13
**Bead:** ga-0lv
**Author:** polecat/capable

## Executive Summary

The Gas Town GUI is a desktop-first SPA with minimal mobile support. The header
navigation (11 tabs) does not collapse, the sidebar has a basic mobile transform
but no toggle button, and most component layouts break below 768px. This document
analyzes the issues and recommends a pure-CSS approach using the existing vanilla
JS architecture (no framework dependencies).

---

## Current State Audit

### What exists

**Responsive breakpoints (layout.css lines 719-751):**
- `1200px` — Activity feed shrinks to 280px
- `1024px` — Sidebar shrinks to 240px, activity feed hidden
- `768px` — Sidebar becomes fixed overlay with `translateX(-100%)`

**Dashboard-specific breakpoints (components.css lines 6376-6428):**
- `1024px` — Metrics grid to 2 columns
- `768px` — Dashboard container auto-height, grid to 1 column
- `480px` — Metrics and quick-actions grids to 2 and 2 columns

**Viewport meta tag:** Present in `index.html` line 4 (`width=device-width, initial-scale=1.0`)

### Critical Issues

#### 1. Header Navigation Does Not Collapse (CRITICAL)

The header contains 11 navigation tabs (Overview, Convoys, Work, Agents, Rigs,
Crews, PRs, Formulas, Issues, Mail, Health) in a horizontal `.nav-tabs` flex row.
At mobile widths these overflow without wrapping or collapsing.

**Files affected:** `index.html` lines 61-107, `css/layout.css` lines 261-290

**Problem:** No hamburger menu, no overflow handling, no dropdown. The tabs simply
overflow the header and are cut off or cause horizontal scrolling.

#### 2. No Mobile Sidebar Toggle (HIGH)

At 768px the sidebar gets `translateX(-100%)`, but there is no visible button to
open it. The `.sidebar.open` class exists but nothing in the UI toggles it on mobile.

**Files affected:** `css/layout.css` lines 737-750, `js/components/sidebar.js`

#### 3. Header Left Section Too Wide (HIGH)

The `.header-left` contains: logo + town name + mayor command bar (min-width: 280px).
On mobile this alone consumes most of the viewport width.

**Files affected:** `css/layout.css` lines 29-101

#### 4. Agent Grid Cards Don't Resize (MEDIUM)

The `.agent-grid` uses `grid-template-columns: repeat(auto-fill, minmax(300px, 1fr))`.
On screens < 360px this forces horizontal scroll. No mobile breakpoint adjusts this.

**Files affected:** `css/layout.css` lines 544-552

#### 5. Modal Sizing (MEDIUM)

Modals use `max-width: 480px` which works on most phones, but the `.modal-lg` variant
and the mayor output panel (`width: 800px`) don't have adequate mobile sizing.

**Files affected:** `css/layout.css` lines 573-584, lines 152-170

#### 6. Fixed Pixel Sidebar Width (LOW)

Sidebar uses `--sidebar-width: 280px` as a fixed value. On tablet this consumes a
large portion of the viewport.

#### 7. Status Bar Content Overflow (LOW)

The status bar has three flex sections (left, center, right) that don't wrap.
The rig filter select and keyboard hint overflow on narrow screens.

**Files affected:** `css/layout.css` lines 486-534

#### 8. Touch Target Sizes (LOW)

Many interactive elements (icon-btn: 36px, icon-btn-sm: 28px, tree items) are below
the recommended 44x44px minimum touch target for mobile.

#### 9. `overflow: hidden` on body (LOW)

`body { overflow: hidden }` in layout.css line 6 prevents mobile users from
accessing any overflowed content via scrolling.

---

## Library Evaluation

### Option A: Vanilla CSS (Recommended)

**Approach:** Extend the existing CSS with mobile-specific media queries and add
a small JS hamburger menu component. No new dependencies.

| Pros | Cons |
|------|------|
| Zero new dependencies | More CSS to write manually |
| Consistent with existing architecture | No pre-built mobile patterns |
| No build step changes needed | Must test each breakpoint manually |
| Bundle size stays minimal (no framework CSS) | |
| Maintains full control over styling | |

**Estimated effort:** 2-3 focused sessions

### Option B: Pico CSS

**What:** Classless/minimal CSS framework (~10KB gzipped)

| Pros | Cons |
|------|------|
| Tiny footprint | Classless approach conflicts with existing class-based CSS |
| Semantic HTML styling | Would need to override most defaults |
| Good mobile defaults | Not really designed for complex dashboards |

**Verdict:** Poor fit. The existing CSS is heavily class-based and Pico's classless
philosophy would fight with it.

### Option C: Open Props

**What:** CSS custom properties library (just variables, no components)

| Pros | Cons |
|------|------|
| Variables only — non-invasive | Already have comprehensive CSS variables |
| Good responsive utilities | Adds a dependency for things we largely have |
| Great animation tokens | |

**Verdict:** Marginal value. The existing `variables.css` already covers colors,
spacing, typography, transitions, and z-index. Open Props would duplicate most of it.

### Option D: Tailwind CSS

**What:** Utility-first CSS framework

| Pros | Cons |
|------|------|
| Excellent responsive utilities | Requires build step (PostCSS/CLI) |
| Large ecosystem | Fundamentally different approach from current CSS |
| Mobile-first by default | Would need to rewrite all existing CSS |
| | Massive migration effort |

**Verdict:** Wrong architecture. The project explicitly has "no build step" as a
design decision. Tailwind requires PostCSS processing.

### Option E: Bootstrap / Bulma

**What:** Full component frameworks

| Pros | Cons |
|------|------|
| Mature mobile patterns (navbar, grid, etc.) | Heavy (~25-50KB CSS) |
| Well-tested responsive components | Opinionated styling conflicts with current theme |
| | Would need to override most defaults for dark theme |
| | Dependency maintenance burden |

**Verdict:** Overkill. The app has its own design system. Importing Bootstrap just
for a hamburger menu and responsive grid is wasteful.

---

## Recommendation: Vanilla CSS + Minimal JS

Given the project constraints (no build step, vanilla JS, existing CSS custom
properties, dark/light theme), the best approach is to extend the existing CSS
with targeted mobile improvements.

### Implementation Plan

#### Phase 1: Header & Navigation (Critical Path)

**1.1 Hamburger Menu**

Add a hamburger button (hidden on desktop, visible on mobile) that toggles a
mobile nav dropdown. Use the existing Material Icons (`menu` icon).

```html
<!-- Add to .header-left, before .nav-tabs -->
<button class="mobile-menu-btn" id="mobile-menu-btn" aria-label="Menu">
  <span class="material-icons">menu</span>
</button>
```

```css
.mobile-menu-btn {
  display: none;
}

@media (max-width: 768px) {
  .mobile-menu-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    color: var(--text-secondary);
    border-radius: var(--radius-md);
  }

  .nav-tabs {
    position: fixed;
    top: var(--header-height);
    left: 0;
    right: 0;
    flex-direction: column;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-default);
    box-shadow: var(--shadow-lg);
    z-index: var(--z-dropdown);
    transform: translateY(-100%);
    opacity: 0;
    pointer-events: none;
    transition: transform var(--transition-base), opacity var(--transition-base);
    max-height: calc(100vh - var(--header-height));
    overflow-y: auto;
  }

  .nav-tabs.open {
    transform: translateY(0);
    opacity: 1;
    pointer-events: auto;
  }

  .nav-tab {
    padding: var(--space-md);
    border-bottom: 1px solid var(--border-muted);
    justify-content: flex-start;
  }
}
```

**JS addition:** ~15 lines in `app.js` for toggle behavior + click-outside-to-close.

**1.2 Header Layout Responsive**

```css
@media (max-width: 768px) {
  .header {
    padding: 0 var(--space-sm);
  }

  .header-left {
    gap: var(--space-sm);
  }

  .header-center {
    /* Moved to dropdown */
    display: none;
  }

  .mayor-command-bar {
    display: none; /* Hide on mobile or move to dedicated view */
  }

  .town-name {
    display: none;
  }

  .header-right {
    gap: var(--space-xs);
  }

  .connection-status .status-text {
    display: none; /* Show dot only */
  }
}
```

#### Phase 2: Sidebar & Layout

**2.1 Mobile Sidebar Toggle**

The sidebar already has CSS for mobile positioning. Add a toggle button visible
only on mobile (can reuse the hamburger or add a separate agents button).

```css
@media (max-width: 768px) {
  .sidebar {
    width: 280px; /* Full sidebar width when open */
    box-shadow: var(--shadow-lg);
    transition: transform var(--transition-base);
  }

  /* Backdrop when sidebar is open */
  .sidebar-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: calc(var(--z-dropdown) - 1);
    display: none;
  }

  .sidebar-backdrop.visible {
    display: block;
  }
}
```

**2.2 Content Area Full Width**

```css
@media (max-width: 768px) {
  .main {
    flex-direction: column;
  }

  .content {
    width: 100%;
  }

  .view-header {
    flex-wrap: wrap;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
  }

  .view-header h1 {
    font-size: var(--text-lg);
    width: 100%;
  }

  .view-actions {
    flex-wrap: wrap;
  }

  .view-filters {
    margin-left: 0;
    flex-wrap: wrap;
  }
}
```

#### Phase 3: Component Mobile Fixes

**3.1 Agent Grid**
```css
@media (max-width: 480px) {
  .agent-grid {
    grid-template-columns: 1fr;
    padding: var(--space-sm);
  }
}
```

**3.2 Modals**
```css
@media (max-width: 480px) {
  .modal {
    max-width: 100%;
    border-radius: 0;
    max-height: 100vh;
  }

  .modal-lg {
    width: 100%;
    max-width: 100%;
  }

  .mayor-output-panel {
    width: 100% !important;
    height: 100vh !important;
    max-width: 100vw;
    max-height: 100vh;
    border-radius: 0;
    top: 0;
    left: 0;
    transform: none;
  }
}
```

**3.3 Status Bar**
```css
@media (max-width: 768px) {
  .status-bar {
    padding: 0 var(--space-sm);
  }

  .keyboard-hint {
    display: none;
  }

  .status-center {
    display: none;
  }
}
```

**3.4 Touch Targets**
```css
@media (max-width: 768px) {
  .icon-btn {
    width: 44px;
    height: 44px;
  }

  .icon-btn-sm {
    width: 36px;
    height: 36px;
  }

  .tree-item {
    padding: var(--space-sm) var(--space-md);
    min-height: 44px;
  }

  .nav-tab {
    min-height: 44px;
  }
}
```

**3.5 Convoy/Work/Mail Lists**
```css
@media (max-width: 768px) {
  .convoy-list,
  .mail-list {
    padding: var(--space-sm);
  }

  .convoy-header {
    flex-wrap: wrap;
  }

  .convoy-meta {
    flex-wrap: wrap;
    gap: var(--space-xs);
  }

  .issue-item {
    padding: var(--space-sm);
  }
}
```

#### Phase 4: Polish & Edge Cases

- Test landscape orientation on phones (many dashboard panels need different layout)
- Add `safe-area-inset` for notched devices:
  ```css
  .header { padding-top: env(safe-area-inset-top); }
  .status-bar { padding-bottom: env(safe-area-inset-bottom); }
  ```
- Ensure modal backdrops cover full viewport including safe areas
- Test with iOS Safari's address bar behavior (100vh issues — use `100dvh` where supported)

---

## File Change Summary

| File | Changes |
|------|---------|
| `index.html` | Add hamburger button, sidebar backdrop div |
| `css/layout.css` | Add/extend 768px and 480px media queries |
| `css/components.css` | Add mobile overrides for cards, modals, lists |
| `js/app.js` | Hamburger toggle logic (~15 lines) |
| `js/components/sidebar.js` | Sidebar backdrop toggle on mobile |

**No new dependencies. No build step changes. No new CSS files needed.**

---

## Testing Checklist

- [ ] Chrome DevTools device emulation: iPhone SE, iPhone 14, iPad
- [ ] Header hamburger menu opens/closes correctly
- [ ] All 11 nav tabs accessible from mobile dropdown
- [ ] Sidebar opens/closes with backdrop
- [ ] Dashboard metrics readable at 375px width
- [ ] Modals fill screen on small devices
- [ ] Touch targets >= 44px on all interactive elements
- [ ] Both dark and light themes tested at mobile sizes
- [ ] Landscape orientation works on phone-size screens
- [ ] Status bar doesn't overflow
- [ ] `prefers-reduced-motion` still respected

---

## Alternatives Considered and Rejected

| Library | Reason for rejection |
|---------|---------------------|
| Tailwind CSS | Requires build step; contradicts "no bundler" architecture |
| Bootstrap 5 | Heavy; would fight existing dark theme and design system |
| Bulma | Same issues as Bootstrap, less suitable for dashboards |
| Pico CSS | Classless approach conflicts with class-heavy existing CSS |
| Open Props | Duplicates existing CSS variables; marginal value |
| Material Web Components | Google's web components; adds JS runtime, build complexity |
| Shoelace (now Lit) | Web component library; overkill for responsive fixes |

The vanilla CSS approach adds zero dependencies, zero build complexity, and
maintains full control over the existing design system. The total CSS addition
is estimated at ~200-300 lines of media queries.
