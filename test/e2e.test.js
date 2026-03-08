/**
 * Gas Town GUI - E2E Tests
 *
 * End-to-end tests using Puppeteer for the Gas Town GUI.
 */

import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import {
  launchBrowser,
  closeBrowser,
  createPage,
  navigateToApp,
  waitForConnection,
  switchView,
  openModal,
  closeModals,
  getText,
  elementExists,
  waitForToast,
  fillField,
  screenshot,
  assert,
  sleep,
  clearBrowserErrors,
  getBrowserErrors,
} from './setup.js';

describe('Gas Town GUI E2E Tests', () => {
  let page;

  beforeAll(async () => {
    await launchBrowser();
  });

  afterAll(async () => {
    await closeBrowser();
  });

  beforeEach(async () => {
    page = await createPage();
  });

  describe('Page Load', () => {
    it('should load the application', async () => {
      await navigateToApp(page);

      const title = await page.title();
      expect(title).toContain('Gas Town');

      const header = await elementExists(page, '#app-header');
      expect(header).toBe(true);
    });

    it('should display the town name', async () => {
      await navigateToApp(page);

      const townName = await getText(page, '#town-name');
      expect(townName).toBeTruthy();
    });

    it('should show connection status', async () => {
      await navigateToApp(page);

      const statusExists = await elementExists(page, '#connection-status');
      expect(statusExists).toBe(true);
    });
  });

  describe('Navigation', () => {
    it('should switch between views using tabs', async () => {
      await navigateToApp(page);

      // Start on dashboard view (default)
      let activeView = await page.$eval('.view.active', el => el.id);
      expect(activeView).toBe('view-dashboard');

      // Switch to convoys
      await switchView(page, 'convoys');
      activeView = await page.$eval('.view.active', el => el.id);
      expect(activeView).toBe('view-convoys');

      // Switch to agents
      await switchView(page, 'agents');
      activeView = await page.$eval('.view.active', el => el.id);
      expect(activeView).toBe('view-agents');

      // Switch to mail
      await switchView(page, 'mail');
      activeView = await page.$eval('.view.active', el => el.id);
      expect(activeView).toBe('view-mail');
    });

    it('should support keyboard shortcuts for navigation', async () => {
      await navigateToApp(page);

      // Keyboard shortcuts: 1=dashboard, 2=convoys, 3=agents, 4=mail
      // Press '2' for convoys view
      await page.keyboard.press('2');
      await page.waitForSelector('#view-convoys.active', { timeout: 2000 });

      // Press '3' for agents view
      await page.keyboard.press('3');
      await page.waitForSelector('#view-agents.active', { timeout: 2000 });

      // Press '1' for dashboard view
      await page.keyboard.press('1');
      await page.waitForSelector('#view-dashboard.active', { timeout: 2000 });
    });
  });

  describe('Theme Toggle', () => {
    it('should toggle between dark and light themes', async () => {
      await navigateToApp(page);

      // Get initial theme
      const initialTheme = await page.$eval('html', el => el.dataset.theme);

      // Click theme toggle
      await page.click('#theme-toggle');

      // Check theme changed
      const newTheme = await page.$eval('html', el => el.dataset.theme);
      expect(newTheme).not.toBe(initialTheme);

      // Toggle back
      await page.click('#theme-toggle');
      const finalTheme = await page.$eval('html', el => el.dataset.theme);
      expect(finalTheme).toBe(initialTheme);
    });
  });

  describe('Sidebar', () => {
    it('should display the agent tree', async () => {
      await navigateToApp(page);

      const sidebarExists = await elementExists(page, '#agent-tree');
      expect(sidebarExists).toBe(true);
    });

    it('should render service controls with rig data attributes', async () => {
      await navigateToApp(page);
      await waitForConnection(page);
      await sleep(1000);

      const serviceData = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('.service-item'));
        return items.map(item => ({
          service: item.dataset.service,
          buttons: Array.from(item.querySelectorAll('[data-action]')).map(btn => ({
            action: btn.dataset.action,
            service: btn.dataset.service,
            rig: btn.dataset.rig || null,
          })),
        }));
      });

      const witnessItem = serviceData.find(s => s.service === 'witness');
      const refineryItem = serviceData.find(s => s.service === 'refinery');

      // Witness is running in mock data, so it should have stop/restart buttons with rig
      expect(witnessItem).toBeDefined();
      expect(witnessItem.buttons.length).toBeGreaterThan(0);
      witnessItem.buttons.forEach(btn => {
        expect(btn.rig).toBe('my-rig');
      });

      // Refinery is stopped in mock data, so it should have start button with rig
      expect(refineryItem).toBeDefined();
      expect(refineryItem.buttons.length).toBeGreaterThan(0);
      refineryItem.buttons.forEach(btn => {
        expect(btn.rig).toBe('my-rig');
      });
    });

    it('should pass rig param when clicking service start button', async () => {
      await navigateToApp(page);
      await waitForConnection(page);
      await sleep(1000);

      // Intercept the POST request to /api/service/refinery/up
      const requestCapture = await page.evaluate(() => {
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => resolve({ error: 'no request captured' }), 5000);

          // Monkey-patch fetch to capture the request
          const originalFetch = window.fetch;
          window.fetch = async (url, opts) => {
            if (typeof url === 'string' && url.includes('/api/service/refinery/up')) {
              clearTimeout(timeout);
              const body = opts?.body ? JSON.parse(opts.body) : null;
              // Restore original fetch before making the actual call
              window.fetch = originalFetch;
              const response = await originalFetch(url, opts);
              resolve({ url, method: opts?.method, body, status: response.status });
              return response;
            }
            return originalFetch(url, opts);
          };

          // Click the refinery start button (refinery is stopped in mock data)
          const refineryStart = document.querySelector('.service-item[data-service="refinery"] [data-action="start"]');
          if (refineryStart) {
            refineryStart.click();
          } else {
            clearTimeout(timeout);
            resolve({ error: 'refinery start button not found' });
          }
        });
      });

      // Verify the request was made with rig in the body
      expect(requestCapture.error).toBeUndefined();
      expect(requestCapture.method).toBe('POST');
      expect(requestCapture.body).toHaveProperty('rig', 'my-rig');
      expect(requestCapture.status).toBe(200);
    });

    it('should expand and collapse tree nodes', async () => {
      await navigateToApp(page);
      await waitForConnection(page);
      await sleep(1000);

      // Find expandable node — mock data should provide one
      const expandableNode = await page.$('.tree-node.expandable');
      expect(expandableNode).not.toBeNull();

      // Check initial state
      const initialExpanded = await expandableNode.evaluate(el => el.classList.contains('expanded'));

      // Click the toggle icon within the node
      const toggleIcon = await page.$('.tree-node.expandable .tree-toggle');
      expect(toggleIcon).not.toBeNull();

      await toggleIcon.click();
      await sleep(300);

      const afterFirstClick = await expandableNode.evaluate(el => el.classList.contains('expanded'));

      // Second click to toggle back
      await toggleIcon.click();
      await sleep(300);

      const afterSecondClick = await expandableNode.evaluate(el => el.classList.contains('expanded'));

      // At least one of the clicks should have toggled the state
      const toggledOnce = (initialExpanded !== afterFirstClick) || (afterFirstClick !== afterSecondClick);
      expect(toggledOnce).toBe(true);
    });
  });

  describe('Modals', () => {
    it('should open and close new convoy modal', async () => {
      await navigateToApp(page);

      // Switch to convoys view first (new-convoy-btn is in convoys view)
      await switchView(page, 'convoys');

      // Open modal
      await page.click('#new-convoy-btn');
      await page.waitForSelector('#new-convoy-modal:not(.hidden)', { timeout: 5000 });

      // Check modal is visible
      const modalVisible = await elementExists(page, '#new-convoy-modal:not(.hidden)');
      expect(modalVisible).toBe(true);

      // Close with Escape
      await page.keyboard.press('Escape');
      await page.waitForSelector('#modal-overlay.hidden', { timeout: 5000 });

      // Check modal is hidden
      const overlayHidden = await page.$eval('#modal-overlay', el => el.classList.contains('hidden'));
      expect(overlayHidden).toBe(true);
    });

    it('should open sling modal', async () => {
      await navigateToApp(page);

      // Switch to convoys view first (sling button is in convoys view)
      await switchView(page, 'convoys');

      // Open sling modal
      await page.click('#sling-btn');
      await page.waitForSelector('#sling-modal:not(.hidden)', { timeout: 5000 });

      const modalVisible = await elementExists(page, '#sling-modal:not(.hidden)');
      expect(modalVisible).toBe(true);

      await closeModals(page);
    });
  });

  describe('Refresh', () => {
    it('should refresh data when clicking refresh button', async () => {
      await navigateToApp(page);

      // Click refresh
      await page.click('#refresh-btn');

      // Should show toast
      const toastMessage = await waitForToast(page, 'info');
      expect(toastMessage).toContain('Refresh');
    });

    it('should refresh with Ctrl+R keyboard shortcut', async () => {
      await navigateToApp(page);

      // Press Ctrl+R (we need to intercept this as it normally refreshes page)
      await page.evaluate(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'r',
          ctrlKey: true,
          bubbles: true,
        }));
      });

      // The handler should trigger refresh and show a toast
      const toastMessage = await waitForToast(page, 'info');
      expect(toastMessage).toContain('Refresh');
    });
  });

  describe('Keyboard Help', () => {
    it('should show help when pressing ?', async () => {
      await navigateToApp(page);

      await page.keyboard.press('?');

      // Should show help modal or keyboard help overlay
      const helpVisible = await page.evaluate(() => {
        // Check for help modal or keyboard help overlay
        const helpModal = document.querySelector('#help-modal:not(.hidden)');
        const keyboardOverlay = document.querySelector('.keyboard-help-overlay');
        return helpModal !== null || keyboardOverlay !== null;
      });
      expect(helpVisible).toBe(true);
    });
  });

  describe('Responsive Layout', () => {
    it('should adapt to mobile viewport', async () => {
      await navigateToApp(page);

      // Set mobile viewport
      await page.setViewport({ width: 375, height: 667 });

      // Wait for layout to adjust
      await sleep(500);

      // Sidebar should be hidden or collapsed on mobile
      // Main content should still be visible
      const mainContent = await elementExists(page, '.content');
      expect(mainContent).toBe(true);
    });

    it('should adapt to tablet viewport', async () => {
      await navigateToApp(page);

      await page.setViewport({ width: 768, height: 1024 });
      await sleep(500);

      const header = await elementExists(page, '#app-header');
      expect(header).toBe(true);
    });
  });

  describe('Activity Feed', () => {
    it('should display activity feed section', async () => {
      await navigateToApp(page);

      const feedExists = await elementExists(page, '.activity-feed');
      expect(feedExists).toBe(true);
    });

    it('should show feed list container', async () => {
      await navigateToApp(page);

      const feedList = await elementExists(page, '#feed-list');
      expect(feedList).toBe(true);
    });
  });

  describe('Form Validation', () => {
    it('should validate convoy name is required', async () => {
      await navigateToApp(page);

      // Switch to convoys view first (new-convoy-btn is in convoys view)
      await switchView(page, 'convoys');

      // Open new convoy modal
      await page.click('#new-convoy-btn');
      await page.waitForSelector('#new-convoy-modal:not(.hidden)', { timeout: 5000 });

      // Check that the name input has required attribute
      const inputRequired = await page.$eval(
        '#new-convoy-modal [name="name"]',
        el => el.hasAttribute('required')
      );
      expect(inputRequired).toBe(true);

      // Close modal by clicking the close button
      await page.click('#new-convoy-modal [data-modal-close]');
      await page.waitForSelector('#modal-overlay.hidden', { timeout: 5000 });
    });

    it('should validate sling form fields', async () => {
      await navigateToApp(page);

      // Switch to convoys view first (sling button is in convoys view)
      await switchView(page, 'convoys');

      await page.click('#sling-btn');
      await page.waitForSelector('#sling-modal:not(.hidden)', { timeout: 5000 });

      // Check both bead and target are required
      const beadRequired = await page.$eval(
        '#sling-modal [name="bead"]',
        el => el.hasAttribute('required')
      );
      const targetRequired = await page.$eval(
        '#sling-modal [name="target"]',
        el => el.hasAttribute('required')
      );

      expect(beadRequired).toBe(true);
      expect(targetRequired).toBe(true);

      await closeModals(page);
    });
  });

  describe('Animations', () => {
    it('should have animation classes defined', async () => {
      await navigateToApp(page);

      // Check that animation CSS is loaded
      const hasAnimationStyles = await page.evaluate(() => {
        const styleSheets = Array.from(document.styleSheets);
        return styleSheets.some(sheet => {
          try {
            const rules = Array.from(sheet.cssRules || []);
            return rules.some(rule =>
              rule.cssText && rule.cssText.includes('@keyframes')
            );
          } catch {
            return false;
          }
        });
      });

      expect(hasAnimationStyles).toBe(true);
    });
  });
});

