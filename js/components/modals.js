/**
 * Gas Town GUI - Modals Component
 *
 * Handles all modal dialogs in the application.
 */

import { api } from '../api.js';
import { showToast } from './toast.js';
import { initAutocomplete, renderBeadItem, renderAgentItem } from './autocomplete.js';
import { state } from '../state.js';
import { escapeHtml, escapeAttr, capitalize } from '../utils/html.js';
import { debounce } from '../utils/performance.js';
import { getBeadPriority } from '../shared/beads.js';
import { parseCloseReason } from '../shared/close-reason.js';
import { TIMING_MS } from '../shared/timing.js';
import { loadAndRenderEpicChildren } from './epic-detail.js';
import {
  AGENT_DETAIL,
  AGENT_NUDGE,
  AGENT_PEEK,
  BEAD_CREATED,
  BEAD_DETAIL,
  BEAD_SLING,
  CONVOY_CREATED,
  CONVOY_DETAIL,
  CONVOY_ESCALATE,
  CONVOY_ESCALATED,
  MAIL_DETAIL,
  MAIL_REPLY,
  MODAL_CLOSE,
  MODAL_SHOW,
  RIGS_REFRESH,
  WORK_SLUNG,
} from '../shared/events.js';

// Modal registry
const modals = new Map();

// References
let overlay = null;

// Peek modal state
let peekAutoRefreshInterval = null;
let currentPeekAgentId = null;
const PEEK_AUTO_REFRESH_INTERVAL_MS = 2000;

// GitHub repo mapping is configured in `js/shared/github-repos.js`.

/**
 * Initialize modals system
 */
export function initModals() {
  overlay = document.getElementById('modal-overlay');

  // Register built-in modals
  registerModal('new-convoy', {
    element: document.getElementById('new-convoy-modal'),
    onOpen: initNewConvoyModal,
  });

  registerModal('new-bead', {
    element: document.getElementById('new-bead-modal'),
    onOpen: initNewBeadModal,
    onSubmit: handleNewBeadSubmit,
  });

  registerModal('sling', {
    element: document.getElementById('sling-modal'),
    onOpen: initSlingModal,
    onSubmit: handleSlingSubmit,
  });

  registerModal('mail-compose', {
    element: document.getElementById('mail-compose-modal'),
    onOpen: initMailComposeModal,
    onSubmit: handleMailComposeSubmit,
  });

  registerModal('help', {
    element: document.getElementById('help-modal'),
    onOpen: initHelpModal,
  });

  registerModal('new-rig', {
    element: document.getElementById('new-rig-modal'),
    onOpen: initNewRigModal,
    onSubmit: handleNewRigSubmit,
  });

  // Close on overlay click
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeAllModals();
    }
  });

  // Close buttons
  document.querySelectorAll('[data-modal-close]').forEach(btn => {
    btn.addEventListener('click', closeAllModals);
  });

  // Open buttons
  document.querySelectorAll('[data-modal-open]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.modalOpen;
      openModal(modalId);
    });
  });

  // Form submissions
  document.querySelectorAll('.modal form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const modal = form.closest('.modal');
      if (!modal) return;

      const modalId = modal.id.replace('-modal', '');
      const config = modals.get(modalId);
      if (config?.onSubmit) {
        await config.onSubmit(form);
      }
    });
  });

  // Listen for custom modal events
  document.addEventListener(CONVOY_DETAIL, (e) => {
    showConvoyDetailModal(e.detail.convoyId);
  });

  document.addEventListener(AGENT_DETAIL, (e) => {
    showAgentDetailModal(e.detail.agentId);
  });

  document.addEventListener(AGENT_NUDGE, (e) => {
    showNudgeModal(e.detail.agentId);
  });

  document.addEventListener(MAIL_DETAIL, (e) => {
    showMailDetailModal(e.detail.mailId, e.detail.mail);
  });

  document.addEventListener(CONVOY_ESCALATE, (e) => {
    showEscalationModal(e.detail.convoyId, e.detail.convoyName);
  });

  document.addEventListener(MAIL_REPLY, (e) => {
    openModal('mail-compose', {
      replyTo: e.detail.mail.from,
      subject: e.detail.mail.subject,
    });
  });

  document.addEventListener(BEAD_DETAIL, (e) => {
    showBeadDetailModal(e.detail.beadId, e.detail.bead);
  });

  document.addEventListener(AGENT_PEEK, (e) => {
    showPeekModal(e.detail.agentId);
  });

  // Register peek modal
  registerModal('peek', {
    element: document.getElementById('peek-modal'),
    onOpen: initPeekModal,
  });

  // Generic dynamic modal handler (event-driven)
  document.addEventListener(MODAL_SHOW, (e) => {
    showEventDrivenModal(e.detail);
  });

  document.addEventListener(MODAL_CLOSE, () => {
    closeDynamicModal();
  });
}

// Dynamic modal element reference
let dynamicModal = null;

/**
 * Show a dynamic modal with custom content (event-driven version)
 * Used by the modal:show custom event
 */
function showEventDrivenModal(options) {
  const { title, content, onMount } = options;

  // Create dynamic modal if it doesn't exist
  if (!dynamicModal) {
    dynamicModal = document.createElement('div');
    dynamicModal.id = 'dynamic-modal';
    dynamicModal.className = 'modal';
    document.body.appendChild(dynamicModal);
  }

  // Build modal content
  dynamicModal.innerHTML = `
    <div class="modal-header">
      <h2>${escapeHtml(title || 'Modal')}</h2>
      <button class="btn btn-icon modal-close" data-action="close">
        <span class="material-icons">close</span>
      </button>
    </div>
    <div class="modal-body">
      ${content || ''}
    </div>
  `;

  // Add close button handler
  dynamicModal.querySelector('[data-action="close"]')?.addEventListener('click', closeDynamicModal);

  // Add cancel button handler (for forms)
  dynamicModal.querySelectorAll('[data-action="close"], .btn-ghost[data-action="close"]').forEach(btn => {
    btn.addEventListener('click', closeDynamicModal);
  });

  // Show overlay and modal
  overlay?.classList.remove('hidden');
  dynamicModal.classList.remove('hidden');

  // Call onMount callback for custom initialization
  if (onMount) {
    onMount(dynamicModal);
  }

  // Focus first input
  const firstInput = dynamicModal.querySelector('input, textarea, select');
  if (firstInput) {
    setTimeout(() => firstInput.focus(), TIMING_MS.FOCUS_DELAY);
  }
}

/**
 * Close the dynamic modal
 */
function closeDynamicModal() {
  if (dynamicModal) {
    dynamicModal.classList.add('hidden');
  }
  overlay?.classList.add('hidden');
}

/**
 * Register a modal
 */
export function registerModal(id, config) {
  modals.set(id, config);
}

/**
 * Open a modal by ID
 */
export function openModal(modalId, data = {}) {
  const config = modals.get(modalId);
  if (!config?.element) {
    console.warn(`Modal not found: ${modalId}`);
    return;
  }

  // Hide all modals first
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));

  // Show overlay and modal
  overlay?.classList.remove('hidden');
  config.element.classList.remove('hidden');

  // Call onOpen callback
  if (config.onOpen) {
    config.onOpen(config.element, data);
  }

  // Focus first input
  const firstInput = config.element.querySelector('input, textarea, select');
  if (firstInput) {
    setTimeout(() => firstInput.focus(), TIMING_MS.FOCUS_DELAY);
  }
}

/**
 * Close all modals
 */
export function closeAllModals() {
  overlay?.classList.add('hidden');
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));

  // Reset forms
  document.querySelectorAll('.modal form').forEach(form => form.reset());

  // Stop peek modal auto-refresh if active
  stopPeekAutoRefresh();
}

// Helper to stop peek auto-refresh from closeAllModals
function stopPeekAutoRefresh() {
  if (peekAutoRefreshInterval) {
    clearInterval(peekAutoRefreshInterval);
    peekAutoRefreshInterval = null;
  }
  currentPeekAgentId = null;
}

/**
 * Close specific modal
 */
export function closeModal(modalId) {
  const config = modals.get(modalId);
  if (config?.element) {
    config.element.classList.add('hidden');
  }

  // Check if any modal is still open
  const openModals = document.querySelectorAll('.modal:not(.hidden)');
  if (openModals.length === 0) {
    overlay?.classList.add('hidden');
  }
}

// === New Convoy Wizard ===

// Wizard state (local to modal, not global)
const convoyWizard = {
  step: 1,
  totalSteps: 4,
  name: '',
  issues: [],
  issueSearch: '',
  notify: '',
  integrationBranch: false,
  branchName: '',
};

function resetConvoyWizard() {
  convoyWizard.step = 1;
  convoyWizard.name = '';
  convoyWizard.issues = [];
  convoyWizard.issueSearch = '';
  convoyWizard.notify = '';
  convoyWizard.integrationBranch = false;
  convoyWizard.branchName = '';
}

function initNewConvoyModal(element) {
  resetConvoyWizard();
  renderConvoyWizardStep(element);
  wireConvoyWizardNav(element);
}

