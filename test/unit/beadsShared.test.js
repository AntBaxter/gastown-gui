import { describe, expect, it } from 'vitest';

import { DEFAULT_BEAD_PRIORITY, getBeadPriority, HIDDEN_BEAD_TYPES, HIDDEN_BEAD_LABELS, isHiddenBead } from '../../js/shared/beads.js';

describe('beads shared', () => {
  it('defaults missing/invalid priorities', () => {
    expect(DEFAULT_BEAD_PRIORITY).toBe(2);
    expect(getBeadPriority()).toBe(2);
    expect(getBeadPriority(null)).toBe(2);
    expect(getBeadPriority({})).toBe(2);
    expect(getBeadPriority({ priority: 0 })).toBe(2);
    expect(getBeadPriority({ priority: 'nope' })).toBe(2);
  });

  it('normalizes numeric and numeric-string priorities', () => {
    expect(getBeadPriority({ priority: 5 })).toBe(5);
    expect(getBeadPriority({ priority: '4' })).toBe(4);
  });

  it('HIDDEN_BEAD_TYPES includes wisp and rig', () => {
    expect(HIDDEN_BEAD_TYPES).toContain('wisp');
    expect(HIDDEN_BEAD_TYPES).toContain('rig');
  });

  it('HIDDEN_BEAD_TYPES includes all internal types', () => {
    for (const t of ['message', 'convoy', 'agent', 'gate', 'role', 'event', 'slot', 'wisp', 'rig']) {
      expect(HIDDEN_BEAD_TYPES).toContain(t);
    }
  });

  it('HIDDEN_BEAD_LABELS includes gt:rig and gt:message', () => {
    expect(HIDDEN_BEAD_LABELS).toContain('gt:rig');
    expect(HIDDEN_BEAD_LABELS).toContain('gt:message');
  });

  it('isHiddenBead hides beads by type', () => {
    expect(isHiddenBead({ issue_type: 'message' })).toBe(true);
    expect(isHiddenBead({ issue_type: 'task' })).toBe(false);
  });

  it('isHiddenBead hides ephemeral beads', () => {
    expect(isHiddenBead({ issue_type: 'task', ephemeral: true })).toBe(true);
  });

  it('isHiddenBead hides beads with hidden labels', () => {
    expect(isHiddenBead({ issue_type: 'task', labels: ['gt:rig'] })).toBe(true);
    expect(isHiddenBead({ issue_type: 'task', labels: ['gt:message'] })).toBe(true);
    expect(isHiddenBead({ issue_type: 'task', labels: ['gt:rig', 'other'] })).toBe(true);
  });

  it('isHiddenBead does not hide beads with non-hidden labels', () => {
    expect(isHiddenBead({ issue_type: 'task', labels: ['other'] })).toBe(false);
    expect(isHiddenBead({ issue_type: 'task', labels: [] })).toBe(false);
    expect(isHiddenBead({ issue_type: 'task' })).toBe(false);
  });
});

