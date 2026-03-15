/**
 * Gas Town GUI - Convoy List Component
 *
 * Renders the list of convoys with status, progress, and actions.
 * Phase 3: Added expandable detail view, issue tree, worker panel.
 */

import { escapeHtml, escapeAttr } from '../utils/html.js';
import { formatTimeAgoOrDate } from '../utils/formatting.js';
import { TIMING_MS } from '../shared/timing.js';
import { AGENT_NUDGE, BEAD_DETAIL, CONVOY_DETAIL, CONVOY_ESCALATE, SLING_OPEN, dispatchEvent } from '../shared/events.js';
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

  // Land integration branch buttons
  container.querySelectorAll('[data-action="land-branch"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const convoyId = btn.dataset.convoyId;
      if (convoyId && !btn.disabled) {
        landIntegrationBranch(convoyId);
      }
    });
  });

  // Create integration branch buttons
  container.querySelectorAll('[data-action="create-ib"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const convoyId = btn.dataset.convoyId;
      if (convoyId) {
        createIntegrationBranch(convoyId);
      }
    });
  });

  // Refresh integration branch status buttons
  container.querySelectorAll('[data-action="refresh-ib"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const convoyId = btn.dataset.convoyId;
      if (convoyId) {
        refreshIntegrationBranchStatus(convoyId);
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
        // Attach click handlers to dynamically added issue items
        detail.querySelectorAll('.issue-item').forEach(item => {
          item.addEventListener('click', (e) => {
            e.stopPropagation();
            const issueId = item.dataset.issueId;
            if (issueId) {
              showIssueDetail(issueId);
            }
          });
        });

        // Attach integration branch action handlers
        attachIntegrationBranchListeners(detail);

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
  const integrationBranch = card.dataset.integrationBranch
    ? JSON.parse(card.dataset.integrationBranch)
    : null;
  return {
    id: card.dataset.convoyId,
    name: card.querySelector('.convoy-name')?.textContent || '',
    issues: JSON.parse(card.dataset.issues || '[]'),
    workers: JSON.parse(card.dataset.workers || '[]'),
    status: card.dataset.status || 'pending',
    integration_branch: integrationBranch,
    agent_count: parseInt(card.dataset.agentCount || '0', 10),
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
         data-workers='${escapeAttr(JSON.stringify(convoy.workers || []))}'
         data-agent-count="${convoy.agent_count ?? convoy.workers?.length ?? 0}"
         ${convoy.integration_branch ? `data-integration-branch='${escapeAttr(JSON.stringify(convoy.integration_branch))}'` : ''}>
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

      ${isStranded(convoy) ? `
        <div class="convoy-stranded-indicator">
          <span class="material-icons">warning</span>
          <span>Stranded — ready work with no assigned workers</span>
        </div>
      ` : ''}

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
  const ib = convoy.integration_branch || null;

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

      <div class="convoy-detail-section">
        <h4><span class="material-icons">merge_type</span> Integration Branch</h4>
        ${ib ? renderIntegrationBranchPanel(convoy.id, ib) : renderNoIntegrationBranch(convoy.id)}
      </div>
    </div>
  `;
}

/**
 * Render integration branch status panel
 */
function renderIntegrationBranchPanel(convoyId, ib) {
  const branchName = ib.branch || ib.name || 'unknown';
  const baseBranch = ib.base_branch || 'main';
  const commitsAhead = ib.commits_ahead ?? 0;
  const commitsBehind = ib.commits_behind ?? null;
  const mergedMRs = ib.merged_mrs ?? ib.merged ?? 0;
  const pendingMRs = ib.pending_mrs ?? ib.pending ?? 0;
  const totalMRs = mergedMRs + pendingMRs;
  const readyToLand = ib.ready_to_land === true;
  const autoLand = ib.auto_land === true;

  const gateResults = ib.gates || null;

  return `
    <div class="integration-branch-panel">
      <div class="ib-branch-info">
        <span class="ib-branch-name" title="${escapeAttr(branchName)}">
          <span class="material-icons">account_tree</span>
          ${escapeHtml(branchName)}
        </span>
        <span class="ib-base-branch">from ${escapeHtml(baseBranch)}</span>
      </div>

      <div class="ib-stats-row">
        <span class="ib-stat" title="Commits ahead of ${escapeAttr(baseBranch)}">
          <span class="material-icons">arrow_upward</span>
          ${commitsAhead} ahead
        </span>
        ${commitsBehind !== null ? `
          <span class="ib-stat ${commitsBehind > 0 ? 'ib-stat-warn' : ''}" title="Commits behind ${escapeAttr(baseBranch)}">
            <span class="material-icons">arrow_downward</span>
            ${commitsBehind} behind
          </span>
        ` : ''}
        <span class="ib-stat" title="Merge requests">
          <span class="material-icons">merge</span>
          ${mergedMRs}/${totalMRs} MRs merged
        </span>
      </div>

      ${gateResults ? renderGateResults(gateResults) : ''}

      <div class="ib-status-row">
        ${readyToLand
          ? '<span class="ib-ready"><span class="material-icons">check_circle</span> Ready to land</span>'
          : '<span class="ib-not-ready"><span class="material-icons">schedule</span> Not ready to land</span>'
        }
        ${autoLand
          ? '<span class="ib-auto-land"><span class="material-icons">autorenew</span> Auto-land enabled</span>'
          : ''
        }
      </div>

      <div class="ib-actions">
        ${readyToLand ? `
          <button class="btn btn-sm btn-primary" data-action="land-branch" data-convoy-id="${escapeAttr(convoyId)}" title="Land integration branch to ${escapeAttr(baseBranch)}">
            <span class="material-icons">merge</span> Land
          </button>
        ` : `
          <button class="btn btn-sm" data-action="land-branch" data-convoy-id="${escapeAttr(convoyId)}" disabled title="All children must be closed and MRs merged before landing">
            <span class="material-icons">merge</span> Land
          </button>
        `}
        <button class="btn btn-sm" data-action="refresh-ib" data-convoy-id="${escapeAttr(convoyId)}" title="Refresh integration branch status">
          <span class="material-icons">refresh</span>
        </button>
      </div>
    </div>
  `;
}

/**
 * Render gate results for integration branch
 */
function renderGateResults(gates) {
  const gateNames = ['build', 'typecheck', 'lint', 'test'];
  const configured = gateNames.filter(g => gates[g] !== undefined);
  if (configured.length === 0) return '';

  return `
    <div class="ib-gates">
      ${configured.map(name => {
        const result = gates[name];
        const passed = result === 'pass' || result === true;
        const failed = result === 'fail' || result === false;
        const icon = passed ? 'check_circle' : failed ? 'cancel' : 'radio_button_unchecked';
        const cls = passed ? 'gate-pass' : failed ? 'gate-fail' : 'gate-pending';
        return `<span class="ib-gate ${cls}" title="${escapeAttr(name)}: ${result}">
          <span class="material-icons">${icon}</span> ${escapeHtml(name)}
        </span>`;
      }).join('')}
    </div>
  `;
}

/**
 * Render placeholder when no integration branch exists
 */
function renderNoIntegrationBranch(convoyId) {
  return `
    <div class="integration-branch-empty">
      <p class="empty-hint">No integration branch configured</p>
      <button class="btn btn-sm" data-action="create-ib" data-convoy-id="${escapeAttr(convoyId)}" title="Create an integration branch for this convoy">
        <span class="material-icons">add</span> Create Integration Branch
      </button>
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
            ${issueObj.rig ? `<span class="bead-rig-badge" title="Rig: ${escapeHtml(issueObj.rig)}">${escapeHtml(issueObj.rig)}</span>` : ''}
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
 * Check if a convoy is stranded (has ready work but no assigned workers)
 */
function isStranded(convoy) {
  if (convoy.stranded) return true;
  const issues = convoy.issues || [];
  const hasReadyWork = issues.some(i => {
    const status = typeof i === 'string' ? 'open' : (i.status || 'open');
    return status === 'open';
  });
  const workerCount = convoy.agent_count ?? convoy.workers?.length ?? 0;
  return hasReadyWork && workerCount === 0 && convoy.status !== 'complete';
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

/**
 * Attach event listeners to integration branch buttons within a container
 */
function attachIntegrationBranchListeners(container) {
  container.querySelectorAll('[data-action="land-branch"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const convoyId = btn.dataset.convoyId;
      if (convoyId && !btn.disabled) landIntegrationBranch(convoyId);
    });
  });
  container.querySelectorAll('[data-action="create-ib"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const convoyId = btn.dataset.convoyId;
      if (convoyId) createIntegrationBranch(convoyId);
    });
  });
  container.querySelectorAll('[data-action="refresh-ib"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const convoyId = btn.dataset.convoyId;
      if (convoyId) refreshIntegrationBranchStatus(convoyId);
    });
  });
}

