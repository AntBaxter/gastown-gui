/**
 * Gas Town GUI - Formula List Component
 *
 * Renders workflow formulas (templates) with actions to view, use, and create.
 */

import { api } from '../api.js';
import { showToast } from './toast.js';
import { escapeHtml } from '../utils/html.js';
import { getStaggerClass } from '../shared/animations.js';

let container = null;
let formulas = [];
let formulaFilter = 'user'; // 'user' | 'system' | 'all'

/**
 * Initialize the formula list component
 */
export function initFormulaList() {
  container = document.getElementById('formula-list-container');
  if (!container) return;

  // Filter tabs
  document.querySelectorAll('.formula-filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.formula-filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      formulaFilter = tab.dataset.formulaFilter;
      renderFormulas();
    });
  });

  // Refresh button
  const refreshBtn = document.getElementById('formula-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => loadFormulas());
  }

  // New formula button - open modal
  const newBtn = document.getElementById('new-formula-btn');
  if (newBtn) {
    newBtn.addEventListener('click', () => {
      document.getElementById('modal-overlay').classList.remove('hidden');
      document.getElementById('new-formula-modal').classList.remove('hidden');
    });
  }

  // New formula form
  const form = document.getElementById('new-formula-form');
  if (form) {
    form.addEventListener('submit', handleCreateFormula);
  }

  // Use formula form
  const useForm = document.getElementById('use-formula-form');
  if (useForm) {
    useForm.addEventListener('submit', handleUseFormula);
  }
}

/**
 * Load formulas from API
 */
export async function loadFormulas() {
  if (!container) {
    container = document.getElementById('formula-list-container');
  }
  if (!container) return;

  container.innerHTML = '<div class="loading-state"><span class="loading-spinner"></span> Loading formulas...</div>';

  try {
    formulas = await api.getFormulas();
    renderFormulas();
  } catch (err) {
    console.error('[Formulas] Load error:', err);
    container.innerHTML = `
      <div class="error-state">
        <span class="material-icons">error_outline</span>
        <p>Failed to load formulas: ${escapeHtml(err.message)}</p>
        <button class="btn btn-secondary" onclick="window.location.reload()">Retry</button>
      </div>
    `;
  }
}

/**
 * Render formula cards
 */
function isSystemFormula(formula) {
  return formula.name && formula.name.startsWith('mol-');
}

function getFilteredFormulas() {
  if (!formulas) return [];
  if (formulaFilter === 'user') return formulas.filter(f => !isSystemFormula(f));
  if (formulaFilter === 'system') return formulas.filter(f => isSystemFormula(f));
  return formulas;
}

