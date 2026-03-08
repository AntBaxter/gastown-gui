/**
 * Gas Town GUI - Convoy List Component
 *
 * Renders the list of convoys with status, progress, and actions.
 * Phase 3: Added expandable detail view, issue tree, worker panel.
 */

import { escapeHtml, escapeAttr, truncate } from '../utils/html.js';
import { formatTimeAgoOrDate } from '../utils/formatting.js';
import { TIMING_MS } from '../shared/timing.js';
import { AGENT_NUDGE, BEAD_DETAIL, CONVOY_DETAIL, CONVOY_ESCALATE, SLING_OPEN } from '../shared/events.js';
import { getStaggerClass } from '../shared/animations.js';

// Status icons for convoys
const STATUS_ICONS = {
  pending: 'hourglass_empty',
  running: 'sync',
  complete: 'check_circle',
  failed: 'error',
  cancelled: 'cancel',
};

// Issue status icons (keys match bd valid statuses)
const ISSUE_STATUS_ICONS = {
  open: 'radio_button_unchecked',
  in_progress: 'pending',
  'in-progress': 'pending',
  closed: 'check_circle',
  blocked: 'block',
  deferred: 'pause_circle',
  pinned: 'push_pin',
  hooked: 'link',
};

// Priority colors
const PRIORITY_CLASSES = {
  high: 'priority-high',
  normal: 'priority-normal',
  low: 'priority-low',
};

// Track expanded convoys
const expandedConvoys = new Set();

/**
 * Render the convoy list
 * @param {HTMLElement} container - The list container
 * @param {Array} convoys - Array of convoy objects
 */
