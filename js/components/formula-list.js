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
let typeFilter = 'all'; // 'all' | 'workflow' | 'convoy' | 'expansion' | 'aspect'
let searchQuery = '';

const FORMULA_TYPES = {
  workflow: { icon: 'account_tree', label: 'Workflow', color: '#3b82f6' },
  convoy: { icon: 'groups', label: 'Convoy', color: '#10b981' },
  expansion: { icon: 'unfold_more', label: 'Expansion', color: '#f59e0b' },
  aspect: { icon: 'layers', label: 'Aspect', color: '#8b5cf6' },
};

function detectFormulaType(formula) {
  if (formula.type && FORMULA_TYPES[formula.type]) return formula.type;
  const name = (formula.name || '').toLowerCase();
  const desc = (formula.description || '').toLowerCase();
  const text = `${name} ${desc}`;
  if (text.includes('convoy')) return 'convoy';
  if (text.includes('expansion') || text.includes('expand')) return 'expansion';
  if (text.includes('aspect')) return 'aspect';
  return 'workflow';
}

/**
 * Initialize the formula list component
 */
export function initFormulaList() {
  container = document.getElementById('formula-list-container');
  if (!container) return;

  // User/System filter tabs
  document.querySelectorAll('.formula-filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.formula-filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      formulaFilter = tab.dataset.formulaFilter;
      renderFormulas();
    });
  });

  // Search input
  const searchInput = document.getElementById('formula-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value.trim().toLowerCase();
      renderFormulas();
    });
  }

  // Type filter tabs
  document.querySelectorAll('.formula-type-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.formula-type-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      typeFilter = tab.dataset.typeFilter;
      renderFormulas();
    });
  });

  // Refresh button
  const refreshBtn = document.getElementById('formula-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => loadFormulas());
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
  let filtered = formulas;
  if (formulaFilter === 'user') filtered = filtered.filter(f => !isSystemFormula(f));
  else if (formulaFilter === 'system') filtered = filtered.filter(f => isSystemFormula(f));
  if (typeFilter !== 'all') filtered = filtered.filter(f => detectFormulaType(f) === typeFilter);
  if (searchQuery) {
    filtered = filtered.filter(f => {
      const name = (f.name || '').toLowerCase();
      const desc = (f.description || '').toLowerCase();
      return name.includes(searchQuery) || desc.includes(searchQuery);
    });
  }
  return filtered;
}

