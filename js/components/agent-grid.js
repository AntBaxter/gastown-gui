/**
 * Gas Town GUI - Agent Grid Component
 *
 * Renders agents in a responsive grid layout with status and actions.
 */

import { AGENT_TYPES, STATUS_ICONS, STATUS_COLORS, getAgentConfig, formatAgentName, getDisplayStatus } from '../shared/agent-types.js';
import { AGENT_DETAIL, AGENT_NUDGE, AGENT_PEEK, POLECAT_ACTION } from '../shared/events.js';
import { escapeHtml, truncate } from '../utils/html.js';
import { getStaggerClass } from '../shared/animations.js';

/**
 * Render the agent grid
 * @param {HTMLElement} container - The grid container
 * @param {Array} agents - Array of agent objects
 */
export function renderAgentGrid(container, agents) {
  if (!container) return;

  if (!agents || agents.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="material-icons empty-icon">group</span>
        <h3>No Agents</h3>
        <p>Agents will appear here when work is dispatched</p>
      </div>
    `;
    return;
  }

  container.innerHTML = agents.map((agent, index) => renderAgentCard(agent, index)).join('');

  // Add event listeners for agent actions
  container.querySelectorAll('.agent-card').forEach(card => {
    const agentId = card.dataset.agentId;

    card.addEventListener('click', (e) => {
      if (!e.target.closest('button')) {
        showAgentDetail(agentId);
      }
    });

    // Nudge button
    const nudgeBtn = card.querySelector('[data-action="nudge"]');
    if (nudgeBtn) {
      nudgeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showNudgeModal(agentId);
      });
    }

    // Polecat start button
    const startBtn = card.querySelector('[data-action="start"]');
    if (startBtn) {
      startBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handlePolecatAction(agentId, 'start');
      });
    }

    // Polecat stop button
    const stopBtn = card.querySelector('[data-action="stop"]');
    if (stopBtn) {
      stopBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handlePolecatAction(agentId, 'stop');
      });
    }

    // Polecat restart button
    const restartBtn = card.querySelector('[data-action="restart"]');
    if (restartBtn) {
      restartBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handlePolecatAction(agentId, 'restart');
      });
    }

    // Peek/view output button
    const peekBtn = card.querySelector('[data-action="peek"]');
    if (peekBtn) {
      peekBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showAgentOutput(agentId);
      });
    }
  });
}

/**
 * Render a single agent card
 */
function renderAgentCard(agent, index) {
  const role = agent.role?.toLowerCase() || 'polecat';
  const agentConfig = getAgentConfig(agent.address || agent.id, role);
  const status = getDisplayStatus(agent);
  const statusIcon = STATUS_ICONS[status] || STATUS_ICONS.idle;
  const statusColor = STATUS_COLORS[status] || STATUS_COLORS.idle;

  return `
	    <div class="agent-card animate-spawn ${getStaggerClass(index)}"
	         data-agent-id="${agent.id || agent.address}"
	         style="--agent-color: ${agentConfig.color}">
      <div class="agent-header">
        <div class="agent-avatar" style="background-color: ${agentConfig.color}20; border-color: ${agentConfig.color}">
          <span class="material-icons" style="color: ${agentConfig.color}">${agentConfig.icon}</span>
        </div>
        <div class="agent-info">
          <h3 class="agent-name">${escapeHtml(agent.name || formatAgentName(agent.id))}</h3>
          <div class="agent-role" style="color: ${agentConfig.color}">${agentConfig.label}</div>
        </div>
        <div class="agent-status status-${status}">
          <span class="material-icons" style="color: ${statusColor}">${statusIcon}</span>
        </div>
      </div>

      ${agent.current_task ? `
        <div class="agent-task">
          <span class="material-icons">task</span>
          <span class="task-text">${escapeHtml(truncate(agent.current_task, 40))}</span>
        </div>
      ` : ''}

      ${agent.progress !== undefined ? `
        <div class="agent-progress">
          <div class="progress-bar small">
            <div class="progress-fill" style="width: ${Math.round(agent.progress * 100)}%"></div>
          </div>
        </div>
      ` : ''}

      <div class="agent-footer">
        <div class="agent-stats">
          ${renderAgentStats(agent)}
        </div>
        <div class="agent-actions">
          ${renderAgentActions(agent, role, status)}
        </div>
      </div>

      ${status === 'working' ? '<div class="agent-pulse"></div>' : ''}
    </div>
  `;
}

/**
 * Render agent action buttons based on role and status
 */
function renderAgentActions(agent, role, status) {
  const actions = [];

  // Common actions
  actions.push(`
    <button class="btn btn-icon btn-sm" title="Nudge Agent" data-action="nudge">
      <span class="material-icons">notifications_active</span>
    </button>
  `);

  // Polecat-specific actions
  if (role === 'polecat') {
    if (status === 'running' || status === 'working') {
      actions.push(`
        <button class="btn btn-icon btn-sm btn-danger" title="Stop Polecat" data-action="stop">
          <span class="material-icons">stop</span>
        </button>
        <button class="btn btn-icon btn-sm" title="Restart Polecat" data-action="restart">
          <span class="material-icons">refresh</span>
        </button>
      `);
    } else {
      actions.push(`
        <button class="btn btn-icon btn-sm btn-success" title="Start Polecat" data-action="start">
          <span class="material-icons">play_arrow</span>
        </button>
      `);
    }
  }

  // View output button for agents with output
  if (role === 'polecat' || role === 'mayor' || role === 'witness') {
    actions.push(`
      <button class="btn btn-icon btn-sm" title="View Output" data-action="peek">
        <span class="material-icons">visibility</span>
      </button>
    `);
  }

  actions.push(`
    <button class="btn btn-icon btn-sm" title="View Details" data-action="view">
      <span class="material-icons">info</span>
    </button>
  `);

  return actions.join('');
}

/**
 * Render agent statistics
 */
function renderAgentStats(agent) {
  const stats = [];

  if (agent.tasks_completed !== undefined) {
    stats.push(`
      <span class="agent-stat" title="Tasks Completed">
        <span class="material-icons">check</span>${agent.tasks_completed}
      </span>
    `);
  }

  if (agent.uptime) {
    stats.push(`
      <span class="agent-stat" title="Uptime">
        <span class="material-icons">timer</span>${formatDuration(agent.uptime)}
      </span>
    `);
  }

  if (agent.convoy_id) {
    stats.push(`
      <span class="agent-stat" title="Convoy">
        <span class="material-icons">local_shipping</span>${agent.convoy_id.slice(0, 6)}
      </span>
    `);
  }

  return stats.join('');
}

/**
 * Show agent detail modal
 */
function showAgentDetail(agentId) {
  const event = new CustomEvent(AGENT_DETAIL, { detail: { agentId } });
  document.dispatchEvent(event);
}

/**
 * Show nudge modal for an agent
 */
function showNudgeModal(agentId) {
  const event = new CustomEvent(AGENT_NUDGE, { detail: { agentId } });
  document.dispatchEvent(event);
}

/**
 * Handle polecat start/stop/restart actions
 * @param {string} agentId - The agent ID (format: rig/name)
 * @param {string} action - 'start', 'stop', or 'restart'
 */
async function handlePolecatAction(agentId, action) {
  // Parse rig and polecat name from agentId (format: "rig/name" or "rig/Polecat-name")
  const parts = agentId.split('/');
  if (parts.length < 2) {
    console.error('Invalid agent ID format:', agentId);
    return;
  }

  const rig = parts[0];
  const name = parts.slice(1).join('/');

  // Dispatch event for API call (handled by app.js or api.js)
  const event = new CustomEvent(POLECAT_ACTION, {
    detail: { rig, name, action, agentId }
  });
  document.dispatchEvent(event);
}

/**
 * Show agent output in peek modal
 */
function showAgentOutput(agentId) {
  const event = new CustomEvent(AGENT_PEEK, { detail: { agentId } });
  document.dispatchEvent(event);
}

// Utility functions
function formatDuration(seconds) {
  if (!seconds) return '0s';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}