export function renderConvoyList(container, convoys) {
  if (!container) return;

  if (!convoys || convoys.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="material-icons empty-icon">local_shipping</span>
        <h3>No Convoys</h3>
        <p>Create a new convoy to start organizing work</p>
        <button class="btn btn-primary" id="empty-new-convoy">
          <span class="material-icons">add</span>
          New Convoy
        </button>
      </div>
    `;

    // Add event listener for empty state button
    const btn = container.querySelector('#empty-new-convoy');
    if (btn) {
      btn.addEventListener('click', () => {
        document.getElementById('new-convoy-btn')?.click();
      });
    }
    return;
  }

  container.innerHTML = convoys.map((convoy, index) => renderConvoyCard(convoy, index)).join('');

  // Add event listeners
  setupConvoyEventListeners(container);
}

/**
 * Setup event listeners for convoy cards
 */
function setupConvoyEventListeners(container) {
  // Expand/collapse toggle
  container.querySelectorAll('.convoy-expand-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = btn.closest('.convoy-card');
      const convoyId = card.dataset.convoyId;
      toggleConvoyExpand(card, convoyId);
    });
  });

  // View details button
  container.querySelectorAll('[data-action="view"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = btn.closest('.convoy-card');
      const convoyId = card.dataset.convoyId;
      showConvoyDetail(convoyId);
    });
  });

  // Sling work button
  container.querySelectorAll('[data-action="sling"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = btn.closest('.convoy-card');
      const convoyId = card.dataset.convoyId;
      openSlingForConvoy(convoyId);
    });
  });

  // Card click to expand
  container.querySelectorAll('.convoy-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (!e.target.closest('button') && !e.target.closest('.convoy-detail')) {
        const convoyId = card.dataset.convoyId;
        toggleConvoyExpand(card, convoyId);
      }
    });
  });

  // Issue item clicks (expanded tree view)
  container.querySelectorAll('.issue-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const issueId = item.dataset.issueId;
      if (issueId) {
        showIssueDetail(issueId);
      }
    });
  });

  // Issue chip clicks (collapsed chip view)
  container.querySelectorAll('.issue-chip[data-issue-id]').forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      const issueId = chip.dataset.issueId;
      if (issueId) {
        showIssueDetail(issueId);
      }
    });
  });

  // Worker nudge buttons
  container.querySelectorAll('[data-action="nudge-worker"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const workerId = btn.dataset.workerId;
      if (workerId) {
        openNudgeModal(workerId);
      }
    });
  });

  // Escalate buttons
  container.querySelectorAll('[data-action="escalate"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = btn.closest('.convoy-card');
      const convoyId = card.dataset.convoyId;
      const convoyName = card.querySelector('.convoy-name')?.textContent || convoyId;
      openEscalationModal(convoyId, convoyName);
    });
  });
}

/**
 * Toggle convoy expansion
 */
function toggleConvoyExpand(card, convoyId) {
  const isExpanded = expandedConvoys.has(convoyId);

  if (isExpanded) {
    expandedConvoys.delete(convoyId);
    card.classList.remove('expanded');
    const detail = card.querySelector('.convoy-detail');
    if (detail) {
      detail.style.maxHeight = '0';
      setTimeout(() => detail.remove(), TIMING_MS.ANIMATION);
    }
  } else {
    expandedConvoys.add(convoyId);
    card.classList.add('expanded');

    // Find convoy data (from card's data attributes or fetch)
    const convoyData = getConvoyDataFromCard(card);
    const detailHtml = renderConvoyDetail(convoyData);

    // Insert detail section
    const footer = card.querySelector('.convoy-footer');
    if (footer) {
      footer.insertAdjacentHTML('beforebegin', detailHtml);
      const detail = card.querySelector('.convoy-detail');
      if (detail) {
        // Trigger animation
        requestAnimationFrame(() => {
          detail.style.maxHeight = detail.scrollHeight + 'px';
        });
      }
    }
  }

  // Update expand button icon
  const expandBtn = card.querySelector('.convoy-expand-btn .material-icons');
  if (expandBtn) {
    expandBtn.textContent = expandedConvoys.has(convoyId) ? 'expand_less' : 'expand_more';
  }
}

/**
 * Get convoy data from card element
 */
function getConvoyDataFromCard(card) {
  // Parse data from card's data attributes
  return {
    id: card.dataset.convoyId,
    name: card.querySelector('.convoy-name')?.textContent || '',
    issues: JSON.parse(card.dataset.issues || '[]'),
    workers: JSON.parse(card.dataset.workers || '[]'),
    status: card.dataset.status || 'pending',
  };
}

/**
 * Render a single convoy card
 */
function renderConvoyCard(convoy, index) {
  const status = convoy.status || 'pending';
  const statusIcon = STATUS_ICONS[status] || 'help';
  const priorityClass = PRIORITY_CLASSES[convoy.priority] || '';
  const progress = calculateProgress(convoy);
  const isExpanded = expandedConvoys.has(convoy.id);

  return `
    <div class="convoy-card animate-spawn ${getStaggerClass(index)} ${isExpanded ? 'expanded' : ''}"
         data-convoy-id="${escapeAttr(convoy.id)}"
         data-status="${escapeAttr(status)}"
         data-issues='${escapeAttr(JSON.stringify(convoy.issues || []))}'
         data-workers='${escapeAttr(JSON.stringify(convoy.workers || []))}'>
      <div class="convoy-header">
        <button class="btn btn-icon convoy-expand-btn" title="Expand">
          <span class="material-icons">${isExpanded ? 'expand_less' : 'expand_more'}</span>
        </button>
        <div class="convoy-status status-${status}">
          <span class="material-icons ${status === 'running' ? 'spin' : ''}">${statusIcon}</span>
        </div>
        <div class="convoy-info">
          <h3 class="convoy-name">${escapeHtml(convoy.name || convoy.id)}</h3>
          <div class="convoy-meta">
            <span class="convoy-id">#${convoy.id?.slice(0, 8) || 'unknown'}</span>
            ${convoy.priority ? `<span class="convoy-priority ${priorityClass}">${convoy.priority}</span>` : ''}
          </div>
        </div>
        <div class="convoy-actions">
          <button class="btn btn-icon" title="Sling Work" data-action="sling">
            <span class="material-icons">send</span>
          </button>
          <button class="btn btn-icon" title="Escalate" data-action="escalate">
            <span class="material-icons">priority_high</span>
          </button>
          <button class="btn btn-icon" title="View Details" data-action="view">
            <span class="material-icons">visibility</span>
          </button>
        </div>
      </div>

      ${convoy.issues?.length ? renderIssueChips(convoy.issues) : ''}

      <div class="convoy-progress">
        <div class="progress-bar">
          <div class="progress-fill animate-progress" style="width: ${progress}%"></div>
        </div>
        <span class="progress-text">${progress}%</span>
      </div>

      ${isExpanded ? renderConvoyDetail(convoy) : ''}

      <div class="convoy-footer">
        <div class="convoy-stats">
          ${renderConvoyStats(convoy)}
        </div>
        <div class="convoy-time">
          ${formatTimeAgoOrDate(convoy.created_at || convoy.timestamp, { justNowLabel: 'Just now' })}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render expandable convoy detail section
 */
function renderConvoyDetail(convoy) {
  const issues = convoy.issues || [];

  return `
    <div class="convoy-detail" style="max-height: ${expandedConvoys.has(convoy.id) ? 'none' : '0'}">
      <div class="convoy-detail-section">
        <h4><span class="material-icons">assignment</span> Issues (${issues.length})</h4>
        ${issues.length > 0 ? renderIssueTree(issues) : '<p class="empty-hint">No issues tracked</p>'}
      </div>

      <div class="convoy-detail-section">
        <h4><span class="material-icons">analytics</span> Progress Breakdown</h4>
        ${renderProgressBreakdown(convoy)}
      </div>
    </div>
  `;
}

/**
 * Render issue tree with status indicators
 */
function renderIssueTree(issues) {
  return `
    <div class="issue-tree">
      ${issues.map(issue => {
        const issueObj = typeof issue === 'string' ? { title: issue, status: 'open' } : issue;
        const status = issueObj.status || 'open';
        const icon = ISSUE_STATUS_ICONS[status] || 'radio_button_unchecked';

        return `
          <div class="issue-item status-${status}" data-issue-id="${issueObj.id || ''}">
            <span class="material-icons issue-status-icon">${icon}</span>
            <span class="issue-title">${escapeHtml(issueObj.title || issueObj)}</span>
            ${issueObj.assignee ? `<span class="issue-assignee">→ ${escapeHtml(issueObj.assignee)}</span>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}


/**
 * Render progress breakdown visualization
 */
function renderProgressBreakdown(convoy) {
  const done = convoy.done || 0;
  const inProgress = convoy.in_progress || 0;
  const pending = convoy.pending || convoy.task_count || 0;
  const total = done + inProgress + pending;

  if (total === 0) {
    return '<p class="empty-hint">No tasks to track</p>';
  }

  const donePercent = Math.round((done / total) * 100);
  const inProgressPercent = Math.round((inProgress / total) * 100);
  const pendingPercent = 100 - donePercent - inProgressPercent;

  return `
    <div class="progress-breakdown">
      <div class="progress-bar-stacked">
        <div class="progress-segment done" style="width: ${donePercent}%" title="Done: ${done}"></div>
        <div class="progress-segment in-progress" style="width: ${inProgressPercent}%" title="In Progress: ${inProgress}"></div>
        <div class="progress-segment pending" style="width: ${pendingPercent}%" title="Pending: ${pending}"></div>
      </div>
      <div class="progress-legend">
        <span class="legend-item done"><span class="legend-dot"></span> Done (${done})</span>
        <span class="legend-item in-progress"><span class="legend-dot"></span> In Progress (${inProgress})</span>
        <span class="legend-item pending"><span class="legend-dot"></span> Pending (${pending})</span>
      </div>
    </div>
  `;
}

/**
 * Render issue chips (collapsed view)
 */
function renderIssueChips(issues) {
  const maxVisible = 3;
  const visible = issues.slice(0, maxVisible);
  const remaining = issues.length - maxVisible;

  return `
    <div class="convoy-issues">
      ${visible.map(issue => {
        const issueObj = typeof issue === 'string' ? { title: issue } : issue;
        const status = issueObj.status || 'open';
        return `
          <div class="issue-chip status-${status}" title="${escapeHtml(issueObj.title || issueObj)}"
               ${issueObj.id ? `data-issue-id="${escapeAttr(issueObj.id)}"` : ''}>
            <span class="material-icons">${ISSUE_STATUS_ICONS[status] || 'assignment'}</span>
            ${escapeHtml(truncate(issueObj.title || issueObj, 20))}
          </div>
        `;
      }).join('')}
      ${remaining > 0 ? `
        <div class="issue-chip more">+${remaining} more</div>
      ` : ''}
    </div>
  `;
}

/**
 * Render convoy statistics
 */
function renderConvoyStats(convoy) {
  const stats = [];

  if (convoy.agent_count !== undefined || convoy.workers?.length) {
    const count = convoy.agent_count ?? convoy.workers?.length ?? 0;
    stats.push(`<span title="Workers"><span class="material-icons">person</span>${count}</span>`);
  }
  if (convoy.task_count !== undefined) {
    stats.push(`<span title="Tasks"><span class="material-icons">task</span>${convoy.task_count}</span>`);
  }
  if (convoy.bead_count !== undefined || convoy.issues?.length) {
    const count = convoy.bead_count ?? convoy.issues?.length ?? 0;
    stats.push(`<span title="Issues"><span class="material-icons">bubble_chart</span>${count}</span>`);
  }

  return stats.join('');
}

/**
 * Calculate progress percentage
 */
function calculateProgress(convoy) {
  if (convoy.progress !== undefined) {
    return Math.round(convoy.progress * 100);
  }
  if (convoy.done !== undefined && convoy.task_count) {
    return Math.round((convoy.done / convoy.task_count) * 100);
  }
  if (convoy.completed && convoy.total) {
    return Math.round((convoy.completed / convoy.total) * 100);
  }
  if (convoy.status === 'complete') return 100;
  if (convoy.status === 'pending') return 0;
  if (convoy.status === 'running') return 50;
  return 0;
}

/**
 * Show convoy detail modal
 */
function showConvoyDetail(convoyId) {
  const event = new CustomEvent(CONVOY_DETAIL, { detail: { convoyId } });
  document.dispatchEvent(event);
}

/**
 * Open sling modal for a specific convoy
 */
function openSlingForConvoy(convoyId) {
  const event = new CustomEvent(SLING_OPEN, { detail: { convoyId } });
  document.dispatchEvent(event);
  // Also trigger the modal
  document.getElementById('sling-btn')?.click();
}

/**
 * Show issue detail in the bead detail modal
 */
function showIssueDetail(issueId) {
  const event = new CustomEvent(BEAD_DETAIL, { detail: { beadId: issueId } });
  document.dispatchEvent(event);
}

/**
 * Open nudge modal for a worker
 */
function openNudgeModal(workerId) {
  const event = new CustomEvent(AGENT_NUDGE, { detail: { agentId: workerId } });
  document.dispatchEvent(event);
}

/**
 * Open escalation modal for a convoy
 */
function openEscalationModal(convoyId, convoyName) {
  const event = new CustomEvent(CONVOY_ESCALATE, {
    detail: { convoyId, convoyName }
  });
  document.dispatchEvent(event);
}