function renderFormulas() {
  const filtered = getFilteredFormulas();

  if (!formulas || formulas.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="material-icons empty-icon">science</span>
        <h3>No Formulas</h3>
        <p>Create workflow templates to quickly spawn repeatable tasks</p>
        <button class="btn btn-primary" id="create-first-formula">
          <span class="material-icons">add</span>
          Create Formula
        </button>
      </div>
    `;
    const btn = container.querySelector('#create-first-formula');
    if (btn) {
      btn.addEventListener('click', () => {
        document.getElementById('modal-overlay').classList.remove('hidden');
        document.getElementById('new-formula-modal').classList.remove('hidden');
      });
    }
    return;
  }

  if (filtered.length === 0) {
    const filterLabel = formulaFilter === 'user' ? 'user' : 'system';
    container.innerHTML = `
      <div class="empty-state">
        <span class="material-icons empty-icon">filter_list</span>
        <h3>No ${filterLabel} formulas</h3>
        <p>Try switching the filter to see other formulas</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  filtered.forEach((formula, index) => {
    const card = createFormulaCard(formula, index);
    container.appendChild(card);
  });
}

/**
 * Create a formula card element
 */
function createFormulaCard(formula, index) {
  const card = document.createElement('div');
  card.className = `formula-card animate-spawn ${getStaggerClass(index)}`;
  card.dataset.formulaName = formula.name;

  const description = formula.description || 'No description';
  const stepCount = formula.steps != null ? formula.steps : '—';
  const varCount = formula.vars != null ? formula.vars : '—';
  const isSystem = isSystemFormula(formula);

  card.innerHTML = `
    <div class="formula-header">
      <div class="formula-icon">
        <span class="material-icons">${isSystem ? 'settings' : 'science'}</span>
      </div>
      <div class="formula-info">
        <h3 class="formula-name">
          ${escapeHtml(formula.name)}
          ${isSystem ? '<span class="badge formula-system-badge">System</span>' : ''}
        </h3>
        <p class="formula-description">${escapeHtml(description)}</p>
      </div>
    </div>
    <div class="formula-meta">
      <span class="formula-meta-item" title="Steps">
        <span class="material-icons">format_list_numbered</span>
        ${escapeHtml(String(stepCount))} steps
      </span>
      <span class="formula-meta-item" title="Variables">
        <span class="material-icons">data_object</span>
        ${escapeHtml(String(varCount))} vars
      </span>
    </div>
    <div class="formula-actions">
      <button class="btn btn-sm btn-secondary" data-action="view" title="View full template">
        <span class="material-icons">visibility</span>
        View
      </button>
      ${isSystem ? '' : `
      <button class="btn btn-sm btn-secondary" data-action="edit" title="Edit formula">
        <span class="material-icons">edit</span>
        Edit
      </button>`}
      <button class="btn btn-sm btn-primary" data-action="use" title="Use this formula">
        <span class="material-icons">play_arrow</span>
        Use
      </button>
      ${isSystem ? '' : `
      <button class="btn btn-sm btn-icon btn-danger" data-action="delete" title="Delete formula">
        <span class="material-icons">delete</span>
      </button>`}
    </div>
  `;

  // Add event listeners
  card.querySelector('[data-action="view"]').addEventListener('click', () => showFormulaDetails(formula));
  const editBtn = card.querySelector('[data-action="edit"]');
  if (editBtn) editBtn.addEventListener('click', () => showEditFormulaModal(formula));
  card.querySelector('[data-action="use"]').addEventListener('click', () => showUseFormulaModal(formula));
  const deleteBtn = card.querySelector('[data-action="delete"]');
  if (deleteBtn) deleteBtn.addEventListener('click', () => handleDeleteFormula(formula.name));

  return card;
}

/**
 * Show formula details in a modal or toast
 */
async function showFormulaDetails(formula) {
  try {
    const details = await api.getFormula(formula.name);

    // Create detail view
    const detailHtml = `
      <div class="formula-detail">
        <h3>${escapeHtml(details.name || formula.name)}</h3>
        <p class="description">${escapeHtml(details.description || 'No description')}</p>
        <div class="template-section">
          <h4>Template</h4>
          <pre class="template-code">${escapeHtml(details.template || 'No template defined')}</pre>
        </div>
        ${details.args ? `
          <div class="args-section">
            <h4>Arguments</h4>
            <pre class="args-code">${escapeHtml(JSON.stringify(details.args, null, 2))}</pre>
          </div>
        ` : ''}
      </div>
    `;

    // Use peek modal to display
    const peekModal = document.getElementById('peek-modal');
    const peekName = document.getElementById('peek-agent-name');
    const peekOutput = document.getElementById('peek-output');
    const peekStatus = document.getElementById('peek-status');

    if (peekModal && peekName && peekOutput) {
      peekName.textContent = `Formula: ${formula.name}`;
      peekStatus.innerHTML = '<span class="status-indicator running"></span><span class="status-text">Formula Details</span>';
      peekOutput.querySelector('.output-content').innerHTML = detailHtml;

      document.getElementById('modal-overlay').classList.remove('hidden');
      peekModal.classList.remove('hidden');
    }
  } catch (err) {
    showToast(`Failed to load formula: ${err.message}`, 'error');
  }
}

/**
 * Show use formula modal
 */
function showUseFormulaModal(formula) {
  const modal = document.getElementById('use-formula-modal');
  const nameInput = document.getElementById('use-formula-name');
  const targetSelect = document.getElementById('use-formula-target');

  if (modal && nameInput) {
    nameInput.value = formula.name;

    // Populate targets
    populateTargets(targetSelect);

    document.getElementById('modal-overlay').classList.remove('hidden');
    modal.classList.remove('hidden');
  }
}

/**
 * Populate target select with available rigs
 */
async function populateTargets(selectEl) {
  if (!selectEl) return;

  try {
    const targets = await api.getTargets();
    selectEl.innerHTML = '<option value="">Select target...</option>';

    if (Array.isArray(targets)) {
      targets.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.address || t.name || t;
        opt.textContent = t.name || t.address || t;
        selectEl.appendChild(opt);
      });
    }
  } catch (err) {
    console.error('[Formulas] Failed to load targets:', err);
  }
}

/**
 * Handle create formula form submission
 */
async function handleCreateFormula(e) {
  e.preventDefault();

  const form = e.target;
  const name = form.querySelector('#formula-name').value.trim();
  const description = form.querySelector('#formula-description').value.trim();
  const template = form.querySelector('#formula-template').value.trim();

  if (!name || !template) {
    showToast('Name and template are required', 'error');
    return;
  }

  const submitBtn = form.querySelector('[type="submit"]');
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML = '<span class="material-icons spinning">sync</span> Creating...';
  submitBtn.disabled = true;

  try {
    await api.createFormula(name, description, template);
    showToast(`Formula "${name}" created`, 'success');

    // Close modal
    document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById('new-formula-modal').classList.add('hidden');
    form.reset();

    // Reload list
    await loadFormulas();
  } catch (err) {
    showToast(`Failed to create formula: ${err.message}`, 'error');
  } finally {
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;
  }
}

