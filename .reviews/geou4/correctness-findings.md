# Correctness Review

## Summary

A comprehensive correctness review of the gastownui codebase reveals several categories of issues: security vulnerabilities (TOML/path injection in FormulaService, XSS in frontend), logic errors (unreachable code in nudge endpoint, incorrect success determination in WorkService), race conditions (WebSocket activity stream, CacheRegistry rejection handling), and systematic null/undefined handling gaps across both backend and frontend. The backend gateway-service-route architecture is generally sound, but the FormulaService stands out as the weakest link with multiple critical issues. The frontend has XSS risks from innerHTML usage with insufficiently escaped content and memory leaks from uncleared event listeners.

## Critical Issues

### P0-1: Path Traversal in FormulaService (FormulaService.js:109,132)

The `update()` and `remove()` methods construct file paths from unsanitized `name` parameters:
```javascript
const formulaPath = path.join(this._formulasDir, `${name}.toml`);
```
Unlike bead and convoy routes which use SafeSegment validation, formula routes pass `:name` directly without sanitization. A name like `../../etc/passwd` can escape the formulas directory. While `execFile` prevents shell injection, the filesystem operations (`writeFile`, `unlink`) are vulnerable.

**Impact:** Arbitrary file write/delete on the server filesystem.
**Fix:** Add SafeSegment validation to all formula route handlers before passing `name` to the service.

### P0-2: TOML Injection in FormulaService.update() (FormulaService.js:117-123)

Formula content is constructed via string interpolation without escaping:
```javascript
const content = `[formula]
name = "${name}"
description = "${description || ''}"
template = """
${template}
"""`;
```
If `name` contains `"`, it breaks TOML string syntax. If `template` contains `"""`, it terminates the triple-quoted string early, allowing injection of arbitrary TOML keys.

**Impact:** Malformed or malicious TOML files that could cause parsing errors or unexpected behavior downstream.
**Fix:** Use a TOML serialization library, or at minimum escape `"` in name/description and `"""` in template.

### P0-3: XSS in Mayor Output Display (app.js:1156-1159)

Server output is regex-replaced to add HTML styling, then injected via innerHTML:
```javascript
output = output.replace(/(Error|Failed|Cannot)/gi, '<span style="color: #ef4444">$1</span>');
output = output.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
mayorOutputContent.innerHTML = `<pre>${output}</pre>`;
```
The output is not HTML-escaped before the regex replacements. If server output contains `<script>` tags or HTML entities, they will be rendered.

**Impact:** XSS via server-controlled output content.
**Fix:** Apply `escapeHtml()` to the output before performing regex replacements.

### P0-4: Missing try-catch on Async Route Handlers (formulas.js:22-26, 38-46)

Two formula route handlers lack try-catch blocks:
- `GET /api/formula/:name` (line 22-26)
- `POST /api/formula/:name/use` (line 38-46)

If the service throws an exception, Express sends a generic 500 with no structured error response, and the connection may close unexpectedly.

**Impact:** Unhandled promise rejections crash request handling.
**Fix:** Wrap in try-catch like the other formula endpoints.

### P0-5: Unreachable Code in Nudge Endpoint (server.js:676)

In the nudge POST handler, the `else if (!isRunning)` branch is unreachable:
```javascript
if (nudgeTarget === 'mayor' && autoStart) {
  // ... auto-start mayor
} else if (!isRunning) {  // ← Unreachable!
  // Error response for non-running agents
}
```
The `!isRunning` condition was already checked earlier (line 651), and the code falls through to the nudge execution. The error response for nudging a non-running, non-mayor agent will never execute.

**Impact:** Users can attempt to nudge agents that aren't running without receiving an error.
**Fix:** Restructure the conditional logic so the not-running check applies to all non-mayor agents.

## Major Issues

### P1-1: Race Condition in CacheRegistry.getOrExecute() (CacheRegistry.js:52-71)

If the executor throws, the rejected promise is stored in `_pending`. Concurrent callers receive the same rejected promise. The `finally()` block cleans it up, but there's a window where new calls get the stale rejection before cleanup occurs.

