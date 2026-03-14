# Gas Town GUI - Codebase Documentation

> **Keep this file current.** If you add, delete, or move files/systems, update this doc before creating a PR. Keep it token-efficient.

## Quick Navigation

```
ENTRY:    server.js - Express bridge server (gt/bd CLI → HTTP/WS)
CLI:      bin/cli.js - npx gastown-gui entry point
FRONTEND: js/ - Browser SPA (vanilla JS, no framework)
BACKEND:  server/ - Refactored backend modules (services, gateways, routes)
STYLES:   css/ - CSS custom properties + component styles
TESTS:    test/ - Vitest unit + integration, Puppeteer E2E
CONFIG:   vitest.config.js, vitest.unit.config.js, package.json
ASSETS:   assets/ - Favicons + screenshots
DOCS:     refactoring-analysis/ - Refactor plans/reports, CLI-COMPATIBILITY.md
```

## Backend — Entry & App

```
server.js - Express server entry point; DI wiring + WebSocket + server startup
├─ Creates infrastructure (CommandRunner, CacheRegistry)
├─ Wires gateways → services → routes
├─ WebSocket server for real-time events (gt feed)
└─ ~290 lines, fully refactored

server/app/createApp.js - Express app factory with CORS config
```

## Backend — Domain Values

```
server/domain/values/AgentPath.js - Validates rig/agent path pairs
└─ Enforces SafeSegment on both segments

server/domain/values/SafeSegment.js - Input sanitization for CLI args
└─ Rejects shell metacharacters, path traversal
```

## Backend — Gateways (CLI Wrappers)

```
server/gateways/GTGateway.js - Wraps gt CLI commands via execFile
├─ status, convoy, sling, mail, nudge, feed, doctor, etc.
└─ Uses CommandRunner for safe execution

server/gateways/BDGateway.js - Wraps bd (beads) CLI commands
├─ list, search, create, show, close, defer, update
└─ Maps GUI actions to current bd CLI syntax

server/gateways/GitHubGateway.js - Wraps gh CLI for PR/issue/repo queries
server/gateways/GitGateway.js - Wraps git CLI for branch info
server/gateways/TmuxGateway.js - Tmux session management for polecats
```

## Backend — Infrastructure

```
server/infrastructure/CommandRunner.js - Safe child_process.execFile wrapper
├─ Timeout, error handling, output parsing
└─ No shell execution (injection-safe)

server/infrastructure/CacheRegistry.js - TTL cache for CLI output
server/infrastructure/EventBus.js - Internal pub/sub for cache invalidation
```

## Backend — Services

```
server/services/AgentService.js - Agent list, polecat output/start/stop/restart, transcript, bead links
server/services/BeadService.js - Bead CRUD via BDGateway
server/services/ConvoyService.js - Convoy CRUD via GTGateway
server/services/CrewService.js - Crew CRUD via GTGateway
server/services/DoctorService.js - Doctor check + fix via GTGateway
server/services/FormulaService.js - Formula CRUD + run via GTGateway
server/services/GitHubService.js - PR/issue/repo queries via GitHubGateway
server/services/MailService.js - Mail inbox/send/read/mark + feed reading
server/services/NudgeService.js - Nudge messaging + mayor message history
server/services/RigService.js - Rig CRUD, dock/undock, setup status
server/services/ServiceControlService.js - Service start/stop/restart/status
server/services/StatusService.js - Town status aggregation
server/services/TargetService.js - Available sling targets
server/services/WorkService.js - Work lifecycle (close, defer, reassign)
```

## Backend — Routes

```
server/routes/agents.js - GET /api/agents, /api/polecat/:rig/:name/*, /api/hook, /api/bead/:id/links
server/routes/beads.js - CRUD /api/beads, /api/bead/:id
server/routes/convoys.js - GET/POST /api/convoys, /api/convoy/:id
server/routes/crews.js - CRUD /api/crews, /api/crew/:name
server/routes/doctor.js - GET /api/doctor, POST /api/doctor/fix
server/routes/formulas.js - CRUD /api/formulas, /api/formula/:name
server/routes/github.js - GET /api/github/{prs,issues,repos}
server/routes/mail.js - CRUD /api/mail, /api/mail/all, /api/mail/:id
server/routes/nudge.js - POST /api/nudge, GET /api/mayor/messages
server/routes/rigs.js - CRUD /api/rigs, /api/setup/status, dock/undock
server/routes/services.js - POST /api/service/:name/{up,down,restart}, GET status
server/routes/status.js - GET /api/status
server/routes/targets.js - GET /api/targets
server/routes/work.js - POST /api/work/:id/{done,park,release,reassign}
```

## Frontend — Core

```
js/app.js - App init, tab routing, event wiring, status polling
js/api.js - HTTP client for /api/* + WebSocket client class
js/state.js - Global reactive state store, component subscriptions
```

