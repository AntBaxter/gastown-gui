/**
 * Gas Town GUI - Greeting Component
 *
 * Displays a time-of-day greeting on the dashboard.
 */

import { escapeHtml } from '../utils/html.js';

/**
 * Get a time-of-day greeting message
 * @returns {{ greeting: string, icon: string }}
 */
function getTimeGreeting() {
  const hour = new Date().getHours();

  if (hour < 6) {
    return { greeting: 'Good night', icon: 'bedtime' };
  } else if (hour < 12) {
    return { greeting: 'Good morning', icon: 'wb_sunny' };
  } else if (hour < 18) {
    return { greeting: 'Good afternoon', icon: 'wb_twilight' };
  } else {
    return { greeting: 'Good evening', icon: 'nights_stay' };
  }
}

/**
 * Render the greeting component
 * @param {string} [userName] - Optional user name to personalize the greeting
 * @returns {string} HTML string
 */
export function renderGreeting(userName) {
  const { greeting, icon } = getTimeGreeting();
  const name = userName ? `, ${escapeHtml(userName)}` : '';

  return `
    <div class="greeting-banner">
      <span class="material-icons greeting-icon">${icon}</span>
      <span class="greeting-text">${greeting}${name}</span>
    </div>
  `;
}
