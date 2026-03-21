/**
 * Cycle detection for directed graphs.
 * Pure function — no browser dependencies.
 */

const CYCLE_EDGE_COLOR = '#d4a017';

/**
 * Detect cycles in a dagre-style graph using DFS.
 * @param {Object} g - Graph with nodes(), successors(node), edges(), edge(v,w) methods
 * @returns {Array<string[]>} Array of cycle paths (each path is array of node IDs, first===last)
 */
function detectCycles(g) {
  const cycles = [];
  const visited = new Set();
  const inStack = new Set();
  const parent = new Map();

  function dfs(node) {
    visited.add(node);
    inStack.add(node);

    for (const succ of (g.successors(node) || [])) {
      if (!visited.has(succ)) {
        parent.set(succ, node);
        dfs(succ);
      } else if (inStack.has(succ)) {
        const cyclePath = [succ];
        let cur = node;
        while (cur !== succ) {
          cyclePath.push(cur);
          cur = parent.get(cur);
        }
        cyclePath.push(succ);
        cyclePath.reverse();
        cycles.push(cyclePath);
      }
    }

    inStack.delete(node);
  }

  for (const node of g.nodes()) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  // Color cycle edges
  const cycleEdges = new Set();
  for (const cyclePath of cycles) {
    for (let i = 0; i < cyclePath.length - 1; i++) {
      cycleEdges.add(`${cyclePath[i]}->${cyclePath[i + 1]}`);
    }
  }
  for (const edge of g.edges()) {
    if (cycleEdges.has(`${edge.v}->${edge.w}`)) {
      const edgeData = g.edge(edge.v, edge.w);
      if (edgeData) {
        edgeData.color = CYCLE_EDGE_COLOR;
      }
    }
  }

  return cycles;
}

export { detectCycles, CYCLE_EDGE_COLOR };
