/**
 * Gas Town GUI - Kanban Board Component
 *
 * Renders beads in a kanban board layout with columns per status.
 * Supports epic-scoped filtering and ready/blocked indicators.
 * Reuses bead card rendering from work-list.js.
 */

import { renderBeadCard } from './work-list.js';
import { BEAD_DETAIL, BLOCKED_TRIAGE } from '../shared/events.js';
import { isHiddenBead } from '../shared/beads.js';
import { escapeHtml, escapeAttr } from '../utils/html.js';
import { toggleSelection, isSelected, onSelectionChange, renderFloatingBar } from '../shared/selection.js';

const KANBAN_COLUMNS = [
  { key: 'open', label: 'Open', icon: 'radio_button_unchecked', colorVar: '--accent-warning' },
  { key: 'in_progress', label: 'In Progress', icon: 'pending', colorVar: '--accent-primary' },
  { key: 'blocked', label: 'Blocked', icon: 'block', colorVar: '--accent-danger' },
  { key: 'closed', label: 'Closed', icon: 'check_circle', colorVar: '--accent-success' },
  { key: 'deferred', label: 'Deferred', icon: 'pause_circle', colorVar: '--text-muted' },
];

/**
 * Group beads into kanban columns by status
 */
function groupByStatus(beads) {
  const groups = {};
  for (const col of KANBAN_COLUMNS) {
    groups[col.key] = [];
  }

  for (const bead of beads) {
    if (isHiddenBead(bead)) continue;

    let status = bead.status || 'open';
    // Normalize in-progress variants
    if (status === 'in-progress') status = 'in_progress';
    // Map hooked/pinned to their logical column
    if (status === 'hooked') status = 'in_progress';
    if (status === 'pinned') status = 'open';

    if (groups[status]) {
      groups[status].push(bead);
    } else {
      // Unknown status goes to open
      groups['open'].push(bead);
    }
  }

  // Sort each column by priority (lower number = higher priority)
  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => {
      const pa = parseInt(a.priority) || 2;
      const pb = parseInt(b.priority) || 2;
      return pa - pb;
    });
  }

  return groups;
}

/**
 * Build a set of blocked bead IDs from blocked data
 * @param {Array} blockedBeads - Array from /api/beads/blocked
 * @returns {Map<string, string[]>} Map of bead ID → array of blocker IDs
 */
function buildBlockedMap(blockedBeads) {
  const map = new Map();
  if (!Array.isArray(blockedBeads)) return map;
  for (const bead of blockedBeads) {
    if (bead.blocked_by && bead.blocked_by.length > 0) {
      map.set(bead.id, bead.blocked_by);
    }
  }
  return map;
}

/**
 * Render the epic filter dropdown
 * @param {Array} epics - Array of epic bead objects
 * @param {string} selectedEpicId - Currently selected epic ID or 'all'
 */
function renderEpicFilter(epics, selectedEpicId) {
  if (!epics || epics.length === 0) return '';

  return `
    <div class="kanban-epic-filter">
      <span class="material-icons kanban-epic-filter-icon">flag</span>
      <select class="kanban-epic-select" id="kanban-epic-filter">
        <option value="all" ${selectedEpicId === 'all' ? 'selected' : ''}>All Work</option>
        ${epics.map(epic => `
          <option value="${escapeAttr(epic.id)}" ${selectedEpicId === epic.id ? 'selected' : ''}>
            ${escapeHtml(epic.title)} (${escapeHtml(epic.id)})
          </option>
        `).join('')}
      </select>
    </div>
  `;
}

/**
 * Render the kanban board
 * @param {HTMLElement} container - The board container
 * @param {Array} beads - Array of bead objects
 * @param {Object} options - Rendering options
 * @param {Array} options.epics - Array of epic beads for filter dropdown
 * @param {string} options.epicFilter - Current epic filter value
 * @param {Array} options.epicChildren - Children of selected epic (if filtered)
 * @param {Array} options.blockedBeads - Blocked beads data
 * @param {Function} options.onEpicFilterChange - Callback when epic filter changes
 */
