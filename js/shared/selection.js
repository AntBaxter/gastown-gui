/**
 * Gas Town GUI - Selection State Manager
 *
 * Manages selected bead IDs across kanban/graph views.
 * Renders a floating action bar when beads are selected.
 */

import { escapeHtml } from '../utils/html.js';
import { CONVOY_WIZARD_PREPOPULATE } from './events.js';

// Selected bead IDs
const selectedIds = new Set();

// Subscribers notified on selection change
const listeners = new Set();

function notify() {
  const ids = Array.from(selectedIds);
  for (const fn of listeners) {
    fn(ids);
  }
}

export function toggleSelection(id) {
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
  } else {
    selectedIds.add(id);
  }
  notify();
}

export function clearSelection() {
  selectedIds.clear();
  notify();
}

export function getSelection() {
  return Array.from(selectedIds);
}

export function isSelected(id) {
  return selectedIds.has(id);
}

/**
 * Subscribe to selection changes.
 * @param {Function} fn - Called with array of selected IDs
 * @returns {Function} unsubscribe
 */
export function onSelectionChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Render the floating action bar into a container element.
 * The bar shows when beads are selected and offers Create Convoy + Clear actions.
 * @param {HTMLElement} container - Parent element (e.g., #view-work)
 */
export function renderFloatingBar(container) {
  // Create bar element if not present
  let bar = container.querySelector('.selection-action-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'selection-action-bar';
    container.appendChild(bar);
  }

  function update(ids) {
    if (ids.length === 0) {
      bar.classList.add('hidden');
      return;
    }
    bar.classList.remove('hidden');
    bar.innerHTML = `
      <span class="selection-count">
        <span class="material-icons">check_box</span>
        ${escapeHtml(String(ids.length))} selected
      </span>
      <div class="selection-actions">
        <button class="btn btn-primary btn-sm selection-create-convoy">
          <span class="material-icons">local_shipping</span>
          Create Convoy
        </button>
        <button class="btn btn-ghost btn-sm selection-clear">
          <span class="material-icons">close</span>
          Clear
        </button>
      </div>
    `;

    bar.querySelector('.selection-create-convoy').addEventListener('click', () => {
      const selected = getSelection();
      document.dispatchEvent(new CustomEvent(CONVOY_WIZARD_PREPOPULATE, {
        detail: { issues: selected },
      }));
    });

    bar.querySelector('.selection-clear').addEventListener('click', () => {
      clearSelection();
    });
  }

  // Initial render
  update(getSelection());

  // Subscribe to changes
  return onSelectionChange(update);
}
