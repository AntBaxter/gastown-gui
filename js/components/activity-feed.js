/**
 * Gas Town GUI - Activity Feed Component
 *
 * Renders real-time activity events from the Gastown system.
 * Supports filtering by event category and grouping consecutive similar events.
 */

import { AGENT_TYPES, getAgentConfig, formatAgentName } from '../shared/agent-types.js';
import { escapeHtml, truncate } from '../utils/html.js';
import { formatActivityFeedTime } from '../utils/formatting.js';

// Event type configuration (uses shared agent colors where applicable)
const EVENT_CONFIG = {
  // Convoy events
  convoy_created: { icon: 'local_shipping', color: '#22c55e', label: 'Convoy Created', category: 'convoy' },
  convoy_updated: { icon: 'update', color: '#3b82f6', label: 'Convoy Updated', category: 'convoy' },
  convoy_complete: { icon: 'check_circle', color: '#22c55e', label: 'Convoy Complete', category: 'convoy' },
  // Work events
  work_slung: { icon: 'send', color: '#a855f7', label: 'Work Slung', category: 'work' },
  work_complete: { icon: 'task_alt', color: '#22c55e', label: 'Work Complete', category: 'work' },
  work_failed: { icon: 'error', color: '#ef4444', label: 'Work Failed', category: 'work' },
  // Agent events
  agent_spawned: { icon: 'person_add', color: AGENT_TYPES.polecat.color, label: 'Agent Spawned', category: 'agent' },
  agent_despawned: { icon: 'person_remove', color: '#6b7280', label: 'Agent Despawned', category: 'agent' },
  agent_nudged: { icon: 'notifications_active', color: '#f59e0b', label: 'Agent Nudged', category: 'agent' },
  // Bead/Issue events
  bead_created: { icon: 'add_circle', color: '#f59e0b', label: 'Issue Created', category: 'bead' },
  bead_updated: { icon: 'edit', color: '#3b82f6', label: 'Issue Updated', category: 'bead' },
  bead_deleted: { icon: 'delete', color: '#6b7280', label: 'Issue Deleted', category: 'bead' },
  bead_pinned: { icon: 'push_pin', color: '#ec4899', label: 'Issue Pinned', category: 'bead' },
  // GT workflow events
  patrol_started: { icon: 'visibility', color: '#8b5cf6', label: 'Patrol Started', category: 'workflow' },
  handoff: { icon: 'swap_horiz', color: '#06b6d4', label: 'Handoff', category: 'workflow' },
  merge_started: { icon: 'merge_type', color: '#f59e0b', label: 'Merge Started', category: 'workflow' },
  // Mail events
  mail: { icon: 'mail', color: '#ec4899', label: 'Mail Sent', category: 'mail' },
  mail_received: { icon: 'mail', color: '#ec4899', label: 'Mail Received', category: 'mail' },
  // Mayor events
  mayor_message: { icon: 'assistant', color: '#a855f7', label: 'Mayor Message', category: 'mail' },
  mayor_started: { icon: 'play_circle', color: '#22c55e', label: 'Mayor Started', category: 'workflow' },
  // System events
  system: { icon: 'info', color: '#6b7280', label: 'System', category: 'system' },
  error: { icon: 'error_outline', color: '#ef4444', label: 'Error', category: 'system' },
};

// Filter categories
const FILTER_CATEGORIES = {
  all:      { label: 'All Activity',  icon: 'list' },
  work:     { label: 'Work',          icon: 'task_alt' },
  agent:    { label: 'Agents',        icon: 'smart_toy' },
  bead:     { label: 'Issues',        icon: 'bug_report' },
  convoy:   { label: 'Convoys',       icon: 'local_shipping' },
  mail:     { label: 'Mail & Mayor',  icon: 'mail' },
  workflow: { label: 'Workflow',      icon: 'swap_horiz' },
  system:   { label: 'System',        icon: 'info' },
};

// Safe localStorage access
const storage = typeof localStorage !== 'undefined' ? localStorage : null;
const FILTER_STORAGE_KEY = 'gastownui-feed-filter';