function wireConvoyWizardNav(element) {
  const nextBtn = element.querySelector('#convoy-wizard-next');
  const backBtn = element.querySelector('#convoy-wizard-back');

  // Remove old listeners by replacing elements
  const newNext = nextBtn.cloneNode(true);
  const newBack = backBtn.cloneNode(true);
  nextBtn.parentNode.replaceChild(newNext, nextBtn);
  backBtn.parentNode.replaceChild(newBack, backBtn);

  newNext.addEventListener('click', () => handleConvoyWizardNext(element));
  newBack.addEventListener('click', () => handleConvoyWizardBack(element));
}

function handleConvoyWizardNext(element) {
  // Validate current step before advancing
  if (!validateConvoyWizardStep(element)) return;

  // Save current step data
  saveConvoyWizardStepData(element);

  if (convoyWizard.step === convoyWizard.totalSteps) {
    // Final step — submit
    handleConvoyWizardSubmit(element);
    return;
  }

  convoyWizard.step++;
  renderConvoyWizardStep(element);
}

function handleConvoyWizardBack(element) {
  saveConvoyWizardStepData(element);
  if (convoyWizard.step > 1) {
    convoyWizard.step--;
    renderConvoyWizardStep(element);
  }
}

function validateConvoyWizardStep(element) {
  switch (convoyWizard.step) {
    case 1: {
      const nameInput = element.querySelector('#convoy-wiz-name');
      const name = nameInput?.value?.trim();
      if (!name) {
        showToast('Please enter a convoy name', 'warning');
        nameInput?.focus();
        return false;
      }
      return true;
    }
    case 2:
      // Issues are optional
      return true;
    case 3:
      // Integration branch config is optional
      return true;
    case 4:
      // Review step — always valid
      return true;
    default:
      return true;
  }
}

function saveConvoyWizardStepData(element) {
  switch (convoyWizard.step) {
    case 1: {
      convoyWizard.name = element.querySelector('#convoy-wiz-name')?.value?.trim() || '';
      convoyWizard.notify = element.querySelector('#convoy-wiz-notify')?.value || '';
      break;
    }
    case 2: {
      // Issues are managed via checkboxes + manual input, already saved in real-time
      const manualInput = element.querySelector('#convoy-wiz-manual-issues');
      if (manualInput?.value?.trim()) {
        const manualIds = manualInput.value
          .split(/[,\n]/)
          .map(s => s.trim())
          .filter(Boolean);
        // Merge manual IDs with checkbox selections (avoid duplicates)
        for (const id of manualIds) {
          if (!convoyWizard.issues.includes(id)) {
            convoyWizard.issues.push(id);
          }
        }
      }
      break;
    }
    case 3: {
      convoyWizard.integrationBranch = element.querySelector('#convoy-wiz-intbranch')?.checked || false;
      convoyWizard.branchName = element.querySelector('#convoy-wiz-branchname')?.value?.trim() || '';
      break;
    }
  }
}

function renderConvoyWizardStep(element) {
  const body = element.querySelector('#convoy-wizard-body');
  const title = element.querySelector('#convoy-wizard-title');
  const subtitle = element.querySelector('#convoy-wizard-subtitle');
  const indicator = element.querySelector('#convoy-wizard-indicator');
  const backBtn = element.querySelector('#convoy-wizard-back');
  const nextBtn = element.querySelector('#convoy-wizard-next');

  // Update progress dots
  element.querySelectorAll('.progress-step').forEach(step => {
    const stepNum = parseInt(step.dataset.step);
    step.classList.toggle('active', stepNum === convoyWizard.step);
    step.classList.toggle('completed', stepNum < convoyWizard.step);
  });

  // Update indicator
  indicator.textContent = `Step ${convoyWizard.step} of ${convoyWizard.totalSteps}`;

  // Show/hide back button
  backBtn.style.display = convoyWizard.step > 1 ? '' : 'none';

  // Update next button text
  nextBtn.textContent = convoyWizard.step === convoyWizard.totalSteps ? 'Create Convoy' : 'Next';
  nextBtn.disabled = false;
  nextBtn.innerHTML = convoyWizard.step === convoyWizard.totalSteps
    ? '<span class="material-icons" style="font-size:18px;vertical-align:middle;margin-right:4px">local_shipping</span>Create Convoy'
    : 'Next <span class="material-icons" style="font-size:18px;vertical-align:middle;margin-left:4px">arrow_forward</span>';

  switch (convoyWizard.step) {
    case 1:
      title.textContent = 'Name your convoy';
      subtitle.textContent = 'Choose a descriptive name and notification settings';
      body.innerHTML = renderConvoyStep1();
      break;
    case 2:
      title.textContent = 'Select issues';
      subtitle.textContent = 'Search and select issues to track in this convoy';
      body.innerHTML = renderConvoyStep2();
      wireConvoyStep2(element);
      break;
    case 3:
      title.textContent = 'Integration branch';
      subtitle.textContent = 'Optionally create an integration branch for atomic landing';
      body.innerHTML = renderConvoyStep3();
      wireConvoyStep3(element);
      break;
    case 4:
      title.textContent = 'Review & create';
      subtitle.textContent = 'Confirm your convoy configuration';
      body.innerHTML = renderConvoyStep4();
      break;
  }

  // Focus first input on the step
  const firstInput = body.querySelector('input:not([type="checkbox"]), textarea, select');
  if (firstInput) {
    setTimeout(() => firstInput.focus(), TIMING_MS.FOCUS_DELAY);
  }
}

function renderConvoyStep1() {
  return `
    <div class="form-group">
      <label for="convoy-wiz-name">Convoy Name</label>
      <input type="text" id="convoy-wiz-name" placeholder="e.g., Deploy v2.0, Auth Refactor"
        value="${escapeAttr(convoyWizard.name)}">
      <small class="form-hint">A descriptive name for the group of related issues</small>
    </div>
    <div class="form-group">
      <label for="convoy-wiz-notify">Notify on completion</label>
      <select id="convoy-wiz-notify">
        <option value="" ${convoyWizard.notify === '' ? 'selected' : ''}>None</option>
        <option value="mayor/" ${convoyWizard.notify === 'mayor/' ? 'selected' : ''}>Mayor</option>
        <option value="human" ${convoyWizard.notify === 'human' ? 'selected' : ''}>Human Overseer</option>
      </select>
    </div>
  `;
}

function renderConvoyStep2() {
  const selectedHtml = convoyWizard.issues.length > 0
    ? convoyWizard.issues.map(id => `
        <span class="convoy-wiz-issue-tag">
          ${escapeHtml(id)}
          <button type="button" class="convoy-wiz-remove-issue" data-issue="${escapeAttr(id)}">
            <span class="material-icons" style="font-size:14px">close</span>
          </button>
        </span>
      `).join('')
    : '<span class="text-muted">No issues selected yet</span>';

  return `
    <div class="form-group">
      <label>Selected Issues</label>
      <div class="convoy-wiz-selected-issues" id="convoy-wiz-selected">${selectedHtml}</div>
    </div>
    <div class="form-group">
      <label for="convoy-wiz-search">Search issues</label>
      <div class="convoy-wiz-search-wrap">
        <span class="material-icons convoy-wiz-search-icon">search</span>
        <input type="text" id="convoy-wiz-search" placeholder="Search by title or ID..."
          value="${escapeAttr(convoyWizard.issueSearch)}">
      </div>
      <div class="convoy-wiz-search-results" id="convoy-wiz-results"></div>
    </div>
    <div class="form-group">
      <label for="convoy-wiz-manual-issues">Or enter issue IDs manually</label>
      <textarea id="convoy-wiz-manual-issues" placeholder="Enter issue IDs (comma or newline separated)&#10;e.g., gt-123, bd-456" rows="3"></textarea>
    </div>
  `;
}

function wireConvoyStep2(element) {
  const searchInput = element.querySelector('#convoy-wiz-search');
  const resultsDiv = element.querySelector('#convoy-wiz-results');

  // Search handler with debounce
  const doSearch = debounce(async (query) => {
    if (!query || query.length < 2) {
      resultsDiv.innerHTML = '';
      return;
    }
    resultsDiv.innerHTML = '<div class="text-muted">Searching...</div>';
    try {
      const results = await api.searchBeads(query);
      const beads = Array.isArray(results) ? results : (results?.beads || []);
      if (beads.length === 0) {
        resultsDiv.innerHTML = '<div class="text-muted">No issues found</div>';
        return;
      }
      resultsDiv.innerHTML = beads.slice(0, 20).map(bead => {
        const id = bead.id || bead.bead_id || '';
        const beadTitle = bead.title || bead.name || id;
        const isSelected = convoyWizard.issues.includes(id);
        const status = bead.status || '';
        const type = bead.type || '';
        return `
          <label class="convoy-wiz-result-item ${isSelected ? 'selected' : ''}">
            <input type="checkbox" value="${escapeAttr(id)}" ${isSelected ? 'checked' : ''}>
            <span class="convoy-wiz-result-id">${escapeHtml(id)}</span>
            <span class="convoy-wiz-result-title">${escapeHtml(beadTitle)}</span>
            ${status ? `<span class="badge badge-sm">${escapeHtml(status)}</span>` : ''}
            ${type ? `<span class="badge badge-sm badge-outline">${escapeHtml(type)}</span>` : ''}
          </label>
        `;
      }).join('');

      // Wire checkbox changes
      resultsDiv.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
          const issueId = cb.value;
          if (cb.checked && !convoyWizard.issues.includes(issueId)) {
            convoyWizard.issues.push(issueId);
          } else if (!cb.checked) {
            convoyWizard.issues = convoyWizard.issues.filter(i => i !== issueId);
          }
          cb.closest('.convoy-wiz-result-item')?.classList.toggle('selected', cb.checked);
          updateSelectedIssuesDisplay(element);
        });
      });
    } catch (err) {
      resultsDiv.innerHTML = `<div class="text-muted">Search failed: ${escapeHtml(err.message)}</div>`;
    }
  }, 300);

  searchInput?.addEventListener('input', (e) => {
    convoyWizard.issueSearch = e.target.value;
    doSearch(e.target.value.trim());
  });

  // Wire remove buttons on selected issues
  wireRemoveIssueButtons(element);
}

