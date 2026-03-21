/**
 * Gas Town GUI - Dependency Graph (DAG) Visualization
 *
 * SVG-based directed acyclic graph showing bead dependencies.
 * Uses vendored dagre-lite for layout. Nodes are bead cards with
 * title, status, and assignee. Edges colored by dependency state.
 * Supports pan/zoom via SVG viewBox and click-to-detail.
 */

import { api } from '../api.js';
import { escapeHtml } from '../utils/html.js';
import { detectCycles, CYCLE_EDGE_COLOR } from '../utils/cycle-detect.js';
import { showToast } from './toast.js';
import { isHiddenBead } from '../shared/beads.js';
import { toggleSelection, isSelected, onSelectionChange, clearSelection, renderFloatingBar } from '../shared/selection.js';

const NODE_WIDTH = 200;
const NODE_HEIGHT = 72;
const MOBILE_BREAKPOINT = 768;
const SELECTION_STROKE = '#58a6ff';
const SELECTION_STROKE_WIDTH = 3;

const STATUS_COLORS = {
  open: '#6e7681',
  in_progress: '#d29922',
  hooked: '#d29922',
  blocked: '#f85149',
  closed: '#3fb950',
  pinned: '#a371f7',
  deferred: '#8b949e',
};

const EDGE_COLORS = {
  resolved: '#3fb950',
  blocked: '#f85149',
  default: '#6e7681',
};

/**
 * Build a dagre graph from bead dependency data.
 * @param {Object} epic - The epic bead (from bd show --json, first element)
 * @param {Array} deps - Dependencies array from bd dep list
 * @param {Array} blocked - Blocked beads array from bd blocked
 * @returns {{ graph: object, nodeMap: Map }}
 */
function buildGraph(epic, deps, blocked) {
  // dagre is loaded as a global from vendor/dagre.min.js
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 100, marginx: 30, marginy: 30 });

  const nodeMap = new Map();
  const blockedIds = new Set(blocked.map(b => b.id));

  // Add epic node
  if (epic) {
    g.setNode(epic.id, { width: NODE_WIDTH, height: NODE_HEIGHT, label: epic });
    nodeMap.set(epic.id, epic);
  }

  // Add dependent/child nodes
  const children = epic?.dependents || [];
  for (const child of children) {
    g.setNode(child.id, { width: NODE_WIDTH, height: NODE_HEIGHT, label: child });
    nodeMap.set(child.id, child);

    // Edge from epic to child (parent-child)
    const edgeColor = child.status === 'closed'
      ? EDGE_COLORS.resolved
      : blockedIds.has(child.id)
        ? EDGE_COLORS.blocked
        : EDGE_COLORS.default;
    g.setEdge(epic.id, child.id, { color: edgeColor });
  }

  // Add explicit dependency edges from dep list
  for (const dep of deps) {
    if (!nodeMap.has(dep.id)) {
      g.setNode(dep.id, { width: NODE_WIDTH, height: NODE_HEIGHT, label: dep });
      nodeMap.set(dep.id, dep);
    }

    if (dep.dependency_type === 'blocks') {
      // dep blocks the queried bead — find which child it blocks
      for (const child of children) {
        const childBlocked = blocked.find(b => b.id === child.id);
        if (childBlocked?.blocked_by?.includes(dep.id)) {
          const edgeColor = dep.status === 'closed' ? EDGE_COLORS.resolved : EDGE_COLORS.blocked;
          g.setEdge(dep.id, child.id, { color: edgeColor });
        }
      }
    }
  }

  dagre.layout(g);
  return { graph: g, nodeMap };
}

/**
 * Render a warning banner showing detected cycles.
 */
function renderCycleBanner(cycles, nodeMap) {
  const cycleDescriptions = cycles.map(path => {
    const labels = path.map(id => {
      const bead = nodeMap.get(id);
      return bead ? (bead.title || id) : id;
    });
    return escapeHtml(labels.join(' \u2192 '));
  });

  return `<div class="dag-cycle-warning">
    <span class="material-icons" style="font-size:18px;vertical-align:middle">warning</span>
    <strong>Dependency cycle${cycles.length > 1 ? 's' : ''} detected:</strong>
    <ul class="dag-cycle-list">
      ${cycleDescriptions.map(d => `<li>${d}</li>`).join('')}
    </ul>
  </div>`;
}

/**
 * Render a bead node as SVG group
 */