// Current filter state
let activeFilter = storage?.getItem(FILTER_STORAGE_KEY) || 'all';

/**
 * Get the current active filter
 */
export function getActiveFilter() {
  return activeFilter;
}

/**
 * Set the active filter and persist it
 */
export function setActiveFilter(filter) {
  activeFilter = filter;
  storage?.setItem(FILTER_STORAGE_KEY, filter);
}

/**
 * Filter events by the active category
 */
function filterEvents(events) {
  if (activeFilter === 'all') return events;
  return events.filter(event => {
    const type = event.type || 'system';
    const config = EVENT_CONFIG[type] || EVENT_CONFIG.system;
    return config.category === activeFilter;
  });
}

/**
 * Group consecutive events of the same type and target into collapsed groups.
 * Returns an array of items: either single events or group objects.
 */
function groupConsecutiveEvents(events) {
  if (!events || events.length === 0) return [];

  const result = [];
  let i = 0;

  while (i < events.length) {
    const current = events[i];
    const currentType = current.type || 'system';
    const currentTarget = current.target || '';

    // Look ahead for consecutive identical type+target events
    let groupCount = 1;
    while (
      i + groupCount < events.length &&
      (events[i + groupCount].type || 'system') === currentType &&
      (events[i + groupCount].target || '') === currentTarget
    ) {
      groupCount++;
    }

    if (groupCount >= 3) {
      // Collapse into a group
      result.push({
        isGroup: true,
        count: groupCount,
        type: currentType,
        target: currentTarget,
        firstEvent: current,
        lastEvent: events[i + groupCount - 1],
      });
      i += groupCount;
    } else {
      // Emit individually
      for (let j = 0; j < groupCount; j++) {
        result.push(events[i + j]);
      }
      i += groupCount;
    }
  }

  return result;
}

/**
 * Render the activity feed
 * @param {HTMLElement} container - The feed container
 * @param {Array} events - Array of event objects
 */
export function renderActivityFeed(container, events) {
  if (!container) return;

  const filtered = filterEvents(events || []);

  if (filtered.length === 0) {
    const noEvents = !events || events.length === 0;
    container.innerHTML = `
      <div class="feed-empty">
        <span class="material-icons">${noEvents ? 'notifications_none' : 'filter_list_off'}</span>
        <p>${noEvents ? 'No activity yet' : 'No matching events'}</p>
      </div>
    `;
    return;
  }

  const grouped = groupConsecutiveEvents(filtered);

  const html = grouped.map((item, index) => {
    if (item.isGroup) {
      return renderGroupedItem(item);
    }
    return renderFeedItem(item, index, false);
  }).join('');

  container.innerHTML = html;
}

/**
 * Add a single event to the feed (for real-time updates)
 * @param {HTMLElement} container - The feed container
 * @param {Object} event - The event to add
 */
