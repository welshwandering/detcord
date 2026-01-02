/**
 * Performance utilities for Detcord
 *
 * Key performance principles:
 * 1. Minimize DOM operations - batch updates, use DocumentFragment
 * 2. Avoid layout thrashing - read then write, never interleave
 * 3. Use passive event listeners where possible
 * 4. Throttle/debounce expensive operations
 * 5. Clean up aggressively - remove unused elements
 * 6. Use requestAnimationFrame for visual updates
 * 7. Limit collections/arrays to prevent memory leaks
 */

/**
 * A throttled function with the ability to cancel pending invocations.
 */
export interface ThrottledFunction<T extends (...args: Parameters<T>) => void> {
  (...args: Parameters<T>): void;
  /** Cancel any pending throttled invocation */
  cancel: () => void;
}

/**
 * Throttle a function to run at most once per interval.
 * Uses trailing edge (function runs after interval).
 * Returns a function with a cancel() method for cleanup.
 */
// biome-ignore lint/suspicious/noExplicitAny: Required for flexible function typing
export function throttle<T extends (...args: any[]) => void>(
  fn: T,
  intervalMs: number,
): ThrottledFunction<T> {
  let lastRun = 0;
  let pending: ReturnType<typeof setTimeout> | null = null;

  const throttled = (...args: Parameters<T>) => {
    const now = Date.now();
    const timeSinceLastRun = now - lastRun;

    if (pending) {
      clearTimeout(pending);
      pending = null;
    }

    if (timeSinceLastRun >= intervalMs) {
      lastRun = now;
      fn(...args);
    } else {
      pending = setTimeout(() => {
        lastRun = Date.now();
        pending = null;
        fn(...args);
      }, intervalMs - timeSinceLastRun);
    }
  };

  throttled.cancel = () => {
    if (pending) {
      clearTimeout(pending);
      pending = null;
    }
  };

  return throttled as ThrottledFunction<T>;
}

/**
 * Debounce a function to run only after a quiet period.
 */
// biome-ignore lint/suspicious/noExplicitAny: Required for flexible function typing
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delayMs: number,
): (...args: Parameters<T>) => void {
  let pending: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (pending) {
      clearTimeout(pending);
    }
    pending = setTimeout(() => {
      pending = null;
      fn(...args);
    }, delayMs);
  };
}

/**
 * Schedule a function to run on the next animation frame.
 * Returns a cancel function.
 */
export function scheduleFrame(fn: () => void): () => void {
  const id = requestAnimationFrame(fn);
  return () => cancelAnimationFrame(id);
}

/**
 * Batch multiple DOM updates into a single animation frame.
 * Collects updates and applies them all at once.
 */
export function createBatchUpdater<T>(
  applyFn: (items: T[]) => void,
  maxBatchSize = 50,
): {
  add: (item: T) => void;
  flush: () => void;
} {
  let pending: T[] = [];
  let scheduled = false;

  const flush = () => {
    if (pending.length === 0) return;
    const batch = pending.splice(0, maxBatchSize);
    applyFn(batch);
    scheduled = false;

    // If there are more items, schedule another flush
    if (pending.length > 0) {
      scheduled = true;
      requestAnimationFrame(flush);
    }
  };

  return {
    add: (item: T) => {
      pending.push(item);
      if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(flush);
      }
    },
    flush: () => {
      if (pending.length > 0) {
        applyFn(pending);
        pending = [];
      }
      scheduled = false;
    },
  };
}

/**
 * Create a bounded array that automatically removes old items.
 * Prevents memory leaks from unbounded growth.
 */
export function createBoundedArray<T>(maxSize: number): {
  push: (item: T) => void;
  getAll: () => T[];
  clear: () => void;
  readonly length: number;
} {
  const items: T[] = [];

  return {
    push: (item: T) => {
      if (items.length >= maxSize) {
        items.shift();
      }
      items.push(item);
    },
    getAll: () => [...items],
    clear: () => {
      items.length = 0;
    },
    get length() {
      return items.length;
    },
  };
}