function renderNode(node, bead) {
  const x = node.x - NODE_WIDTH / 2;
  const y = node.y - NODE_HEIGHT / 2;
  const statusColor = STATUS_COLORS[bead.status] || STATUS_COLORS.open;
  const assigneeText = bead.assignee ? bead.assignee.split('/').pop() : '';
  const titleText = escapeHtml((bead.title || bead.id || '').substring(0, 28));
  const idText = escapeHtml(bead.id || '');
  const statusText = escapeHtml(bead.status || 'open');
  const isEpic = bead.issue_type === 'epic';

  const strokeWidth = isEpic ? 2.5 : 1.5;
  const sel = isSelected(bead.id);

  return `<g class="dag-node${sel ? ' dag-node-selected' : ''}" data-bead-id="${escapeHtml(bead.id)}" style="cursor:pointer">
    <rect x="${x}" y="${y}" width="${NODE_WIDTH}" height="${NODE_HEIGHT}"
      rx="6" ry="6"
      fill="var(--bg-tertiary)"
      stroke="${sel ? SELECTION_STROKE : statusColor}"
      stroke-width="${sel ? SELECTION_STROKE_WIDTH : strokeWidth}"
      data-orig-stroke="${statusColor}" data-orig-stroke-width="${strokeWidth}"
      ${isEpic ? 'stroke-dasharray="6,3"' : ''}/>
    <text x="${x + 10}" y="${y + 20}" fill="var(--text-primary)" font-size="13" font-weight="500">${titleText}</text>
    <text x="${x + 10}" y="${y + 38}" fill="var(--text-muted)" font-size="11" font-family="var(--font-mono)">${idText}</text>
    <rect x="${x + 10}" y="${y + 48}" width="8" height="8" rx="2" fill="${statusColor}"/>
    <text x="${x + 22}" y="${y + 56}" fill="var(--text-secondary)" font-size="10">${statusText}</text>
    ${assigneeText ? `<text x="${x + NODE_WIDTH - 10}" y="${y + 56}" fill="var(--text-muted)" font-size="10" text-anchor="end">${escapeHtml(assigneeText)}</text>` : ''}
    ${sel ? `<circle cx="${x + NODE_WIDTH - 12}" cy="${y + 14}" r="8" fill="${SELECTION_STROKE}"/>
    <path d="M${x + NODE_WIDTH - 16} ${y + 14} l3 3 5-6" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
  </g>`;
}

/**
 * Render an edge as SVG path with arrowhead
 */
function renderEdge(edge, g) {
  const edgeData = g.edge(edge.v, edge.w);
  if (!edgeData?.points || edgeData.points.length < 2) return '';

  const color = edgeData.color || EDGE_COLORS.default;
  const pts = edgeData.points;

  // Cubic bezier through midpoint
  const d = pts.length === 3
    ? `M${pts[0].x},${pts[0].y} Q${pts[1].x},${pts[1].y} ${pts[2].x},${pts[2].y}`
    : `M${pts[0].x},${pts[0].y} L${pts[pts.length - 1].x},${pts[pts.length - 1].y}`;

  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
  const arrowSize = 8;
  const ax1 = last.x - arrowSize * Math.cos(angle - Math.PI / 6);
  const ay1 = last.y - arrowSize * Math.sin(angle - Math.PI / 6);
  const ax2 = last.x - arrowSize * Math.cos(angle + Math.PI / 6);
  const ay2 = last.y - arrowSize * Math.sin(angle + Math.PI / 6);

  return `<g class="dag-edge">
    <path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" stroke-opacity="0.7"/>
    <polygon points="${last.x},${last.y} ${ax1},${ay1} ${ax2},${ay2}" fill="${color}" fill-opacity="0.7"/>
  </g>`;
}

/**
 * Render mobile fallback as indented list
 */
function renderMobileFallback(epic, blocked) {
  if (!epic) return '<div class="dag-empty">No dependency data available</div>';

  const blockedIds = new Set(blocked.map(b => b.id));
  const children = epic.dependents || [];
  const statusColor = (s) => STATUS_COLORS[s] || STATUS_COLORS.open;

  let html = `<div class="dag-mobile-list">
    <div class="dag-mobile-node dag-mobile-epic" data-bead-id="${escapeHtml(epic.id)}">
      <span class="dag-mobile-status" style="background:${statusColor(epic.status)}"></span>
      <span class="dag-mobile-title">${escapeHtml(epic.title || epic.id)}</span>
      <span class="dag-mobile-id">${escapeHtml(epic.id)}</span>
    </div>`;

  for (const child of children) {
    const isBlocked = blockedIds.has(child.id);
    const badgeClass = child.status === 'closed' ? 'dag-badge-done'
      : isBlocked ? 'dag-badge-blocked' : 'dag-badge-ready';
    const badgeText = child.status === 'closed' ? 'Done'
      : isBlocked ? `Blocked by ${(blocked.find(b => b.id === child.id)?.blocked_by || []).join(', ')}` : 'Ready';
    const assignee = child.assignee ? child.assignee.split('/').pop() : '';

    html += `<div class="dag-mobile-node dag-mobile-child" data-bead-id="${escapeHtml(child.id)}">
      <span class="dag-mobile-indent"></span>
      <span class="dag-mobile-status" style="background:${statusColor(child.status)}"></span>
      <span class="dag-mobile-title">${escapeHtml(child.title || child.id)}</span>
      <span class="dag-mobile-id">${escapeHtml(child.id)}</span>
      ${assignee ? `<span class="dag-mobile-assignee">${escapeHtml(assignee)}</span>` : ''}
      <span class="dag-mobile-badge ${badgeClass}">${escapeHtml(badgeText)}</span>
    </div>`;
  }

  html += '</div>';
  return html;
}

/**
 * Render the full SVG dependency graph
 */
function renderSVG(g, nodeMap) {
  const graphLabel = g.graph();
  const width = graphLabel.width || 600;
  const height = graphLabel.height || 400;

  let edgesSvg = '';
  for (const edge of g.edges()) {
    edgesSvg += renderEdge(edge, g);
  }

  let nodesSvg = '';
  for (const id of g.nodes()) {
    const node = g.node(id);
    const bead = node.label || nodeMap.get(id);
    if (bead) {
      nodesSvg += renderNode(node, bead);
    }
  }

  return `<svg class="dag-svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%"
    xmlns="http://www.w3.org/2000/svg" style="min-height: 300px; max-height: 600px;">
    <g class="dag-edges">${edgesSvg}</g>
    <g class="dag-nodes">${nodesSvg}</g>
  </svg>`;
}

/**
 * Set up pan/zoom on the SVG element via mouse drag and wheel.
 */
function setupPanZoom(container) {
  const svg = container.querySelector('.dag-svg');
  if (!svg) return;

  let viewBox = svg.viewBox.baseVal;
  let isPanning = false;
  let startX = 0;
  let startY = 0;
  let startVBX = 0;
  let startVBY = 0;

  svg.addEventListener('mousedown', (e) => {
    if (e.target.closest('.dag-node')) return; // Don't pan on node click
    isPanning = true;
    startX = e.clientX;
    startY = e.clientY;
    startVBX = viewBox.x;
    startVBY = viewBox.y;
    svg.style.cursor = 'grabbing';
  });

  svg.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    const scale = viewBox.width / svg.clientWidth;
    viewBox.x = startVBX - (e.clientX - startX) * scale;
    viewBox.y = startVBY - (e.clientY - startY) * scale;
  });

  svg.addEventListener('mouseup', () => {
    isPanning = false;
    svg.style.cursor = '';
  });

  svg.addEventListener('mouseleave', () => {
    isPanning = false;
    svg.style.cursor = '';
  });

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    const rect = svg.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const my = (e.clientY - rect.top) / rect.height;

    const newWidth = viewBox.width * zoomFactor;
    const newHeight = viewBox.height * zoomFactor;

    viewBox.x += (viewBox.width - newWidth) * mx;
    viewBox.y += (viewBox.height - newHeight) * my;
    viewBox.width = newWidth;
    viewBox.height = newHeight;
  }, { passive: false });
}

/**
 * Set up click handlers on nodes — either selection toggle or detail open.
 * @param {HTMLElement} container
 * @param {Function} onNodeClick - fallback when selection mode is off
 * @param {{ isSelectMode: () => boolean }} mode - selection mode accessor
 */
function setupNodeClicks(container, onNodeClick, mode = {}) {
  // Remove previous handler to prevent stacking across re-renders.
  // Stale handlers from prior graph renders fire on kanban cards too
  // (they also have [data-bead-id]), causing duplicate bead detail opens.
  if (container._nodeClickHandler) {
    container.removeEventListener('click', container._nodeClickHandler);
  }

  const handler = (e) => {
    const node = e.target.closest('[data-bead-id]');
    if (node) {
      const beadId = node.dataset.beadId;
      if (mode.isSelectMode && mode.isSelectMode()) {
        toggleSelection(beadId);
      } else if (onNodeClick) {
        onNodeClick(beadId);
      }
    }
  };

  container._nodeClickHandler = handler;
  container.addEventListener('click', handler);
}

/**
 * Set up the Select toggle button and wire selection visuals on graph nodes.
 * Returns an unsubscribe function for cleanup.
 */
function setupSelectionMode(container) {
  let selectMode = false;

  const btn = container.querySelector('.dag-select-toggle');
  if (!btn) return { isSelectMode: () => false, unsub: () => {} };

  btn.addEventListener('click', () => {
    selectMode = !selectMode;
    btn.classList.toggle('active', selectMode);
    container.classList.toggle('dag-select-active', selectMode);
    if (!selectMode) {
      clearSelection();
    }
  });

  // Update node visuals when selection changes
  const unsub = onSelectionChange((ids) => {
    const selectedSet = new Set(ids);
    container.querySelectorAll('.dag-node[data-bead-id]').forEach(g => {
      const id = g.dataset.beadId;
      const rect = g.querySelector('rect');
      if (!rect) return;
      if (selectedSet.has(id)) {
        g.classList.add('dag-node-selected');
        rect.setAttribute('stroke', SELECTION_STROKE);
        rect.setAttribute('stroke-width', String(SELECTION_STROKE_WIDTH));
      } else {
        g.classList.remove('dag-node-selected');
        // Restore original stroke from STATUS_COLORS
        const origStroke = rect.dataset.origStroke;
        const origWidth = rect.dataset.origStrokeWidth;
        if (origStroke) rect.setAttribute('stroke', origStroke);
        if (origWidth) rect.setAttribute('stroke-width', origWidth);
      }
    });

    // Also update mobile list nodes
    container.querySelectorAll('.dag-mobile-node[data-bead-id]').forEach(el => {
      el.classList.toggle('dag-node-selected', selectedSet.has(el.dataset.beadId));
    });
  });

  return { isSelectMode: () => selectMode, unsub };
}

/**
 * Build a dagre graph from a flat list of beads and their dependency edges.
 * Used by renderConvoyGraph for multi-issue combined graphs.
 * @param {Array} beads - Array of bead objects
 * @param {Array} edges - Array of { from, to } dependency pairs
 * @param {Set} blockedIds - Set of blocked bead IDs
 * @returns {{ graph: object, nodeMap: Map }}
 */
function buildCombinedGraph(beads, edges, blockedIds) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 100, marginx: 30, marginy: 30 });

  const nodeMap = new Map();

  for (const bead of beads) {
    g.setNode(bead.id, { width: NODE_WIDTH, height: NODE_HEIGHT, label: bead });
    nodeMap.set(bead.id, bead);
  }

  for (const edge of edges) {
    if (nodeMap.has(edge.from) && nodeMap.has(edge.to)) {
      const target = nodeMap.get(edge.to);
      const edgeColor = target.status === 'closed'
        ? EDGE_COLORS.resolved
        : blockedIds.has(edge.to)
          ? EDGE_COLORS.blocked
          : EDGE_COLORS.default;
      g.setEdge(edge.from, edge.to, { color: edgeColor });
    }
  }

  dagre.layout(g);
  return { graph: g, nodeMap };
}

/**
 * Render a convoy-scoped dependency graph into a container element.
 * Fetches all issues in the convoy, their dependencies, and builds a combined DAG.
 *
 * @param {HTMLElement} container - DOM element to render into
 * @param {string} convoyId - The convoy ID to visualize
 * @param {Object} options
 * @param {Function} options.onNodeClick - Callback when a node is clicked (receives beadId)
 */
export async function renderConvoyGraph(container, convoyId, options = {}) {
  if (!container) return;

  container.innerHTML = '<div class="dag-loading"><span class="loading-spinner"></span> Loading convoy dependency graph...</div>';

  try {
    const [convoy, blocked] = await Promise.all([
      api.getConvoy(convoyId),
      api.getBlockedBeads(),
    ]);

    const issueIds = (convoy.issues || []).map(i => typeof i === 'string' ? i : i.id).filter(Boolean);

    if (issueIds.length === 0) {
      container.innerHTML = '<div class="dag-empty">No issues in this convoy</div>';
      return;
    }

    // Fetch bead details and dependencies for each issue in parallel
    const [beadResults, depResults] = await Promise.all([
      Promise.all(issueIds.map(id => api.getBead(id).catch(() => null))),
      Promise.all(issueIds.map(id => api.getBeadDependencies(id).catch(() => []))),
    ]);

    // Collect all beads
    const beadMap = new Map();
    for (const result of beadResults) {
      const bead = Array.isArray(result) ? result[0] : result;
      if (bead?.id) beadMap.set(bead.id, bead);
    }

    // Also add any dependents/children from each bead
    for (const bead of beadMap.values()) {
      for (const child of (bead.dependents || [])) {
        if (!beadMap.has(child.id)) beadMap.set(child.id, child);
      }
    }

    // Build edges from dependency data
    const edges = [];
    const blockedIds = new Set(blocked.map(b => b.id));

    for (let i = 0; i < issueIds.length; i++) {
      const issueId = issueIds[i];
      const deps = depResults[i] || [];
      const bead = beadMap.get(issueId);

      // Parent-to-child edges
      if (bead?.dependents) {
        for (const child of bead.dependents) {
          edges.push({ from: issueId, to: child.id });
          if (!beadMap.has(child.id)) beadMap.set(child.id, child);
        }
      }

      // Explicit dependency edges
      for (const dep of deps) {
        if (!beadMap.has(dep.id)) beadMap.set(dep.id, dep);
        if (dep.dependency_type === 'blocks') {
          // dep blocks something — find which children it blocks
          const children = bead?.dependents || [];
          for (const child of children) {
            const childBlocked = blocked.find(b => b.id === child.id);
            if (childBlocked?.blocked_by?.includes(dep.id)) {
              edges.push({ from: dep.id, to: child.id });
            }
          }
        }
      }
    }

    const allBeads = Array.from(beadMap.values());

    // Mobile fallback
    if (window.innerWidth < MOBILE_BREAKPOINT) {
      container.innerHTML = renderConvoyMobileFallback(allBeads, blockedIds);
      setupNodeClicks(container, options.onNodeClick);
      return;
    }

    const { graph, nodeMap } = buildCombinedGraph(allBeads, edges, blockedIds);
    container.innerHTML = `<div class="dag-container">
      <div class="dag-toolbar">
        <button class="btn btn-sm btn-secondary dag-select-toggle" title="Toggle selection mode">
          <span class="material-icons" style="font-size:16px">check_box_outline_blank</span> Select
        </button>
        <button class="btn btn-sm btn-secondary dag-zoom-in" title="Zoom in">
          <span class="material-icons" style="font-size:16px">zoom_in</span>
        </button>
        <button class="btn btn-sm btn-secondary dag-zoom-out" title="Zoom out">
          <span class="material-icons" style="font-size:16px">zoom_out</span>
        </button>
        <button class="btn btn-sm btn-secondary dag-reset" title="Reset view">
          <span class="material-icons" style="font-size:16px">fit_screen</span>
        </button>
        <button class="btn btn-sm btn-secondary dag-copy-mermaid" title="Copy as Mermaid">
          <span class="material-icons" style="font-size:16px">content_copy</span> Mermaid
        </button>
      </div>
      ${renderSVG(graph, nodeMap)}
      <div class="dag-legend">
        <span class="dag-legend-item"><span class="dag-legend-dot" style="background:${EDGE_COLORS.default}"></span> Pending</span>
        <span class="dag-legend-item"><span class="dag-legend-dot" style="background:${EDGE_COLORS.blocked}"></span> Blocked</span>
        <span class="dag-legend-item"><span class="dag-legend-dot" style="background:${EDGE_COLORS.resolved}"></span> Resolved</span>
      </div>
    </div>`;

    setupPanZoom(container);
    const mode = setupSelectionMode(container);
    setupNodeClicks(container, options.onNodeClick, mode);
    setupZoomButtons(container);
    setupMermaidExport(container, graph, nodeMap);
    renderFloatingBar(container.querySelector('.dag-container'));
  } catch (err) {
    console.error('[ConvoyGraph] Error:', err);
    container.innerHTML = `<div class="dag-error">
      <span class="material-icons">error_outline</span>
      <p>Failed to load convoy dependency graph: ${escapeHtml(err.message)}</p>
    </div>`;
  }
}

/**
 * Render mobile fallback for convoy graph as a flat list of beads.
 */
function renderConvoyMobileFallback(beads, blockedIds) {
  if (!beads.length) return '<div class="dag-empty">No dependency data available</div>';

  const statusColor = (s) => STATUS_COLORS[s] || STATUS_COLORS.open;

  let html = '<div class="dag-mobile-list">';
  for (const bead of beads) {
    const isBlocked = blockedIds.has(bead.id);
    const assignee = bead.assignee ? bead.assignee.split('/').pop() : '';
    html += `<div class="dag-mobile-node" data-bead-id="${escapeHtml(bead.id)}">
      <span class="dag-mobile-status" style="background:${statusColor(bead.status)}"></span>
      <span class="dag-mobile-title">${escapeHtml(bead.title || bead.id)}</span>
      <span class="dag-mobile-id">${escapeHtml(bead.id)}</span>
      ${assignee ? `<span class="dag-mobile-assignee">${escapeHtml(assignee)}</span>` : ''}
      ${isBlocked ? '<span class="dag-mobile-badge dag-badge-blocked">Blocked</span>' : ''}
    </div>`;
  }
  html += '</div>';
  return html;
}

/**
 * Set up zoom button handlers on a DAG container.
 */
function setupZoomButtons(container) {
  const svg = container.querySelector('.dag-svg');
  if (!svg) return;

  const vb = svg.viewBox.baseVal;
  const origW = vb.width;
  const origH = vb.height;
  const origX = vb.x;
  const origY = vb.y;

  container.querySelector('.dag-zoom-in')?.addEventListener('click', () => {
    const cx = vb.x + vb.width / 2;
    const cy = vb.y + vb.height / 2;
    vb.width *= 0.8;
    vb.height *= 0.8;
    vb.x = cx - vb.width / 2;
    vb.y = cy - vb.height / 2;
  });

  container.querySelector('.dag-zoom-out')?.addEventListener('click', () => {
    const cx = vb.x + vb.width / 2;
    const cy = vb.y + vb.height / 2;
    vb.width *= 1.25;
    vb.height *= 1.25;
    vb.x = cx - vb.width / 2;
    vb.y = cy - vb.height / 2;
  });

  container.querySelector('.dag-reset')?.addEventListener('click', () => {
    vb.x = origX;
    vb.y = origY;
    vb.width = origW;
    vb.height = origH;
  });
}

/**
 * Serialize a dagre graph to Mermaid graph TD syntax.
 * @param {object} g - dagre graph
 * @param {Map} nodeMap - Map of id → bead
 * @returns {string} Mermaid diagram text
 */
function graphToMermaid(g, nodeMap) {
  const lines = ['graph TD'];

  // Mermaid style classes for status
  const statusStyles = [];

  for (const id of g.nodes()) {
    const bead = nodeMap.get(id);
    if (!bead) continue;
    const label = (bead.title || id).replace(/"/g, '#quot;');
    const status = bead.status || 'open';
    lines.push(`  ${id}["${label}"]:::${status}`);
  }

  for (const edge of g.edges()) {
    const edgeData = g.edge(edge.v, edge.w);
    const target = nodeMap.get(edge.w);
    const arrow = target?.status === 'closed' ? '-->' : '==>';
    lines.push(`  ${edge.v} ${arrow} ${edge.w}`);
  }

  // Add style definitions
  lines.push('');
  lines.push('  classDef open fill:#6e7681,color:#fff');
  lines.push('  classDef in_progress fill:#d29922,color:#fff');
  lines.push('  classDef hooked fill:#d29922,color:#fff');
  lines.push('  classDef blocked fill:#f85149,color:#fff');
  lines.push('  classDef closed fill:#3fb950,color:#fff');
  lines.push('  classDef pinned fill:#a371f7,color:#fff');
  lines.push('  classDef deferred fill:#8b949e,color:#fff');

  return lines.join('\n');
}

/**
 * Set up the "Copy as Mermaid" button click handler.
 */
function setupMermaidExport(container, g, nodeMap) {
  const btn = container.querySelector('.dag-copy-mermaid');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const mermaid = graphToMermaid(g, nodeMap);
    navigator.clipboard.writeText(mermaid).then(() => {
      showToast('Copied Mermaid diagram to clipboard', 'success', 3000);
    });
  });
}

/**
 * Render a dependency graph into a container element.
 *
 * @param {HTMLElement} container - DOM element to render into
 * @param {string} epicId - The epic bead ID to visualize
 * @param {Object} options
 * @param {Function} options.onNodeClick - Callback when a node is clicked (receives beadId)
 */
/**
 * Render a dependency graph of all open/in_progress/blocked beads.
 * Fetches beads and their dependencies, builds a combined DAG.
 *
 * @param {HTMLElement} container - DOM element to render into
 * @param {Object} options
 * @param {string} options.rig - Optional rig filter
 * @param {Function} options.onNodeClick - Callback when a node is clicked (receives beadId)
 */
export async function renderAllBeadsGraph(container, options = {}) {
  if (!container) return;

  container.innerHTML = '<div class="dag-loading"><span class="loading-spinner"></span> Loading dependency graph...</div>';

  try {
    // Fetch all open/in_progress/blocked beads and blocked info
    const params = new URLSearchParams();
    params.set('status', 'open');
    if (options.rig) params.set('rig', options.rig);

    const [openBeads, blockedBeads] = await Promise.all([
      api.get(`/api/beads?${params}`),
      api.getBlockedBeads(options.rig),
    ]);

    const allBeads = (openBeads || []).filter(b => !isHiddenBead(b));

    if (allBeads.length === 0) {
      container.innerHTML = '<div class="dag-empty"><span class="material-icons">account_tree</span><p>No open beads to graph</p></div>';
      return;
    }

    // Fetch per-bead dependencies in parallel (same pattern as renderConvoyGraph)
    const depResults = await Promise.all(
      allBeads.map(b => api.getBeadDependencies(b.id).catch(() => []))
    );

    // Build node map from all beads
    const beadMap = new Map();
    for (const bead of allBeads) {
      beadMap.set(bead.id, bead);
    }

    // Build edges from blocked_by relationships
    const edges = [];
    const blockedIds = new Set();
    for (const b of (blockedBeads || [])) {
      if (isHiddenBead(b)) continue;
      blockedIds.add(b.id);
      for (const depId of (b.blocked_by || [])) {
        edges.push({ from: depId, to: b.id });
        // Add the blocker to beadMap if not already present
        if (!beadMap.has(depId)) {
          beadMap.set(depId, { id: depId, title: depId, status: 'open' });
        }
      }
    }

    // Build edges from per-bead dependency data (blocks relationships)
    for (let i = 0; i < allBeads.length; i++) {
      const bead = allBeads[i];
      const deps = depResults[i] || [];
      for (const dep of deps) {
        if (dep.dependency_type === 'blocks') {
          // dep blocks this bead: edge from blocker to blocked
          edges.push({ from: dep.id, to: bead.id });
          if (!beadMap.has(dep.id)) {
            beadMap.set(dep.id, { id: dep.id, title: dep.title || dep.id, status: dep.status || 'open' });
          }
        }
      }
    }

    // Also add parent-child edges from dependents
    for (const bead of allBeads) {
      for (const child of (bead.dependents || [])) {
        edges.push({ from: bead.id, to: child.id });
        if (!beadMap.has(child.id)) beadMap.set(child.id, child);
      }
    }

    const beadsArray = Array.from(beadMap.values());

    // Mobile fallback
    if (window.innerWidth < MOBILE_BREAKPOINT) {
      container.innerHTML = renderConvoyMobileFallback(beadsArray, blockedIds);
      setupNodeClicks(container, options.onNodeClick);
      return;
    }

    const { graph, nodeMap } = buildCombinedGraph(beadsArray, edges, blockedIds);
    const cycles = detectCycles(graph);
    const cycleBannerHtml = cycles.length > 0 ? renderCycleBanner(cycles, nodeMap) : '';

    container.innerHTML = `<div class="dag-container">
      ${cycleBannerHtml}
      <div class="dag-toolbar">
        <button class="btn btn-sm btn-secondary dag-select-toggle" title="Toggle selection mode">
          <span class="material-icons" style="font-size:16px">check_box_outline_blank</span> Select
        </button>
        <button class="btn btn-sm btn-secondary dag-zoom-in" title="Zoom in">
          <span class="material-icons" style="font-size:16px">zoom_in</span>
        </button>
        <button class="btn btn-sm btn-secondary dag-zoom-out" title="Zoom out">
          <span class="material-icons" style="font-size:16px">zoom_out</span>
        </button>
        <button class="btn btn-sm btn-secondary dag-reset" title="Reset view">
          <span class="material-icons" style="font-size:16px">fit_screen</span>
        </button>
        <button class="btn btn-sm btn-secondary dag-copy-mermaid" title="Copy as Mermaid">
          <span class="material-icons" style="font-size:16px">content_copy</span> Mermaid
        </button>
      </div>
      ${renderSVG(graph, nodeMap)}
      <div class="dag-legend">
        <span class="dag-legend-item"><span class="dag-legend-dot" style="background:${EDGE_COLORS.default}"></span> Pending</span>
        <span class="dag-legend-item"><span class="dag-legend-dot" style="background:${EDGE_COLORS.blocked}"></span> Blocked</span>
        <span class="dag-legend-item"><span class="dag-legend-dot" style="background:${EDGE_COLORS.resolved}"></span> Resolved</span>
        ${cycles.length > 0 ? `<span class="dag-legend-item"><span class="dag-legend-dot" style="background:${CYCLE_EDGE_COLOR}"></span> Cycle</span>` : ''}
      </div>
    </div>`;

    setupPanZoom(container);
    const mode = setupSelectionMode(container);
    setupNodeClicks(container, options.onNodeClick, mode);
    setupZoomButtons(container);
    setupMermaidExport(container, graph, nodeMap);
    renderFloatingBar(container.querySelector('.dag-container'));
  } catch (err) {
    console.error('[AllBeadsGraph] Error:', err);
    container.innerHTML = `<div class="dag-error">
      <span class="material-icons">error_outline</span>
      <p>Failed to load dependency graph: ${escapeHtml(err.message)}</p>
    </div>`;
  }
}

export async function renderDependencyGraph(container, epicId, options = {}) {
  if (!container) return;

  container.innerHTML = '<div class="dag-loading"><span class="loading-spinner"></span> Loading dependency graph...</div>';

  try {
    const [epicData, deps, blocked] = await Promise.all([
      api.getBead(epicId),
      api.getBeadDependencies(epicId),
      api.getBlockedBeads(),
    ]);

    // epicData from bd show returns array; take first element
    const epic = Array.isArray(epicData) ? epicData[0] : epicData;

    if (!epic) {
      container.innerHTML = '<div class="dag-empty">Epic not found</div>';
      return;
    }

    // Mobile fallback
    if (window.innerWidth < MOBILE_BREAKPOINT) {
      container.innerHTML = renderMobileFallback(epic, blocked);
      setupNodeClicks(container, options.onNodeClick);
      return;
    }

    const { graph, nodeMap } = buildGraph(epic, deps, blocked);
    const cycles = detectCycles(graph);
    const cycleBannerHtml = cycles.length > 0 ? renderCycleBanner(cycles, nodeMap) : '';

    container.innerHTML = `<div class="dag-container">
      ${cycleBannerHtml}
      <div class="dag-toolbar">
        <button class="btn btn-sm btn-secondary dag-select-toggle" title="Toggle selection mode">
          <span class="material-icons" style="font-size:16px">check_box_outline_blank</span> Select
        </button>
        <button class="btn btn-sm btn-secondary dag-zoom-in" title="Zoom in">
          <span class="material-icons" style="font-size:16px">zoom_in</span>
        </button>
        <button class="btn btn-sm btn-secondary dag-zoom-out" title="Zoom out">
          <span class="material-icons" style="font-size:16px">zoom_out</span>
        </button>
        <button class="btn btn-sm btn-secondary dag-reset" title="Reset view">
          <span class="material-icons" style="font-size:16px">fit_screen</span>
        </button>
        <button class="btn btn-sm btn-secondary dag-copy-mermaid" title="Copy as Mermaid">
          <span class="material-icons" style="font-size:16px">content_copy</span> Mermaid
        </button>
      </div>
      ${renderSVG(graph, nodeMap)}
      <div class="dag-legend">
        <span class="dag-legend-item"><span class="dag-legend-dot" style="background:${EDGE_COLORS.default}"></span> Pending</span>
        <span class="dag-legend-item"><span class="dag-legend-dot" style="background:${EDGE_COLORS.blocked}"></span> Blocked</span>
        <span class="dag-legend-item"><span class="dag-legend-dot" style="background:${EDGE_COLORS.resolved}"></span> Resolved</span>
        ${cycles.length > 0 ? `<span class="dag-legend-item"><span class="dag-legend-dot" style="background:${CYCLE_EDGE_COLOR}"></span> Cycle</span>` : ''}
      </div>
    </div>`;

    setupPanZoom(container);
    const mode = setupSelectionMode(container);
    setupNodeClicks(container, options.onNodeClick, mode);
    setupZoomButtons(container);
    setupMermaidExport(container, graph, nodeMap);
    renderFloatingBar(container.querySelector('.dag-container'));
  } catch (err) {
    console.error('[DependencyGraph] Error:', err);
    container.innerHTML = `<div class="dag-error">
      <span class="material-icons">error_outline</span>
      <p>Failed to load dependency graph: ${escapeHtml(err.message)}</p>
    </div>`;
  }
}
