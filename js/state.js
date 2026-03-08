/**
 * Gas Town GUI - State Management
 *
 * Simple reactive state store with subscription support.
 * No external dependencies - just plain JavaScript.
 */

// Safe localStorage access (graceful degradation in non-browser environments)
const storage = typeof localStorage !== 'undefined' ? localStorage : null;

/**
 * Create a new state store instance.
 * Exported for testing - allows fresh, isolated state per test.
 *
 * @param {object} [options]
 * @param {Storage} [options.storage] - localStorage-like object for persistence
 * @returns {{ state, subscribe, store }}
 */
export function createStateStore(options = {}) {
  const stg = options.storage ?? storage;

  // State store
  const store = {
    status: null,
    convoys: [],
    agents: [],
    events: [],
    mail: [],
    selectedRig: stg?.getItem('gastownui-rig-filter') || 'all',
  };

  // Subscribers by key
  const subscribers = new Map();

  // Maximum events to keep
  const MAX_EVENTS = 500;

  // Subscribe to state changes
  function subscribe(key, callback) {
    if (!subscribers.has(key)) {
      subscribers.set(key, new Set());
    }
    subscribers.get(key).add(callback);

    // Return unsubscribe function
    return () => {
      subscribers.get(key).delete(callback);
    };
  }

  // Notify subscribers of changes
  function notify(key, meta) {
    const callbacks = subscribers.get(key);
    if (callbacks) {
      callbacks.forEach(cb => cb(store[key], meta));
    }
  }

  // State mutations
  const state = {
    // Get current state
    get(key) {
      return store[key];
    },

    // Set status
    setStatus(status) {
      store.status = status;
      notify('status');

      // Extract agents from status if present
      if (status?.agents) {
        this.setAgents(status.agents);
      }
    },

    // Set convoys
    setConvoys(convoys) {
      store.convoys = convoys || [];
      notify('convoys');
    },

    // Update single convoy
    updateConvoy(convoy) {
      if (!convoy?.id) return;

      const index = store.convoys.findIndex(c => c.id === convoy.id);
      if (index >= 0) {
        store.convoys[index] = { ...store.convoys[index], ...convoy };
      } else {
        store.convoys.unshift(convoy);
      }
      notify('convoys');
    },

    // Set agents
    setAgents(agents) {
      store.agents = agents || [];
      notify('agents');
    },

    // Get agents
    getAgents() {
      return store.agents || [];
    },

    // Get rigs from status
    getRigs() {
      return store.status?.rigs || [];
    },

    // Add event
    addEvent(event) {
      // Add timestamp if missing
      if (!event.timestamp) {
        event.timestamp = new Date().toISOString();
      }

      // Add to beginning
      store.events.unshift(event);

      // Trim to max
      if (store.events.length > MAX_EVENTS) {
        store.events = store.events.slice(0, MAX_EVENTS);
      }

      notify('events', { incremental: true, newEvent: event });
    },

    // Add multiple events at once (single notification)
    addEvents(events) {
      if (!events || events.length === 0) return;

      for (const event of events) {
        if (!event.timestamp) {
          event.timestamp = new Date().toISOString();
        }
        store.events.unshift(event);
      }

      // Trim to max
      if (store.events.length > MAX_EVENTS) {
        store.events = store.events.slice(0, MAX_EVENTS);
      }

      notify('events');
    },

    // Clear events
    clearEvents() {
      store.events = [];
      notify('events');
    },

    // Set mail
    setMail(mail) {
      store.mail = mail || [];
      notify('mail');
    },

    // Mark mail as read
    markMailRead(id) {
      const mail = store.mail.find(m => m.id === id);
      if (mail) {
        mail.read = true;
        notify('mail');
      }
    },

    // Rig filter
    getSelectedRig() {
      return store.selectedRig;
    },

    setSelectedRig(rig) {
      store.selectedRig = rig;
      stg?.setItem('gastownui-rig-filter', rig);
      notify('selectedRig');
    },
  };

  return { state, subscribe, store };
}

// Default singleton instance for the browser app
const { state, subscribe, store } = createStateStore();

export { subscribe, state, store };
