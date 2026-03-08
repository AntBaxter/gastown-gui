# Security Review

## Summary

Comprehensive security review of the Gas Town GUI codebase (Express server + vanilla JS frontend). The application wraps CLI tools (`gt`, `bd`, `gh`, `git`, `tmux`) as HTTP endpoints and serves a browser SPA. While the codebase correctly uses `execFile` (no shell) for all CLI calls and provides a `SafeSegment` validation class, there are significant gaps in input validation coverage, XSS vulnerabilities in the frontend, and missing security infrastructure (auth, rate limiting, CSRF, security headers). The most critical findings involve path traversal in formula operations, TOML injection, inconsistent input validation across endpoints, and stored XSS via innerHTML rendering of unescaped server data.

## Critical Issues

### C1. Path Traversal in Formula File Operations
- **File:** `server/services/FormulaService.js:109,132`
- **Severity:** P0
- **Description:** Formula `name` parameter is directly concatenated into file paths via `path.join(this._formulasDir, \`${name}.toml\`)` without validation. A name like `../../etc/passwd` resolves outside the intended directory.
- **Impact:** Arbitrary file read/write/delete on the server filesystem (within Node.js process permissions). Affects GET, PUT, and DELETE `/api/formula/:name` endpoints.
- **Fix:** Validate formula names through `SafeSegment` or verify the resolved path stays within `_formulasDir` using `path.resolve()` + prefix check.

### C2. TOML Injection via String Interpolation
- **File:** `server/services/FormulaService.js:117-123`
- **Severity:** P0
- **Description:** The `update()` method constructs TOML content using unescaped string interpolation for `name`, `description`, and `template` fields. An attacker can inject arbitrary TOML sections by including quote sequences or newlines.
- **Impact:** Configuration tampering, formula content manipulation. A description like `x"\n[malicious]\nkey = "value` breaks the TOML structure.
- **Fix:** Use a proper TOML serialization library, or at minimum escape double quotes and newlines in interpolated values.

### C3. No Authentication or Authorization
- **File:** `server.js` (global), all routes
- **Severity:** P0
- **Description:** The entire application has zero authentication/authorization checks. Any client with network access to port 7667 can invoke all endpoints, including destructive operations (delete rigs, stop services, send messages as any agent).
- **Impact:** Full administrative access to any network client. While the server binds to `127.0.0.1` by default (`server.js:50`), the `HOST` env var can override this, and localhost binding alone is insufficient defense-in-depth.
- **Fix:** Add authentication middleware (JWT, session-based, or API key). Implement role-based authorization for destructive operations.

### C4. Stored XSS in Mayor Output Panel
- **File:** `js/app.js:1154-1160`
- **Severity:** P0
- **Description:** Mayor output is processed with regex replacements that insert HTML spans and anchor tags, then rendered via `innerHTML` inside a `<pre>` tag. The content is never escaped before HTML insertion. The URL regex creates `<a href="$1">` links without validating the protocol, allowing `javascript:` URLs.
- **Impact:** If Mayor output contains malicious content (compromised service, attacker-controlled data), arbitrary JavaScript executes in the browser context.
- **Fix:** Escape the output with `escapeHtml()` before applying regex replacements, or use `textContent` + DOM APIs. Validate URLs against an allowlist of protocols (`http:`, `https:` only).

## Major Issues

### M1. Inconsistent SafeSegment Validation Across Endpoints
- **File:** `server.js` (multiple endpoints)
- **Severity:** P1
- **Description:** Many endpoints pass user-supplied parameters directly to CLI commands without `SafeSegment` validation. The refactored routes (beads, convoys, formulas, work) generally lack validation, while some legacy endpoints in `server.js` use it. Affected parameters include:
  - **Rig names:** `/api/rigs/:name/dock` (line 1204), `/api/rigs/:name/undock` (line 1222), DELETE `/api/rigs/:name` (line 1240)
  - **Crew names:** `/api/crew/:name/status` (line 1294), POST `/api/crews` (line 1318), DELETE `/api/crew/:name` (line 1341)
  - **Mail IDs:** `/api/mail/:id` (line 585), `/api/mail/:id/read` (line 602), `/api/mail/:id/unread` (line 618)
  - **Bead IDs:** `/api/bead/:beadId/links` (line 720), work routes (work.js:34,50,64,78)
  - **Formula names:** All formula routes (formulas.js:22-75)
  - **Convoy names:** POST `/api/convoys` (convoys.js:26-29)
