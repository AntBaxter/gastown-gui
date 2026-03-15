/**
 * Gas Town GUI - Epic Detail Component
 *
 * Renders epic metadata + child task tree inside the bead detail modal.
 * Each child shows status, title, ID, assignee, priority, dependency arrows.
 * Ready badge on unblocked tasks, review gate badge on terminal tasks.
 * Sling button per ready child + bulk "Sling All Ready" action.
 */

import { api } from '../api.js';
import { showToast } from './toast.js';
import { escapeHtml } from '../utils/html.js';
import { getBeadPriority } from '../shared/beads.js';
import { BEAD_DETAIL, BEAD_SLING } from '../shared/events.js';

const STATUS_ICONS = {
  open: 'radio_button_unchecked',
  closed: 'check_circle',
  'in-progress': 'pending',
  in_progress: 'pending',
  hooked: 'pending',
  blocked: 'block',
  deferred: 'pause_circle',
};

function isReady(child, allChildren) {
  if (child.status === 'closed' || child.status === 'blocked') return false;
  // A child is ready if it has no open dependencies among siblings
  // Check if any other child that this one depends on is still open
  // For now, since we don't have full dep data, mark open/unassigned tasks as ready
  return child.status === 'open';
}

function isReviewGate(child) {
  const title = (child.title || '').toLowerCase();
  return title.includes('review') || title.includes('gate') ||
    child.issue_type === 'gate';
}

function renderChildCard(child, allChildren) {
  const statusIcon = STATUS_ICONS[child.status] || 'help_outline';
  const priority = getBeadPriority(child);
  const assignee = child.assignee ? child.assignee.split('/').pop() : null;
  const ready = isReady(child, allChildren);
  const reviewGate = isReviewGate(child);
  const canSling = ready && child.status !== 'closed';

  return `
    <div class="epic-child-card ${child.status === 'closed' ? 'child-closed' : ''} ${reviewGate ? 'child-review-gate' : ''}"
         data-child-id="${escapeHtml(child.id)}">
      <div class="epic-child-main">
        <span class="material-icons status-icon status-${child.status}">${statusIcon}</span>
        <div class="epic-child-info">
          <div class="epic-child-title-row">
            <code class="epic-child-id">${escapeHtml(child.id)}</code>
            <span class="epic-child-title">${escapeHtml(child.title)}</span>
          </div>
          <div class="epic-child-meta">
            <span class="priority-badge priority-${priority}">P${priority}</span>
            <span class="status-badge status-${child.status}">${child.status || 'open'}</span>
            ${ready ? '<span class="ready-badge">Ready</span>' : ''}
            ${reviewGate ? '<span class="gate-badge"><span class="material-icons">verified</span>Review Gate</span>' : ''}
            ${assignee ? `<span class="assignee-tag"><span class="material-icons">person</span>${escapeHtml(assignee)}</span>` : '<span class="assignee-tag unassigned">Unassigned</span>'}
          </div>
        </div>
      </div>
      <div class="epic-child-actions">
        ${canSling ? `
          <button class="btn btn-sm btn-primary epic-sling-btn" data-sling-id="${escapeHtml(child.id)}" title="Sling this task">
            <span class="material-icons">send</span>
          </button>
        ` : ''}
        <button class="btn btn-sm btn-secondary epic-detail-btn" data-detail-id="${escapeHtml(child.id)}" title="View details">
          <span class="material-icons">open_in_new</span>
        </button>
      </div>
    </div>
  `;
}

export function renderEpicProgress(children) {
  const total = children.length;
  const closed = children.filter(c => c.status === 'closed').length;
  const inProgress = children.filter(c => c.status === 'in_progress' || c.status === 'in-progress' || c.status === 'hooked').length;
  const pct = total > 0 ? Math.round((closed / total) * 100) : 0;

  return `
    <div class="epic-progress">
      <div class="epic-progress-bar">
        <div class="epic-progress-fill" style="width: ${pct}%"></div>
      </div>
      <div class="epic-progress-stats">
        <span>${closed}/${total} complete (${pct}%)</span>
        ${inProgress > 0 ? `<span>${inProgress} in progress</span>` : ''}
      </div>
    </div>
  `;
}

export function renderEpicChildTree(children) {
  const readyCount = children.filter(c => isReady(c, children) && c.status !== 'closed').length;

  return `
    <div class="epic-children-section">
      <div class="epic-children-header">
        <h4>
          <span class="material-icons">account_tree</span>
          Child Tasks (${children.length})
        </h4>
        ${readyCount > 0 ? `
          <button class="btn btn-sm btn-primary epic-sling-all-btn" title="Sling all ready tasks">
            <span class="material-icons">send</span>
            Sling All Ready (${readyCount})
          </button>
        ` : ''}
      </div>
      ${renderEpicProgress(children)}
      <div class="epic-child-list">
        ${children.map(child => renderChildCard(child, children)).join('')}
      </div>
    </div>
  `;
}

export function wireEpicChildEvents(container, children) {
  // Sling individual child
  container.querySelectorAll('.epic-sling-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const beadId = btn.dataset.slingId;
      document.dispatchEvent(new CustomEvent(BEAD_SLING, { detail: { beadId } }));
    });
  });

  // View child detail
  container.querySelectorAll('.epic-detail-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const beadId = btn.dataset.detailId;
      document.dispatchEvent(new CustomEvent(BEAD_DETAIL, { detail: { beadId } }));
    });
  });

  // Sling all ready
  const slingAllBtn = container.querySelector('.epic-sling-all-btn');
  if (slingAllBtn) {
    slingAllBtn.addEventListener('click', () => {
      const readyChildren = children.filter(c => isReady(c, children) && c.status !== 'closed');
      for (const child of readyChildren) {
        document.dispatchEvent(new CustomEvent(BEAD_SLING, { detail: { beadId: child.id } }));
      }
      showToast(`Sling initiated for ${readyChildren.length} ready tasks`, 'success');
    });
  }

  // Click on card to view detail
  container.querySelectorAll('.epic-child-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const beadId = card.dataset.childId;
      document.dispatchEvent(new CustomEvent(BEAD_DETAIL, { detail: { beadId } }));
    });
  });
}

export async function loadAndRenderEpicChildren(beadId, container) {
  container.innerHTML = `
    <div class="loading-inline">
      <span class="material-icons spinning">sync</span>
      Loading child tasks...
    </div>
  `;

  try {
    const result = await api.getBeadChildren(beadId);
    const children = result?.children || [];

    if (children.length === 0) {
      container.innerHTML = '<p class="empty-state">No child tasks found</p>';
      return;
    }

    container.innerHTML = renderEpicChildTree(children);
    wireEpicChildEvents(container, children);
  } catch {
    container.innerHTML = '<p class="error-state">Failed to load child tasks</p>';
  }
}