/**
 * Create a cleanup manager for tracking and disposing resources.
 * Prevents memory leaks from event listeners, timers, etc.
 */
export function createCleanupManager(): {
  add: (cleanup: () => void) => void;
  addInterval: (id: ReturnType<typeof setInterval>) => void;
  addTimeout: (id: ReturnType<typeof setTimeout>) => void;
  addListener: <K extends keyof WindowEventMap>(
    target: Window | Document | Element,
    event: K,
    handler: EventListener,
    options?: AddEventListenerOptions,
  ) => void;
  dispose: () => void;
} {
  const cleanups: Array<() => void> = [];

  return {
    add: (cleanup: () => void) => {
      cleanups.push(cleanup);
    },
    addInterval: (id: ReturnType<typeof setInterval>) => {
      cleanups.push(() => clearInterval(id));
    },
    addTimeout: (id: ReturnType<typeof setTimeout>) => {
      cleanups.push(() => clearTimeout(id));
    },
    addListener: (target, event, handler, options) => {
      target.addEventListener(event, handler, options);
      cleanups.push(() => target.removeEventListener(event, handler, options));
    },
    dispose: () => {
      for (const cleanup of cleanups) {
        try {
          cleanup();
        } catch {
          // Ignore cleanup errors
        }
      }
      cleanups.length = 0;
    },
  };
}

/**
 * Efficiently append multiple elements to a container using DocumentFragment.
 */
export function appendMany(container: Element, elements: Element[]): void {
  if (elements.length === 0) return;

  const fragment = document.createDocumentFragment();
  for (const el of elements) {
    fragment.appendChild(el);
  }
  container.appendChild(fragment);
}

/**
 * Remove excess children from an element, keeping only the first N.
 * Uses requestAnimationFrame to avoid layout thrashing.
 */
export function trimChildren(container: Element, maxChildren: number, removeFromEnd = true): void {
  const childCount = container.children.length;
  if (childCount <= maxChildren) return;

  requestAnimationFrame(() => {
    const toRemove = childCount - maxChildren;
    for (let i = 0; i < toRemove; i++) {
      const child = removeFromEnd ? container.lastElementChild : container.firstElementChild;
      child?.remove();
    }
  });
}

/**
 * Create a lazy initializer that only runs once.
 */
export function lazy<T>(factory: () => T): () => T {
  let value: T | undefined;
  let initialized = false;

  return () => {
    if (!initialized) {
      value = factory();
      initialized = true;
    }
    return value as T;
  };
}

/**
 * Options for creating an optimized MutationObserver.
 */
export interface OptimizedObserverOptions {
  /** Callback for mutations (receives batched mutations) */
  callback: (mutations: MutationRecord[]) => void;
  /** Throttle interval in ms (default: 1000) */
  throttleMs?: number;
  /** MutationObserver options */
  observe: MutationObserverInit;
}

/**
 * Create a throttled MutationObserver that batches mutations.
 * Prevents performance issues from rapid DOM changes.
 */
export function createOptimizedObserver(
  target: Node,
  options: OptimizedObserverOptions,
): { disconnect: () => void } {
  const { callback, throttleMs = 1000, observe } = options;

  let pendingMutations: MutationRecord[] = [];
  let scheduled = false;

  const flush = () => {
    if (pendingMutations.length > 0) {
      callback(pendingMutations);
      pendingMutations = [];
    }
    scheduled = false;
  };

  const throttledFlush = throttle(flush, throttleMs);

  const observer = new MutationObserver((mutations) => {
    pendingMutations.push(...mutations);
    if (!scheduled) {
      scheduled = true;
      throttledFlush();
    }
  });

  observer.observe(target, observe);

  return {
    disconnect: () => {
      observer.disconnect();
      pendingMutations = [];
    },
  };
}