**Impact:** Transient errors cascade to all concurrent callers; retries may fail.
**Fix:** In the `.catch()` chain (before `finally`), delete the `_pending` entry so subsequent calls retry the executor.

### P1-2: Race Condition in WebSocket Activity Stream (server.js:1711-1714)

Multiple concurrent WebSocket connections can trigger `startActivityStream()` simultaneously:
```javascript
if (clients.size === 1) {
  startActivityStream();
}
```
The size check and function call are not atomic. Two clients connecting at the same moment could both see `size === 1` and spawn duplicate `gt feed` processes.

**Impact:** Duplicate child processes, resource waste, potential duplicate events.
**Fix:** Add a mutex/flag before the size check, or make `startActivityStream()` idempotent (it checks `activityProcess` but there's a TOCTOU window).

### P1-3: FormulaService Swallows Errors Silently (FormulaService.js:56-59)

The `list()` method parses CLI output as JSON and falls back to `[]` on failure:
```javascript
const parsed = parseJsonOrNull((bdResult.stdout || '').trim()) || [];
```
If the `bd formula list` command fails (exits non-zero), the error is silently converted to an empty array. Callers display "no formulas" instead of an error.

**Impact:** CLI failures are invisible to users.
**Fix:** Check `bdResult.ok` before parsing. Return error state when the command fails.

### P1-4: WorkService Incorrect Success Determination (WorkService.js:82)

```javascript
const ok = Boolean(result.ok || workAttached || promptSent);
```
Declares success if any of three conditions is true. But `result.ok` is from CLI exit code, which might succeed even when work wasn't attached. This means a command that runs but doesn't achieve its goal is still reported as success.

**Impact:** UI shows "slung successfully" when work may not actually be attached.
**Fix:** Use `result.ok && (workAttached || promptSent)` for more accurate success.

### P1-5: Invalid Date Sorting (GitHubService.js:70, 115)

```javascript
all.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
```
If `updatedAt` is undefined or an invalid date string, `new Date(undefined)` returns `Invalid Date`, and the subtraction produces `NaN`. Sort with `NaN` comparisons is unstable and implementation-dependent.

**Impact:** PR/issue lists may display in wrong order with malformed data.
**Fix:** Add a guard: `(new Date(b.updatedAt) || 0) - (new Date(a.updatedAt) || 0)`.

### P1-6: Missing Input Validation on Mail Endpoint (server.js:534-545)

The `/api/mail` POST endpoint doesn't validate `to`, `subject`, or `message` fields. If any are undefined, they're passed as literal `undefined` strings to the CLI command.

**Impact:** Garbled mail commands, confusing error messages.
**Fix:** Validate all three fields are non-empty strings before constructing the command.

### P1-7: Duplicate Event Listeners in Sidebar (sidebar.js:265-274)

`setupServiceControls()` is called every time the sidebar renders. Each call adds NEW click listeners to buttons without removing old ones.

**Impact:** After multiple status updates, clicking a service button executes the handler multiple times.
**Fix:** Use event delegation on the container, or remove old listeners before adding new ones.

### P1-8: Memory Leak in Peek Modal Auto-Refresh (modals.js:1744-1751)

The `setInterval` for peek auto-refresh is only cleared in `closeAllModals()`. If the modal is closed by other paths (navigation, DOM manipulation), the interval persists indefinitely.

**Impact:** Memory and CPU leak from accumulated intervals.
**Fix:** Also clear the interval in the modal's close button handler and overlay click handler.

### P1-9: Unsafe Dynamic Modal Content Injection (modals.js:196-206)

```javascript
dynamicModal.innerHTML = `
  <div class="modal-body">
    ${content || ''}  // <-- NOT ESCAPED
  </div>
`;
```
The `content` parameter is injected directly into innerHTML without escaping.

**Impact:** XSS if content includes user-controlled data.
**Fix:** Escape content, or use DOM APIs instead of innerHTML for dynamic content.

## Minor Issues

### P2-1: BDGateway Truthiness Bug for ID=0 (BDGateway.js:60)

```javascript
const beadId = parsed?.id || null;
```
Uses `||` instead of `??`. If `parsed.id` is `0` (falsy), it returns `null` instead of `0`. While bead IDs are strings in practice, this is a latent bug.

**Fix:** Use `parsed?.id ?? null`.

### P2-2: Inconsistent HTTP Status for Missing Input (convoys.js:26-40)

POST `/api/convoy` returns HTTP 500 when `name` is missing:
```javascript
if (!result.ok) return res.status(500).json({ error: result.error });
```
Missing required input is a client error (400), not server error (500).

**Fix:** Use `result.statusCode || 500` like the beads route does.

### P2-3: Missing parseInt Radix (server.js:714, 862, 889)

Several `parseInt()` calls lack the radix parameter:
```javascript
const limit = Math.min(parseInt(req.query.limit) || 50, MAX_MESSAGE_HISTORY);
```
While modern Node.js defaults to base 10, explicit radix is best practice.

**Fix:** Use `parseInt(value, 10)` consistently.

### P2-4: Null Check Gap in Sidebar Popover (sidebar.js:360)

```javascript
const agentStatus = nodeEl.querySelector('.tree-icon')?.classList.contains('status-working') ? 'working' : 'idle';
```
Optional chaining returns `undefined` from `querySelector`, but `.classList.contains()` is called on the result. The `?.` doesn't chain through method calls on the returned object.

**Fix:** Use `nodeEl.querySelector('.tree-icon')?.classList?.contains('status-working')`.

### P2-5: EventBus Broadcast Can Crash emit() (EventBus.js:9-16)

If `this._broadcast()` throws synchronously, it bubbles up and prevents further event processing. No try-catch protects the broadcast call.

**Fix:** Wrap `this._broadcast(event)` in try-catch.

### P2-6: Formula Search Returns Empty Array on Error (formulas.js:13-20)

The search endpoint catches all errors and returns `[]`:
```javascript
} catch {
  res.json([]);
}
```
Clients cannot distinguish "no results" from "search failed".

**Fix:** Return `res.status(500).json({ error: 'Search failed' })` on exception.

### P2-7: Missing Theme Toggle Null Check (app.js:1031-1032)

```javascript
const btn = document.getElementById('theme-toggle');
const icon = btn.querySelector('.material-icons');  // btn could be null
```
No null check on `btn` before accessing `.querySelector()`.

**Fix:** Guard with `if (!btn) return;`.

### P2-8: CORS Callback Logic for Null Origin (createApp.js:14-18)

When `origin === 'null'` and `allowNullOrigin` is false:
```javascript
return callback(allowNullOrigin ? null : new Error(...), allowNullOrigin);
```
Passes `false` as the second argument to the CORS callback, which is inconsistent with the pattern `callback(error, boolean)`.

**Fix:** When rejecting, pass `callback(new Error(...), false)` explicitly.

## Observations

- **FormulaService is the weakest link**: It has the most critical issues (path traversal, TOML injection, silent error swallowing, missing directory creation). This is likely because it bypasses the SafeSegment validation that protects other routes and does its own file I/O rather than delegating to CLI commands.

- **Inconsistent error response formats**: Some routes return `{ error: msg }`, others `{ success: false, error: msg }`, and search endpoints return `[]` on error. A consistent error envelope would help frontend error handling.

- **WebSocket listeners accumulate**: The `api.js` WebSocket class uses setter-based listener registration that pushes to arrays without cleanup. Components that set `onopen`/`onclose` repeatedly will accumulate stale callbacks.

- **Frontend innerHTML pattern**: Many components use `innerHTML` with template literals. While most properly use `escapeHtml()`, the mayor output display (P0-3) and dynamic modal content (P1-9) do not. A systematic audit of all `innerHTML` assignments would be valuable.

- **GTGateway.createConvoy regex is fragile** (GTGateway.js:51-52): The convoy ID is extracted via regex match on CLI output. If the upstream `gt` command changes its output format, this silently returns `null`. Should prefer `--json` output where available.
