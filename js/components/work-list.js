/**
 * Gas Town GUI - Work List Component
 *
 * Renders the list of beads (tasks/work items) with status and completion info.
 */

import { api } from '../api.js';
import { showToast } from './toast.js';
import { escapeHtml, truncate } from '../utils/html.js';
import { formatTimeAgoOrDate } from '../utils/formatting.js';
import { getBeadPriority, HIDDEN_BEAD_TYPES } from '../shared/beads.js';
import { BEAD_DETAIL, WORK_REFRESH } from '../shared/events.js';
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
 */
export function renderWorkList(container, beads) {
  if (!container) return;

  // Show all work types except internal/ephemeral ones
  const tasks = beads.filter(b => !HIDDEN_BEAD_TYPES.includes(b.issue_type) && !b.ephemeral);

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

  container.innerHTML = tasks.map((bead, index) => renderBeadCard(bead, index)).join('');

  // Add click handlers for cards
  container.querySelectorAll('.bead-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // Don't trigger if clicking a link
      if (e.target.closest('a')) return;

      const beadId = card.dataset.beadId;
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

  return `
	    <div class="bead-card ${statusConfig.class}${gateClass} animate-spawn ${getStaggerClass(index)}"
	         data-bead-id="${bead.id}">
      <div class="bead-header">
        <div class="bead-status">
          <span class="material-icons">${statusConfig.icon}</span>
        </div>
        <div class="bead-info">
          <h3 class="bead-title">${escapeHtml(bead.title)}</h3>
          <div class="bead-meta">
            <span class="bead-id">#${bead.id}</span>
            <span class="bead-type">
              <span class="material-icons">${typeIcon}</span>
              ${bead.issue_type || 'task'}
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