/**
 * Land integration branch for a convoy
 */
async function landIntegrationBranch(convoyId) {
  if (!confirm('Land integration branch to main? This merges all convoy work.')) return;

  try {
    const res = await fetch(`/api/convoy/${encodeURIComponent(convoyId)}/integration-branch/land`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(`Failed to land: ${data.error || 'Unknown error'}`);
      return;
    }
    dispatchEvent(CONVOY_DETAIL, { convoyId, refresh: true });
  } catch (err) {
    alert(`Failed to land: ${err.message}`);
  }
}

/**
 * Create integration branch for a convoy
 */
async function createIntegrationBranch(convoyId) {
  try {
    const res = await fetch(`/api/convoy/${encodeURIComponent(convoyId)}/integration-branch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(`Failed to create integration branch: ${data.error || 'Unknown error'}`);
      return;
    }
    dispatchEvent(CONVOY_DETAIL, { convoyId, refresh: true });
  } catch (err) {
    alert(`Failed to create integration branch: ${err.message}`);
  }
}

/**
 * Refresh integration branch status for a convoy
 */
async function refreshIntegrationBranchStatus(convoyId) {
  try {
    const res = await fetch(`/api/convoy/${encodeURIComponent(convoyId)}/integration-branch/status`);
    const data = await res.json();
    if (!res.ok) return;

    // Update the panel in-place if visible
    const card = document.querySelector(`.convoy-card[data-convoy-id="${CSS.escape(convoyId)}"]`);
    if (!card) return;

    const section = card.querySelector('.integration-branch-panel, .integration-branch-empty');
    if (section) {
      const parent = section.parentElement;
      const newHtml = data.branch
        ? renderIntegrationBranchPanel(convoyId, data)
        : renderNoIntegrationBranch(convoyId);
      parent.innerHTML = `<h4><span class="material-icons">merge_type</span> Integration Branch</h4>${newHtml}`;
    }
  } catch {
    // Silently ignore refresh failures
  }
}