function wireRemoveIssueButtons(element) {
  element.querySelectorAll('.convoy-wiz-remove-issue').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.issue;
      convoyWizard.issues = convoyWizard.issues.filter(i => i !== id);
      updateSelectedIssuesDisplay(element);
      // Also uncheck in search results
      const cb = element.querySelector(`#convoy-wiz-results input[value="${CSS.escape(id)}"]`);
      if (cb) {
        cb.checked = false;
        cb.closest('.convoy-wiz-result-item')?.classList.remove('selected');
      }
    });
  });
}

function updateSelectedIssuesDisplay(element) {
  const container = element.querySelector('#convoy-wiz-selected');
  if (!container) return;

  if (convoyWizard.issues.length === 0) {
    container.innerHTML = '<span class="text-muted">No issues selected yet</span>';
  } else {
    container.innerHTML = convoyWizard.issues.map(id => `
      <span class="convoy-wiz-issue-tag">
        ${escapeHtml(id)}
        <button type="button" class="convoy-wiz-remove-issue" data-issue="${escapeAttr(id)}">
          <span class="material-icons" style="font-size:14px">close</span>
        </button>
      </span>
    `).join('');
    wireRemoveIssueButtons(element);
  }
}

function renderConvoyStep3() {
  return `
    <div class="convoy-wiz-intbranch-section">
      <label class="convoy-wiz-toggle-label">
        <input type="checkbox" id="convoy-wiz-intbranch" ${convoyWizard.integrationBranch ? 'checked' : ''}>
        <span class="convoy-wiz-toggle-text">
          <strong>Create integration branch</strong>
          <small>All MRs merge into a shared branch, then land to main atomically</small>
        </span>
      </label>

      <div class="convoy-wiz-intbranch-config ${convoyWizard.integrationBranch ? '' : 'hidden'}" id="convoy-wiz-intbranch-config">
        <div class="form-group">
          <label for="convoy-wiz-branchname">Branch name (optional)</label>
          <input type="text" id="convoy-wiz-branchname"
            placeholder="Auto-generated from convoy name if empty"
            value="${escapeAttr(convoyWizard.branchName)}">
          <small class="form-hint">Default: integration/{convoy-name-slug}</small>
        </div>
        <div class="convoy-wiz-intbranch-info">
          <span class="material-icons">info</span>
          <div>
            <p>Integration branches batch all child work and land it as a single merge commit.</p>
            <p>MR targets are auto-detected — polecats don't need to know about the branch.</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function wireConvoyStep3(element) {
  const toggle = element.querySelector('#convoy-wiz-intbranch');
  const config = element.querySelector('#convoy-wiz-intbranch-config');
  toggle?.addEventListener('change', () => {
    convoyWizard.integrationBranch = toggle.checked;
    config?.classList.toggle('hidden', !toggle.checked);
  });
}

function renderConvoyStep4() {
  const issuesList = convoyWizard.issues.length > 0
    ? convoyWizard.issues.map(id => `<span class="convoy-wiz-issue-tag">${escapeHtml(id)}</span>`).join(' ')
    : '<span class="text-muted">None</span>';

  const notifyLabel = convoyWizard.notify === 'mayor/' ? 'Mayor'
    : convoyWizard.notify === 'human' ? 'Human Overseer'
    : 'None';

  const branchDisplay = convoyWizard.integrationBranch
    ? (convoyWizard.branchName || `integration/${convoyWizard.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 60)}`)
    : 'None';

  return `
    <div class="convoy-wiz-review">
      <div class="convoy-wiz-review-row">
        <span class="convoy-wiz-review-label">Name</span>
        <span class="convoy-wiz-review-value">${escapeHtml(convoyWizard.name)}</span>
      </div>
      <div class="convoy-wiz-review-row">
        <span class="convoy-wiz-review-label">Issues (${convoyWizard.issues.length})</span>
        <span class="convoy-wiz-review-value">${issuesList}</span>
      </div>
      <div class="convoy-wiz-review-row">
        <span class="convoy-wiz-review-label">Notify</span>
        <span class="convoy-wiz-review-value">${escapeHtml(notifyLabel)}</span>
      </div>
      <div class="convoy-wiz-review-row">
        <span class="convoy-wiz-review-label">Integration Branch</span>
        <span class="convoy-wiz-review-value">${escapeHtml(branchDisplay)}</span>
      </div>
    </div>
  `;
}

async function handleConvoyWizardSubmit(element) {
  const nextBtn = element.querySelector('#convoy-wizard-next');
  const originalHtml = nextBtn?.innerHTML;
  if (nextBtn) {
    nextBtn.disabled = true;
    nextBtn.innerHTML = '<span class="material-icons spinning">sync</span> Creating...';
  }

  try {
    // Step 1: Create the convoy
    const result = await api.createConvoy(convoyWizard.name, convoyWizard.issues, convoyWizard.notify || null);
    const convoyId = result?.convoy_id;

    // Step 2: Create integration branch if enabled
    if (convoyWizard.integrationBranch && convoyId) {
      try {
        await api.createIntegrationBranch(convoyId, convoyWizard.branchName || undefined);
      } catch (branchErr) {
        showToast(`Convoy created, but integration branch failed: ${branchErr.message}`, 'warning');
      }
    }

    showToast(`Convoy "${convoyWizard.name}" created`, 'success');
    closeAllModals();
    document.dispatchEvent(new CustomEvent(CONVOY_CREATED, { detail: result }));
  } catch (err) {
    showToast(`Failed to create convoy: ${err.message}`, 'error');
  } finally {
    if (nextBtn) {
      nextBtn.disabled = false;
      nextBtn.innerHTML = originalHtml;
    }
  }
}

// === New Bead Modal ===

function initNewBeadModal(element, data) {
  // Clear any previous state
  const form = element.querySelector('form');
  if (form) form.reset();

  // Populate rig dropdown from status rigs
  const rigSelect = element.querySelector('[name="rig"]');
  if (rigSelect) {
    const rigs = state.getRigs();
    // Keep the default option, remove previously added rig options
    rigSelect.innerHTML = '<option value="">Default (HQ)</option>';
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

  // Pre-fill parent if provided (e.g., creating child task from epic detail)
  const parentInput = element.querySelector('[name="parent"]');
  if (parentInput && data?.parent) {
    parentInput.value = data.parent;
  }
}

async function handleNewBeadSubmit(form) {
  const title = form.querySelector('[name="title"]')?.value;
  const description = form.querySelector('[name="description"]')?.value || '';
  const type = form.querySelector('[name="type"]')?.value || 'task';
  const rig = form.querySelector('[name="rig"]')?.value || '';
  const priority = form.querySelector('[name="priority"]')?.value || 'normal';
  const parent = form.querySelector('[name="parent"]')?.value?.trim() || '';
  const labelsText = form.querySelector('[name="labels"]')?.value || '';
  const slingNow = form.querySelector('[name="sling_now"]')?.checked || false;

  if (!title) {
    showToast('Please enter a title for the bead', 'warning');
    return;
  }

  // Parse labels
  const labels = labelsText
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  // Close modal immediately and show progress toast
  showToast(`Creating work item "${title}"...`, 'info');
  closeAllModals();

  // Run in background (non-blocking)
  api.createBead(title, { description, type, priority, labels, rig: rig || undefined, parent: parent || undefined }).then(result => {
    if (result.success) {
      showToast(`Work item created: ${result.bead_id}`, 'success');

      // Dispatch event for UI refresh
      document.dispatchEvent(new CustomEvent(BEAD_CREATED, { detail: result }));

      // If "sling now" was checked, open sling modal with bead pre-filled
      if (slingNow && result.bead_id) {
        setTimeout(() => {
          openModal('sling', { bead: result.bead_id });
        }, 100);
      }
    } else {
      showToast(`Failed to create work item: ${result.error}`, 'error');
    }
  }).catch(err => {
    showToast(`Failed to create work item: ${err.message}`, 'error');
  });
}

// === Sling Modal ===

// Track autocomplete instances for cleanup
let beadAutocomplete = null;

function initSlingModal(element, data) {
  // Pre-fill if data provided
  if (data.bead) {
    const beadInput = element.querySelector('[name="bead"]');
    if (beadInput) beadInput.value = data.bead;
  }
  if (data.target) {
    const targetInput = element.querySelector('[name="target"]');
    if (targetInput) targetInput.value = data.target;
  }

  // Initialize bead autocomplete
  const beadInput = element.querySelector('[name="bead"]');
  if (beadInput && !beadAutocomplete) {
    beadAutocomplete = initAutocomplete(beadInput, {
      search: async (query) => {
        // Search both beads and formulas
        try {
          const selectedRig = state.getSelectedRig();
          const [beads, formulas] = await Promise.all([
            api.searchBeads(query, { rig: selectedRig }).catch(() => []),
            api.searchFormulas(query).catch(() => []),
          ]);

          // Combine and dedupe results
          const results = [
            ...beads.map(b => ({ ...b, type: 'bead' })),
            ...formulas.map(f => ({ ...f, type: 'formula', id: f.name })),
          ];

          return results;
        } catch {
          // Fallback: provide local suggestions from convoys
          const convoys = state.get('convoys') || [];
          const beadMatches = [];
          convoys.forEach(convoy => {
            if (convoy.issues) {
              convoy.issues.forEach(issue => {
                const id = typeof issue === 'string' ? issue : issue.id;
                if (id && id.toLowerCase().includes(query.toLowerCase())) {
                  beadMatches.push({ id, title: typeof issue === 'object' ? issue.title : '', type: 'bead' });
                }
              });
            }
          });
          return beadMatches;
        }
      },
      renderItem: (item) => {
        if (item.type === 'formula') {
          return `
            <div class="bead-item formula">
              <span class="bead-icon">📜</span>
              <span class="bead-id">${escapeHtml(item.name || item.id)}</span>
              <span class="bead-desc">${escapeHtml(item.description || 'Formula')}</span>
            </div>
          `;
        }
        return renderBeadItem(item);
      },
      onSelect: (item, input) => {
        input.value = item.id || item.name;
      },
      minChars: 1,
      debounce: 150,
    });
  }

  // Populate target dropdown with agents
  populateTargetDropdown(element);
}

async function populateTargetDropdown(modalElement) {
  const targetSelect = modalElement.querySelector('[name="target"]');
  if (!targetSelect) return;

  // Show loading state
  targetSelect.innerHTML = '<option value="">Loading targets...</option>';
  targetSelect.disabled = true;

  try {
    // Get targets from API
    let targets = [];
    try {
      targets = await api.getTargets();
    } catch {
      // Fallback to agents from state
      targets = state.get('agents') || [];
    }

    // Reset and add placeholder
    targetSelect.innerHTML = '<option value="">Select target agent...</option>';
    targetSelect.disabled = false;

    // Group targets by type: global, rig, agent
    const groups = {
      global: { label: 'Global Agents', targets: [] },
      rig: { label: 'Rigs (auto-spawn polecat)', targets: [] },
      agent: { label: 'Running Agents', targets: [] },
    };

    targets.forEach(target => {
      const type = target.type || 'agent';
      if (groups[type]) {
        groups[type].targets.push(target);
      } else {
        groups.agent.targets.push(target);
      }
    });

    // Create optgroups for each non-empty group
    Object.entries(groups).forEach(([type, group]) => {
      if (group.targets.length === 0) return;

      const optgroup = document.createElement('optgroup');
      optgroup.label = group.label;

      group.targets.forEach(target => {
        const option = document.createElement('option');
        option.value = target.id;
        option.textContent = target.name || target.id;

        // Add status indicators
        if (target.has_work) {
          option.textContent += ' (busy)';
          option.className = 'target-busy';
        } else if (target.running === false) {
          option.textContent += ' (stopped)';
          option.className = 'target-stopped';
        }

        // Add description as title
        if (target.description) {
          option.title = target.description;
        }

        optgroup.appendChild(option);
      });

      targetSelect.appendChild(optgroup);
    });

    // If no targets at all, show helpful message
    if (targetSelect.options.length === 1) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No targets available - add a rig first';
      option.disabled = true;
      targetSelect.appendChild(option);
    }
  } catch (err) {
    console.error('[Modals] Failed to populate targets:', err);
    targetSelect.innerHTML = '<option value="">Failed to load targets</option>';
    targetSelect.disabled = false;
  }
}

async function handleSlingSubmit(form) {
  const bead = form.querySelector('[name="bead"]')?.value;
  const target = form.querySelector('[name="target"]')?.value;
  const molecule = form.querySelector('[name="molecule"]')?.value || undefined;

  if (!bead || !target) {
    showToast('Please enter both bead and target', 'warning');
    return;
  }

  // Close modal immediately and show progress toast
  showToast(`Slinging ${bead} → ${target}...`, 'info');
  closeAllModals();

  // Run in background (non-blocking)
  api.sling(bead, target, { molecule }).then(result => {
    showToast(`Work slung: ${bead} → ${target}`, 'success');
    // Dispatch event
    document.dispatchEvent(new CustomEvent(WORK_SLUNG, { detail: result }));
  }).catch(err => {
    // For sling errors, we can't show the fancy error in the modal (it's closed)
    // So just show a toast with the error message
    showToast(`Failed to sling work: ${err.message || 'Unknown error'}`, 'error');
  });
}

function showSlingError(form, errorData) {
  // Remove existing error
  const existing = form.querySelector('.sling-error');
  if (existing) existing.remove();

  const errorDiv = document.createElement('div');
  errorDiv.className = 'sling-error';

  if (errorData.errorType === 'formula_missing') {
    errorDiv.innerHTML = `
      <div class="sling-error-icon">
        <span class="material-icons">warning</span>
      </div>
      <div class="sling-error-content">
        <div class="sling-error-title">Formula Not Found</div>
        <div class="sling-error-message">
          <code>${escapeHtml(errorData.formula)}</code> doesn't exist yet.
        </div>
        <div class="sling-error-hint">${escapeHtml(errorData.hint)}</div>
        <div class="sling-error-actions">
          <button type="button" class="btn btn-secondary btn-sm" onclick="this.closest('.sling-error').remove();">
            <span class="material-icons">close</span>
            Dismiss
          </button>
        </div>
      </div>
    `;
  } else if (errorData.errorType === 'bead_missing') {
    errorDiv.innerHTML = `
      <div class="sling-error-icon">
        <span class="material-icons">search_off</span>
      </div>
      <div class="sling-error-content">
        <div class="sling-error-title">Bead Not Found</div>
        <div class="sling-error-message">${escapeHtml(errorData.hint)}</div>
      </div>
    `;
  } else {
    errorDiv.innerHTML = `
      <div class="sling-error-icon">
        <span class="material-icons">error</span>
      </div>
      <div class="sling-error-content">
        <div class="sling-error-title">Sling Failed</div>
        <div class="sling-error-message">${escapeHtml(errorData.error || 'Unknown error')}</div>
      </div>
    `;
  }

  // Insert before submit button
  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn?.parentElement) {
    submitBtn.parentElement.insertBefore(errorDiv, submitBtn);
  } else {
    form.appendChild(errorDiv);
  }
}

// === Mail Compose Modal ===

function initMailComposeModal(element, data) {
  // Populate recipient dropdown
  populateRecipientDropdown(element, data.replyTo);

  // Pre-fill subject if replying
  if (data.subject) {
    const subjectInput = element.querySelector('[name="subject"]');
    if (subjectInput) subjectInput.value = `Re: ${data.subject}`;
  }
}

async function populateRecipientDropdown(modalElement, preselect = null) {
  const toSelect = modalElement.querySelector('[name="to"]');
  if (!toSelect) return;

  // Keep first option (placeholder)
  const placeholder = toSelect.options[0];
  toSelect.innerHTML = '';
  toSelect.appendChild(placeholder);

  try {
    // Try to get agents from API first
    let agents = [];
    try {
      agents = await api.getAgents();
    } catch {
      // Fallback to agents from state
      agents = state.get('agents') || [];
    }

    // Add common recipients group
    const commonGroup = document.createElement('optgroup');
    commonGroup.label = 'Common Recipients';

    // Always include Mayor and Overseer
    const commonRecipients = [
      { id: 'mayor/', name: 'Mayor', role: 'mayor' },
      { id: 'human', name: 'Human Overseer', role: 'overseer' },
    ];

    commonRecipients.forEach(r => {
      const option = document.createElement('option');
      option.value = r.id;
      option.textContent = r.name;
      option.className = `recipient-${r.role}`;
      commonGroup.appendChild(option);
    });
    toSelect.appendChild(commonGroup);

    // Group agents by role
    const roleGroups = new Map();
    const roleOrder = ['deacon', 'witness', 'refinery', 'polecat'];

    agents.forEach(agent => {
      const role = (agent.role || 'worker').toLowerCase();
      if (!roleGroups.has(role)) {
        roleGroups.set(role, []);
      }
      roleGroups.get(role).push(agent);
    });

    // Create optgroups for each role
    roleOrder.forEach(role => {
      const roleAgents = roleGroups.get(role);
      if (!roleAgents || roleAgents.length === 0) return;

      const optgroup = document.createElement('optgroup');
      optgroup.label = capitalize(role) + 's';

      roleAgents.forEach(agent => {
        const option = document.createElement('option');
        option.value = agent.path || agent.id || agent.name;
        option.textContent = agent.name || agent.id;
        option.className = `recipient-${role}`;
        optgroup.appendChild(option);
      });

      toSelect.appendChild(optgroup);
    });

    // Add any remaining roles
    roleGroups.forEach((roleAgents, role) => {
      if (roleOrder.includes(role)) return;
      if (roleAgents.length === 0) return;

      const optgroup = document.createElement('optgroup');
      optgroup.label = capitalize(role) + 's';

      roleAgents.forEach(agent => {
        const option = document.createElement('option');
        option.value = agent.path || agent.id || agent.name;
        option.textContent = agent.name || agent.id;
        optgroup.appendChild(option);
      });

      toSelect.appendChild(optgroup);
    });

    // Pre-select if replying
    if (preselect) {
      toSelect.value = preselect;
    }

  } catch (err) {
    console.error('[Modals] Failed to populate recipients:', err);
  }
}

// === Help Modal ===

function initHelpModal(element) {
  // Set up tab switching
  const tabs = element.querySelectorAll('.help-tab');
  const panels = element.querySelectorAll('.help-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.dataset.tab;

      // Update active tab
      tabs.forEach(t => t.classList.toggle('active', t === tab));

      // Update active panel
      panels.forEach(p => {
        p.classList.toggle('active', p.id === `help-${tabId}`);
      });
    });
  });
}

// === New Rig Modal ===

// Cache for GitHub repos
let cachedGitHubRepos = null;

function initNewRigModal(element, data) {
  const form = element.querySelector('form');
  if (form) form.reset();

  // Reset GitHub repo picker state
  const repoList = document.getElementById('github-repo-list');
  const pickerBtn = document.getElementById('github-repo-picker-btn');
  if (repoList) repoList.classList.add('hidden');
  if (pickerBtn) {
    pickerBtn.querySelector('.btn-text').textContent = 'Load My Repositories';
    pickerBtn.disabled = false;
  }

  // Set up GitHub repo picker button
  pickerBtn?.addEventListener('click', loadGitHubRepos, { once: true });

  // Set up search filtering with debounce
  const searchInput = document.getElementById('github-repo-search');
  const debouncedFilter = debounce((value) => filterGitHubRepos(value), 150);
  searchInput?.addEventListener('input', (e) => {
    debouncedFilter(e.target.value);
  });
}

async function loadGitHubRepos() {
  const pickerBtn = document.getElementById('github-repo-picker-btn');
  const repoList = document.getElementById('github-repo-list');
  const repoItems = document.getElementById('github-repo-items');

  if (!pickerBtn || !repoList || !repoItems) return;

  // Show loading state
  pickerBtn.disabled = true;
  pickerBtn.querySelector('.btn-text').textContent = 'Loading...';
  repoItems.innerHTML = '<div class="github-repo-loading"><span class="loading-spinner"></span> Loading repositories...</div>';
  repoList.classList.remove('hidden');

  try {
    // Use cached repos if available
    if (!cachedGitHubRepos) {
      cachedGitHubRepos = await api.getGitHubRepos({ limit: 100 });
    }

    renderGitHubRepos(cachedGitHubRepos);
    pickerBtn.querySelector('.btn-text').textContent = 'Refresh List';
    pickerBtn.disabled = false;

    // Re-add click listener for refresh
    pickerBtn.addEventListener('click', async () => {
      cachedGitHubRepos = null;
      await loadGitHubRepos();
    }, { once: true });

  } catch (err) {
    repoItems.innerHTML = `<div class="github-repo-empty">Failed to load repos: ${escapeHtml(err.message)}</div>`;
    pickerBtn.querySelector('.btn-text').textContent = 'Retry';
    pickerBtn.disabled = false;
    pickerBtn.addEventListener('click', loadGitHubRepos, { once: true });
  }
}

function renderGitHubRepos(repos) {
  const repoItems = document.getElementById('github-repo-items');
  if (!repoItems) return;

  if (!repos || repos.length === 0) {
    repoItems.innerHTML = '<div class="github-repo-empty">No repositories found</div>';
    return;
  }

  repoItems.innerHTML = repos.map(repo => `
    <div class="github-repo-item ${repo.isPrivate ? 'private' : ''}"
         data-name="${escapeAttr(repo.name)}"
         data-url="${escapeAttr(repo.url)}">
      <span class="material-icons repo-icon">${repo.isPrivate ? 'lock' : 'public'}</span>
      <div class="repo-info">
        <div class="repo-name">${escapeHtml(repo.nameWithOwner)}</div>
        <div class="repo-desc">${escapeHtml(repo.description || 'No description')}</div>
      </div>
      <div class="repo-meta">
        ${repo.primaryLanguage ? `
          <span class="repo-lang">
            <span class="lang-dot" style="background: ${getLanguageColor(repo.primaryLanguage.name)}"></span>
            ${escapeHtml(repo.primaryLanguage.name)}
          </span>
        ` : ''}
      </div>
    </div>
  `).join('');

  // Add click handlers
  repoItems.querySelectorAll('.github-repo-item').forEach(item => {
    item.addEventListener('click', () => selectGitHubRepo(item));
  });
}

function filterGitHubRepos(query) {
  if (!cachedGitHubRepos) return;

  const q = query.toLowerCase();
  const filtered = cachedGitHubRepos.filter(repo =>
    repo.name.toLowerCase().includes(q) ||
    repo.nameWithOwner.toLowerCase().includes(q) ||
    (repo.description || '').toLowerCase().includes(q)
  );
  renderGitHubRepos(filtered);
}

function selectGitHubRepo(item) {
  const name = item.dataset.name;
  const url = item.dataset.url;

  // Fill in the form fields
  const nameInput = document.getElementById('rig-name');
  const urlInput = document.getElementById('rig-url');

  if (nameInput) nameInput.value = name;
  if (urlInput) urlInput.value = url;

  // Hide the repo list
  const repoList = document.getElementById('github-repo-list');
  if (repoList) repoList.classList.add('hidden');

  // Show feedback
  showToast(`Selected: ${name}`, 'success');
}

function getLanguageColor(lang) {
  const colors = {
    'JavaScript': '#f1e05a',
    'TypeScript': '#3178c6',
    'Python': '#3572A5',
    'Go': '#00ADD8',
    'Rust': '#dea584',
    'Ruby': '#701516',
    'Java': '#b07219',
    'C#': '#178600',
    'C++': '#f34b7d',
    'C': '#555555',
    'PHP': '#4F5D95',
    'Swift': '#F05138',
    'Kotlin': '#A97BFF',
    'Markdown': '#083fa1',
  };
  return colors[lang] || '#8b949e';
}

async function handleNewRigSubmit(form) {
  const name = form.querySelector('[name="name"]')?.value?.trim();
  const url = form.querySelector('[name="url"]')?.value?.trim();

  if (!name || !url) {
    showToast('Please enter both name and path', 'warning');
    return;
  }

  // Validate name format (lowercase, numbers, hyphens only)
  if (!/^[a-z0-9-]+$/.test(name)) {
    showToast('Rig name must be lowercase letters, numbers, and hyphens only (no spaces)', 'warning');
    return;
  }

  // Close modal immediately and show progress toast
  showToast(`Adding rig "${name}"...`, 'info');
  closeAllModals();

  // Run in background (non-blocking)
  api.addRig(name, url).then(result => {
    if (result.success) {
      showToast(`Rig "${name}" added successfully`, 'success');
      // Trigger refresh
      document.dispatchEvent(new CustomEvent(RIGS_REFRESH));
    } else {
      showToast(`Failed to add rig: ${result.error}`, 'error');
    }
  }).catch(err => {
    showToast(`Failed to add rig: ${err.message}`, 'error');
  });
}

async function handleMailComposeSubmit(form) {
  const to = form.querySelector('[name="to"]')?.value;
  const subject = form.querySelector('[name="subject"]')?.value;
  const message = form.querySelector('[name="message"]')?.value;
  const priority = form.querySelector('[name="priority"]')?.value || 'normal';

  if (!to || !subject || !message) {
    showToast('Please fill in all fields', 'warning');
    return;
  }

  // Show loading state
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn?.innerHTML;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="material-icons spinning">sync</span> Sending...';
  }

  try {
    await api.sendMail(to, subject, message, priority);
    showToast('Mail sent', 'success');
    closeAllModals();
  } catch (err) {
    showToast(`Failed to send mail: ${err.message}`, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  }
}

// === Dynamic Modals ===

async function showConvoyDetailModal(convoyId) {
  // Show loading modal immediately
  const loadingContent = `
    <div class="modal-header">
      <h2>Convoy: ${escapeHtml(convoyId)}</h2>
      <button class="btn btn-icon" data-modal-close>
        <span class="material-icons">close</span>
      </button>
    </div>
    <div class="modal-body">
      <div class="loading-state">
        <span class="loading-spinner"></span>
        Loading convoy details...
      </div>
    </div>
  `;
  const modal = showDynamicModal('convoy-detail', loadingContent);

  try {
    const convoy = await api.getConvoy(convoyId);
    const content = `
      <div class="modal-header">
        <h2>Convoy: ${escapeHtml(convoy.name || convoy.id)}</h2>
        <button class="btn btn-icon" data-modal-close>
          <span class="material-icons">close</span>
        </button>
      </div>
      <div class="modal-body">
        <div class="detail-grid">
          <div class="detail-item">
            <label>ID</label>
            <span>${convoyId}</span>
          </div>
          <div class="detail-item">
            <label>Status</label>
            <span class="status-badge status-${convoy.status || 'pending'}">${convoy.status || 'pending'}</span>
          </div>
          <div class="detail-item">
            <label>Created</label>
            <span>${new Date(convoy.created_at).toLocaleString()}</span>
          </div>
          ${convoy.issues?.length ? `
            <div class="detail-item full-width">
              <label>Issues</label>
              <ul class="issue-list">
                ${convoy.issues.map(i => `<li>${escapeHtml(typeof i === 'string' ? i : i.title)}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
        </div>
      </div>
    `;
    modal.innerHTML = content;

    // Re-add close button handler
    modal.querySelector('[data-modal-close]')?.addEventListener('click', closeAllModals);
  } catch (err) {
    modal.innerHTML = `
      <div class="modal-header">
        <h2>Convoy: ${escapeHtml(convoyId)}</h2>
        <button class="btn btn-icon" data-modal-close>
          <span class="material-icons">close</span>
        </button>
      </div>
      <div class="modal-body">
        <div class="error-state">
          <span class="material-icons">error_outline</span>
          <p>Failed to load convoy: ${escapeHtml(err.message)}</p>
        </div>
      </div>
    `;
    modal.querySelector('[data-modal-close]')?.addEventListener('click', closeAllModals);
  }
}

async function showAgentDetailModal(agentId) {
  // For now show a simple modal - can be expanded later
  const content = `
    <div class="modal-header">
      <h2>Agent Details</h2>
      <button class="btn btn-icon" data-modal-close>
        <span class="material-icons">close</span>
      </button>
    </div>
    <div class="modal-body">
      <p>Agent ID: <code>${escapeHtml(agentId)}</code></p>
      <p>Detailed agent view coming soon...</p>
    </div>
  `;
  showDynamicModal('agent-detail', content);
}

function showNudgeModal(agentId) {
  const content = `
    <div class="modal-header">
      <h2>Nudge Agent</h2>
      <button class="btn btn-icon" data-modal-close>
        <span class="material-icons">close</span>
      </button>
    </div>
    <div class="modal-body">
      <form id="nudge-form">
        <input type="hidden" name="agent_id" value="${escapeAttr(agentId)}">
        <div class="form-group">
          <label for="nudge-message">Message</label>
          <textarea id="nudge-message" name="message" rows="3" placeholder="Enter a message to send to the agent..."></textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" data-modal-close>Cancel</button>
          <button type="submit" class="btn btn-primary">
            <span class="material-icons">send</span>
            Send Nudge
          </button>
        </div>
      </form>
    </div>
  `;

  const modal = showDynamicModal('nudge', content);

  // Handle form submission
  const form = modal.querySelector('#nudge-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = form.querySelector('[name="message"]')?.value;

    // Show loading state
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn?.innerHTML;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="material-icons spinning">sync</span> Sending...';
    }

    try {
      await api.nudge(agentId, message);
      showToast('Nudge sent', 'success');
      closeAllModals();
    } catch (err) {
      showToast(`Failed to nudge agent: ${err.message}`, 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    }
  });
}

function showMailDetailModal(mailId, mail) {
  const content = `
    <div class="modal-header">
      <h2>${escapeHtml(mail.subject || '(No Subject)')}</h2>
      <button class="btn btn-icon" data-modal-close>
        <span class="material-icons">close</span>
      </button>
    </div>
    <div class="modal-body">
      <div class="mail-detail-meta">
        <div><strong>From:</strong> ${escapeHtml(mail.from || 'System')}</div>
        <div><strong>Date:</strong> ${new Date(mail.timestamp).toLocaleString()}</div>
        ${mail.priority && mail.priority !== 'normal' ? `<div><strong>Priority:</strong> ${mail.priority}</div>` : ''}
      </div>
      <div class="mail-detail-body">
        ${escapeHtml(mail.message || mail.body || '(No content)')}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" data-action="reply">
        <span class="material-icons">reply</span>
        Reply
      </button>
    </div>
  `;
  const modal = showDynamicModal('mail-detail', content);
  modal.querySelector('[data-action="reply"]')?.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent(MAIL_REPLY, { detail: { mail } }));
  });
}

// === Bead Detail Modal ===

async function showBeadDetailModal(beadId, bead) {
  if (!bead) {
    try {
      bead = await api.getBead(beadId);
    } catch {
      showToast('Failed to load bead details', 'error');
      return;
    }
    if (!bead || !bead.id) {
      showToast('Bead not found', 'warning');
      return;
    }
  }

  const statusIcons = {
    open: 'radio_button_unchecked',
    closed: 'check_circle',
    'in-progress': 'pending',
    in_progress: 'pending',
    blocked: 'block',
  };

  const typeIcons = {
    task: 'task_alt',
    bug: 'bug_report',
    feature: 'star',
    chore: 'build',
    epic: 'flag',
  };

  const statusIcon = statusIcons[bead.status] || 'help_outline';
  const typeIcon = typeIcons[bead.issue_type] || 'assignment';
  const assignee = bead.assignee ? bead.assignee.split('/').pop() : null;

  // Parse close_reason for links (pass beadId for GitHub URL lookup)
  const closeReasonHtml = bead.close_reason
    ? parseCloseReasonForModal(bead.close_reason, beadId)
    : '';
  const priority = getBeadPriority(bead);

  const content = `
    <div class="modal-header bead-detail-header">
      <div class="bead-detail-title-row">
        <span class="material-icons status-icon status-${bead.status}">${statusIcon}</span>
        <h2>${escapeHtml(bead.title)}</h2>
      </div>
      <button class="btn btn-icon" data-modal-close>
        <span class="material-icons">close</span>
      </button>
    </div>
    <div class="modal-body bead-detail-body">
      <div class="bead-detail-meta">
        <div class="meta-row">
          <span class="meta-label">ID:</span>
          <code class="bead-id-code">${escapeHtml(beadId)}</code>
          <button class="btn btn-icon btn-xs copy-btn" data-copy="${beadId}" title="Copy ID">
            <span class="material-icons">content_copy</span>
          </button>
        </div>
        <div class="meta-row">
          <span class="meta-label">Type:</span>
          <span class="meta-value">
            <span class="material-icons">${typeIcon}</span>
            ${bead.issue_type || 'task'}
          </span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Priority:</span>
          <span class="priority-badge priority-${priority}">P${priority}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Status:</span>
          <span class="status-badge status-${bead.status}">${bead.status || 'open'}</span>
        </div>
        ${assignee ? `
          <div class="meta-row">
            <span class="meta-label">Assignee:</span>
            <span class="meta-value">
              <span class="material-icons">person</span>
              ${escapeHtml(assignee)}
            </span>
          </div>
        ` : ''}
        <div class="meta-row">
          <span class="meta-label">Created:</span>
          <span class="meta-value">${bead.created_at ? new Date(bead.created_at).toLocaleString() : 'Unknown'}</span>
        </div>
        ${bead.closed_at ? `
          <div class="meta-row">
            <span class="meta-label">Completed:</span>
            <span class="meta-value">${new Date(bead.closed_at).toLocaleString()}</span>
          </div>
        ` : ''}
      </div>

      ${bead.description ? `
        <div class="bead-detail-section">
          <h4>Description</h4>
          <div class="bead-description">${escapeHtml(bead.description)}</div>
        </div>
      ` : ''}

      ${bead.close_reason ? `
        <div class="bead-detail-section completion-section">
          <h4>
            <span class="material-icons">check_circle</span>
            Completion Summary
          </h4>
          <div class="bead-close-reason">${closeReasonHtml}</div>
        </div>
      ` : ''}

      ${bead.labels && bead.labels.length > 0 ? `
        <div class="bead-detail-section">
          <h4>Labels</h4>
          <div class="bead-labels">
            ${bead.labels.map(l => `<span class="label-tag">${escapeHtml(l)}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      ${bead.parent_id ? `
        <div class="meta-row">
          <span class="meta-label">Parent:</span>
          <a href="#" class="bead-parent-link" data-parent-id="${escapeAttr(bead.parent_id)}">${escapeHtml(bead.parent_id)}</a>
        </div>
      ` : ''}

      <div class="bead-detail-section bead-deps-section" id="bead-deps-section">
        <h4>
          <span class="material-icons">account_tree</span>
          Dependencies
        </h4>
        <div class="bead-deps-content" id="bead-deps-content">
          <div class="loading-inline">
            <span class="material-icons spinning">sync</span>
            Loading dependencies...
          </div>
        </div>
        ${bead.status !== 'closed' ? `
          <div class="bead-dep-add">
            <input type="text" class="dep-add-input" id="dep-add-input"
                   placeholder="Add dependency (bead ID)..." />
            <button class="btn btn-sm btn-primary dep-add-btn" id="dep-add-btn" title="Add dependency">
              <span class="material-icons">add</span>
            </button>
          </div>
        ` : ''}
      </div>

      ${bead.issue_type === 'epic' ? `
        <div class="bead-detail-section epic-children-container" id="epic-children-container">
        </div>
      ` : ''}

      <div class="bead-detail-section bead-links-section" id="bead-links-section">
        <h4>
          <span class="material-icons">link</span>
          Related Links
        </h4>
        <div class="bead-links-content" id="bead-links-content">
          <div class="loading-inline">
            <span class="material-icons spinning">sync</span>
            Searching for PRs...
          </div>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" data-modal-close>Close</button>
      ${bead.status !== 'closed' ? `
        <button class="btn btn-primary sling-btn" data-bead-id="${beadId}">
          <span class="material-icons">send</span>
          Sling Work
        </button>
      ` : ''}
    </div>
  `;

  const modal = showDynamicModal('bead-detail', content);

  // Load epic children if this is an epic
  if (bead.issue_type === 'epic') {
    const epicContainer = modal.querySelector('#epic-children-container');
    if (epicContainer) {
      loadAndRenderEpicChildren(beadId, epicContainer);
    }
  }

  // Load and render dependencies
  loadBeadDependencies(beadId, bead, modal);

  // Wire parent link
  const parentLink = modal.querySelector('.bead-parent-link');
  if (parentLink) {
    parentLink.addEventListener('click', (e) => {
      e.preventDefault();
      const parentId = parentLink.dataset.parentId;
      closeAllModals();
      document.dispatchEvent(new CustomEvent(BEAD_DETAIL, { detail: { beadId: parentId } }));
    });
  }

  // Add sling button handler
  const slingBtn = modal.querySelector('.sling-btn');
  if (slingBtn) {
    slingBtn.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent(BEAD_SLING, { detail: { beadId } }));
      closeAllModals();
    });
  }

  // Add copy button handlers
  modal.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = btn.dataset.copy;
      navigator.clipboard.writeText(text).then(() => {
        showToast(`Copied: ${text}`, 'success');
      });
    });
  });

  // Add commit link handlers (copy-only, no GitHub URL)
  modal.querySelectorAll('.commit-copy').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const hash = link.dataset.commit;
      navigator.clipboard.writeText(hash).then(() => {
        showToast(`Copied commit: ${hash}`, 'success');
      });
    });
  });

  // Add PR link handlers (copy-only, no GitHub URL)
  modal.querySelectorAll('.pr-copy').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const pr = link.dataset.pr;
      navigator.clipboard.writeText(`#${pr}`).then(() => {
        showToast(`Copied: PR #${pr}`, 'success');
      });
    });
  });

  // Fetch and display related links (PRs, commits)
  fetchBeadLinks(beadId, modal);
}

