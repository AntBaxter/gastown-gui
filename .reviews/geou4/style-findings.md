# Style Review

## Summary

The Gas Town GUI codebase is generally well-structured with consistent patterns in the refactored backend modules and test suite. However, there are significant style inconsistencies in the legacy `server.js` monolith, the frontend components, and the CSS layer. The most impactful issues are: mixed snake_case/camelCase naming in API responses, inconsistent error handling across routes, undefined CSS custom properties being referenced, and duplicate code patterns (parseJsonOrNull appears in 4 files, keyframe animations defined multiple times). The test suite is the strongest area stylistically, with consistent naming, organization, and assertion patterns.

## Critical Issues

- **Undefined CSS custom properties referenced throughout**: `--border-primary`, `--text-tertiary`, `--status-success`, `--status-error`, `--status-warning`, `--status-info` are used in `css/layout.css` and `css/components.css` but never defined in `css/variables.css`. The actual variable names are `--border-default`, `--accent-success`, `--accent-danger`, `--accent-warning`. This causes fallback to browser defaults (likely transparent/black).
  - `css/layout.css:72,134,162,178,223,232` - `--border-primary` (should be `--border-default`)
  - `css/layout.css:99` - `--text-tertiary` (undefined)
  - `css/components.css:1330-1358` - `--status-success/error/warning/info` (should be `--accent-*`)
  - `css/components.css:4828,5059,5106,5126,5311+` - `--text-tertiary` (20+ occurrences)

- **Inconsistent API response naming (snake_case vs camelCase)**: Routes return mixed conventions making client code unpredictable.
  - `server/routes/beads.js:33` - `{ bead_id }` (snake_case)
  - `server/routes/convoys.js:34` - `{ convoy_id }` (snake_case)
  - `server/routes/work.js:41-46` - `{ beadId, message }` (camelCase)
  - `server.js:863` - `gt_installed`, `bd_version` (snake_case in doctor response)

- **Silent error swallowing in routes**: Some routes catch errors and return empty arrays instead of error responses, hiding failures from the frontend.
  - `server/routes/beads.js:8-10` - `catch { res.json([]); }` (no logging, no error response)
  - `server/routes/formulas.js:18-19` - `catch { res.json([]); }` (same pattern)
  - Compare: `server/routes/convoys.js:4-15` properly returns `res.status(500).json({ error })`

## Major Issues

- **Duplicate `parseJsonOrNull` function in 4 files**: Identical helper copy-pasted across gateways and services. Should be extracted to a shared utility.
  - `server/gateways/GTGateway.js:1`
  - `server/gateways/BDGateway.js:3`
  - `server/gateways/GitHubGateway.js:1`
  - `server/services/WorkService.js:1`

- **Duplicate CSS keyframe definitions**: Same animation defined multiple times with inconsistent values.
  - `@keyframes pulse`: `css/components.css:2243` (opacity 1->0.7) vs `css/components.css:6343` (opacity 1->0.6) - different values!
  - `@keyframes spin`: defined at `css/components.css:3464`, `css/components.css:4443`, and `css/animations.css` - three definitions

- **Duplicate CSS selector definitions with conflicting rules**:
  - `.issue-list`: defined at `css/components.css:331`, `css/components.css:1546`, and `css/components.css:4978` with different margin, padding, and display properties
  - `.toast-container`: `css/layout.css:629` (top-right) vs `css/components.css:1260` (bottom-right) - opposing positions
  - `.legend-item`: `css/components.css:1100` and `css/components.css:1820` for different purposes (should use distinct class names)

- **Hardcoded colors instead of CSS custom properties**: 30+ hex color values scattered through stylesheets instead of referencing design tokens.
  - `css/layout.css:85,143,144,179` - `#a855f7` (should use `--role-deacon` or `--accent-secondary`)
  - `css/layout.css:116` - `#4a90e2`
  - `css/components.css:26` - `#4a90e2`, `css/components.css:46` - `#e53935`
  - `css/components.css:678,864,868` - `#22c55e`
  - `css/components.css:2150` - `#dc2626`, `css/components.css:3377` - `#7c3aed`