describe('Component Tests', () => {
  let page;

  beforeAll(async () => {
    await launchBrowser();
  });

  afterAll(async () => {
    await closeBrowser();
  });

  beforeEach(async () => {
    page = await createPage();
  });

  describe('Toast Component', () => {
    it('should display toast and auto-dismiss', async () => {
      await navigateToApp(page);

      // Trigger a toast via refresh button
      await page.click('#refresh-btn');

      // Toast should appear
      await page.waitForSelector('.toast.show', { timeout: 5000 });

      // Wait for auto-dismiss (default 3s for info)
      await sleep(4000);

      // Toast should be gone
      const toastExists = await elementExists(page, '.toast.show');
      expect(toastExists).toBe(false);
    });
  });

  describe('Convoy List Component', () => {
    it('should render convoy list or empty state', async () => {
      await navigateToApp(page);

      // Wait for convoy data to load - give more time for API call
      await sleep(2000);

      // Wait for convoy data to load (either cards or empty state)
      try {
        await page.waitForFunction(() => {
          const hasConvoys = document.querySelector('.convoy-card');
          const hasEmpty = document.querySelector('#convoy-list .empty-state');
          return hasConvoys || hasEmpty;
        }, { timeout: 8000 });
      } catch (e) {
        // If timeout, check what's in the convoy-list element for debugging
        const listContent = await page.$eval('#convoy-list', el => el.innerHTML.substring(0, 200));
        console.log('[Debug] convoy-list content:', listContent);
      }

      // Either convoy cards or empty state should be present
      const hasConvoys = await elementExists(page, '.convoy-card');
      const hasEmptyState = await elementExists(page, '#convoy-list .empty-state');

      expect(hasConvoys || hasEmptyState).toBe(true);
    });
  });

  describe('Agent Grid Component', () => {
    it('should render agent grid or empty state', async () => {
      await navigateToApp(page);
      await switchView(page, 'agents');

      await page.waitForFunction(() => {
        const grid = document.getElementById('agent-grid');
        return grid && (grid.querySelector('.agent-card') || grid.querySelector('.empty-state'));
      }, { timeout: 5000 });

      // Either agent cards or empty state should be present
      const hasAgents = await elementExists(page, '.agent-card');
      const hasEmptyState = await elementExists(page, '#agent-grid .empty-state');

      expect(hasAgents || hasEmptyState).toBe(true);
    });
  });

  describe('Mail List Component', () => {
    it('should render mail list or empty state', async () => {
      await navigateToApp(page);
      await switchView(page, 'mail');

      await page.waitForFunction(() => {
        const list = document.getElementById('mail-list');
        return list && (list.querySelector('.mail-item') || list.querySelector('.empty-state'));
      }, { timeout: 5000 });

      // Either mail items or empty state should be present
      const hasMail = await elementExists(page, '.mail-item');
      const hasEmptyState = await elementExists(page, '#mail-list .empty-state');

      expect(hasMail || hasEmptyState).toBe(true);
    });
  });
});

