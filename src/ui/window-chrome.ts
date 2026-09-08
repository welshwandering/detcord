/**
 * Window chrome helpers: dragging and the minimised progress indicator.
 */

import { throttle } from '../utils/performance';
import { CSS_PREFIX } from './constants';

/** Handle returned by {@link enableWindowDragging}. */
export interface DraggingHandle {
  /** Detaches listeners and cancels the throttled move handler. */
  dispose(): void;
}

/**
 * Makes a window draggable by its header.
 *
 * The mousemove handler is throttled to roughly 60fps so dragging does not
 * thrash layout inside Discord's already busy page.
 *
 * @param windowEl - The element that moves
 * @param header - The drag handle
 * @returns A handle for tearing the listeners down
 */
export function enableWindowDragging(windowEl: HTMLElement, header: HTMLElement): DraggingHandle {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;

  const handleMouseDown = (event: MouseEvent): void => {
    if ((event.target as HTMLElement).closest('[data-action]')) {
      return;
    }
    const rect = windowEl.getBoundingClientRect();
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    originX = rect.left + rect.width / 2;
    originY = rect.top + rect.height / 2;
    event.preventDefault();
  };

  const handleMouseMove = throttle((event: MouseEvent) => {
    if (!dragging) {
      return;
    }
    const rect = windowEl.getBoundingClientRect();
    const halfWidth = rect.width / 2;
    const halfHeight = rect.height / 2;
    const x = Math.min(
      window.innerWidth - halfWidth,
      Math.max(halfWidth, originX + event.clientX - startX),
    );
    const y = Math.min(
      window.innerHeight - halfHeight,
      Math.max(halfHeight, originY + event.clientY - startY),
    );
    windowEl.style.left = `${x}px`;
    windowEl.style.top = `${y}px`;
    windowEl.style.transform = 'translate(-50%, -50%)';
  }, 16);

  const handleMouseUp = (): void => {
    dragging = false;
  };

  header.addEventListener('mousedown', handleMouseDown);
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);

  return {
    dispose(): void {
      handleMouseMove.cancel();
      header.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    },
  };
}

/**
 * Builds the small floating pill shown while a run continues minimised.
 *
 * @returns The indicator element, not yet attached
 */
export function createMiniIndicator(): HTMLElement {
  const indicator = document.createElement('div');
  indicator.className = `${CSS_PREFIX}-mini-indicator`;
  indicator.setAttribute('data-action', 'maximize');
  indicator.setAttribute('aria-label', 'Reopen Detcord');
  const count = document.createElement('span');
  count.className = `${CSS_PREFIX}-mini-count`;
  count.setAttribute('data-bind', 'miniCount');
  count.textContent = '0 / 0';
  indicator.appendChild(count);
  return indicator;
}