## Frontend — Components

```
js/components/dashboard.js - Main dashboard layout + tab switching
js/components/sidebar.js - Agent tree, service controls, stats, hook display
js/components/agent-grid.js - Agent cards with status/actions
js/components/convoy-list.js - Convoy management panel
js/components/mail-list.js - Mail inbox/compose/reply
js/components/issue-list.js - Beads/issues list with search
js/components/pr-list.js - GitHub PR list
js/components/formula-list.js - Formula editor/executor
js/components/greeting.js - Time-of-day greeting banner on dashboard
js/components/work-list.js - Active work items display
js/components/rig-list.js - Rig management + polecat spawn/stop
js/components/crew-list.js - Crew CRUD operations
js/components/health-check.js - System health display (doctor)
js/components/activity-feed.js - Real-time event stream
js/components/modals.js - Modal dialogs (sling, nudge, compose)
js/components/onboarding.js - First-run setup wizard
js/components/tutorial.js - Interactive tutorial overlay
js/components/autocomplete.js - Search input with suggestions
js/components/toast.js - Toast notification system
```

## Frontend — Shared & Utils

```
js/shared/agent-types.js - Agent type definitions, icons, colors
js/shared/animations.js - Shared animation helpers
js/shared/beads.js - Bead domain helpers/constants
js/shared/close-reason.js - close_reason formatting
js/shared/events.js - Custom event names/bus
js/shared/github-repos.js - Bead/rig → GitHub repo mapping
js/shared/timing.js - Shared timing constants (polling, debounce)

js/utils/formatting.js - Date/number formatters
js/utils/html.js - escapeHtml, escapeAttr, truncate, capitalize
js/utils/performance.js - Debounce/throttle utilities
js/utils/tooltip.js - Tooltip positioning helpers
```

## Styles

```
css/variables.css - CSS custom properties (colors, spacing, z-index)
css/reset.css - Browser reset
css/layout.css - Grid/flex layouts, responsive breakpoints
css/components.css - Component-specific styles
css/animations.css - Transitions & keyframes
```

## Tests

```
test/setup.js - Vitest test environment setup
test/globalSetup.js - Global setup (port allocation)
test/mock-server.js - Mock Express server mimicking gt CLI responses

test/e2e.test.js - Puppeteer browser tests (real server + browser)
test/integration.test.js - Legacy integration tests
test/integration/endpoints.test.js - API endpoint contract tests
test/integration/websocket.test.js - WebSocket lifecycle tests
test/integration/cache.test.js - Cache invalidation tests

test/unit/ - 31 unit test files covering:
├─ Domain values: safeSegment, agentPath
├─ Gateways: gtGateway, bdGateway, githubGateway, gitGateway, tmuxGateway
├─ Infrastructure: cacheRegistry, commandRunner, eventBus
├─ Services: statusService, targetService, githubService, convoyService,
│            formulaService, beadService, workService
├─ Routes: statusRoutes, targetRoutes, githubRoutes, convoyRoutes,
│          formulaRoutes, beadRoutes, workRoutes
├─ Frontend: state, htmlUtils, quoteArg, formattingTime, animationsShared,
│            beadsShared, githubRepos
└─ Security: quoteArg (shell injection prevention)

test/manual/ - Manual test scripts (debug-button, onboarding, UI flow)
```

## Config & Scripts

```
package.json - Dependencies: express, cors, ws. Dev: vitest, puppeteer
vitest.config.js - Main test config (all tests)
vitest.unit.config.js - Unit-only test config
bin/cli.js - CLI entry point (gastown-gui command)
scripts/extract_user_prompts.mjs - Sanitized prompt log builder
```

## Documentation

```
CLI-COMPATIBILITY.md - gt/bd CLI command compatibility audit
analysis/mobile-friendly-ui.md - Mobile responsiveness audit, library evaluation, implementation plan
analysis/beads-ui-integration.md - Beads UI enhancement analysis: kanban, graphs, BeadBoard patterns
analysis/convoy-integration-branches.md - Convoy and integration branch UI analysis and pitfalls
analysis/implementation-plan.md - Phased implementation plan for all beads UI enhancements
refactoring-analysis/ - Refactor plans, reports, and analysis docs
refactoring-analysis/trace/ - Sanitized prompt/trace exports
```

## Key Patterns

- **Gateway pattern:** CLI tools (gt, bd, gh, git, tmux) wrapped in gateway classes; services compose gateways; routes call services
- **Safe execution:** All CLI calls use `execFile` (no shell) + `SafeSegment` validation — prevents injection
- **Cache + invalidation:** `CacheRegistry` with TTL; `EventBus` triggers cache clears on mutations
- **Frontend:** Vanilla JS SPA, no build step. Components render via innerHTML, subscribe to global state
- **Service controls:** Witness/refinery require a `rig` parameter for start/stop/restart; mayor/deacon do not