- **Ad-hoc z-index values**: Mix of CSS variables and hardcoded values creating unpredictable stacking.
  - `css/layout.css:165` - `z-index: 9999` (hardcoded)
  - `css/components.css:2028` - `z-index: 1000` (should use `--z-dropdown: 100`)
  - `css/components.css:2928` - `z-index: 10000` (no variable for this level)
  - `css/components.css:3230` - `z-index: 9999`, `css/components.css:3244` - `z-index: 10000`

- **Inconsistent error handling across routes**: Different patterns for error responses.
  - `server/routes/beads.js:9` - returns `[]` on error
  - `server/routes/convoys.js:15` - returns `{ error: err.message }` with 500
  - `server/routes/work.js:10` - returns `{ success: false, error }` with 500
  - No standard error response envelope

- **No logging in service layer**: All service files (`BeadService`, `ConvoyService`, `FormulaService`, `WorkService`) have zero console logging, making debugging difficult compared to `server.js` which has contextual `[Cache]`, `[Session]`, `[GT]` prefixed logs.

- **Missing HTML attribute escaping in frontend**: Some data attributes receive unescaped values.
  - `js/components/convoy-list.js:238` - `JSON.stringify(convoy.issues)` used in `data-issues` attribute without `escapeAttr()` wrapper
  - `js/components/agent-grid.js:120` - truncated output not escaped (compare to `js/sidebar.js:161` which properly uses `escapeHtml()`)

## Minor Issues

- **Inconsistent string quoting**: Mixed single and double quotes across backend files. `server.js:203-208` mixes both; `bin/cli.js` has no consistent pattern. Frontend is more consistent (mostly single quotes). Test suite is fully consistent (single quotes).

- **Import organization not standardized**: Frontend components order imports differently.
  - `js/components/sidebar.js:7-12` - agent-types, api, toast, html, events, timing
  - `js/components/convoy-list.js:8-12` - html, formatting, timing, events, animations
  - No alphabetical or category-based grouping convention

- **Inconsistent test naming style**: `test/unit/quoteArg.test.js` uses `'should ...'` prefix throughout (lines 22-117) while all other test files use imperative mood (`'maps'`, `'returns'`, `'creates'`).

- **Large files without clear internal structure**:
  - `css/components.css` - 7,451 lines (no table of contents, difficult to navigate)
  - `js/app.js` - ~1,234 lines (mixes initialization, data loading, event handlers, rendering)
  - `server.js` - ~1,700 lines (legacy endpoints still inline)

- **Timeout values scattered as magic numbers**: Different timeouts across gateways and server.js with no shared constants.
  - `server.js:268` - 15000, `server.js:351` - 10000, `server.js:387` - 30000
  - `server/gateways/GTGateway.js:24,33` - 30000
  - `server/gateways/GitHubGateway.js:16` - 15000, line 20 - 10000

- **Duplicate rig validation in mock server**: `test/mock-server.js` repeats identical rig parameter validation at lines 576-578, 596-598, 612-614. Should extract to helper.

- **Frontend inconsistency in empty/loading state patterns**: Each component handles empty states differently.
  - `js/app.js:68-81` - separate `showLoadingState()`/`hideLoadingState()` functions
  - `js/components/agent-grid.js:20-28` - inline in render function
  - `js/components/convoy-list.js:49-69` - inline with button handler
  - No reusable empty state component

- **Hardcoded pixel values in CSS**: 40+ instances of spacing/sizing values like `2px`, `6px`, `8px`, `20px`, `28px` that should use the spacing scale (`--space-xs`, `--space-sm`, etc.).

- **Missing JSDoc on backend classes**: Gateway and service classes lack constructor documentation and parameter types. `server/infrastructure/CommandRunner.js` has no JSDoc on methods.

## Observations

- The refactored `server/` modules (gateways, services, routes) are notably cleaner and more consistent than the legacy code in `server.js`. The refactoring effort has been effective and the pattern should be continued.
- The test suite is the strongest area for style consistency: uniform 2-space indentation, consistent assertion patterns, good arrange-act-assert structure, and proper setup/teardown.
- CSS `variables.css` defines a reasonable design token system but adoption is incomplete - components.css frequently bypasses it with hardcoded values, and several referenced variable names don't match what's actually defined.
- The codebase would benefit from a linter configuration (ESLint + Prettier) to enforce quoting, spacing, and import ordering automatically.
- Event naming in the backend mixes snake_case (`bead_created`, `convoy_created`) with the camelCase convention used for everything else in JavaScript. This is a design decision worth standardizing.