async function loadBeadDependencies(beadId, bead, modal) {
  const depsContent = modal.querySelector('#bead-deps-content');
  if (!depsContent) return;

  try {
    const deps = await api.getDependencies(beadId);
    if (!deps || deps.length === 0) {
      depsContent.innerHTML = '<div class="no-deps"><span class="material-icons">link_off</span> No dependencies</div>';
    } else {
      depsContent.innerHTML = deps.map(dep => {
        const depId = dep.dependency_id || dep.id || dep;
        const depType = dep.dependency_type || 'depends_on';
        return `
          <div class="dep-item">
            <span class="dep-type-badge">${escapeHtml(depType)}</span>
            <a href="#" class="dep-link" data-dep-id="${escapeAttr(depId)}">${escapeHtml(depId)}</a>
            ${bead.status !== 'closed' ? `
              <button class="btn btn-xs btn-ghost dep-remove-btn" data-dep-id="${escapeAttr(depId)}" title="Remove dependency">
                <span class="material-icons">close</span>
              </button>
            ` : ''}
          </div>
        `;
      }).join('');

      // Wire dep link clicks
      depsContent.querySelectorAll('.dep-link').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const depId = link.dataset.depId;
          closeAllModals();
          document.dispatchEvent(new CustomEvent(BEAD_DETAIL, { detail: { beadId: depId } }));
        });
      });

      // Wire remove buttons
      depsContent.querySelectorAll('.dep-remove-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const depId = btn.dataset.depId;
          btn.disabled = true;
          try {
            const result = await api.removeDependency(beadId, depId);
            if (result.success) {
              showToast(`Dependency removed: ${depId}`, 'success');
              loadBeadDependencies(beadId, bead, modal);
            } else {
              showToast(`Failed: ${result.error}`, 'error');
            }
          } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
          }
          btn.disabled = false;
        });
      });
    }
  } catch {
    depsContent.innerHTML = '<div class="no-deps"><span class="material-icons">link_off</span> No dependencies</div>';
  }

  // Wire add dependency button
  const addBtn = modal.querySelector('#dep-add-btn');
  const addInput = modal.querySelector('#dep-add-input');
  if (addBtn && addInput) {
    const handleAdd = async () => {
      const depId = addInput.value.trim();
      if (!depId) return;
      addBtn.disabled = true;
      try {
        const result = await api.addDependency(beadId, depId);
        if (result.success) {
          showToast(`Dependency added: ${depId}`, 'success');
          addInput.value = '';
          loadBeadDependencies(beadId, bead, modal);
        } else {
          showToast(`Failed: ${result.error}`, 'error');
        }
      } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
      }
      addBtn.disabled = false;
    };

    addBtn.addEventListener('click', handleAdd);
    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
      }
    });
  }
}

