/**
 * Gas Town GUI - Bead helpers
 */

export const DEFAULT_BEAD_PRIORITY = 2;

/**
 * Bead types that are internal/ephemeral and should not appear in task views.
 */
export const HIDDEN_BEAD_TYPES = ['message', 'convoy', 'agent', 'gate', 'role', 'event', 'slot', 'wisp', 'rig'];

/**
 * Bead labels that mark internal beads which should not appear in work item panes.
 */
export const HIDDEN_BEAD_LABELS = ['gt:rig', 'gt:message'];

/**
 * Check if a bead should be hidden from work item panes.
 * @param {object} bead
 * @returns {boolean}
 */
export function isHiddenBead(bead) {
  if (HIDDEN_BEAD_TYPES.includes(bead.issue_type)) return true;
  if (bead.ephemeral) return true;
  const labels = bead.labels;
  if (Array.isArray(labels)) {
    for (const label of HIDDEN_BEAD_LABELS) {
      if (labels.includes(label)) return true;
    }
  }
  return false;
}

/**
 * Normalize a bead's priority for display.
 * @param {object} bead
 * @returns {number}
 */
export function getBeadPriority(bead) {
  const raw = bead?.priority;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_BEAD_PRIORITY;
}

