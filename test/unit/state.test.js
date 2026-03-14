/**
 * Gas Town GUI - State Management Unit Tests
 *
 * Tests for the reactive state store in js/state.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createStateStore } from '../../js/state.js';

describe('State Management', () => {
  let state, subscribe, store;

  beforeEach(() => {
    const result = createStateStore();
    state = result.state;
    subscribe = result.subscribe;
    store = result.store;
  });

  describe('get()', () => {
    it('should return undefined for unset keys', () => {
      expect(state.get('status')).toBeNull();
    });

    it('should return empty arrays for list keys', () => {
      expect(state.get('convoys')).toEqual([]);
      expect(state.get('agents')).toEqual([]);
      expect(state.get('events')).toEqual([]);
      expect(state.get('mail')).toEqual([]);
    });
  });

  describe('setStatus()', () => {
    it('should set status and notify subscribers', () => {
      const callback = vi.fn();
      subscribe('status', callback);

      state.setStatus({ name: 'Test Town', version: '1.0.0' });

      expect(state.get('status')).toEqual({ name: 'Test Town', version: '1.0.0' });
      expect(callback).toHaveBeenCalledWith({ name: 'Test Town', version: '1.0.0' }, undefined);
    });

    it('should extract agents from status', () => {
      const callback = vi.fn();
      subscribe('agents', callback);

      const agents = [{ id: 'agent-1', name: 'Mayor' }];
      state.setStatus({ name: 'Town', agents });

      expect(state.get('agents')).toEqual(agents);
      expect(callback).toHaveBeenCalledWith(agents, undefined);
    });
  });

  describe('setConvoys()', () => {
    it('should set convoys array', () => {
      const convoys = [
        { id: 'conv-1', name: 'Test Convoy' },
        { id: 'conv-2', name: 'Another Convoy' },
      ];

      state.setConvoys(convoys);

      expect(state.get('convoys')).toEqual(convoys);
    });

    it('should handle null/undefined', () => {
      state.setConvoys(null);
      expect(state.get('convoys')).toEqual([]);

      state.setConvoys(undefined);
      expect(state.get('convoys')).toEqual([]);
    });

    it('should notify subscribers', () => {
      const callback = vi.fn();
      subscribe('convoys', callback);

      const convoys = [{ id: 'conv-1' }];
      state.setConvoys(convoys);

      expect(callback).toHaveBeenCalledWith(convoys, undefined);
    });
  });

  describe('updateConvoy()', () => {
    it('should add new convoy to beginning', () => {
      state.setConvoys([{ id: 'conv-1', name: 'Existing' }]);

      state.updateConvoy({ id: 'conv-2', name: 'New' });

      const convoys = state.get('convoys');
      expect(convoys.length).toBe(2);
      expect(convoys[0].id).toBe('conv-2');
    });

    it('should update existing convoy', () => {
      state.setConvoys([{ id: 'conv-1', name: 'Original', status: 'pending' }]);

      state.updateConvoy({ id: 'conv-1', status: 'running' });

      const convoy = state.get('convoys')[0];
      expect(convoy.name).toBe('Original'); // Preserved
      expect(convoy.status).toBe('running'); // Updated
    });

    it('should not add convoy without id', () => {
      state.setConvoys([]);
      state.updateConvoy({ name: 'No ID' });
      expect(state.get('convoys').length).toBe(0);

      state.updateConvoy(null);
      expect(state.get('convoys').length).toBe(0);
    });
  });

  describe('setAgents()', () => {
    it('should set agents array', () => {
      const agents = [
        { id: 'agent-1', name: 'Mayor', status: 'idle' },
        { id: 'agent-2', name: 'Polecat', status: 'working' },
      ];

      state.setAgents(agents);

      expect(state.get('agents')).toEqual(agents);
    });

    it('should handle null/undefined', () => {
      state.setAgents(null);
      expect(state.get('agents')).toEqual([]);
    });
  });

  describe('getAgents()', () => {
    it('should return agents array', () => {
      const agents = [{ id: 'agent-1', name: 'Mayor' }];
      state.setAgents(agents);
      expect(state.getAgents()).toEqual(agents);
    });

    it('should return empty array when no agents set', () => {
      expect(state.getAgents()).toEqual([]);
    });
  });

  describe('getRigs()', () => {
    it('should return rigs from status', () => {
      const rigs = ['gastownui', 'beads'];
      state.setStatus({ rigs });
      expect(state.getRigs()).toEqual(rigs);
    });

    it('should return empty array when no status', () => {
      expect(state.getRigs()).toEqual([]);
    });
  });

  describe('addEvent()', () => {
    it('should add event to beginning of list', () => {
      state.addEvent({ type: 'first', message: 'First event' });
      state.addEvent({ type: 'second', message: 'Second event' });

      const events = state.get('events');
      expect(events.length).toBe(2);
      expect(events[0].type).toBe('second'); // Most recent first
    });

    it('should add timestamp if missing', () => {
      state.addEvent({ type: 'test' });

      const event = state.get('events')[0];
      expect(event.timestamp).toBeDefined();
    });

    it('should preserve existing timestamp', () => {
      const timestamp = '2024-01-01T12:00:00Z';
      state.addEvent({ type: 'test', timestamp });

      const event = state.get('events')[0];
      expect(event.timestamp).toBe(timestamp);
    });

    it('should notify with incremental meta', () => {
      const callback = vi.fn();
      subscribe('events', callback);

      const event = { type: 'test', message: 'hello' };
      state.addEvent(event);

      expect(callback).toHaveBeenCalledWith(
        expect.any(Array),
        { incremental: true, newEvent: expect.objectContaining({ type: 'test', message: 'hello' }) }
      );
    });

    it('should trim to max events', () => {
      // Add 510 events
      for (let i = 0; i < 510; i++) {
        state.addEvent({ type: 'test', index: i });
      }

      const events = state.get('events');
      expect(events.length).toBe(500);
      expect(events[0].index).toBe(509); // Most recent
    });
  });

  describe('addEvents()', () => {
    it('should add multiple events at once', () => {
      state.addEvents([
        { type: 'a', message: 'First' },
        { type: 'b', message: 'Second' },
      ]);

      const events = state.get('events');
      expect(events.length).toBe(2);
      expect(events[0].type).toBe('b'); // Most recent first
    });

    it('should add timestamps to events missing them', () => {
      state.addEvents([{ type: 'test' }]);
      expect(state.get('events')[0].timestamp).toBeDefined();
    });

    it('should send single notification', () => {
      const callback = vi.fn();
      subscribe('events', callback);

      state.addEvents([
        { type: 'a' },
        { type: 'b' },
        { type: 'c' },
      ]);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should do nothing for empty or null input', () => {
      const callback = vi.fn();
      subscribe('events', callback);

      state.addEvents([]);
      state.addEvents(null);

      expect(callback).not.toHaveBeenCalled();
      expect(state.get('events')).toEqual([]);
    });

    it('should trim to max events', () => {
      const events = Array.from({ length: 510 }, (_, i) => ({ type: 'test', index: i }));
      state.addEvents(events);

      expect(state.get('events').length).toBe(500);
    });
  });

  describe('clearEvents()', () => {
    it('should clear all events', () => {
      state.addEvent({ type: 'test' });
      state.addEvent({ type: 'test' });

      state.clearEvents();

      expect(state.get('events')).toEqual([]);
    });

    it('should notify subscribers', () => {
      const callback = vi.fn();
      subscribe('events', callback);

      state.clearEvents();

      expect(callback).toHaveBeenCalledWith([], undefined);
    });
  });

  describe('setMail()', () => {
    it('should set mail array', () => {
      const mail = [
        { id: 'mail-1', subject: 'Hello', read: false },
        { id: 'mail-2', subject: 'World', read: true },
      ];

      state.setMail(mail);

      expect(state.get('mail')).toEqual(mail);
    });

    it('should handle null/undefined', () => {
      state.setMail(null);
      expect(state.get('mail')).toEqual([]);
    });
  });

  describe('markMailRead()', () => {
    it('should mark mail as read', () => {
      state.setMail([
        { id: 'mail-1', subject: 'Test', read: false },
      ]);

      state.markMailRead('mail-1');

      expect(state.get('mail')[0].read).toBe(true);
    });

    it('should notify subscribers', () => {
      state.setMail([{ id: 'mail-1', read: false }]);

      const callback = vi.fn();
      subscribe('mail', callback);

      state.markMailRead('mail-1');

      expect(callback).toHaveBeenCalled();
    });

    it('should do nothing for non-existent mail', () => {
      state.setMail([{ id: 'mail-1', read: false }]);

      state.markMailRead('mail-999');

      expect(state.get('mail')[0].read).toBe(false);
    });
  });

  describe('markMailUnread()', () => {
    it('should mark mail as unread', () => {
      state.setMail([
        { id: 'mail-1', subject: 'Test', read: true },
      ]);

      state.markMailUnread('mail-1');

      expect(state.get('mail')[0].read).toBe(false);
    });

    it('should notify subscribers', () => {
      state.setMail([{ id: 'mail-1', read: true }]);

      const callback = vi.fn();
      subscribe('mail', callback);

      state.markMailUnread('mail-1');

      expect(callback).toHaveBeenCalled();
    });

    it('should do nothing for non-existent mail', () => {
      state.setMail([{ id: 'mail-1', read: true }]);

      state.markMailUnread('mail-999');

      expect(state.get('mail')[0].read).toBe(true);
    });
  });

  describe('selectedRig', () => {
    it('should default to "all" without storage', () => {
      expect(state.getSelectedRig()).toBe('all');
    });

    it('should read initial value from storage', () => {
      const mockStorage = {
        getItem: vi.fn(() => 'myrig'),
        setItem: vi.fn(),
      };
      const { state: s } = createStateStore({ storage: mockStorage });
      expect(s.getSelectedRig()).toBe('myrig');
      expect(mockStorage.getItem).toHaveBeenCalledWith('gastownui-rig-filter');
    });

    it('should persist to storage on set', () => {
      const mockStorage = {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
      };
      const { state: s } = createStateStore({ storage: mockStorage });
      s.setSelectedRig('testrig');
      expect(s.getSelectedRig()).toBe('testrig');
      expect(mockStorage.setItem).toHaveBeenCalledWith('gastownui-rig-filter', 'testrig');
    });

    it('should notify subscribers on change', () => {
      const callback = vi.fn();
      subscribe('selectedRig', callback);
      state.setSelectedRig('newrig');
      expect(callback).toHaveBeenCalledWith('newrig', undefined);
    });
  });

  describe('subscribe()', () => {
    it('should return unsubscribe function', () => {
      const callback = vi.fn();
      const unsubscribe = subscribe('status', callback);

      state.setStatus({ name: 'First' });
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();

      state.setStatus({ name: 'Second' });
      expect(callback).toHaveBeenCalledTimes(1); // Not called again
    });

    it('should support multiple subscribers', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      subscribe('convoys', callback1);
      subscribe('convoys', callback2);

      state.setConvoys([{ id: 'test' }]);

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('should isolate subscribers by key', () => {
      const statusCallback = vi.fn();
      const convoysCallback = vi.fn();

      subscribe('status', statusCallback);
      subscribe('convoys', convoysCallback);

      state.setStatus({ name: 'Test' });

      expect(statusCallback).toHaveBeenCalled();
      expect(convoysCallback).not.toHaveBeenCalled();
    });
  });
});

describe('State Integration', () => {
  let state, subscribe;

  beforeEach(() => {
    const result = createStateStore();
    state = result.state;
    subscribe = result.subscribe;
  });

  it('should handle typical app initialization flow', () => {
    // Subscribe to all state keys
    const callbacks = {
      status: vi.fn(),
      convoys: vi.fn(),
      agents: vi.fn(),
      events: vi.fn(),
      mail: vi.fn(),
    };

    Object.entries(callbacks).forEach(([key, cb]) => subscribe(key, cb));

    // Simulate initial data load
    state.setStatus({
      name: 'Gas Town',
      version: '1.0.0',
      agents: [{ id: 'mayor', name: 'Mayor' }],
    });

    state.setConvoys([
      { id: 'conv-1', name: 'Feature Work', status: 'running' },
    ]);

    state.setMail([
      { id: 'mail-1', subject: 'Welcome', read: false },
    ]);

    // Verify all callbacks were called
    expect(callbacks.status).toHaveBeenCalled();
    expect(callbacks.convoys).toHaveBeenCalled();
    expect(callbacks.agents).toHaveBeenCalled(); // From setStatus
    expect(callbacks.mail).toHaveBeenCalled();
  });

  it('should handle real-time updates', () => {
    const convoysCallback = vi.fn();
    subscribe('convoys', convoysCallback);

    // Initial load
    state.setConvoys([{ id: 'conv-1', name: 'Test', status: 'pending' }]);

    // WebSocket update
    state.updateConvoy({ id: 'conv-1', status: 'running', progress: 0.5 });

    // Verify convoy was updated, not duplicated
    expect(state.get('convoys').length).toBe(1);
    expect(state.get('convoys')[0].status).toBe('running');
    expect(state.get('convoys')[0].progress).toBe(0.5);
  });

  it('should handle activity stream', () => {
    const eventsCallback = vi.fn();
    subscribe('events', eventsCallback);

    // Simulate activity stream
    state.addEvent({ type: 'status', message: 'Agent started' });
    state.addEvent({ type: 'progress', message: 'Task 50% complete' });
    state.addEvent({ type: 'complete', message: 'Task finished' });

    expect(state.get('events').length).toBe(3);
    expect(eventsCallback).toHaveBeenCalledTimes(3);

    // Most recent event should be first
    expect(state.get('events')[0].type).toBe('complete');
  });
});
