/**
 * Hold-to-confirm, the only authored motion in the interface.
 *
 * Deleting messages is irreversible, so the control that starts it asks for a
 * deliberate, sustained gesture rather than a click. The fill is the feedback:
 * it shows how much of the hold is left without moving or relabelling the
 * button. Release, leaving the control, Escape, blur or the page being hidden
 * all cancel; only a completed hold confirms.
 */

/** How long the destructive button must be held before it confirms (ms). */
export const HOLD_TO_CONFIRM_MS = 1500;

/** How long the reduced-motion two-step confirmation stays armed (ms). */
export const HOLD_REARM_WINDOW_MS = 4000;

/** Label shown by the reduced-motion two-step confirmation. */
export const HOLD_SECOND_STEP_LABEL = 'Press again to delete';

/** Options for {@link runHoldToConfirm}. */
export interface HoldToConfirmOptions {
  /** Called once the hold completes, or on the second reduced-motion press. */
  onConfirm: () => void;
  /** Hold duration in ms (default: {@link HOLD_TO_CONFIRM_MS}). */
  durationMs?: number;
}

/**
 * Handle returned by {@link runHoldToConfirm}.
 *
 * Calling it detaches every listener; `cancel()` abandons a hold in flight
 * while leaving the control usable.
 */
export interface HoldToConfirmHandle {
  (): void;
  /** Abandons an in-flight hold or a pending second step. */
  cancel: () => void;
}

/** Marks a button that {@link runHoldToConfirm} is driving. */
const HOLD_CLASS = 'detcord-hold';

/** Present only while the button is actually being held. */
const HOLDING_CLASS = 'holding';

/** Custom property the fill reads, 0 to 1. */
const PROGRESS_PROPERTY = '--hold-progress';

function prefersReducedMotion(): boolean {
  const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  return query?.matches === true;
}

function isActivationKey(key: string): boolean {
  return key === ' ' || key === 'Spacebar' || key === 'Enter';
}

/**
 * Turns a button into a hold-to-confirm control.
 *
 * Under `prefers-reduced-motion: reduce` the hold is replaced by a two-step
 * confirmation: the first press relabels the button and the second, within
 * {@link HOLD_REARM_WINDOW_MS}, confirms.
 *
 * @param button - The destructive button
 * @param options - Confirmation callback and hold duration
 * @returns A dispose function carrying a `cancel()` method
 */
export function runHoldToConfirm(
  button: HTMLElement,
  options: HoldToConfirmOptions,
): HoldToConfirmHandle {
  const duration = Math.max(1, options.durationMs ?? HOLD_TO_CONFIRM_MS);
  let frameId: number | null = null;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let startedAt = 0;
  let confirming = false;
  let armedLabel: string | null = null;
  let rearmTimer: ReturnType<typeof setTimeout> | null = null;

  button.classList.add(HOLD_CLASS);
  button.style.setProperty(PROGRESS_PROPERTY, '0');

  const clearFill = (): void => {
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
    if (holdTimer !== null) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    button.classList.remove(HOLDING_CLASS);
    button.style.setProperty(PROGRESS_PROPERTY, '0');
  };

  const disarm = (): void => {
    if (rearmTimer !== null) {
      clearTimeout(rearmTimer);
      rearmTimer = null;
    }
    if (armedLabel !== null) {
      button.textContent = armedLabel;
      armedLabel = null;
    }
  };

  const cancel = (): void => {
    clearFill();
    disarm();
  };

  const confirm = (): void => {
    if (confirming) {
      return;
    }
    confirming = true;
    cancel();
    try {
      options.onConfirm();
    } finally {
      confirming = false;
    }
  };

  // The frames paint the fill; the timer decides. Keeping the commitment off
  // the frame clock means a throttled tab cannot stretch or shorten the hold.
  const tick = (): void => {
    const progress = Math.min(1, (Date.now() - startedAt) / duration);
    button.style.setProperty(PROGRESS_PROPERTY, String(progress));
    frameId = progress < 1 ? requestAnimationFrame(tick) : null;
  };

  /** The reduced-motion path: press once to arm, again to confirm. */
  const stepConfirm = (): void => {
    if (armedLabel !== null) {
      confirm();
      return;
    }
    armedLabel = button.textContent ?? '';
    button.textContent = HOLD_SECOND_STEP_LABEL;
    rearmTimer = setTimeout(disarm, HOLD_REARM_WINDOW_MS);
  };

  const begin = (): void => {
    if (button.hasAttribute('disabled') || holdTimer !== null) {
      return;
    }
    if (prefersReducedMotion()) {
      stepConfirm();
      return;
    }
    startedAt = Date.now();
    button.classList.add(HOLDING_CLASS);
    button.style.setProperty(PROGRESS_PROPERTY, '0');
    holdTimer = setTimeout(confirm, duration);
    frameId = requestAnimationFrame(tick);
  };

  const handlePointerDown = (event: Event): void => {
    if ((event as MouseEvent).button > 0) {
      return;
    }
    begin();
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat || !isActivationKey(event.key)) {
      return;
    }
    event.preventDefault();
    begin();
  };

  const handleKeyUp = (event: KeyboardEvent): void => {
    if (isActivationKey(event.key)) {
      clearFill();
    }
  };

  const handleEscape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      cancel();
    }
  };

  const handleVisibility = (): void => {
    if (document.hidden) {
      cancel();
    }
  };

  button.addEventListener('pointerdown', handlePointerDown);
  button.addEventListener('pointerup', clearFill);
  button.addEventListener('pointerleave', clearFill);
  button.addEventListener('pointercancel', clearFill);
  button.addEventListener('keydown', handleKeyDown);
  button.addEventListener('keyup', handleKeyUp);
  button.addEventListener('blur', cancel);
  document.addEventListener('keydown', handleEscape);
  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('blur', cancel);

  const dispose = (): void => {
    cancel();
    button.classList.remove(HOLD_CLASS);
    button.style.removeProperty(PROGRESS_PROPERTY);
    button.removeEventListener('pointerdown', handlePointerDown);
    button.removeEventListener('pointerup', clearFill);
    button.removeEventListener('pointerleave', clearFill);
    button.removeEventListener('pointercancel', clearFill);
    button.removeEventListener('keydown', handleKeyDown);
    button.removeEventListener('keyup', handleKeyUp);
    button.removeEventListener('blur', cancel);
    document.removeEventListener('keydown', handleEscape);
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('blur', cancel);
  };

  const handle = dispose as HoldToConfirmHandle;
  handle.cancel = cancel;
  return handle;
}