function renderFormulas() {
  const filtered = getFilteredFormulas();

  if (!formulas || formulas.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="material-icons empty-icon">science</span>
        <h3>No Formulas</h3>
        <p>No workflow formulas found</p>
      </div>
    `;
    return;
  }

  if (filtered.length === 0) {
    const parts = [];
    if (formulaFilter !== 'all') parts.push(formulaFilter);
    if (typeFilter !== 'all') parts.push(typeFilter);
    const filterLabel = parts.length > 0 ? parts.join(' ') : '';
    const searchNote = searchQuery ? ` matching "${escapeHtml(searchQuery)}"` : '';
    container.innerHTML = `
      <div class="empty-state">
        <span class="material-icons empty-icon">${searchQuery ? 'search_off' : 'filter_list'}</span>
        <h3>No ${escapeHtml(filterLabel)} formulas${searchNote}</h3>
        <p>${searchQuery ? 'Try a different search term or clear the search' : 'Try switching the filter to see other formulas'}</p>
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
  const fType = detectFormulaType(formula);
  const typeInfo = FORMULA_TYPES[fType];

  card.innerHTML = `
    <div class="formula-header">
      <div class="formula-icon" style="background: linear-gradient(135deg, ${typeInfo.color}, ${typeInfo.color}99)">
        <span class="material-icons">${typeInfo.icon}</span>
      </div>
      <div class="formula-info">
        <h3 class="formula-name">
          ${escapeHtml(formula.name)}
          <span class="badge formula-type-badge formula-type-${fType}">${typeInfo.label}</span>
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
  card.querySelector('[data-action="use"]').addEventListener('click', () => showUseFormulaModal(formula));
  const deleteBtn = card.querySelector('[data-action="delete"]');
  if (deleteBtn) deleteBtn.addEventListener('click', () => handleDeleteFormula(formula.name));

  return card;
}

/**
 * Build the step DAG section for workflow formulas
 */
function buildStepDagHtml(steps) {
  if (!Array.isArray(steps) || steps.length === 0) return '';

  const stepById = {};
  steps.forEach(s => { stepById[s.id] = s; });

  const rows = steps.map((step, i) => {
    const needs = Array.isArray(step.needs) ? step.needs : [];
    const depsHtml = needs.length > 0
      ? needs.map(dep => `<span class="step-dep-arrow" title="Depends on: ${escapeHtml(dep)}"><span class="material-icons">arrow_back</span>${escapeHtml(dep)}</span>`).join(' ')
      : '<span class="step-dep-none">none</span>';

    return `
      <tr>
        <td class="step-index">${i + 1}</td>
        <td class="step-id">${escapeHtml(step.id)}</td>
        <td class="step-title">${escapeHtml(step.title || '')}</td>
        <td class="step-deps">${depsHtml}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="formula-section">
      <h4><span class="material-icons">account_tree</span> Steps (${steps.length})</h4>
      <table class="formula-step-table">
        <thead><tr><th>#</th><th>ID</th><th>Title</th><th>Depends on</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

/**
 * Build the variable table section
 */
function buildVarsTableHtml(vars) {
  if (!vars || typeof vars !== 'object') return '';
  const entries = Object.entries(vars);
  if (entries.length === 0) return '';

  const rows = entries.map(([name, def]) => {
    const isRequired = def.required === true;
    const flagHtml = isRequired
      ? '<span class="var-flag var-required">required</span>'
      : '<span class="var-flag var-optional">optional</span>';
    const defaultVal = def.default != null && def.default !== ''
      ? escapeHtml(String(def.default))
      : '—';

    return `
      <tr>
        <td class="var-name"><code>${escapeHtml(name)}</code></td>
        <td class="var-flag-cell">${flagHtml}</td>
        <td class="var-default">${defaultVal}</td>
        <td class="var-desc">${escapeHtml(def.description || '')}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="formula-section">
      <h4><span class="material-icons">data_object</span> Variables (${entries.length})</h4>
      <table class="formula-var-table">
        <thead><tr><th>Name</th><th>Flag</th><th>Default</th><th>Description</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

/**
 * Build convoy legs section (from description since legs aren't structured)
 */
function buildConvoyHtml(details) {
  return `
    <div class="formula-section">
      <h4><span class="material-icons">group_work</span> Convoy</h4>
      <p class="formula-convoy-note">Convoy formulas execute legs in parallel. See description for leg details.</p>
    </div>
  `;
}

/**
 * Build expansion refinement chain section
 */
function buildExpansionHtml(template) {
  if (!Array.isArray(template) || template.length === 0) return '';

  const chain = template.map((step, i) => {
    const needs = Array.isArray(step.needs) ? step.needs : [];
    const arrow = i > 0 ? '<span class="material-icons refinement-arrow">arrow_downward</span>' : '';
    return `
      ${arrow}
      <div class="refinement-step">
        <div class="refinement-step-header">
          <span class="refinement-step-num">${i + 1}</span>
          <strong>${escapeHtml(step.title || step.id)}</strong>
        </div>
        <p class="refinement-step-desc">${escapeHtml(step.description || '')}</p>
      </div>
    `;
  }).join('');

  return `
    <div class="formula-section">
      <h4><span class="material-icons">layers</span> Refinement Chain (${template.length} passes)</h4>
      <div class="refinement-chain">${chain}</div>
    </div>
  `;
}

/**
 * Build aspect pointcuts section
 */
function buildAspectHtml(details) {
  const pointcuts = details.pointcuts || [];
  const advice = details.advice || [];

  let html = '';

  if (pointcuts.length > 0) {
    const pcList = pointcuts.map(pc =>
      `<span class="pointcut-tag">${escapeHtml(pc.glob || JSON.stringify(pc))}</span>`
    ).join(' ');
    html += `
      <div class="formula-section">
        <h4><span class="material-icons">adjust</span> Pointcuts</h4>
        <div class="pointcut-list">${pcList}</div>
      </div>
    `;
  }

  if (advice.length > 0) {
    const adviceRows = advice.map(a => {
      const beforeSteps = a.around?.before || [];
      const afterSteps = a.around?.after || [];
      const beforeHtml = beforeSteps.map(s => escapeHtml(s.title || s.id)).join(', ') || '—';
      const afterHtml = afterSteps.map(s => escapeHtml(s.title || s.id)).join(', ') || '—';
      return `
        <tr>
          <td class="advice-target"><code>${escapeHtml(a.target || '')}</code></td>
          <td class="advice-before">${beforeHtml}</td>
          <td class="advice-after">${afterHtml}</td>
        </tr>
      `;
    }).join('');

    html += `
      <div class="formula-section">
        <h4><span class="material-icons">swap_vert</span> Advice</h4>
        <table class="formula-advice-table">
          <thead><tr><th>Target</th><th>Before</th><th>After</th></tr></thead>
          <tbody>${adviceRows}</tbody>
        </table>
      </div>
    `;
  }

  return html;
}

/**
 * Get the type icon and color class for a formula type
 */
function getTypeInfo(type) {
  switch (type) {
    case 'workflow': return { icon: 'account_tree', cls: 'type-workflow' };
    case 'convoy': return { icon: 'group_work', cls: 'type-convoy' };
    case 'expansion': return { icon: 'layers', cls: 'type-expansion' };
    case 'aspect': return { icon: 'adjust', cls: 'type-aspect' };
    default: return { icon: 'science', cls: 'type-unknown' };
  }
}

/**
 * Show formula details in a modal
 */
async function showFormulaDetails(formula) {
  try {
    const details = await api.getFormula(formula.name);
    const type = details.type || 'unknown';
    const typeInfo = getTypeInfo(type);
    const version = details.version != null ? `v${details.version}` : '';
    const description = details.description || 'No description';

    // Build type-specific sections
    let typeSections = '';
    if (type === 'workflow') {
      typeSections = buildStepDagHtml(details.steps) + buildVarsTableHtml(details.vars);
    } else if (type === 'convoy') {
      typeSections = buildConvoyHtml(details);
    } else if (type === 'expansion') {
      typeSections = buildExpansionHtml(details.template);
    } else if (type === 'aspect') {
      typeSections = buildAspectHtml(details);
    }

    // Fallback: show raw template/args if no structured sections rendered
    if (!typeSections && (details.template || details.args)) {
      const tmpl = typeof details.template === 'string' ? details.template : '';
      typeSections = tmpl ? `
        <div class="formula-section">
          <h4>Template</h4>
          <pre class="template-code">${escapeHtml(tmpl)}</pre>
        </div>
      ` : '';
      if (details.args) {
        typeSections += `
          <div class="formula-section">
            <h4>Arguments</h4>
            <pre class="args-code">${escapeHtml(JSON.stringify(details.args, null, 2))}</pre>
          </div>
        `;
      }
    }

    const detailHtml = `
      <div class="formula-detail">
        <div class="formula-detail-header">
          <h3>${escapeHtml(details.name || formula.name)}</h3>
          <div class="formula-detail-badges">
            <span class="badge formula-type-badge ${typeInfo.cls}">
              <span class="material-icons">${typeInfo.icon}</span>
              ${escapeHtml(type)}
            </span>
            ${version ? `<span class="badge formula-version-badge">${escapeHtml(version)}</span>` : ''}
          </div>
        </div>
        <p class="description">${escapeHtml(description)}</p>
        ${typeSections}
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
 * Show use formula modal with structured variable inputs
 */
async function showUseFormulaModal(formula) {
  const modal = document.getElementById('use-formula-modal');
  const nameInput = document.getElementById('use-formula-name');
  const titleEl = document.getElementById('use-formula-title');
  const descEl = document.getElementById('use-formula-description');
  const varsContainer = document.getElementById('use-formula-vars');
  const targetSelect = document.getElementById('use-formula-target');

  if (!modal || !nameInput) return;

  nameInput.value = formula.name;
  titleEl.textContent = `Run: ${formula.name}`;
  descEl.textContent = '';
  descEl.classList.add('hidden');
  varsContainer.innerHTML = '';

  // Populate targets
  populateTargets(targetSelect);

  // Show modal immediately, then load details
  document.getElementById('modal-overlay').classList.remove('hidden');
  modal.classList.remove('hidden');

  try {
    const details = await api.getFormula(formula.name);

    // Show description
    if (details.description) {
      descEl.textContent = details.description;
      descEl.classList.remove('hidden');
    }

    // Render variable inputs
    if (details.vars && typeof details.vars === 'object') {
      const entries = Object.entries(details.vars);
      if (entries.length > 0) {
        varsContainer.innerHTML = `<div class="formula-vars-heading">Variables</div>`;
        entries.forEach(([varName, def]) => {
          const isRequired = def.required === true;
          const defaultVal = def.default != null ? String(def.default) : '';
          const inputId = `use-formula-var-${varName}`;

          const group = document.createElement('div');
          group.className = 'form-group formula-var-group';
          group.innerHTML = `
            <label for="${escapeHtml(inputId)}">
              ${escapeHtml(varName)}
              ${isRequired ? '<span class="formula-var-required">*</span>' : '<span class="formula-var-optional">(optional)</span>'}
            </label>
            ${def.description ? `<span class="formula-var-hint">${escapeHtml(def.description)}</span>` : ''}
            <input type="text" id="${escapeHtml(inputId)}" name="var:${escapeHtml(varName)}"
              ${defaultVal ? `value="${escapeHtml(defaultVal)}"` : ''}
              ${isRequired ? 'required' : ''}
              placeholder="${isRequired ? 'Required' : defaultVal ? `Default: ${escapeHtml(defaultVal)}` : 'Optional'}"
              class="formula-var-input"
              data-var-name="${escapeHtml(varName)}"
              data-var-required="${isRequired}">
          `;
          varsContainer.appendChild(group);
        });
      }
    }
  } catch (err) {
    console.error('[Formulas] Failed to load formula details:', err);
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
 * Handle use formula form submission
 */
async function handleUseFormula(e) {
  e.preventDefault();

  const form = e.target;
  const name = form.querySelector('#use-formula-name').value.trim();
  const target = form.querySelector('#use-formula-target').value;

  if (!name || !target) {
    showToast('Formula name and target are required', 'error');
    return;
  }

  // Collect variable values and validate required ones
  const varInputs = form.querySelectorAll('.formula-var-input');
  const missing = [];
  const varParts = [];
  varInputs.forEach(input => {
    const varName = input.dataset.varName;
    const val = input.value.trim();
    if (input.dataset.varRequired === 'true' && !val) {
      missing.push(varName);
    }
    if (val) {
      varParts.push(`${varName}=${val}`);
    }
  });

  if (missing.length > 0) {
    showToast(`Required variables missing: ${missing.join(', ')}`, 'error');
    return;
  }

  const args = varParts.length > 0 ? varParts.join(',') : undefined;

  const submitBtn = form.querySelector('[type="submit"]');
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML = '<span class="material-icons spinning">sync</span> Running...';
  submitBtn.disabled = true;

  try {
    await api.useFormula(name, target, args);
    showToast(`Formula "${name}" applied to ${target}`, 'success');

    // Close modal
    document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById('use-formula-modal').classList.add('hidden');
    form.reset();
  } catch (err) {
    showToast(`Failed to run formula: ${err.message}`, 'error');
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
