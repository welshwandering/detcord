/**
 * Tests for Visual Effects Module
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createConfetti,
  createStatusRotator,
  flashElement,
  runCountdownSequence,
  STATUS_MESSAGES,
  shakeElement,
} from './effects';

describe('effects module', () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  describe('createConfetti', () => {
    it('creates confetti elements in container', () => {
      createConfetti(container, 10, 3000);

      const confettiContainer = container.querySelector('.confetti-container');
      expect(confettiContainer).toBeTruthy();
      expect(confettiContainer?.querySelectorAll('.confetti').length).toBe(10);
    });

    it('uses default count when not specified', () => {
      createConfetti(container);

      const confettiContainer = container.querySelector('.confetti-container');
      expect(confettiContainer?.querySelectorAll('.confetti').length).toBe(30);
    });

    it('removes confetti after duration', () => {
      createConfetti(container, 10, 1000);

      expect(container.querySelector('.confetti-container')).toBeTruthy();

      vi.advanceTimersByTime(1000);

      expect(container.querySelector('.confetti-container')).toBeFalsy();
    });

    it('applies random styles to each confetti piece', () => {
      createConfetti(container, 5, 3000);

      const confetti = container.querySelectorAll('.confetti');
      for (const piece of confetti) {
        const el = piece as HTMLElement;
        expect(el.style.getPropertyValue('--x')).toBeTruthy();
        expect(el.style.getPropertyValue('--delay')).toBeTruthy();
        expect(el.style.backgroundColor).toBeTruthy();
        expect(el.style.width).toBeTruthy();
        expect(el.style.height).toBeTruthy();
      }
    });
  });

  describe('shakeElement', () => {
    it('adds shaking class to element', () => {
      const el = document.createElement('div');
      shakeElement(el, 400);

      expect(el.classList.contains('shaking')).toBe(true);
    });

    it('removes shaking class after duration', async () => {
      const el = document.createElement('div');
      const promise = shakeElement(el, 400);

      vi.advanceTimersByTime(400);
      await promise;

      expect(el.classList.contains('shaking')).toBe(false);
    });

    it('resolves promise after duration', async () => {
      const el = document.createElement('div');
      const promise = shakeElement(el, 200);

      vi.advanceTimersByTime(200);
      await expect(promise).resolves.toBeUndefined();
    });
  });

  describe('flashElement', () => {
    it('adds flash overlay to container', () => {
      flashElement(container, 300);

      expect(container.querySelector('.flash-overlay')).toBeTruthy();
    });

    it('removes flash overlay after duration', async () => {
      const promise = flashElement(container, 300);

      expect(container.querySelector('.flash-overlay')).toBeTruthy();

      vi.advanceTimersByTime(300);
      await promise;

      expect(container.querySelector('.flash-overlay')).toBeFalsy();
    });

    it('resolves promise after duration', async () => {
      const promise = flashElement(container, 100);

      vi.advanceTimersByTime(100);
      await expect(promise).resolves.toBeUndefined();
    });
  });

  describe('runCountdownSequence', () => {
    it('displays countdown numbers in sequence', () => {
      const onComplete = vi.fn();
      runCountdownSequence(container, onComplete);

      // Check initial state - shows "3"
      const overlay = container.querySelector('.detcord-countdown-overlay');
      expect(overlay).toBeTruthy();
      expect(overlay?.querySelector('.countdown-number')?.textContent).toBe('3');
    });

    it('progresses through 3-2-1-BOOM sequence', () => {
      const onComplete = vi.fn();
      runCountdownSequence(container, onComplete);

      const overlay = container.querySelector('.detcord-countdown-overlay');

      // Initially "3"
      expect(overlay?.querySelector('.countdown-number')?.textContent).toBe('3');

      // After 900ms -> "2"
      vi.advanceTimersByTime(900);
      expect(overlay?.querySelector('.countdown-number')?.textContent).toBe('2');

      // After 900ms -> "1"
      vi.advanceTimersByTime(900);
      expect(overlay?.querySelector('.countdown-number')?.textContent).toBe('1');

      // After 900ms -> "BOOM"
      vi.advanceTimersByTime(900);
      expect(overlay?.querySelector('.countdown-boom')?.textContent).toBe('💥 BOOM');
    });

    it('calls onComplete after full sequence', () => {
      const onComplete = vi.fn();
      runCountdownSequence(container, onComplete);

      expect(onComplete).not.toHaveBeenCalled();

      // Advance through entire sequence: 900 + 900 + 900 + 500 = 3200ms
      vi.advanceTimersByTime(3200);

      expect(onComplete).toHaveBeenCalledOnce();
    });

    it('removes overlay after completion', () => {
      const onComplete = vi.fn();
      runCountdownSequence(container, onComplete);

      vi.advanceTimersByTime(3200);

      expect(container.querySelector('.detcord-countdown-overlay')).toBeFalsy();
    });

    it('can be cancelled via cleanup function', () => {
      const onComplete = vi.fn();
      const cancel = runCountdownSequence(container, onComplete);

      // Cancel mid-sequence
      vi.advanceTimersByTime(1000);
      cancel();

      // Overlay should be removed immediately
      expect(container.querySelector('.detcord-countdown-overlay')).toBeFalsy();

      // Complete the remaining time
      vi.advanceTimersByTime(2200);

      // onComplete should NOT be called
      expect(onComplete).not.toHaveBeenCalled();
    });
  });

  describe('createStatusRotator', () => {
    it('returns object with start and stop methods', () => {
      const el = document.createElement('div');
      const rotator = createStatusRotator(el, 3000);

      expect(typeof rotator.start).toBe('function');
      expect(typeof rotator.stop).toBe('function');
    });

    it('displays first message on start', () => {
      const el = document.createElement('div');
      const rotator = createStatusRotator(el, 3000);

      rotator.start();

      expect(el.textContent).toBe(STATUS_MESSAGES[0]);
      expect(el.classList.contains('rotating')).toBe(true);

      rotator.stop();
    });

    it('rotates through messages at interval', () => {
      const el = document.createElement('div');
      const rotator = createStatusRotator(el, 1000);

      rotator.start();
      expect(el.textContent).toBe(STATUS_MESSAGES[0]);

      vi.advanceTimersByTime(1000);
      expect(el.textContent).toBe(STATUS_MESSAGES[1]);

      vi.advanceTimersByTime(1000);
      expect(el.textContent).toBe(STATUS_MESSAGES[2]);

      rotator.stop();
    });

    it('wraps around to first message after last', () => {
      const el = document.createElement('div');
      const rotator = createStatusRotator(el, 100);

      rotator.start();

      // Advance through all messages
      vi.advanceTimersByTime(100 * STATUS_MESSAGES.length);

      // Should wrap back to first message
      expect(el.textContent).toBe(STATUS_MESSAGES[0]);

      rotator.stop();
    });

    it('stops rotation when stop is called', () => {
      const el = document.createElement('div');
      const rotator = createStatusRotator(el, 1000);

      rotator.start();

      rotator.stop();

      // Advance time
      vi.advanceTimersByTime(5000);

      // No more updates should happen after stop
      expect(el.classList.contains('rotating')).toBe(false);
    });

    it('removes rotating class when stopped', () => {
      const el = document.createElement('div');
      const rotator = createStatusRotator(el, 1000);

      rotator.start();
      expect(el.classList.contains('rotating')).toBe(true);

      rotator.stop();
      expect(el.classList.contains('rotating')).toBe(false);
    });

    it('handles multiple stop calls gracefully', () => {
      const el = document.createElement('div');
      const rotator = createStatusRotator(el, 1000);

      rotator.start();
      rotator.stop();
      rotator.stop(); // Should not throw
      rotator.stop();

      expect(el.classList.contains('rotating')).toBe(false);
    });
  });

  describe('STATUS_MESSAGES', () => {
    it('exports array of status messages', () => {
      expect(Array.isArray(STATUS_MESSAGES)).toBe(true);
      expect(STATUS_MESSAGES.length).toBeGreaterThan(0);
    });

    it('all messages are non-empty strings', () => {
      for (const msg of STATUS_MESSAGES) {
        expect(typeof msg).toBe('string');
        expect(msg.length).toBeGreaterThan(0);
      }
    });
  });
});