async function fetchBeadLinks(beadId, modal) {
  const linksContent = modal.querySelector('#bead-links-content');
  if (!linksContent) return;

  try {
    const links = await api.getBeadLinks(beadId);

    if (!links.prs || links.prs.length === 0) {
      linksContent.innerHTML = `
        <div class="no-links">
          <span class="material-icons">link_off</span>
          No related PRs found
        </div>
      `;
      return;
    }

    const prHtml = links.prs.map(pr => {
      const stateIcon = pr.state === 'MERGED' ? 'merge' :
                        pr.state === 'CLOSED' ? 'close' :
                        'git_merge';
      const stateClass = pr.state.toLowerCase();
      return `
        <a href="${pr.url}" target="_blank" class="pr-link pr-state-${stateClass}">
          <span class="material-icons">${stateIcon}</span>
          <span class="pr-info">
            <span class="pr-title">${escapeHtml(pr.title)}</span>
            <span class="pr-meta">${pr.repo} #${pr.number}</span>
          </span>
          <span class="material-icons open-icon">open_in_new</span>
        </a>
      `;
    }).join('');

    linksContent.innerHTML = prHtml;
  } catch (err) {
    console.error('[Links] Error fetching links:', err);
    linksContent.innerHTML = `
      <div class="no-links">
        <span class="material-icons">error_outline</span>
        Could not fetch links
      </div>
    `;
  }
}

