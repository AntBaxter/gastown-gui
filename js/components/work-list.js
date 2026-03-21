/**
 * Gas Town GUI - Work List Component
 *
 * Renders the list of beads (tasks/work items) with status and completion info.
 */

import { api } from '../api.js';
import { showToast } from './toast.js';
import { escapeHtml, truncate } from '../utils/html.js';
import { formatTimeAgoOrDate } from '../utils/formatting.js';
import { getBeadPriority, isHiddenBead } from '../shared/beads.js';
import { BEAD_DETAIL, WORK_REFRESH } from '../shared/events.js';
import { toggleSelection, isSelected, onSelectionChange, renderFloatingBar } from '../shared/selection.js';
import { TIMING_MS } from '../shared/timing.js';
import { getStaggerClass } from '../shared/animations.js';
import { parseCloseReason } from '../shared/close-reason.js';

// Issue type icons
const TYPE_ICONS = {
  task: 'task_alt',
  bug: 'bug_report',
  feature: 'star',
  message: 'mail',
  convoy: 'local_shipping',
  agent: 'smart_toy',
  chore: 'build',
  epic: 'flag',
};

// Types that have colour coding (matching CSS type-* classes)
const TYPE_COLORS = ['task', 'bug', 'feature', 'epic', 'chore'];

// Status configuration
const STATUS_CONFIG = {
  open: { icon: 'radio_button_unchecked', class: 'status-open', label: 'Open' },
  closed: { icon: 'check_circle', class: 'status-closed', label: 'Completed' },
  'in-progress': { icon: 'pending', class: 'status-progress', label: 'In Progress' },
  in_progress: { icon: 'pending', class: 'status-progress', label: 'In Progress' },
  blocked: { icon: 'block', class: 'status-blocked', label: 'Blocked' },
};

// GitHub repo mapping is configured in `js/shared/github-repos.js`.

/**
 * Render the work list
 * @param {HTMLElement} container - The list container
 * @param {Array} beads - Array of bead objects
 * @param {Object} [options] - Rendering options
 * @param {boolean} [options.selectMode] - Whether selection mode is active
 */
export function renderWorkList(container, beads, options = {}) {
  if (!container) return;

  // Remove stale delegated click handler from graph view (if any)
  if (container._nodeClickHandler) {
    container.removeEventListener('click', container._nodeClickHandler);
    delete container._nodeClickHandler;
  }

  const { selectMode } = options;

  // Show all work types except internal/ephemeral ones
  const tasks = beads.filter(b => !isHiddenBead(b));

  if (!tasks || tasks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="material-icons empty-icon">task_alt</span>
        <h3>No Work Found</h3>
        <p>Create a new task to track work</p>
      </div>
    `;
    return;
  }

  container.innerHTML = tasks.map((bead, index) => renderListCard(bead, index, selectMode)).join('');

  // Add click handlers for cards
  container.querySelectorAll('.bead-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // Don't trigger if clicking a link
      if (e.target.closest('a')) return;
      if (e.target.closest('[data-action]')) return;

      const beadId = card.dataset.beadId;

      if (selectMode) {
        toggleSelection(beadId);
        card.classList.toggle('bead-card--selected', isSelected(beadId));
        const checkbox = card.querySelector('.bead-select-checkbox .material-icons');
        if (checkbox) {
          checkbox.textContent = isSelected(beadId) ? 'check_box' : 'check_box_outline_blank';
        }
        return;
      }

      showBeadDetail(beadId, beads.find(b => b.id === beadId));
    });
  });

  // Add click handlers for copy-only links (no GitHub repo configured)
  container.querySelectorAll('.commit-copy').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const hash = link.dataset.commit;
      navigator.clipboard.writeText(hash).then(() => {
        showCopyToast(`Copied: ${hash}`);
      });
    });
  });

  container.querySelectorAll('.pr-copy').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const pr = link.dataset.pr;
      navigator.clipboard.writeText(`#${pr}`).then(() => {
        showCopyToast(`Copied: PR #${pr}`);
      });
    });
  });

  // For links with actual GitHub URLs, just prevent card click propagation
  container.querySelectorAll('.commit-link:not(.commit-copy), .pr-link:not(.pr-copy)').forEach(link => {
    link.addEventListener('click', (e) => {
      e.stopPropagation(); // Don't trigger card click, but let the link navigate
    });
  });

  // Add action button handlers
  container.querySelectorAll('.bead-actions [data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const beadId = btn.dataset.beadId;
      await handleWorkAction(action, beadId, btn);
    });
  });

  // Selection mode: sync selection state and render floating bar
  if (selectMode) {
    container.querySelectorAll('.bead-card[data-bead-id]').forEach(card => {
      card.classList.toggle('bead-card--selected', isSelected(card.dataset.beadId));
    });
    onSelectionChange((ids) => {
      const selectedSet = new Set(ids);
      container.querySelectorAll('.bead-card[data-bead-id]').forEach(card => {
        card.classList.toggle('bead-card--selected', selectedSet.has(card.dataset.beadId));
      });
    });
    renderFloatingBar(container);
  }
}

/**
 * Handle work action (done, park, release, reassign)
 */
