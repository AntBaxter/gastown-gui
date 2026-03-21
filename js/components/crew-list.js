/**
 * Gas Town GUI - Crew List Component
 *
 * Renders the list of crews (teams of polecats) with their status.
 */

import { api } from '../api.js';
import { showToast } from './toast.js';
import { CREW_REFRESH, MODAL_CLOSE, MODAL_SHOW } from '../shared/events.js';
import { escapeHtml } from '../utils/html.js';
import { getStaggerClass } from '../shared/animations.js';
import { state } from '../state.js';

let currentCrews = [];

/**
 * Render the crew list
 * @param {HTMLElement} container - The crew list container
 * @param {Array} crews - Array of crew objects
 */
export function renderCrewList(container, crews) {
  if (!container) return;

  currentCrews = crews || [];

  if (!crews || crews.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="material-icons empty-icon">group_off</span>
        <h3>No Crews</h3>
        <p>Create a crew to group polecats for coordinated work</p>
        <button class="btn btn-primary" id="empty-new-crew-btn">
          <span class="material-icons">group_add</span>
          Create First Crew
        </button>
      </div>
    `;

    const emptyBtn = container.querySelector('#empty-new-crew-btn');
    if (emptyBtn) {
      emptyBtn.addEventListener('click', () => showNewCrewModal());
    }
    return;
  }

  container.innerHTML = `
    <div class="crew-grid">
      ${crews.map((crew, index) => renderCrewCard(crew, index)).join('')}
    </div>
  `;

  // Add event listeners
  container.querySelectorAll('.crew-card').forEach(card => {
    const crewName = card.dataset.crewName;

    // View status
    card.querySelector('[data-action="status"]')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await showCrewStatus(crewName);
    });

    // Remove crew
    card.querySelector('[data-action="remove"]')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await handleCrewRemove(crewName);
    });
  });
}

/**
 * Render a single crew card
 */
function renderCrewCard(crew, index) {
  const memberCount = (crew.members || []).length;
  const statusClass = crew.status === 'active' ? 'status-active' : 'status-inactive';
  const statusIcon = crew.status === 'active' ? 'check_circle' : 'pause_circle';

  return `
    <div class="crew-card animate-spawn ${getStaggerClass(index)}" data-crew-name="${escapeHtml(crew.name)}">
      <div class="crew-header">
        <div class="crew-icon">
          <span class="material-icons">groups</span>
        </div>
        <div class="crew-info">
          <h3 class="crew-name">${escapeHtml(crew.name)}</h3>
          <div class="crew-meta">
            ${crew.rig ? `<span class="crew-rig">
              <span class="material-icons">folder</span>
              ${escapeHtml(crew.rig)}
            </span>` : '<span class="crew-no-rig">No rig assigned</span>'}
          </div>
        </div>
        <div class="crew-status ${statusClass}">
          <span class="material-icons">${statusIcon}</span>
          <span>${crew.status || 'unknown'}</span>
        </div>
      </div>

      <div class="crew-stats">
        <div class="crew-stat">
          <span class="material-icons">smart_toy</span>
          <span class="stat-value">${memberCount}</span>
          <span class="stat-label">Members</span>
        </div>
        ${crew.active_tasks !== undefined ? `
        <div class="crew-stat">
          <span class="material-icons">pending_actions</span>
          <span class="stat-value">${crew.active_tasks}</span>
          <span class="stat-label">Active Tasks</span>
        </div>
        ` : ''}
        ${crew.completed_tasks !== undefined ? `
        <div class="crew-stat">
          <span class="material-icons">task_alt</span>
          <span class="stat-value">${crew.completed_tasks}</span>
          <span class="stat-label">Completed</span>
        </div>
        ` : ''}
      </div>

      ${memberCount > 0 ? `
      <div class="crew-members">
        <h4>Members</h4>
        <div class="member-list">
          ${crew.members.map(member => `
            <span class="member-badge">
              <span class="material-icons">smart_toy</span>
              ${escapeHtml(member)}
            </span>
          `).join('')}
        </div>
      </div>
      ` : ''}

      <div class="crew-actions">
        <button class="btn btn-sm btn-icon" data-action="status" title="View Status">
          <span class="material-icons">info</span>
        </button>
        <button class="btn btn-sm btn-icon btn-danger" data-action="remove" title="Remove Crew">
          <span class="material-icons">delete</span>
        </button>
      </div>
    </div>
  `;
}

/**
 * Show crew status details
 */
async function showCrewStatus(name) {
  try {
    showToast('Loading crew status...', 'info');
    const status = await api.getCrewStatus(name);

    // Dispatch event to show status in a modal
    document.dispatchEvent(new CustomEvent(MODAL_SHOW, {
      detail: {
        title: `Crew: ${name}`,
        content: `
          <div class="crew-status-details">
            <div class="detail-row">
              <span class="label">Status:</span>
              <span class="value">${status.status || 'unknown'}</span>
            </div>
            <div class="detail-row">
              <span class="label">Rig:</span>
              <span class="value">${status.rig || 'None'}</span>
            </div>
            <div class="detail-row">
              <span class="label">Members:</span>
              <span class="value">${(status.members || []).length}</span>
            </div>
            ${status.active_tasks !== undefined ? `
            <div class="detail-row">
              <span class="label">Active Tasks:</span>
              <span class="value">${status.active_tasks}</span>
            </div>
            ` : ''}
            ${status.completed_tasks !== undefined ? `
            <div class="detail-row">
              <span class="label">Completed Tasks:</span>
              <span class="value">${status.completed_tasks}</span>
            </div>
            ` : ''}
            ${status.created_at ? `
            <div class="detail-row">
              <span class="label">Created:</span>
              <span class="value">${new Date(status.created_at).toLocaleString()}</span>
            </div>
            ` : ''}
          </div>
        `
      }
    }));
  } catch (err) {
    showToast(`Failed to get crew status: ${err.message}`, 'error');
  }
}

/**
 * Handle crew removal
 */
async function handleCrewRemove(name) {
  if (!confirm(`Are you sure you want to remove the crew "${name}"?`)) {
    return;
  }

  try {
    showToast('Removing crew...', 'info');
    await api.removeCrew(name);
    showToast(`Crew "${name}" removed successfully`, 'success');

    // Dispatch event to refresh the list
    document.dispatchEvent(new CustomEvent(CREW_REFRESH));
  } catch (err) {
    showToast(`Failed to remove crew: ${err.message}`, 'error');
  }
}

/**
 * Show new crew creation modal
 */
export function showNewCrewModal() {
  document.dispatchEvent(new CustomEvent(MODAL_SHOW, {
    detail: {
      title: 'Create New Crew',
      content: `
        <form id="new-crew-form" class="modal-form">
          <div class="form-group">
            <label for="crew-name">Crew Name</label>
            <input type="text" id="crew-name" name="name" required placeholder="e.g., backend-team">
          </div>
          <div class="form-group">
            <label for="crew-rig">Rig (optional)</label>
            <select id="crew-rig" name="rig">
              <option value="">None</option>
            </select>
            <small class="form-help">Associate this crew with a specific rig/project</small>
          </div>
          <div class="form-actions">
            <button type="button" class="btn btn-ghost" data-action="close">Cancel</button>
            <button type="submit" class="btn btn-primary">Create Crew</button>
          </div>
        </form>
      `,
      onMount: (modal) => {
        const rigSelect = modal.querySelector('#crew-rig');
        if (rigSelect) {
          const rigs = state.getRigs();
          for (const rig of rigs) {
            const name = typeof rig === 'string' ? rig : rig.name;
            if (name) {
              const opt = document.createElement('option');
              opt.value = name;
              opt.textContent = name;
              rigSelect.appendChild(opt);
            }
          }
        }

        const form = modal.querySelector('#new-crew-form');
        form?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const formData = new FormData(form);
          const name = formData.get('name');
          const rig = formData.get('rig') || undefined;

          try {
            showToast('Creating crew...', 'info');
            await api.addCrew(name, rig);
            showToast(`Crew "${name}" created successfully`, 'success');

            // Close modal and refresh
            document.dispatchEvent(new CustomEvent(MODAL_CLOSE));
            document.dispatchEvent(new CustomEvent(CREW_REFRESH));
          } catch (err) {
            showToast(`Failed to create crew: ${err.message}`, 'error');
          }
        });
      }
    }
  }));
}

/**
 * Load and refresh crews
 */
export async function loadCrews() {
  const container = document.getElementById('crew-list-container');
  if (!container) return;

  try {
    container.innerHTML = `
      <div class="loading-state">
        <span class="material-icons spinning">sync</span>
        <span>Loading crews...</span>
      </div>
    `;

    const crews = await api.getCrews();
    renderCrewList(container, crews);
    return crews;
  } catch (err) {
    container.innerHTML = `
      <div class="error-state">
        <span class="material-icons">error</span>
        <h3>Failed to Load Crews</h3>
        <p>${escapeHtml(err.message)}</p>
        <button class="btn btn-primary" id="crew-retry-btn">
          <span class="material-icons">refresh</span>
          Retry
        </button>
      </div>
    `;

    container.querySelector('#crew-retry-btn')?.addEventListener('click', loadCrews);
    throw err;
  }
}