export function addEventToFeed(container, event) {
  if (!container) return;

  // Check if event passes current filter
  if (activeFilter !== 'all') {
    const type = event.type || 'system';
    const config = EVENT_CONFIG[type] || EVENT_CONFIG.system;
    if (config.category !== activeFilter) return;
  }

  // Remove empty state if present
  const emptyState = container.querySelector('.feed-empty');
  if (emptyState) {
    emptyState.remove();
  }

  // Check if the top item is a group of the same type — if so, increment it
  const firstChild = container.firstElementChild;
  if (firstChild?.classList.contains('feed-group')) {
    const groupType = firstChild.dataset.groupType;
    const groupTarget = firstChild.dataset.groupTarget || '';
    const eventType = event.type || 'system';
    const eventTarget = event.target || '';
    if (groupType === eventType && groupTarget === eventTarget) {
      const countEl = firstChild.querySelector('.group-count');
      if (countEl) {
        const oldCount = parseInt(countEl.textContent, 10) || 0;
        countEl.textContent = oldCount + 1;
        const timeEl = firstChild.querySelector('.feed-time');
        if (timeEl) timeEl.textContent = formatActivityFeedTime(event.timestamp);
        return;
      }
    }
  }

  // Check if the top 2 items are the same type as this new event — start a group
  if (firstChild?.classList.contains('feed-item')) {
    const firstType = firstChild.dataset.eventType;
    const firstTarget = firstChild.dataset.eventTarget || '';
    const eventType = event.type || 'system';
    const eventTarget = event.target || '';
    if (firstType === eventType && firstTarget === eventTarget) {
      const second = firstChild.nextElementSibling;
      if (second?.classList.contains('feed-item') &&
          second.dataset.eventType === eventType &&
          second.dataset.eventTarget === eventTarget) {
        // Remove the 2 individual items and replace with a group of 3
        firstChild.remove();
        second.remove();
        const groupItem = {
          isGroup: true,
          count: 3,
          type: eventType,
          target: eventTarget,
          firstEvent: event,
          lastEvent: { type: eventType, target: eventTarget, timestamp: second.dataset.eventTime },
        };
        const div = document.createElement('div');
        div.innerHTML = renderGroupedItem(groupItem);
        const newGroup = div.firstElementChild;
        if (container.firstChild) {
          container.insertBefore(newGroup, container.firstChild);
        } else {
          container.appendChild(newGroup);
        }
        return;
      }
    }
  }

  // Create new event element
  const div = document.createElement('div');
  div.innerHTML = renderFeedItem(event, 0, true);
  const newItem = div.firstElementChild;

  // Insert at the beginning with animation
  if (container.firstChild) {
    container.insertBefore(newItem, container.firstChild);
  } else {
    container.appendChild(newItem);
  }

  // Trigger animation
  requestAnimationFrame(() => {
    newItem.classList.add('animate-in');
  });

  // Limit items in DOM (keep last 100)
  const items = container.querySelectorAll('.feed-item, .feed-group');
  if (items.length > 100) {
    for (let i = 100; i < items.length; i++) {
      items[i].remove();
    }
  }
}

/**
 * Render the filter bar for the feed header area
 */