/**
 * Parse close_reason for the detail modal (with more formatting)
 */
function parseCloseReasonForModal(text, beadId) {
  if (!text) return '';

  let result = parseCloseReason(text, beadId);

  // Upgrade commit links to modal-specific styling (icon + short hash)
  result = result.replace(/<a\b[^>]*\bdata-commit="([^"]+)"[^>]*>.*?<\/a>/gi, (match, hash) => {
    const href = match.match(/href="([^"]+)"/i)?.[1] ?? '#';
    const shortHash = String(hash).substring(0, 7);
    const isCopy = href === '#' || /\bcommit-copy\b/i.test(match);

    if (isCopy) {
      return `<a href="#" class="commit-copy code-link" data-commit="${hash}" title="Click to copy">
        <span class="material-icons">commit</span>${shortHash}
      </a>`;
    }

    return `<a href="${href}" target="_blank" class="commit-link code-link" data-commit="${hash}" title="View on GitHub">
        <span class="material-icons">commit</span>${shortHash}
      </a>`;
  });

  // Upgrade PR links to modal-specific styling (icon)
  result = result.replace(/<a\b[^>]*\bdata-pr="([^"]+)"[^>]*>.*?<\/a>/gi, (match, num) => {
    const href = match.match(/href="([^"]+)"/i)?.[1] ?? '#';
    const isCopy = href === '#' || /\bpr-copy\b/i.test(match);

    if (isCopy) {
      return `<a href="#" class="pr-copy code-link" data-pr="${num}" title="Click to copy">
        <span class="material-icons">merge</span>PR #${num}
      </a>`;
    }

    return `<a href="${href}" target="_blank" class="pr-link code-link" data-pr="${num}" title="View on GitHub">
        <span class="material-icons">merge</span>PR #${num}
      </a>`;
  });

  // Replace file paths (→ filename.ext pattern)
  result = result.replace(/→\s*([A-Za-z0-9_.-]+\.[A-Za-z0-9]+)/g, (match, filename) => {
    return `→ <code class="filename">${filename}</code>`;
  });

  return result;
}