- **Impact:** While `execFile` prevents shell injection, unvalidated input increases attack surface against the downstream CLI tools. Consistency gaps also indicate missing defense-in-depth.
- **Fix:** Apply `SafeSegment` validation to all user-supplied parameters before passing to gateways.

### M2. Unvalidated `rig` Parameter in Service Control Endpoints
- **File:** `server.js:1483,1517,1561,1572`
- **Severity:** P1
- **Description:** Service start/stop/restart endpoints validate the service `name` against a whitelist (`['mayor', 'witness', 'refinery', 'deacon']`), but the `rig` parameter from `req.body` is passed directly to `executeGT()` without any validation.
- **Impact:** The `rig` value flows directly as a CLI argument. While `execFile` limits impact, this is a defense-in-depth gap.
- **Fix:** Validate `rig` through `SafeSegment`.

### M3. Sensitive Data Exposure in Error Responses
- **File:** `server.js:529,543,609,625,856,1007` and throughout routes
- **Severity:** P1
- **Description:** Error responses return raw CLI stderr/stdout and Node.js error messages to clients. These can contain filesystem paths, database connection details, environment variable names, and internal system structure.
- **Impact:** Information disclosure that aids further attacks. Example: a failed `bd` command might expose `BEADS_DIR=/home/user/gt/.beads` paths.
- **Fix:** Return generic error messages to clients. Log detailed errors server-side only.

### M4. Unescaped Error Messages in Frontend innerHTML
- **File:** `js/app.js:1167`
- **Severity:** P1
- **Description:** Error messages from API calls are interpolated into `innerHTML` without escaping: `innerHTML = \`<pre style="color: #ef4444">Error loading output: ${err.message}</pre>\``.
- **Impact:** If error messages contain HTML (e.g., from server error responses), XSS is possible.
- **Fix:** Use `escapeHtml(err.message)` consistently in all innerHTML interpolations.

### M5. URL Injection in Issue Links
- **File:** `js/components/issue-list.js:121,148`
- **Severity:** P1
- **Description:** Issue URLs are placed directly in `href` attributes without protocol validation: `<a href="${issue.url}">`. While the title is escaped, `javascript:` or `data:` URLs in the `href` attribute would execute code on click.
- **Impact:** XSS via malicious issue URLs stored in beads data.
- **Fix:** Validate URLs against an allowlist of safe protocols (`https:`, `http:` only).

### M6. No Rate Limiting or Concurrency Limits
- **File:** `server.js` (global)
- **Severity:** P1
- **Description:** No rate limiting on any endpoint. Long-running commands like `gt doctor` (25s timeout, line 1362) and `gt rig add` (120s timeout, line 1142) can be triggered in parallel without limits, exhausting Node.js resources.
- **Impact:** Denial of service via resource exhaustion.
- **Fix:** Add `express-rate-limit` middleware. Consider concurrency limits for expensive operations.

### M7. Path Traversal Risk in Transcript Endpoint
- **File:** `server.js:915-942`
- **Severity:** P1
- **Description:** The transcript endpoint reads files from `.claude/sessions/` directories. While `rig` and `name` are validated via `SafeSegment`, the endpoint reads the most recent `.json/.md/.jsonl` file from the directory and returns its full content. Transcript content may contain sensitive data (prompts, API keys, internal discussions).
- **Impact:** Sensitive data exposure via transcript contents to any connected client.
- **Fix:** Consider whether transcript access should require additional authorization.

### M8. GitHub Route Parameters Not Validated
- **File:** `server/routes/github.js:16,36,44-47`; `server/gateways/GitHubGateway.js:19-20`
- **Severity:** P1
- **Description:** The `repo` parameter (containing `owner/repo`) and `visibility` query parameter are passed to `gh` CLI commands without SafeSegment validation. The `owner` and `repo` values are also interpolated into API paths: `repos/${owner}/${repo}`.
- **Impact:** Potential command injection against the `gh` CLI or API path manipulation.
- **Fix:** Validate repo format (alphanumeric + hyphens + one slash) and visibility against a whitelist.