export async function handleWorkAction(action, beadId, btn) {
  const originalIcon = btn.innerHTML;
  btn.innerHTML = '<span class="material-icons spinning">sync</span>';
  btn.disabled = true;

  try {
    let result;
    switch (action) {
      case 'done':
        const summary = prompt('Enter completion summary (optional):');
        if (summary === null) {
          // User cancelled
          btn.innerHTML = originalIcon;
          btn.disabled = false;
          return;
        }
        result = await api.markWorkDone(beadId, summary || 'Completed via GUI');
        break;

      case 'defer':
        const reason = prompt('Enter reason for deferring:');
        if (!reason) {
          btn.innerHTML = originalIcon;
          btn.disabled = false;
          return;
        }
        result = await api.parkWork(beadId, reason);
        break;

      case 'reopen':
        if (!confirm('Reopen this work item? It will be unassigned and set to open.')) {
          btn.innerHTML = originalIcon;
          btn.disabled = false;
          return;
        }
        result = await api.releaseWork(beadId);
        break;

      case 'reassign':
        const target = prompt('Enter target agent address:');
        if (!target) {
          btn.innerHTML = originalIcon;
          btn.disabled = false;
          return;
        }
        result = await api.reassignWork(beadId, target);
        break;

      case 'delete':
        if (!confirm(`Permanently delete ${beadId}? This cannot be undone.`)) {
          btn.innerHTML = originalIcon;
          btn.disabled = false;
          return;
        }
        result = await api.deleteWork(beadId);
        break;
    }

    const ACTION_LABELS = {
      done: 'completed',
      defer: 'deferred',
      reopen: 'reopened',
      reassign: 'reassigned',
      delete: 'deleted',
    };
    if (result && result.success) {
      showToast(`Work ${ACTION_LABELS[action] || action}: ${beadId}`, 'success');
      // Trigger work list refresh
      document.dispatchEvent(new CustomEvent(WORK_REFRESH));
    } else if (result) {
      showToast(`Failed: ${result.error || 'Unknown error'}`, 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    btn.innerHTML = originalIcon;
    btn.disabled = false;
  }
}

/**
 * Render a single bead card
 */
export function renderBeadCard(bead, index) {
  const status = bead.status || 'open';
  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.open;
  const typeIcon = TYPE_ICONS[bead.issue_type] || 'assignment';
  const assignee = bead.assignee ? bead.assignee.split('/').pop() : null;
  const priority = getBeadPriority(bead);
  const isGate = bead._isGate || bead.issue_type === 'gate' ||
    (bead.title || '').toLowerCase().includes('review gate');
  const gateClass = isGate ? ' bead-gate' : '';
  const beadType = bead.issue_type || 'task';
  const typeClass = TYPE_COLORS.includes(beadType) ? ` type-${beadType}` : '';

  return `
	    <div class="bead-card ${statusConfig.class}${gateClass}${typeClass} animate-spawn ${getStaggerClass(index)}"
	         data-bead-id="${bead.id}">
      <div class="bead-header">
        <div class="bead-status">
          <span class="material-icons">${statusConfig.icon}</span>
        </div>
        <div class="bead-info">
          <h3 class="bead-title">${escapeHtml(bead.title)}</h3>
          <div class="bead-meta">
            <span class="bead-id">#${bead.id}</span>
            <span class="bead-type${typeClass}">
              <span class="material-icons">${typeIcon}</span>
              ${beadType}
            </span>
            ${bead.rig ? `
              <span class="bead-rig-badge" title="Rig: ${escapeHtml(bead.rig)}">
                ${escapeHtml(bead.rig)}
              </span>
            ` : ''}
            ${assignee ? `
              <span class="bead-assignee">
                <span class="material-icons">person</span>
                ${escapeHtml(assignee)}
              </span>
            ` : ''}
          </div>
        </div>
        <div class="bead-priority priority-${priority}">
          P${priority}
        </div>
      </div>

      ${bead.close_reason ? `
        <div class="bead-result">
          <span class="material-icons">check</span>
          <span class="result-text">${parseCloseReason(truncate(bead.close_reason, 150), bead.id)}</span>
        </div>
      ` : ''}

      <div class="bead-footer">
        <div class="bead-time">
          ${bead.closed_at ? `Completed ${formatTimeAgoOrDate(bead.closed_at)}` : `Created ${formatTimeAgoOrDate(bead.created_at)}`}
        </div>
        ${status !== 'closed' ? `
          <div class="bead-actions">
            <button class="btn btn-xs btn-success-ghost" data-action="done" data-bead-id="${bead.id}" title="Close as completed">
              <span class="material-icons">check_circle</span>
            </button>
            <button class="btn btn-xs btn-ghost" data-action="defer" data-bead-id="${bead.id}" title="Defer for later">
              <span class="material-icons">pause_circle</span>
            </button>
            <button class="btn btn-xs btn-ghost" data-action="reopen" data-bead-id="${bead.id}" title="Reopen and unassign">
              <span class="material-icons">replay</span>
            </button>
            <button class="btn btn-xs btn-ghost" data-action="reassign" data-bead-id="${bead.id}" title="Reassign to another agent">
              <span class="material-icons">person_add</span>
            </button>
            <button class="btn btn-xs btn-danger-ghost" data-action="delete" data-bead-id="${bead.id}" title="Delete permanently">
              <span class="material-icons">delete</span>
            </button>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Render a list card with optional selection checkbox overlay
 */
function renderListCard(bead, index, selectMode) {
  let html = renderBeadCard(bead, index);

  if (selectMode) {
    if (isSelected(bead.id)) {
      html = html.replace('class="bead-card ', 'class="bead-card bead-card--selected ');
    }
    const checkIcon = isSelected(bead.id) ? 'check_box' : 'check_box_outline_blank';
    const checkboxHtml = `<div class="bead-select-checkbox"><span class="material-icons">${checkIcon}</span></div>`;
    html = html.replace('<div class="bead-header">', checkboxHtml + '<div class="bead-header">');
  }

  return html;
}

/**
 * Show bead detail modal
 */
function showBeadDetail(beadId, bead) {
  const event = new CustomEvent(BEAD_DETAIL, { detail: { beadId, bead } });
  document.dispatchEvent(event);
}

/**
 * Show a small toast when copying
 */
function showCopyToast(message) {
  showToast(message, 'success', TIMING_MS.FEEDBACK);
}
