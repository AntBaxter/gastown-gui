/**
 * Gas Town GUI - Bead helpers
 */

export const DEFAULT_BEAD_PRIORITY = 2;

/**
 * Bead types that are internal/ephemeral and should not appear in task views.
 */
export const HIDDEN_BEAD_TYPES = ['message', 'convoy', 'agent', 'gate', 'role', 'event', 'slot', 'wisp', 'rig'];

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

