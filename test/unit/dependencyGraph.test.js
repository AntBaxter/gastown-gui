import { describe, it, expect } from 'vitest';

import { detectCycles, CYCLE_EDGE_COLOR } from '../../js/utils/cycle-detect.js';

/**
 * Minimal mock graph that implements the methods detectCycles uses:
 * nodes(), successors(), edges(), edge()
 */
function createMockGraph(edges) {
  const nodeSet = new Set();
  const adjList = new Map();
  const edgeDataMap = new Map();

  for (const [v, w] of edges) {
    nodeSet.add(v);
    nodeSet.add(w);
    if (!adjList.has(v)) adjList.set(v, []);
    adjList.get(v).push(w);
    edgeDataMap.set(`${v}->${w}`, { color: '#6e7681' });
  }

  return {
    nodes: () => [...nodeSet],
    successors: (node) => adjList.get(node) || [],
    edges: () => edges.map(([v, w]) => ({ v, w })),
    edge: (v, w) => edgeDataMap.get(`${v}->${w}`),
  };
}

describe('detectCycles', () => {
  it('returns empty array for acyclic graph', () => {
    const g = createMockGraph([
      ['a', 'b'],
      ['b', 'c'],
      ['a', 'c'],
    ]);
    const cycles = detectCycles(g);
    expect(cycles).toHaveLength(0);
  });

  it('detects a simple two-node cycle', () => {
    const g = createMockGraph([
      ['a', 'b'],
      ['b', 'a'],
    ]);
    const cycles = detectCycles(g);
    expect(cycles.length).toBeGreaterThan(0);
    // The cycle should contain both 'a' and 'b'
    const flatNodes = cycles.flat();
    expect(flatNodes).toContain('a');
    expect(flatNodes).toContain('b');
  });

  it('detects a three-node cycle', () => {
    const g = createMockGraph([
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'a'],
    ]);
    const cycles = detectCycles(g);
    expect(cycles.length).toBeGreaterThan(0);
    const flatNodes = cycles.flat();
    expect(flatNodes).toContain('a');
    expect(flatNodes).toContain('b');
    expect(flatNodes).toContain('c');
  });

  it('colors cycle edges orange/yellow', () => {
    const g = createMockGraph([
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'a'],
    ]);
    detectCycles(g);

    // At least one edge in the cycle should be colored
    const cycleColor = CYCLE_EDGE_COLOR;
    const coloredEdges = g.edges().filter(e => {
      const data = g.edge(e.v, e.w);
      return data && data.color === cycleColor;
    });
    expect(coloredEdges.length).toBeGreaterThan(0);
  });

  it('does not color non-cycle edges', () => {
    const g = createMockGraph([
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'b'], // cycle between b and c only
    ]);
    detectCycles(g);

    const abEdge = g.edge('a', 'b');
    expect(abEdge.color).toBe('#6e7681'); // default, not cycle
  });

  it('handles graph with no edges', () => {
    const g = {
      nodes: () => ['a', 'b'],
      successors: () => [],
      edges: () => [],
      edge: () => null,
    };
    const cycles = detectCycles(g);
    expect(cycles).toHaveLength(0);
  });

  it('handles self-loop as a cycle', () => {
    const g = createMockGraph([
      ['a', 'a'],
    ]);
    const cycles = detectCycles(g);
    expect(cycles.length).toBeGreaterThan(0);
  });
});
