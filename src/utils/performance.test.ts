import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  appendMany,
  createBatchUpdater,
  createBoundedArray,
  createCleanupManager,
  createOptimizedObserver,
  debounce,
  lazy,
  scheduleFrame,
  throttle,
  trimChildren,
} from './performance';

describe('performance utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('throttle', () => {
    it('should call function immediately on first call', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not call function again within interval', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled();
      throttled();
      throttled();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should call function again after interval', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled();
      vi.advanceTimersByTime(100);
      throttled();
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should call trailing edge after interval', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled();
      throttled(); // This should be scheduled as trailing
      expect(fn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('debounce', () => {
    it('should not call function immediately', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced();
      expect(fn).not.toHaveBeenCalled();
    });

    it('should call function after delay', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced();
      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should reset delay on subsequent calls', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced();
      vi.advanceTimersByTime(50);
      debounced();
      vi.advanceTimersByTime(50);
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(50);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('createBoundedArray', () => {
    it('should add items normally when under limit', () => {
      const arr = createBoundedArray<number>(5);

      arr.push(1);
      arr.push(2);
      arr.push(3);

      expect(arr.getAll()).toEqual([1, 2, 3]);
      expect(arr.length).toBe(3);
    });

    it('should remove oldest items when at limit', () => {
      const arr = createBoundedArray<number>(3);

      arr.push(1);
      arr.push(2);
      arr.push(3);
      arr.push(4);

      expect(arr.getAll()).toEqual([2, 3, 4]);
      expect(arr.length).toBe(3);
    });

    it('should clear all items', () => {
      const arr = createBoundedArray<number>(5);
      arr.push(1);
      arr.push(2);

      arr.clear();

      expect(arr.getAll()).toEqual([]);
      expect(arr.length).toBe(0);
    });
  });

  describe('createCleanupManager', () => {
    it('should run all cleanup functions on dispose', () => {
      const cleanup1 = vi.fn();
      const cleanup2 = vi.fn();

      const manager = createCleanupManager();
      manager.add(cleanup1);
      manager.add(cleanup2);

      manager.dispose();

      expect(cleanup1).toHaveBeenCalledTimes(1);
      expect(cleanup2).toHaveBeenCalledTimes(1);
    });

    it('should clear intervals', () => {
      const manager = createCleanupManager();
      const intervalId = setInterval(() => {}, 1000);
      manager.addInterval(intervalId);

      // Should not throw
      manager.dispose();
    });

    it('should clear timeouts', () => {
      const manager = createCleanupManager();
      const timeoutId = setTimeout(() => {}, 1000);
      manager.addTimeout(timeoutId);

      // Should not throw
      manager.dispose();
    });

    it('should continue disposing even if one cleanup throws', () => {
      const cleanup1 = vi.fn(() => {
        throw new Error('test');
      });
      const cleanup2 = vi.fn();

      const manager = createCleanupManager();
      manager.add(cleanup1);
      manager.add(cleanup2);

      // Should not throw
      manager.dispose();

      expect(cleanup1).toHaveBeenCalledTimes(1);
      expect(cleanup2).toHaveBeenCalledTimes(1);
    });
  });

  describe('appendMany', () => {
    it('should append multiple elements efficiently', () => {
      const container = document.createElement('div');
      const elements = [
        document.createElement('span'),
        document.createElement('span'),
        document.createElement('span'),
      ];

      appendMany(container, elements);

      expect(container.children.length).toBe(3);
    });

    it('should handle empty array', () => {
      const container = document.createElement('div');
      appendMany(container, []);
      expect(container.children.length).toBe(0);
    });
  });

  describe('lazy', () => {
    it('should not call factory until accessed', () => {
      const factory = vi.fn(() => 'value');
      lazy(factory);

      expect(factory).not.toHaveBeenCalled();
    });

    it('should call factory once on first access', () => {
      const factory = vi.fn(() => 'value');
      const getValue = lazy(factory);

      const result = getValue();

      expect(factory).toHaveBeenCalledTimes(1);
      expect(result).toBe('value');
    });

    it('should return cached value on subsequent calls', () => {
      const factory = vi.fn(() => ({ data: 'value' }));
      const getValue = lazy(factory);

      const result1 = getValue();
      const result2 = getValue();

      expect(factory).toHaveBeenCalledTimes(1);
      expect(result1).toBe(result2);
    });
  });

  describe('throttle.cancel', () => {
    it('should cancel pending throttled invocation', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled(); // First call executes immediately
      throttled(); // This schedules a trailing call

      expect(fn).toHaveBeenCalledTimes(1);

      throttled.cancel();

      vi.advanceTimersByTime(100);
      // Trailing call should have been cancelled
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not throw when cancelling with no pending call', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      expect(() => throttled.cancel()).not.toThrow();
    });
  });

  describe('scheduleFrame', () => {
    it('should schedule function for next animation frame', () => {
      const fn = vi.fn();
      const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
        setTimeout(() => cb(0), 16);
        return 1;
      });

      scheduleFrame(fn);

      expect(rafSpy).toHaveBeenCalledWith(fn);

      rafSpy.mockRestore();
    });

    it('should return cancel function that calls cancelAnimationFrame', () => {
      const fn = vi.fn();
      const cafSpy = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
      vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(42);

      const cancel = scheduleFrame(fn);
      cancel();

      expect(cafSpy).toHaveBeenCalledWith(42);

      cafSpy.mockRestore();
    });
  });

  describe('createBatchUpdater', () => {
    it('should batch items and apply via requestAnimationFrame', () => {
      const applyFn = vi.fn();
      const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
        setTimeout(() => cb(0), 16);
        return 1;
      });

      const updater = createBatchUpdater<number>(applyFn, 50);

      updater.add(1);
      updater.add(2);
      updater.add(3);

      expect(applyFn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(16);

      expect(applyFn).toHaveBeenCalledWith([1, 2, 3]);

      rafSpy.mockRestore();
    });

    it('should process items in batches when exceeding maxBatchSize', () => {
      const applyFn = vi.fn();
      let rafCallback: FrameRequestCallback = () => {};
      vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
        rafCallback = cb;
        return 1;
      });

      const updater = createBatchUpdater<number>(applyFn, 2);

      updater.add(1);
      updater.add(2);
      updater.add(3);
      updater.add(4);
      updater.add(5);

      // First batch
      rafCallback(0);
      expect(applyFn).toHaveBeenCalledWith([1, 2]);

      // Second batch
      rafCallback(0);
      expect(applyFn).toHaveBeenCalledWith([3, 4]);

      // Third batch
      rafCallback(0);
      expect(applyFn).toHaveBeenCalledWith([5]);
    });

    it('should flush immediately when flush is called', () => {
      const applyFn = vi.fn();
      vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1);

      const updater = createBatchUpdater<number>(applyFn, 50);

      updater.add(1);
      updater.add(2);

      updater.flush();

      expect(applyFn).toHaveBeenCalledWith([1, 2]);
    });

    it('should not call applyFn when flushing empty batch', () => {
      const applyFn = vi.fn();
      const updater = createBatchUpdater<number>(applyFn, 50);

      updater.flush();

      expect(applyFn).not.toHaveBeenCalled();
    });
  });

  describe('trimChildren', () => {
    it('should remove excess children from end by default', () => {
      const container = document.createElement('div');
      for (let i = 0; i < 5; i++) {
        const child = document.createElement('span');
        child.textContent = `child-${i}`;
        container.appendChild(child);
      }

      let rafCallback: FrameRequestCallback = () => {};
      vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
        rafCallback = cb;
        return 1;
      });

      trimChildren(container, 3, true);

      // Execute the RAF callback
      rafCallback(0);

      expect(container.children.length).toBe(3);
      expect(container.children[0]?.textContent).toBe('child-0');
      expect(container.children[2]?.textContent).toBe('child-2');
    });

    it('should remove excess children from beginning when removeFromEnd is false', () => {
      const container = document.createElement('div');
      for (let i = 0; i < 5; i++) {
        const child = document.createElement('span');
        child.textContent = `child-${i}`;
        container.appendChild(child);
      }

      let rafCallback: FrameRequestCallback = () => {};
      vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
        rafCallback = cb;
        return 1;
      });

      trimChildren(container, 3, false);

      // Execute the RAF callback
      rafCallback(0);

      expect(container.children.length).toBe(3);
      expect(container.children[0]?.textContent).toBe('child-2');
      expect(container.children[2]?.textContent).toBe('child-4');
    });

    it('should not remove children when count is at or below limit', () => {
      const container = document.createElement('div');
      for (let i = 0; i < 3; i++) {
        container.appendChild(document.createElement('span'));
      }

      const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame');

      trimChildren(container, 3);

      // Should not even schedule RAF when no trimming needed
      expect(rafSpy).not.toHaveBeenCalled();
      expect(container.children.length).toBe(3);
    });
  });

  describe('createOptimizedObserver', () => {
    it('should create observer and start observing target', () => {
      const target = document.createElement('div');
      const callback = vi.fn();

      const observeSpy = vi.spyOn(MutationObserver.prototype, 'observe');

      const observer = createOptimizedObserver(target, {
        callback,
        throttleMs: 100,
        observe: { childList: true },
      });

      expect(observeSpy).toHaveBeenCalledWith(target, { childList: true });

      observer.disconnect();
      observeSpy.mockRestore();
    });

    it('should batch mutations and call callback', () => {
      const target = document.createElement('div');
      const callback = vi.fn();

      // Mock MutationObserver to capture the callback
      let observerCallback: MutationCallback = () => {};
      const originalMutationObserver = globalThis.MutationObserver;

      class MockMutationObserver {
        constructor(cb: MutationCallback) {
          observerCallback = cb;
        }
        observe = vi.fn();
        disconnect = vi.fn();
      }
      globalThis.MutationObserver = MockMutationObserver as unknown as typeof MutationObserver;

      createOptimizedObserver(target, {
        callback,
        throttleMs: 100,
        observe: { childList: true },
      });

      // Simulate mutations
      const mockMutation = {} as MutationRecord;
      observerCallback([mockMutation], {} as MutationObserver);

      // Should be throttled, so callback not called immediately
      // But first call goes through due to throttle behavior
      vi.advanceTimersByTime(100);

      expect(callback).toHaveBeenCalled();

      globalThis.MutationObserver = originalMutationObserver;
    });

    it('should disconnect observer and clear pending mutations', () => {
      const target = document.createElement('div');
      const callback = vi.fn();

      const disconnectSpy = vi.fn();
      const originalMutationObserver = globalThis.MutationObserver;

      class MockMutationObserver {
        observe = vi.fn();
        disconnect = disconnectSpy;
      }
      globalThis.MutationObserver = MockMutationObserver as unknown as typeof MutationObserver;

      const observer = createOptimizedObserver(target, {
        callback,
        throttleMs: 100,
        observe: { childList: true },
      });

      observer.disconnect();

      expect(disconnectSpy).toHaveBeenCalled();

      globalThis.MutationObserver = originalMutationObserver;
    });

    it('should use default throttleMs of 1000 when not specified', () => {
      const target = document.createElement('div');
      const callback = vi.fn();

      let observerCallback: MutationCallback = () => {};
      const originalMutationObserver = globalThis.MutationObserver;

      class MockMutationObserver {
        constructor(cb: MutationCallback) {
          observerCallback = cb;
        }
        observe = vi.fn();
        disconnect = vi.fn();
      }
      globalThis.MutationObserver = MockMutationObserver as unknown as typeof MutationObserver;

      createOptimizedObserver(target, {
        callback,
        observe: { childList: true },
      });

      // Simulate mutations
      const mockMutation = {} as MutationRecord;
      observerCallback([mockMutation], {} as MutationObserver);

      // First call goes through immediately due to throttle
      vi.advanceTimersByTime(0);
      expect(callback).toHaveBeenCalledTimes(1);

      // Trigger another mutation
      observerCallback([mockMutation], {} as MutationObserver);

      // Should be throttled for 1000ms
      vi.advanceTimersByTime(500);
      expect(callback).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(500);
      expect(callback).toHaveBeenCalledTimes(2);

      globalThis.MutationObserver = originalMutationObserver;
    });
  });

  describe('createCleanupManager.addListener', () => {
    it('should add and remove event listeners', () => {
      const manager = createCleanupManager();
      const handler = vi.fn();
      const element = document.createElement('div');

      const addSpy = vi.spyOn(element, 'addEventListener');
      const removeSpy = vi.spyOn(element, 'removeEventListener');

      manager.addListener(element, 'click', handler);

      expect(addSpy).toHaveBeenCalledWith('click', handler, undefined);

      manager.dispose();

      expect(removeSpy).toHaveBeenCalledWith('click', handler, undefined);
    });

    it('should pass options to event listener', () => {
      const manager = createCleanupManager();
      const handler = vi.fn();
      const options = { passive: true, capture: true };

      const addSpy = vi.spyOn(window, 'addEventListener');
      const removeSpy = vi.spyOn(window, 'removeEventListener');

      manager.addListener(window, 'scroll', handler, options);

      expect(addSpy).toHaveBeenCalledWith('scroll', handler, options);

      manager.dispose();

      expect(removeSpy).toHaveBeenCalledWith('scroll', handler, options);
    });
  });
});