export function renderFeedFilterBar(headerContainer) {
  if (!headerContainer) return;

  headerContainer.innerHTML = `
    <h2>Activity</h2>
    <div class="feed-controls">
      <div class="feed-filter-dropdown">
        <button class="icon-btn-sm feed-filter-btn" id="feed-filter-btn"
                title="Filter activity">
          <span class="material-icons">${activeFilter === 'all' ? 'filter_list' : 'filter_alt'}</span>
          ${activeFilter !== 'all' ? `<span class="filter-active-dot"></span>` : ''}
        </button>
        <div class="feed-filter-menu" id="feed-filter-menu">
          ${Object.entries(FILTER_CATEGORIES).map(([key, cat]) => `
            <button class="feed-filter-option ${activeFilter === key ? 'active' : ''}"
                    data-filter="${key}">
              <span class="material-icons">${cat.icon}</span>
              <span>${cat.label}</span>
              ${activeFilter === key ? '<span class="material-icons filter-check">check</span>' : ''}
            </button>
          `).join('')}
          <div class="feed-filter-divider"></div>
          <button class="feed-filter-option" id="feed-clear-btn">
            <span class="material-icons">clear_all</span>
            <span>Clear Feed</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render a grouped/collapsed item
 */
function renderGroupedItem(group) {
  const config = EVENT_CONFIG[group.type] || EVENT_CONFIG.system;
  const targetLabel = group.target ? escapeHtml(group.target) : '';

  return `
    <div class="feed-group"
         data-group-type="${group.type}"
         data-group-target="${escapeHtml(group.target || '')}"
         style="--event-color: ${config.color}">
      <div class="feed-icon">
        <span class="material-icons" style="color: ${config.color}">${config.icon}</span>
      </div>
      <div class="feed-content">
        <div class="feed-header">
          <span class="feed-type">${config.label}</span>
          <span class="feed-time">${formatActivityFeedTime(group.firstEvent?.timestamp)}</span>
        </div>
        <div class="feed-message feed-group-message">
          <span class="group-count">${group.count}</span> ${config.label.toLowerCase()} events${targetLabel ? ` for <strong>${targetLabel}</strong>` : ''}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render a single feed item
 */
function renderFeedItem(event, index, isNew) {
  const type = event.type || 'system';
  const config = EVENT_CONFIG[type] || EVENT_CONFIG.system;

  return `
    <div class="feed-item ${isNew ? 'new-event' : ''}"
         data-event-id="${event.id || index}"
         data-event-type="${type}"
         data-event-target="${escapeHtml(event.target || '')}"
         data-event-time="${event.timestamp || ''}"
         style="--event-color: ${config.color}">
      <div class="feed-icon">
        <span class="material-icons" style="color: ${config.color}">${config.icon}</span>
      </div>
      <div class="feed-content">
        <div class="feed-header">
          <span class="feed-type">${config.label}</span>
          <span class="feed-time">${formatActivityFeedTime(event.timestamp)}</span>
        </div>
        <div class="feed-message">${formatMessage(event)}</div>
        ${event.details ? `
          <div class="feed-details">${escapeHtml(event.details)}</div>
        ` : ''}
        ${event.convoy_id ? `
          <div class="feed-meta">
            <span class="feed-tag">
              <span class="material-icons">local_shipping</span>
              ${event.convoy_id.slice(0, 8)}
            </span>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Format event message based on type
 */
function formatMessage(event) {
  const msg = event.message || event.summary || event.description || '';

  // Add special formatting for certain event types
  switch (event.type) {
    case 'work_slung': {
      // Service-emitted events have explicit bead and target fields.
      // Feed-stream events have target (the entity/bead) and action (descriptive text).
      const beadId = event.bead || event.target || 'work';
      let slingTarget = event.bead ? event.target : null;
      if (!slingTarget && event.action) {
        const m = event.action.match(/(?:to|→)\s+(\S+)/);
        if (m) slingTarget = m[1];
      }
      return `Slung <strong>${escapeHtml(beadId)}</strong> to ${formatAgentBadge(slingTarget)}`;
    }

    case 'agent_spawned':
      return `${formatAgentBadge(event.agent_id || event.agent_name, event.role)} joined`;

    case 'bead_created':
      return `Created bead <strong>${escapeHtml(event.bead_id || 'unknown')}</strong>`;

    case 'convoy_created':
      return `Convoy <strong>${escapeHtml(event.convoy_name || event.convoy_id || 'unknown')}</strong> created`;

    case 'mail':
    case 'mail_received': {
      const fromConfig = getAgentConfig(event.actor || event.from);
      const toConfig = getAgentConfig(event.payload?.to || event.to);
      return `${formatAgentBadge(event.actor || event.from)} → ${formatAgentBadge(event.payload?.to || event.to)}: ${escapeHtml(truncate(event.payload?.subject || event.subject || msg, 40))}`;
    }

    case 'mayor_message': {
      const statusIcon = event.status === 'sent' ? '✓' : event.status === 'auto-started' ? '⚡' : '✗';
      const statusText = event.status === 'auto-started' ? ' (auto-started Mayor)' : '';
      return `You → ${formatAgentBadge(event.target || 'mayor')}: "${escapeHtml(truncate(event.message || msg, 50))}"${statusText}`;
    }

    case 'mayor_started':
      return `Mayor service started${event.autoStarted ? ' (auto-started for message)' : ''}`;

    default:
      // For events with actor, show the actor badge
      if (event.actor) {
        return `${formatAgentBadge(event.actor)}: ${escapeHtml(msg)}`;
      }
      return escapeHtml(msg);
  }
}

/**
 * Create a small inline agent badge for feed items
 */
function formatAgentBadge(agentPath, role = null) {
  if (!agentPath) return '<span class="feed-agent">unknown</span>';
  const config = getAgentConfig(agentPath, role);
  const name = formatAgentName(agentPath);
  return `<span class="feed-agent" style="color: ${config.color}"><span class="material-icons" style="font-size: 12px">${config.icon}</span> ${escapeHtml(name)}</span>`;
}
