/**
 * Gas Town GUI - Graph Insights Component
 *
 * Renders project health, critical path, top blockers, and stale items
 * from the /api/beads/insights endpoint.
 */

import { BEAD_DETAIL } from '../shared/events.js';
import { escapeHtml, escapeAttr } from '../utils/html.js';

const STATUS_COLORS = {
  open: { label: 'Open', color: 'var(--accent-warning)' },
  in_progress: { label: 'In Progress', color: 'var(--accent-primary)' },
  'in-progress': { label: 'In Progress', color: 'var(--accent-primary)' },
  blocked: { label: 'Blocked', color: 'var(--accent-danger)' },
  closed: { label: 'Closed', color: 'var(--accent-success)' },
  deferred: { label: 'Deferred', color: 'var(--text-muted)' },
  hooked: { label: 'Hooked', color: 'var(--accent-primary)' },
  pinned: { label: 'Pinned', color: 'var(--accent-warning)' },
};

/**
 * Render the insights dashboard
 * @param {HTMLElement} container
 * @param {Object} insights - Response from /api/beads/insights
 */
export function renderGraphInsights(container, insights) {
  if (!container) return;

  if (!insights) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="material-icons empty-icon">analytics</span>
        <h3>No Insights Available</h3>
        <p>Unable to compute project insights</p>
      </div>
    `;
    return;
  }

  const { health, criticalPath, topBlockers, staleItems } = insights;

  container.innerHTML = `
    <div class="insights-dashboard">
      ${renderHealthSection(health)}
      <div class="insights-grid">
        ${renderCriticalPath(criticalPath)}
        ${renderTopBlockers(topBlockers)}
      </div>
      ${renderStaleItems(staleItems)}
    </div>
  `;

  // Wire click handlers for bead links
  container.querySelectorAll('[data-insight-bead]').forEach(el => {
    el.addEventListener('click', () => {
      const beadId = el.dataset.insightBead;
      document.dispatchEvent(new CustomEvent(BEAD_DETAIL, {
        detail: { beadId, bead: { id: beadId } },
      }));
    });
  });
}

function renderHealthSection(health) {
  if (!health) return '';

  const { statusCounts, typeCounts, totalBeads, avgAgeDays, staleCount } = health;

  const statusEntries = Object.entries(statusCounts).sort((a, b) => b[1] - a[1]);
  const maxCount = Math.max(...statusEntries.map(([, c]) => c), 1);

  return `
    <div class="insights-section">
      <div class="insights-section-header">
        <span class="material-icons">monitoring</span>
        <h3>Project Health</h3>
      </div>
      <div class="insights-health-summary">
        <div class="health-stat">
          <span class="health-stat-value">${totalBeads}</span>
          <span class="health-stat-label">Total Beads</span>
        </div>
        <div class="health-stat">
          <span class="health-stat-value">${avgAgeDays}d</span>
          <span class="health-stat-label">Avg Age</span>
        </div>
        <div class="health-stat ${staleCount > 0 ? 'health-stat-warn' : ''}">
          <span class="health-stat-value">${staleCount}</span>
          <span class="health-stat-label">Stale (&gt;7d)</span>
        </div>
      </div>
      <div class="insights-status-chart">
        ${statusEntries.map(([status, count]) => {
          const cfg = STATUS_COLORS[status] || { label: status, color: 'var(--text-muted)' };
          const pct = Math.round((count / maxCount) * 100);
          return `
            <div class="status-bar-row">
              <span class="status-bar-label">${escapeHtml(cfg.label)}</span>
              <div class="status-bar-track">
                <div class="status-bar-fill" style="width: ${pct}%; background: ${cfg.color}"></div>
              </div>
              <span class="status-bar-count">${count}</span>
            </div>
          `;
        }).join('')}
      </div>
      ${Object.keys(typeCounts).length > 0 ? `
        <div class="insights-type-chips">
          ${Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).map(([type, count]) => `
            <span class="type-chip">${escapeHtml(type)} <strong>${count}</strong></span>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderCriticalPath(criticalPath) {
  if (!criticalPath || criticalPath.length === 0) {
    return `
      <div class="insights-section insights-half">
        <div class="insights-section-header">
          <span class="material-icons">route</span>
          <h3>Critical Path</h3>
        </div>
        <div class="insights-empty">No blocking chains found</div>
      </div>
    `;
  }

  return `
    <div class="insights-section insights-half">
      <div class="insights-section-header">
        <span class="material-icons">route</span>
        <h3>Critical Path</h3>
        <span class="insights-badge">${criticalPath.length} deep</span>
      </div>
      <div class="insights-chain">
        ${criticalPath.map((item, i) => {
          const cfg = STATUS_COLORS[item.status] || { label: item.status, color: 'var(--text-muted)' };
          const isLast = i === criticalPath.length - 1;
          return `
            <div class="chain-item" data-insight-bead="${escapeAttr(item.id)}">
              <div class="chain-connector">
                <span class="chain-dot" style="background: ${cfg.color}"></span>
                ${!isLast ? '<span class="chain-line"></span>' : ''}
              </div>
              <div class="chain-content">
                <span class="chain-title">${escapeHtml(item.title)}</span>
                <span class="chain-meta">${escapeHtml(item.id)} &middot; ${escapeHtml(cfg.label)}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderTopBlockers(topBlockers) {
  if (!topBlockers || topBlockers.length === 0) {
    return `
      <div class="insights-section insights-half">
        <div class="insights-section-header">
          <span class="material-icons">block</span>
          <h3>Top Blockers</h3>
        </div>
        <div class="insights-empty">No blockers found</div>
      </div>
    `;
  }

  return `
    <div class="insights-section insights-half">
      <div class="insights-section-header">
        <span class="material-icons">block</span>
        <h3>Top Blockers</h3>
      </div>
      <div class="insights-blocker-list">
        ${topBlockers.map(item => {
          const cfg = STATUS_COLORS[item.status] || { label: item.status, color: 'var(--text-muted)' };
          return `
            <div class="blocker-item" data-insight-bead="${escapeAttr(item.id)}">
              <div class="blocker-count" style="color: ${cfg.color}">${item.blockCount}</div>
              <div class="blocker-info">
                <span class="blocker-title">${escapeHtml(item.title)}</span>
                <span class="blocker-meta">${escapeHtml(item.id)} &middot; ${escapeHtml(cfg.label)}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderStaleItems(staleItems) {
  if (!staleItems || staleItems.length === 0) {
    return `
      <div class="insights-section">
        <div class="insights-section-header">
          <span class="material-icons">schedule</span>
          <h3>Stale Items</h3>
        </div>
        <div class="insights-empty">No stale items (&gt;7 days)</div>
      </div>
    `;
  }

  return `
    <div class="insights-section">
      <div class="insights-section-header">
        <span class="material-icons">schedule</span>
        <h3>Stale Items</h3>
        <span class="insights-badge insights-badge-warn">${staleItems.length} items</span>
      </div>
      <div class="insights-stale-list">
        ${staleItems.map(item => {
          const cfg = STATUS_COLORS[item.status] || { label: item.status, color: 'var(--text-muted)' };
          return `
            <div class="stale-item" data-insight-bead="${escapeAttr(item.id)}">
              <span class="stale-age">${item.ageDays}d</span>
              <span class="stale-title">${escapeHtml(item.title)}</span>
              <span class="stale-id">${escapeHtml(item.id)}</span>
              <span class="stale-status" style="color: ${cfg.color}">${escapeHtml(cfg.label)}</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}