describe('UI Smoke Test', () => {
  let page;

  beforeAll(async () => {
    await launchBrowser();
  });

  afterAll(async () => {
    await closeBrowser();
  });

  beforeEach(async () => {
    page = await createPage();

    // Auto-accept dialogs used by some UI actions (prompt/confirm).
    page.on('dialog', async (dialog) => {
      try {
        if (dialog.type() === 'prompt') {
          const msg = dialog.message() || '';
          if (msg.includes('completion summary')) return dialog.accept('Completed via UI smoke test');
          if (msg.includes('reason for parking')) return dialog.accept('Parked via UI smoke test');
          if (msg.includes('target agent address')) return dialog.accept('mayor');
          return dialog.accept('ok');
        }
        if (dialog.type() === 'confirm') return dialog.accept();
        return dialog.dismiss();
      } catch {
        // ignore
      }
    });
  });

  it('should click through all tabs and key flows without JS errors', async () => {
    const allowConsoleErrorPatterns = [
      /Failed to load resource/i,
      /net::ERR_/i,
      /favicon\\.ico/i,
    ];

    const safeClick = async (selector, { timeout = 8000, retries = 2 } = {}) => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          await page.waitForSelector(selector, { timeout, visible: true });
          await page.click(selector);
          return;
        } catch (err) {
          const message = err?.message || String(err);
          if (message.includes('Node is detached') && attempt < retries) {
            await sleep(200);
            continue;
          }
          throw err;
        }
      }
    };

    const safeOptionalClick = async (selector, opts) => {
      const exists = await elementExists(page, selector);
      if (!exists) return false;
      try {
        await safeClick(selector, opts);
        return true;
      } catch {
        return false;
      }
    };

    await navigateToApp(page);
    await waitForConnection(page);

    // Let background preloads settle (PRs/issues/formulas/rigs/agents).
    await sleep(750);

    // Reset counters after startup so we only catch UI issues during smoke.
    clearBrowserErrors(page);

    // Help modal
    await safeClick('#help-btn');
    await page.waitForSelector('#help-modal:not(.hidden)', { timeout: 5000 });
    await closeModals(page);

    // Convoys: expand + escalate + sling
    await switchView(page, 'convoys');
    await page.waitForFunction(() => {
      const list = document.getElementById('convoy-list');
      return list && (list.querySelector('.convoy-card') || list.querySelector('.empty-state') || list.querySelector('.error-state'));
    }, { timeout: 8000 });

    const hasConvoy = await elementExists(page, '.convoy-card');
    if (hasConvoy) {
      await safeClick('.convoy-card .convoy-expand-btn');
      await sleep(250);

      // Escalation modal (opens dynamic modal inside overlay)
      const didEscalateClick = await safeOptionalClick('.convoy-card [data-action="escalate"]');
      if (didEscalateClick) {
        await page.waitForSelector('#escalation-modal:not(.hidden)', { timeout: 5000 });
        await fillField(page, '#escalation-reason', 'Escalation smoke test');
        await page.select('#escalation-priority', 'high');
        await safeClick('#escalation-form button[type="submit"]');
        await page.waitForSelector('#modal-overlay.hidden', { timeout: 8000 });
      }
    }

    // Sling modal (main modal)
    await safeClick('#sling-btn');
    await page.waitForSelector('#sling-modal:not(.hidden)', { timeout: 5000 });
    await fillField(page, '#sling-bead', 'bead-1');
    await page.select('#sling-target', 'mayor');
    await safeClick('#sling-form button[type="submit"]');
    await page.waitForSelector('#modal-overlay.hidden', { timeout: 8000 });

    // Work: reassign + release + park + done
    await switchView(page, 'work');
    await page.waitForFunction(() => {
      const list = document.getElementById('work-list');
      return list && (list.querySelector('.bead-card') || list.querySelector('.empty-state'));
    }, { timeout: 8000 });

    const hasWork = await elementExists(page, '.bead-card');
    if (hasWork) {
      await safeOptionalClick('.bead-card [data-action="reassign"]');
      await sleep(300);
      await safeOptionalClick('.bead-card [data-action="release"]');
      await sleep(300);
      await safeOptionalClick('.bead-card [data-action="park"]');
      await sleep(300);
      await safeOptionalClick('.bead-card [data-action="done"]');
      await sleep(300);
    }

    // Agents: open peek output + open nudge modal
    await switchView(page, 'agents');
    await page.waitForFunction(() => {
      const grid = document.getElementById('agent-grid');
      return grid && (grid.querySelector('.agent-card') || grid.querySelector('.empty-state'));
    }, { timeout: 8000 });

    const hasAgent = await elementExists(page, '.agent-card');
    if (hasAgent) {
      const didOpenPeek = await page.evaluate(() => {
        // Prefer a rig/name agent if present; otherwise use a known mock polecat id.
        const agentIds = Array.from(document.querySelectorAll('.agent-card'))
          .map((el) => el?.dataset?.agentId)
          .filter(Boolean);
        const agentId = agentIds.find((id) => id.includes('/')) || 'gastown/worker-1';
        document.dispatchEvent(new CustomEvent('agent:peek', { detail: { agentId } }));
        return true;
      });
      if (didOpenPeek) {
        await page.waitForSelector('#peek-modal:not(.hidden)', { timeout: 8000 });
        await closeModals(page);
      }

      const didOpenNudge = await page.evaluate(() => {
        const agentId = document.querySelector('.agent-card')?.dataset?.agentId;
        if (!agentId) return false;
        document.dispatchEvent(new CustomEvent('agent:nudge', { detail: { agentId } }));
        return true;
      });
      if (didOpenNudge) {
        await page.waitForSelector('#nudge-modal:not(.hidden)', { timeout: 5000 });
        await closeModals(page);
      }
    }

    // Rigs: GitHub repo picker + add rig
    await switchView(page, 'rigs');
    await page.waitForFunction(() => {
      const list = document.getElementById('rig-list');
      return list && (list.querySelector('.rig-card') || list.querySelector('.empty-state'));
    }, { timeout: 8000 });

    await safeClick('#new-rig-btn');
    await page.waitForSelector('#new-rig-modal:not(.hidden)', { timeout: 8000 });
    await safeClick('#github-repo-picker-btn');
    await page.waitForSelector('#github-repo-list:not(.hidden)', { timeout: 8000 });
    await fillField(page, '#rig-name', 'smoke-rig');
    await fillField(page, '#rig-url', 'https://github.com/web3dev1337/smoke-rig');
    await safeClick('#new-rig-form button[type="submit"]');
    await page.waitForSelector('#modal-overlay.hidden', { timeout: 8000 });

    // Crews: create crew via dynamic modal
    await switchView(page, 'crews');
    await page.waitForSelector('#new-crew-btn', { timeout: 8000 });
    await safeClick('#new-crew-btn');
    await page.waitForSelector('#dynamic-modal:not(.hidden)', { timeout: 8000 });
    await fillField(page, '#crew-name', 'smoke-crew');
    // Avoid submitting in smoke test (can mutate list + be flaky); just validate modal wiring.
    await page.waitForSelector('#new-crew-form', { timeout: 8000 });
    await closeModals(page);

    // PRs + Issues tabs should render (no errors)
    await switchView(page, 'prs');
    await page.waitForFunction(() => {
      const list = document.getElementById('pr-list-container');
      return list && (list.querySelector('.pr-card') || list.querySelector('.empty-state') || list.querySelector('.error-state'));
    }, { timeout: 8000 });

    await switchView(page, 'issues');
    await page.waitForFunction(() => {
      const list = document.getElementById('issue-list-container');
      return list && (list.querySelector('.issue-card') || list.querySelector('.empty-state') || list.querySelector('.error-state'));
    }, { timeout: 8000 });

    // Click sling on first issue card to ensure modal wiring works
    const didIssueSlingClick = await safeOptionalClick('.issue-card [data-action="sling"]');
    if (didIssueSlingClick) {
      await page.waitForSelector('#sling-modal:not(.hidden)', { timeout: 8000 });
      const beadValue = await page.$eval('#sling-bead', el => el.value);
      expect(beadValue).toContain('gh:');
      await closeModals(page);
    }

    // Formulas: view details (opens peek modal)
    await switchView(page, 'formulas');
    await page.waitForFunction(() => {
      const list = document.getElementById('formula-list-container');
      return list && (list.querySelector('.formula-card') || list.querySelector('.empty-state') || list.querySelector('.error-state'));
    }, { timeout: 8000 });

    const didFormulaViewClick = await safeOptionalClick('.formula-card [data-action="view"]');
    if (didFormulaViewClick) {
      await page.waitForSelector('#peek-modal:not(.hidden)', { timeout: 8000 });
      await closeModals(page);
    }

    // Mail: open mail detail + reply
    await switchView(page, 'mail');
    await page.waitForFunction(() => {
      const list = document.getElementById('mail-list');
      return list && (list.querySelector('.mail-item') || list.querySelector('.empty-state'));
    }, { timeout: 8000 });

    const didMailClick = await safeOptionalClick('.mail-item');
    if (didMailClick) {
      await page.waitForSelector('#mail-detail-modal:not(.hidden)', { timeout: 8000 });
      const didReplyClick = await safeOptionalClick('#mail-detail-modal:not(.hidden) button.btn.btn-secondary');
      if (didReplyClick) {
        await page.waitForSelector('#mail-compose-modal:not(.hidden)', { timeout: 8000 });
      }
      await closeModals(page);
    }

    // Health: run doctor and render summary
    await switchView(page, 'health');
    await safeClick('#health-refresh');
    await page.waitForFunction(() => {
      const container = document.getElementById('health-check-container');
      return container && (container.querySelector('.health-summary') || container.querySelector('.health-error'));
    }, { timeout: 12000 });

    const { consoleErrors, pageErrors } = getBrowserErrors(page, { allowConsoleErrorPatterns });
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