// === Escalation Modal ===

function showEscalationModal(convoyId, convoyName) {
  const content = `
    <div class="modal-header escalation-header">
      <h2>
        <span class="material-icons warning-icon">warning</span>
        Escalate Issue
      </h2>
      <button class="btn btn-icon" data-modal-close>
        <span class="material-icons">close</span>
      </button>
    </div>
    <div class="modal-body">
      <div class="escalation-info">
        <p>You are about to escalate convoy: <strong>${escapeHtml(convoyName || convoyId)}</strong></p>
        <p class="escalation-warning">This will notify the Mayor and may interrupt other workflows.</p>
      </div>
      <form id="escalation-form">
        <input type="hidden" name="convoy_id" value="${convoyId}">
        <div class="form-group">
          <label for="escalation-reason">Reason for Escalation</label>
          <textarea
            id="escalation-reason"
            name="reason"
            rows="4"
            required
            placeholder="Describe why this issue needs immediate attention..."
          ></textarea>
        </div>
        <div class="form-group">
          <label for="escalation-priority">Priority Level</label>
          <select id="escalation-priority" name="priority">
            <option value="normal">Normal - Needs attention soon</option>
            <option value="high">High - Blocking other work</option>
            <option value="critical">Critical - Production issue</option>
          </select>
        </div>
        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" name="block_others" value="true">
            Block new work assignments until resolved
          </label>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" data-modal-close>Cancel</button>
          <button type="submit" class="btn btn-danger">
            <span class="material-icons">priority_high</span>
            Escalate
          </button>
        </div>
      </form>
    </div>
  `;

  const modal = showDynamicModal('escalation', content);

  // Handle form submission
  const form = modal.querySelector('#escalation-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const reason = form.querySelector('[name="reason"]')?.value;
    const priority = form.querySelector('[name="priority"]')?.value || 'normal';

    if (!reason) {
      showToast('Please provide a reason for escalation', 'warning');
      return;
    }

    // Show loading state
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn?.innerHTML;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="material-icons spinning">sync</span> Escalating...';
    }

    try {
      await api.escalate(convoyId, reason, priority);
      showToast('Issue escalated to Mayor', 'success');
      closeAllModals();

      // Dispatch event for UI updates
      document.dispatchEvent(new CustomEvent(CONVOY_ESCALATED, {
        detail: { convoyId, reason, priority }
      }));
    } catch (err) {
      showToast(`Failed to escalate: ${err.message}`, 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    }
  });
}

