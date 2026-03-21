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

const NODE_WIDTH = 200;
const NODE_HEIGHT = 72;
const MOBILE_BREAKPOINT = 768;

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

  return `<g class="dag-node" data-bead-id="${escapeHtml(bead.id)}" style="cursor:pointer">
    <rect x="${x}" y="${y}" width="${NODE_WIDTH}" height="${NODE_HEIGHT}"
      rx="6" ry="6"
      fill="var(--bg-tertiary)" stroke="${statusColor}" stroke-width="${isEpic ? 2.5 : 1.5}"
      ${isEpic ? 'stroke-dasharray="6,3"' : ''}/>
    <text x="${x + 10}" y="${y + 20}" fill="var(--text-primary)" font-size="13" font-weight="500">${titleText}</text>
    <text x="${x + 10}" y="${y + 38}" fill="var(--text-muted)" font-size="11" font-family="var(--font-mono)">${idText}</text>
    <rect x="${x + 10}" y="${y + 48}" width="8" height="8" rx="2" fill="${statusColor}"/>
    <text x="${x + 22}" y="${y + 56}" fill="var(--text-secondary)" font-size="10">${statusText}</text>
    ${assigneeText ? `<text x="${x + NODE_WIDTH - 10}" y="${y + 56}" fill="var(--text-muted)" font-size="10" text-anchor="end">${escapeHtml(assigneeText)}</text>` : ''}
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
 * Set up click handlers on nodes to open bead detail.
 */
function setupNodeClicks(container, onNodeClick) {
  container.addEventListener('click', (e) => {
    const node = e.target.closest('[data-bead-id]');
    if (node) {
      const beadId = node.dataset.beadId;
      if (onNodeClick) {
        onNodeClick(beadId);
      }
    }
  });
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
        <button class="btn btn-sm btn-secondary dag-zoom-in" title="Zoom in">
          <span class="material-icons" style="font-size:16px">zoom_in</span>
        </button>
        <button class="btn btn-sm btn-secondary dag-zoom-out" title="Zoom out">
          <span class="material-icons" style="font-size:16px">zoom_out</span>
        </button>
        <button class="btn btn-sm btn-secondary dag-reset" title="Reset view">
          <span class="material-icons" style="font-size:16px">fit_screen</span>
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
    setupNodeClicks(container, options.onNodeClick);
    setupZoomButtons(container);
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
 * Render a dependency graph into a container element.
 *
 * @param {HTMLElement} container - DOM element to render into
 * @param {string} epicId - The epic bead ID to visualize
 * @param {Object} options
 * @param {Function} options.onNodeClick - Callback when a node is clicked (receives beadId)
 */
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
        <button class="btn btn-sm btn-secondary dag-zoom-in" title="Zoom in">
          <span class="material-icons" style="font-size:16px">zoom_in</span>
        </button>
        <button class="btn btn-sm btn-secondary dag-zoom-out" title="Zoom out">
          <span class="material-icons" style="font-size:16px">zoom_out</span>
        </button>
        <button class="btn btn-sm btn-secondary dag-reset" title="Reset view">
          <span class="material-icons" style="font-size:16px">fit_screen</span>
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
    setupNodeClicks(container, options.onNodeClick);
    setupZoomButtons(container);
  } catch (err) {
    console.error('[DependencyGraph] Error:', err);
    container.innerHTML = `<div class="dag-error">
      <span class="material-icons">error_outline</span>
      <p>Failed to load dependency graph: ${escapeHtml(err.message)}</p>
    </div>`;
  }
}
