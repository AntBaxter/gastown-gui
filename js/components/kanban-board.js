/**
 * Gas Town GUI - Kanban Board Component
 *
 * Renders beads in a kanban board layout with columns per status.
 * Reuses bead card rendering from work-list.js.
 */

import { renderBeadCard } from './work-list.js';
import { BEAD_DETAIL } from '../shared/events.js';
import { HIDDEN_BEAD_TYPES } from '../shared/beads.js';

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
    if (HIDDEN_BEAD_TYPES.includes(bead.issue_type)) continue;

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
 * Render the kanban board
 * @param {HTMLElement} container - The board container
 * @param {Array} beads - Array of bead objects
 */
export function renderKanbanBoard(container, beads) {
  if (!container) return;

  const tasks = beads.filter(b => !HIDDEN_BEAD_TYPES.includes(b.issue_type));

  if (!tasks || tasks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="material-icons empty-icon">view_kanban</span>
        <h3>No Work Found</h3>
        <p>Create a new task to track work</p>
      </div>
    `;
    return;
  }

  const groups = groupByStatus(beads);

  // Only show columns that have items or are core statuses (open, in_progress, blocked)
  const coreColumns = ['open', 'in_progress', 'blocked'];
  const visibleColumns = KANBAN_COLUMNS.filter(
    col => coreColumns.includes(col.key) || groups[col.key].length > 0
  );

  container.innerHTML = `
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
                : items.map((bead, i) => renderBeadCard(bead, i)).join('')
              }
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  // Add click handlers for bead cards
  container.querySelectorAll('.bead-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      if (e.target.closest('[data-action]')) return;
      const beadId = card.dataset.beadId;
      const bead = beads.find(b => b.id === beadId);
      document.dispatchEvent(new CustomEvent(BEAD_DETAIL, { detail: { beadId, bead } }));
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
}