/**
 * Handle use formula form submission
 */
async function handleUseFormula(e) {
  e.preventDefault();

  const form = e.target;
  const name = form.querySelector('#use-formula-name').value.trim();
  const target = form.querySelector('#use-formula-target').value;
  const args = form.querySelector('#use-formula-args').value.trim();

  if (!name || !target) {
    showToast('Formula name and target are required', 'error');
    return;
  }

  const submitBtn = form.querySelector('[type="submit"]');
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML = '<span class="material-icons spinning">sync</span> Using...';
  submitBtn.disabled = true;

  try {
    await api.useFormula(name, target, args || undefined);
    showToast(`Formula "${name}" applied to ${target}`, 'success');

    // Close modal
    document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById('use-formula-modal').classList.add('hidden');
    form.reset();
  } catch (err) {
    showToast(`Failed to use formula: ${err.message}`, 'error');
  } finally {
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;
  }
}

/**
 * Show edit formula modal
 */
async function showEditFormulaModal(formula) {
  // Get full formula details
  let details;
  try {
    details = await api.getFormula(formula.name);
  } catch (err) {
    showToast(`Failed to load formula: ${err.message}`, 'error');
    return;
  }

  // Create edit modal if it doesn't exist
  let modal = document.getElementById('edit-formula-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'edit-formula-modal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-header">
        <h2>Edit Formula</h2>
        <button class="btn btn-icon modal-close" data-modal-close>
          <span class="material-icons">close</span>
        </button>
      </div>
      <form id="edit-formula-form" class="modal-body">
        <input type="hidden" id="edit-formula-name" />
        <div class="form-group">
          <label for="edit-formula-description">Description</label>
          <textarea id="edit-formula-description" rows="2" placeholder="What does this formula do?"></textarea>
        </div>
        <div class="form-group">
          <label for="edit-formula-template">Template</label>
          <textarea id="edit-formula-template" rows="6" required placeholder="The template with \${variables}"></textarea>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-modal-close>Cancel</button>
          <button type="submit" class="btn btn-primary">
            <span class="material-icons">save</span>
            Save Changes
          </button>
        </div>
      </form>
    `;
    document.body.appendChild(modal);

    // Add form submit handler
    const form = modal.querySelector('#edit-formula-form');
    form.addEventListener('submit', handleUpdateFormula);

    // Add close handlers
    modal.querySelectorAll('[data-modal-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('modal-overlay').classList.add('hidden');
        modal.classList.add('hidden');
      });
    });
  }

  // Populate form with current values
  modal.querySelector('#edit-formula-name').value = details.name;
  modal.querySelector('#edit-formula-description').value = details.description || '';
  modal.querySelector('#edit-formula-template').value = details.template || '';

  // Show modal
  document.getElementById('modal-overlay').classList.remove('hidden');
  modal.classList.remove('hidden');
}

/**
 * Handle formula update form submission
 */
async function handleUpdateFormula(e) {
  e.preventDefault();

  const form = e.target;
  const name = form.querySelector('#edit-formula-name').value;
  const description = form.querySelector('#edit-formula-description').value.trim();
  const template = form.querySelector('#edit-formula-template').value.trim();

  if (!template) {
    showToast('Template is required', 'error');
    return;
  }

  const submitBtn = form.querySelector('[type="submit"]');
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML = '<span class="material-icons spinning">sync</span> Saving...';
  submitBtn.disabled = true;

  try {
    await api.updateFormula(name, description, template);
    showToast(`Formula "${name}" updated`, 'success');

    // Close modal
    document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById('edit-formula-modal').classList.add('hidden');

    // Reload list
    await loadFormulas();
  } catch (err) {
    showToast(`Failed to update formula: ${err.message}`, 'error');
  } finally {
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;
  }
}

/**
 * Handle formula deletion
 */
async function handleDeleteFormula(name) {
  if (!confirm(`Are you sure you want to delete the formula "${name}"? This cannot be undone.`)) {
    return;
  }

  try {
    showToast('Deleting formula...', 'info');
    await api.deleteFormula(name);
    showToast(`Formula "${name}" deleted`, 'success');

    // Reload list
    await loadFormulas();
  } catch (err) {
    showToast(`Failed to delete formula: ${err.message}`, 'error');
  }
}