## Minor Issues

### N1. Missing Security Headers
- **File:** `server/app/createApp.js`
- **Severity:** P2
- **Description:** The server disables `x-powered-by` but doesn't set other security headers: `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`, `Strict-Transport-Security`.
- **Fix:** Add security headers via middleware (e.g., `helmet`).

### N2. No CSRF Protection
- **File:** All POST/PUT/DELETE endpoints
- **Severity:** P2
- **Description:** No CSRF token validation on state-changing operations. While the SPA architecture and localhost binding provide some mitigation, a malicious page opened in the same browser could forge requests.
- **Fix:** Implement CSRF tokens or use `SameSite` cookie attributes.

### N3. CORS Configuration Allows `null` Origin
- **File:** `server/app/createApp.js:12-20`
- **Severity:** P2
- **Description:** CORS allows requests with no `Origin` header (line 14) and optionally allows `null` origin via `ALLOW_NULL_ORIGIN=true`. The `CORS_ORIGINS=*` env var enables unrestricted CORS.
- **Fix:** Require explicit origin allowlist. Don't allow `null` origin.

### N4. Query Parameter Bounds Not Enforced
- **File:** `server.js:551-552,862,889`
- **Severity:** P2
- **Description:** Some query parameters like `lines` lack upper bounds: `const lines = parseInt(req.query.lines) || 100` allows arbitrarily large values, potentially causing memory issues with tmux output.
- **Fix:** Apply `Math.min(maxValue, Math.max(1, parseInt(...)))` consistently.

### N5. Unprotected WebSocket Broadcasting
- **File:** `server.js:191-198`
- **Severity:** P2
- **Description:** WebSocket broadcasts send internal system events to all connected clients without authentication. Internal operations, agent activities, and system state changes are visible to any WebSocket client.
- **Fix:** Add WebSocket authentication (e.g., token in connection handshake).

### N6. Global Window API Exposure
- **File:** `js/app.js:1233`
- **Severity:** P2
- **Description:** `window.gastown = { state, api, ws, ... }` exposes internal APIs and state to the global scope, making XSS exploitation easier and enabling browser extension interference.
- **Fix:** Remove global exposure or limit to development mode only.

### N7. Inline Event Handlers Prevent CSP
- **File:** `js/app.js:951`, `js/components/issue-list.js:70`, `js/components/dashboard.js:167`
- **Severity:** P2
- **Description:** Several components use inline `onclick` handlers (e.g., `onclick="window.location.reload()"`), which prevents deployment of a strict Content-Security-Policy.
- **Fix:** Replace inline handlers with `addEventListener()`.

### N8. Dead Code: Unused quoteArg Function
- **File:** `server.js:200-208`
- **Severity:** P2
- **Description:** The `quoteArg()` function is defined but never used. Its presence is misleading and suggests incomplete security refactoring.
- **Fix:** Remove the dead code.

## Observations

- **Strong foundation:** The use of `execFile` (no shell) throughout the backend is a solid architectural decision that prevents the most common command injection vectors.
- **SafeSegment is well-designed but underutilized:** The validation class exists and works correctly, but is applied inconsistently. Many endpoints (especially in the refactored routes) bypass it entirely.
- **Frontend escaping utilities exist:** `escapeHtml()` and `escapeAttr()` are available in `js/utils/html.js` and used in many places, but coverage is incomplete, particularly around error messages and server-sourced content.
- **Localhost binding provides partial mitigation:** The default `HOST = '127.0.0.1'` limits network exposure, but this is a deployment assumption, not a code-enforced security boundary.
- **The refactored route/service/gateway pattern is cleaner** but introduced validation gaps by not consistently applying SafeSegment at the route layer before passing to services.
- **No dependency vulnerabilities assessed:** This review focused on application code. A separate `npm audit` should be run to check for known vulnerabilities in dependencies.