export function renderKanbanBoard(container, beads, options = {}) {
  if (!container) return;

  // Remove stale delegated click handler from graph view (if any).
  // Graph view adds a click handler on [data-bead-id] to the container itself,
  // which persists across view switches and fires on kanban cards too.
  if (container._nodeClickHandler) {
    container.removeEventListener('click', container._nodeClickHandler);
    delete container._nodeClickHandler;
  }

  const { epics, epicFilter, epicChildren, blockedBeads, onEpicFilterChange, selectMode } = options;
  const selectedEpicId = epicFilter || 'all';

  // If epic is selected, show only its children (may be empty)
  let displayBeads = beads;
  if (selectedEpicId !== 'all') {
    displayBeads = epicChildren || [];
  }

  const blockedMap = buildBlockedMap(blockedBeads);

  // Annotate beads with ready/blocked info
  const annotatedBeads = displayBeads.map(bead => {
    const blockers = blockedMap.get(bead.id);
    const isBlocked = blockers && blockers.length > 0;
    const isReady = !isBlocked && bead.status !== 'closed' && bead.status !== 'blocked' &&
      bead.status !== 'deferred' && bead.dependency_count === 0;
    const isGate = bead.issue_type === 'gate' ||
      (bead.title || '').toLowerCase().includes('review gate') ||
      (bead.title || '').toLowerCase().includes('review');
    return { ...bead, _blockers: blockers, _isBlocked: isBlocked, _isReady: isReady, _isGate: isGate };
  });

  const tasks = annotatedBeads.filter(b => !isHiddenBead(b));

  if (!tasks || tasks.length === 0) {
    container.innerHTML = `
      ${renderEpicFilter(epics, selectedEpicId)}
      <div class="empty-state">
        <span class="material-icons empty-icon">view_kanban</span>
        <h3>No Work Found</h3>
        <p>${selectedEpicId !== 'all' ? 'No tasks in this epic' : 'Create a new task to track work'}</p>
      </div>
    `;
    wireEpicFilterEvent(container, onEpicFilterChange);
    return;
  }

  const groups = groupByStatus(annotatedBeads);

  // Only show columns that have items or are core statuses (open, in_progress, blocked)
  const coreColumns = ['open', 'in_progress', 'blocked'];
  const visibleColumns = KANBAN_COLUMNS.filter(
    col => coreColumns.includes(col.key) || groups[col.key].length > 0
  );

  container.innerHTML = `
    ${renderEpicFilter(epics, selectedEpicId)}
    <div class="kanban-board">
      ${visibleColumns.map(col => {
        const items = groups[col.key];
        return `
          <div class="kanban-column" data-status="${col.key}">
            <div class="kanban-column-header">
              <span class="kanban-column-icon">
                <span class="material-icons" style="color: var(${col.colorVar})">${col.icon}</span>
              </span>
              <span class="kanban-column-title">${col.label}</span>
              <span class="kanban-column-count">${items.length}</span>
            </div>
            <div class="kanban-column-body">
              ${items.length === 0
                ? '<div class="kanban-empty">No items</div>'
                : items.map((bead, i) => renderKanbanCard(bead, i, selectMode)).join('')
              }
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  wireEpicFilterEvent(container, onEpicFilterChange);

  // Add click handlers for bead cards
  container.querySelectorAll('.bead-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      if (e.target.closest('[data-action]')) return;
      const beadId = card.dataset.beadId;

      if (selectMode) {
        toggleSelection(beadId);
        card.classList.toggle('bead-card--selected', isSelected(beadId));
        return;
      }

      const bead = annotatedBeads.find(b => b.id === beadId);
      document.dispatchEvent(new CustomEvent(BEAD_DETAIL, { detail: { beadId, bead } }));
    });
  });

  // Add blocked badge click handlers
  container.querySelectorAll('.blocked-badge[data-blocked-bead]').forEach(badge => {
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      const beadId = badge.dataset.blockedBead;
      const blockers = JSON.parse(badge.dataset.blockers || '[]');
      const bead = annotatedBeads.find(b => b.id === beadId);
      document.dispatchEvent(new CustomEvent(BLOCKED_TRIAGE, {
        detail: { beadId, blockers, bead }
      }));
    });
  });

  // Add action button handlers
  container.querySelectorAll('.bead-actions [data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const beadId = btn.dataset.beadId;
      const { handleWorkAction } = await import('./work-list.js');
      handleWorkAction(action, beadId, btn);
    });
  });

  // Sync selection state from shared selection module
  function updateCardSelection(ids) {
    const selectedSet = new Set(ids);
    container.querySelectorAll('.bead-card[data-bead-id]').forEach(card => {
      card.classList.toggle('bead-card-selected', selectedSet.has(card.dataset.beadId));
    });
  }
  // Apply current selection on initial render
  container.querySelectorAll('.bead-card[data-bead-id]').forEach(card => {
    card.classList.toggle('bead-card-selected', isSelected(card.dataset.beadId));
  });
  onSelectionChange(updateCardSelection);
  renderFloatingBar(container);
}

/**
 * Render a kanban card with ready/blocked/gate indicators
 */
function renderKanbanCard(bead, index, selectMode) {
  let html = renderBeadCard(bead, index);

  // Add gate class to card wrapper
  if (bead._isGate) {
    html = html.replace('class="bead-card ', 'class="bead-card bead-gate ');
  }

  // Add selected class if in select mode and bead is selected
  if (selectMode && isSelected(bead.id)) {
    html = html.replace('class="bead-card ', 'class="bead-card bead-card--selected ');
  }

  // Insert badges before bead-footer
  const badges = [];
  if (bead._isReady && bead.status !== 'closed') {
    badges.push('<span class="ready-badge"><span class="material-icons">check_circle</span>Ready</span>');
  }
  if (bead._isBlocked && bead._blockers) {
    const blockerList = bead._blockers.slice(0, 2).map(id => escapeHtml(id)).join(', ');
    const more = bead._blockers.length > 2 ? ` +${bead._blockers.length - 2}` : '';
    badges.push(`<span class="blocked-badge" data-blocked-bead="${escapeAttr(bead.id)}" data-blockers="${escapeAttr(JSON.stringify(bead._blockers))}"><span class="material-icons">block</span>Blocked by ${blockerList}${more}</span>`);
  }
  if (bead._isGate) {
    badges.push('<span class="gate-badge"><span class="material-icons">verified</span>Review Gate</span>');
  }

  if (badges.length > 0) {
    const badgeHtml = `<div class="bead-badges">${badges.join('')}</div>`;
    html = html.replace('<div class="bead-footer">', badgeHtml + '<div class="bead-footer">');
  }

  return html;
}

/**
 * Wire the epic filter dropdown change event
 */
function wireEpicFilterEvent(container, onEpicFilterChange) {
  const select = container.querySelector('#kanban-epic-filter');
  if (select && onEpicFilterChange) {
    select.addEventListener('change', () => {
      onEpicFilterChange(select.value);
    });
  }
}
