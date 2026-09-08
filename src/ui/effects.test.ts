/**
 * Tests for hold-to-confirm.
 *
 * The control guards an irreversible action, so the cases that matter are the
 * ones where it must *not* fire: a short press, a release, Escape, a pointer
 * that wanders off, and a disposed control.
 */

import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { HOLD_SECOND_STEP_LABEL, HOLD_TO_CONFIRM_MS, runHoldToConfirm } from './effects';

/** Dispatches a pointer event; jsdom has no PointerEvent constructor. */
function pointer(target: EventTarget, type: string, init: MouseEventInit = {}): void {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init }));
}

function key(target: EventTarget, type: string, keyName: string, repeat = false): void {
  target.dispatchEvent(new KeyboardEvent(type, { bubbles: true, key: keyName, repeat }));
}

function progress(button: HTMLElement): number {
  return Number(button.style.getPropertyValue('--hold-progress'));
}

function setReducedMotion(reduced: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: reduced && query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: (): void => {},
      removeEventListener: (): void => {},
      addListener: (): void => {},
      removeListener: (): void => {},
      dispatchEvent: (): boolean => false,
    }),
  });
}

describe('runHoldToConfirm', () => {
  let button: HTMLButtonElement;
  let onConfirm: Mock<() => void>;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    button = document.createElement('button');
    button.textContent = 'Delete 12 messages';
    document.body.appendChild(button);
    onConfirm = vi.fn<() => void>();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
    Reflect.deleteProperty(window, 'matchMedia');
  });

  it('confirms only once the hold completes', () => {
    const hold = runHoldToConfirm(button, { onConfirm });

    pointer(button, 'pointerdown');
    expect(button.classList.contains('holding')).toBe(true);

    vi.advanceTimersByTime(HOLD_TO_CONFIRM_MS - 200);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(progress(button)).toBeGreaterThan(0.5);
    expect(progress(button)).toBeLessThan(1);

    vi.advanceTimersByTime(300);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(button.classList.contains('holding')).toBe(false);
    expect(progress(button)).toBe(0);

    hold();
  });

  it('does not confirm when the press is released early', () => {
    const hold = runHoldToConfirm(button, { onConfirm });

    pointer(button, 'pointerdown');
    vi.advanceTimersByTime(800);
    pointer(button, 'pointerup');
    vi.advanceTimersByTime(HOLD_TO_CONFIRM_MS);

    expect(onConfirm).not.toHaveBeenCalled();
    expect(button.classList.contains('holding')).toBe(false);
    expect(progress(button)).toBe(0);

    hold();
  });

  it.each(['pointerleave', 'pointercancel'])('cancels the hold on %s', (type) => {
    const hold = runHoldToConfirm(button, { onConfirm });

    pointer(button, 'pointerdown');
    vi.advanceTimersByTime(500);
    pointer(button, type);
    vi.advanceTimersByTime(HOLD_TO_CONFIRM_MS);

    expect(onConfirm).not.toHaveBeenCalled();
    hold();
  });

  it('cancels the hold on Escape', () => {
    const hold = runHoldToConfirm(button, { onConfirm });

    pointer(button, 'pointerdown');
    vi.advanceTimersByTime(500);
    key(document, 'keydown', 'Escape');
    vi.advanceTimersByTime(HOLD_TO_CONFIRM_MS);

    expect(onConfirm).not.toHaveBeenCalled();
    expect(button.classList.contains('holding')).toBe(false);
    hold();
  });

  it('cancels the hold when the button loses focus', () => {
    const hold = runHoldToConfirm(button, { onConfirm });

    pointer(button, 'pointerdown');
    vi.advanceTimersByTime(500);
    button.dispatchEvent(new FocusEvent('blur'));
    vi.advanceTimersByTime(HOLD_TO_CONFIRM_MS);

    expect(onConfirm).not.toHaveBeenCalled();
    hold();
  });

  it('cancels the hold when the page is hidden', () => {
    const hold = runHoldToConfirm(button, { onConfirm });

    pointer(button, 'pointerdown');
    vi.advanceTimersByTime(500);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(HOLD_TO_CONFIRM_MS);

    expect(onConfirm).not.toHaveBeenCalled();
    hold();
  });

  it('holds from the keyboard and cancels when the key is released', () => {
    const hold = runHoldToConfirm(button, { onConfirm });

    key(button, 'keydown', ' ');
    vi.advanceTimersByTime(800);
    key(button, 'keyup', ' ');
    vi.advanceTimersByTime(HOLD_TO_CONFIRM_MS);
    expect(onConfirm).not.toHaveBeenCalled();

    key(button, 'keydown', 'Enter');
    vi.advanceTimersByTime(HOLD_TO_CONFIRM_MS);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    hold();
  });

  it('ignores auto-repeat while a key is already held', () => {
    const hold = runHoldToConfirm(button, { onConfirm });

    key(button, 'keydown', 'Enter');
    vi.advanceTimersByTime(500);
    key(button, 'keydown', 'Enter', true);
    vi.advanceTimersByTime(HOLD_TO_CONFIRM_MS);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    hold();
  });

  it('refuses to start while the button is disabled', () => {
    const hold = runHoldToConfirm(button, { onConfirm });
    button.setAttribute('disabled', 'disabled');

    pointer(button, 'pointerdown');
    vi.advanceTimersByTime(HOLD_TO_CONFIRM_MS);

    expect(onConfirm).not.toHaveBeenCalled();
    expect(button.classList.contains('holding')).toBe(false);
    hold();
  });

  it('ignores non-primary pointer buttons', () => {
    const hold = runHoldToConfirm(button, { onConfirm });

    pointer(button, 'pointerdown', { button: 2 });
    vi.advanceTimersByTime(HOLD_TO_CONFIRM_MS);

    expect(onConfirm).not.toHaveBeenCalled();
    hold();
  });

  it('cancel() abandons a hold in flight but leaves the control usable', () => {
    const hold = runHoldToConfirm(button, { onConfirm });

    pointer(button, 'pointerdown');
    vi.advanceTimersByTime(700);
    hold.cancel();
    vi.advanceTimersByTime(HOLD_TO_CONFIRM_MS);
    expect(onConfirm).not.toHaveBeenCalled();

    pointer(button, 'pointerdown');
    vi.advanceTimersByTime(HOLD_TO_CONFIRM_MS);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    hold();
  });

  it('detaches every listener on dispose', () => {
    const hold = runHoldToConfirm(button, { onConfirm });
    expect(button.classList.contains('detcord-hold')).toBe(true);

    hold();

    expect(button.classList.contains('detcord-hold')).toBe(false);
    pointer(button, 'pointerdown');
    key(button, 'keydown', 'Enter');
    vi.advanceTimersByTime(HOLD_TO_CONFIRM_MS * 2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('honours a custom hold duration', () => {
    const hold = runHoldToConfirm(button, { onConfirm, durationMs: 400 });

    pointer(button, 'pointerdown');
    vi.advanceTimersByTime(200);
    expect(onConfirm).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    hold();
  });

  describe('prefers-reduced-motion', () => {
    beforeEach(() => {
      setReducedMotion(true);
    });

    it('asks for a second press instead of a hold', () => {
      const hold = runHoldToConfirm(button, { onConfirm });

      pointer(button, 'pointerdown');
      expect(button.textContent).toBe(HOLD_SECOND_STEP_LABEL);
      expect(button.classList.contains('holding')).toBe(false);
      vi.advanceTimersByTime(HOLD_TO_CONFIRM_MS);
      expect(onConfirm).not.toHaveBeenCalled();

      pointer(button, 'pointerdown');
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(button.textContent).toBe('Delete 12 messages');

      hold();
    });

    it('disarms itself after four seconds', () => {
      const hold = runHoldToConfirm(button, { onConfirm });

      pointer(button, 'pointerdown');
      vi.advanceTimersByTime(4000);
      expect(button.textContent).toBe('Delete 12 messages');

      pointer(button, 'pointerdown');
      expect(onConfirm).not.toHaveBeenCalled();
      expect(button.textContent).toBe(HOLD_SECOND_STEP_LABEL);

      hold();
    });

    it('disarms on Escape and restores the label', () => {
      const hold = runHoldToConfirm(button, { onConfirm });

      pointer(button, 'pointerdown');
      key(document, 'keydown', 'Escape');
      expect(button.textContent).toBe('Delete 12 messages');

      pointer(button, 'pointerdown');
      expect(onConfirm).not.toHaveBeenCalled();

      hold();
    });
  });
});