/**
 * Show a dynamic modal with custom content
 */
function showDynamicModal(id, content) {
  // Remove existing dynamic modal if present
  const existing = document.getElementById(`${id}-modal`);
  if (existing) existing.remove();

  // Create new modal
  const modal = document.createElement('div');
  modal.id = `${id}-modal`;
  modal.className = 'modal';
  modal.innerHTML = content;

  // Add to overlay (not body - modals must be inside overlay)
  const modalOverlay = overlay || document.getElementById('modal-overlay');
  modalOverlay.appendChild(modal);

  // Register and show
  registerModal(id, { element: modal });
  overlay?.classList.remove('hidden');
  modal.classList.remove('hidden');

  // Wire up close buttons
  modal.querySelectorAll('[data-modal-close]').forEach(btn => {
    btn.addEventListener('click', closeAllModals);
  });

  return modal;
}

// === Peek Modal ===

function initPeekModal(element, data) {
  // Set up refresh button
  const refreshBtn = element.querySelector('#peek-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      if (currentPeekAgentId) {
        refreshPeekOutput(currentPeekAgentId);
      }
    });
  }

  // Set up auto-refresh toggle
  const autoRefreshToggle = element.querySelector('#peek-auto-refresh-toggle');
  if (autoRefreshToggle) {
    autoRefreshToggle.addEventListener('change', (e) => {
      if (e.target.checked) {
        startAutoRefresh();
      } else {
        stopAutoRefresh();
      }
    });
  }

  // Set up transcript button
  const transcriptBtn = element.querySelector('#peek-transcript');
  if (transcriptBtn) {
    transcriptBtn.addEventListener('click', () => {
      if (currentPeekAgentId) {
        showAgentTranscript(currentPeekAgentId);
      }
    });
  }
}

async function showPeekModal(agentId) {
  currentPeekAgentId = agentId;

  // Parse agent ID (format: "rig/name")
  const parts = agentId.split('/');
  const rig = parts[0];
  const name = parts[1] || parts[0];

  // Update header
  const headerEl = document.getElementById('peek-agent-name');
  if (headerEl) {
    headerEl.textContent = `Output: ${name}`;
  }

  // Reset auto-refresh state
  const autoRefreshToggle = document.getElementById('peek-auto-refresh-toggle');
  if (autoRefreshToggle) {
    autoRefreshToggle.checked = false;
  }
  stopAutoRefresh();

  // Open modal
  openModal('peek', { agentId, rig, name });

  // Fetch initial output
  await refreshPeekOutput(agentId);
}

async function refreshPeekOutput(agentId) {
  const parts = agentId.split('/');
  const rig = parts[0];
  const name = parts[1] || parts[0];

  const statusEl = document.getElementById('peek-status');
  const outputEl = document.getElementById('peek-output');
  const outputContent = outputEl?.querySelector('.output-content');

  if (statusEl) {
    statusEl.innerHTML = '<span class="loading-spinner"></span> Loading...';
  }

  try {
    const response = await api.getPeekOutput(rig, name);

    // Update status
    if (statusEl) {
      const statusClass = response.running ? 'status-running' : 'status-stopped';
      const statusText = response.running ? 'Running' : 'Stopped';
      const sessionInfo = response.session ? ` (${response.session})` : '';
      statusEl.innerHTML = `
        <span class="peek-status-badge ${statusClass}">
          <span class="material-icons">${response.running ? 'play_circle' : 'stop_circle'}</span>
          ${statusText}
        </span>
        <span class="peek-session-info">${sessionInfo}</span>
      `;
    }

    // Update output
    if (outputContent) {
      if (response.output && response.output.trim()) {
        outputContent.textContent = response.output;
        // Scroll to bottom
        outputEl.scrollTop = outputEl.scrollHeight;
      } else {
        outputContent.textContent = '(No output available)';
      }
    }
  } catch (err) {
    if (statusEl) {
      statusEl.innerHTML = `
        <span class="peek-status-badge status-error">
          <span class="material-icons">error</span>
          Error
        </span>
      `;
    }
    if (outputContent) {
      outputContent.textContent = `Failed to fetch output: ${err.message}`;
    }
    console.error('[Peek] Failed to fetch output:', err);
  }
}

function startAutoRefresh() {
  if (peekAutoRefreshInterval) return;

  peekAutoRefreshInterval = setInterval(() => {
    if (currentPeekAgentId) {
      refreshPeekOutput(currentPeekAgentId);
    }
  }, PEEK_AUTO_REFRESH_INTERVAL_MS);
}

function stopAutoRefresh() {
  if (peekAutoRefreshInterval) {
    clearInterval(peekAutoRefreshInterval);
    peekAutoRefreshInterval = null;
  }
}

async function showAgentTranscript(agentId) {
  const parts = agentId.split('/');
  const rig = parts[0];
  const name = parts[1] || parts[0];

  // Show loading in a modal
  const loadingContent = `
    <div class="modal-header">
      <h2>
        <span class="material-icons">article</span>
        Transcript: ${escapeHtml(name)}
      </h2>
      <button class="btn btn-icon" data-modal-close>
        <span class="material-icons">close</span>
      </button>
    </div>
    <div class="modal-body transcript-body">
      <div class="transcript-loading">
        <span class="loading-spinner"></span>
        <p>Loading transcript...</p>
      </div>
    </div>
  `;
  const modal = showDynamicModal('transcript', loadingContent);

  try {
    const response = await api.getAgentTranscript(rig, name);

    // Build transcript content
    let transcriptHtml = '';

    // Claude session transcript files
    if (response.transcripts && response.transcripts.length > 0) {
      transcriptHtml += `
        <div class="transcript-section">
          <h3>
            <span class="material-icons">history</span>
            Claude Session Transcripts
          </h3>
          <div class="transcript-files">
            ${response.transcripts.map(t => `
              <div class="transcript-file">
                <div class="transcript-file-header">
                  <span class="material-icons">description</span>
                  <span class="transcript-filename">${escapeHtml(t.filename)}</span>
                  <span class="transcript-date">${t.modified ? new Date(t.modified).toLocaleString() : ''}</span>
                </div>
                <pre class="transcript-content">${escapeHtml(t.content || '(Empty)')}</pre>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Tmux session output
    if (response.output) {
      transcriptHtml += `
        <div class="transcript-section">
          <h3>
            <span class="material-icons">terminal</span>
            Recent Tmux Output
          </h3>
          <pre class="transcript-content tmux-output">${escapeHtml(response.output)}</pre>
        </div>
      `;
    }

    // No content found
    if (!transcriptHtml) {
      transcriptHtml = `
        <div class="transcript-empty">
          <span class="material-icons">info</span>
          <p>No transcript data found for this agent.</p>
          <p class="hint">Transcripts are created when Claude sessions are run.</p>
        </div>
      `;
    }

    // Update modal content
    const modalBody = modal.querySelector('.modal-body');
    if (modalBody) {
      modalBody.innerHTML = transcriptHtml;
    }

  } catch (err) {
    const modalBody = modal.querySelector('.modal-body');
    if (modalBody) {
      modalBody.innerHTML = `
        <div class="transcript-error">
          <span class="material-icons">error</span>
          <p>Failed to load transcript: ${escapeHtml(err.message)}</p>
        </div>
      `;
    }
    console.error('[Transcript] Failed to fetch:', err);
  }
}

// Note: escapeHtml and escapeAttr imported from ../utils/html.js
