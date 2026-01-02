/**
 * Visual Effects Module for Detcord
 *
 * High-performance visual effects for celebration and feedback.
 * Uses requestAnimationFrame and CSS animations for smooth rendering.
 */

/**
 * Discord-themed colors for confetti
 */
const CONFETTI_COLORS = [
  '#5865F2', // Blurple
  '#57F287', // Green
  '#FEE75C', // Yellow
  '#EB459E', // Fuchsia
  '#ED4245', // Red
];

/**
 * Creates a confetti celebration effect within a container.
 * Uses DocumentFragment for efficient DOM insertion and CSS animations.
 *
 * @param container - The HTML element to append confetti to
 * @param count - Number of confetti pieces (default: 30)
 * @param duration - Duration in ms before cleanup (default: 3000)
 */
export function createConfetti(container: HTMLElement, count = 30, duration = 3000): void {
  // Create container for confetti
  const confettiContainer = document.createElement('div');
  confettiContainer.className = 'confetti-container';

  // Use DocumentFragment for batch insertion
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < count; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti';

    // Random horizontal position
    const x = Math.random() * 100;
    confetti.style.setProperty('--x', `${x}%`);

    // Random animation delay for staggered effect
    const delay = Math.random() * 0.5;
    confetti.style.setProperty('--delay', `${delay}s`);

    // Random color from Discord palette
    const colorIndex = Math.floor(Math.random() * CONFETTI_COLORS.length);
    confetti.style.backgroundColor = CONFETTI_COLORS[colorIndex] ?? '#5865F2';

    // Random size variation
    const size = 8 + Math.random() * 6;
    confetti.style.width = `${size}px`;
    confetti.style.height = `${size}px`;

    fragment.appendChild(confetti);
  }

  confettiContainer.appendChild(fragment);
  container.appendChild(confettiContainer);

  // Clean up after animation completes
  setTimeout(() => {
    confettiContainer.remove();
  }, duration);
}

/**
 * Creates a screen shake effect on the specified element.
 *
 * @param element - The element to shake
 * @param duration - Duration in ms (default: 400)
 */
export function shakeElement(element: HTMLElement, duration = 400): Promise<void> {
  return new Promise((resolve) => {
    element.classList.add('shaking');

    setTimeout(() => {
      element.classList.remove('shaking');
      resolve();
    }, duration);
  });
}

/**
 * Creates a flash effect overlay on the specified element.
 *
 * @param container - The element to add the flash overlay to
 * @param duration - Duration in ms (default: 300)
 */
export function flashElement(container: HTMLElement, duration = 300): Promise<void> {
  return new Promise((resolve) => {
    const flash = document.createElement('div');
    flash.className = 'flash-overlay';
    container.appendChild(flash);

    setTimeout(() => {
      flash.remove();
      resolve();
    }, duration);
  });
}

/**
 * Runs a countdown animation sequence (3-2-1-BOOM).
 *
 * @param container - The container element to display countdown in
 * @param onComplete - Callback when countdown finishes
 * @returns Cleanup function to cancel the countdown
 */
export function runCountdownSequence(container: HTMLElement, onComplete: () => void): () => void {
  let cancelled = false;
  const countdownOverlay = document.createElement('div');
  countdownOverlay.className = 'detcord-countdown-overlay';
  container.appendChild(countdownOverlay);

  const sequence = ['3', '2', '1', 'BOOM'];
  const delays = [900, 900, 900, 500]; // ms between each step

  const runStep = (index: number): void => {
    if (cancelled || index >= sequence.length) {
      if (!cancelled) {
        countdownOverlay.remove();
        onComplete();
      }
      return;
    }

    const value = sequence[index] ?? '';
    const isBoom = value === 'BOOM';

    // Clear previous content
    countdownOverlay.innerHTML = '';

    // Create countdown element
    const countEl = document.createElement('div');
    countEl.className = isBoom ? 'countdown-boom' : 'countdown-number';
    countEl.textContent = isBoom ? '💥 BOOM' : value;
    countdownOverlay.appendChild(countEl);

    // Add shake effect on each number
    shakeElement(container);

    // If this is BOOM, add flash effect
    if (isBoom) {
      flashElement(container);
    }

    // Schedule next step
    setTimeout(() => runStep(index + 1), delays[index]);
  };

  // Start the sequence
  runStep(0);

  // Return cleanup function
  return () => {
    cancelled = true;
    countdownOverlay.remove();
  };
}

/**
 * Status messages to rotate during deletion
 */
export const STATUS_MESSAGES = [
  // Classic
  'Erasing evidence...',
  'Gone. Reduced to atoms...',
  'Making messages disappear...',
  'Cleaning up the mess...',
  'Scrubbing the timeline...',
  'History? What history?',
  'Deleting with extreme prejudice...',
  'Messages go brrr...',
  'Witness protection program activated...',
  'Nothing to see here...',
  'Vanishing into thin air...',
  'Clearing the paper trail...',
  'Memory hole activated...',
  'Shredding the receipts...',
  'Digital amnesia in progress...',

  // Movie references
  'I have a particular set of skills...',
  'These are not the messages you seek...',
  'Hasta la vista, messages...',
  'You shall not pass... to the server...',
  "I'll be back... to delete more...",
  'Say hello to my little delete button...',
  "You can't handle the deletion...",
  "Here's Johnny... deleting stuff...",
  'Run, messages. Run!',
  'To delete, or not to delete...',

  // Tech humor
  'sudo rm -rf messages/*',
  'git reset --hard origin/empty',
  'DROP TABLE messages;',
  'Garbage collection in progress...',
  'Defragmenting your past...',
  '/dev/null is hungry...',
  'Bit by bit, byte by byte...',
  'Recursively removing regrets...',
  'Purging the cache of shame...',
  'malloc failed: no space for cringe...',

  // Dramatic
  'The cleansing has begun...',
  'Reducing digital footprint...',
  'Scorched earth protocol active...',
  'Purification in progress...',
  'Dawn of a new timeline...',
  'Rising from the ashes...',
  'Rewriting history...',
  'The great purge continues...',

  // Casual/Funny
  'Oops, did I delete that?',
  'Messages? What messages?',
  'Spring cleaning, Discord edition...',
  'Making Marie Kondo proud...',
  'This sparks no joy... deleted!',
  'Yeeting messages into the void...',
  'Sending to /dev/null...',
  'Poof! Gone!',
  'And just like that... gone.',
  'Magic tricks with data...',
  'Abracadabra... disappearo!',
  'Thanos snapping messages...',
  "I don't remember posting that...",
  'What happens in Discord stays... deleted',
  'Ctrl+Z? Never heard of her...',

  // Progress updates
  'Still going strong...',
  'No rest for the wicked...',
  'On a roll here...',
  'Making good progress...',
  'Almost there... probably...',
  'Keep calm and delete on...',
  'One message at a time...',
  'Patience, young grasshopper...',

  // Philosophical
  'To exist is temporary...',
  'All things must pass...',
  'Entropy always wins...',
  'Nothing lasts forever...',
  'Change is the only constant...',
  'Let go of the past...',
  'New beginnings require endings...',

  // Misc
  'Beep boop, messages go poof...',
  'Cleaning up after past you...',
  'Future you will thank me...',
  'The void welcomes all...',
  'Processing regret removal...',
  'Sanitizing the timeline...',
  'Removing evidence of existence...',
  'Making room for new mistakes...',
  'Out with the old...',
  'Decluttering your digital life...',
  'Memory? What memory?',
  'The internet forgets nothing... except this.',
  'Removing traces of 3am you...',
  'Your secrets are safe... nowhere.',
  'Deleting faster than you can type...',
];

/**
 * Creates a rotating status message manager.
 * Cycles through messages with fade animation.
 *
 * @param element - The element to update with status messages
 * @param intervalMs - Interval between message changes (default: 3000)
 * @returns Object with start() and stop() methods
 */
export function createStatusRotator(
  element: HTMLElement,
  intervalMs = 3000,
): { start: () => void; stop: () => void } {
  let intervalId: number | null = null;
  let currentIndex = 0;

  const updateMessage = (): void => {
    // Trigger fade animation
    element.classList.remove('rotating');
    // Force reflow to restart animation
    void element.offsetWidth;
    element.classList.add('rotating');

    // Update text
    element.textContent = STATUS_MESSAGES[currentIndex] ?? STATUS_MESSAGES[0] ?? '';

    // Move to next message
    currentIndex = (currentIndex + 1) % STATUS_MESSAGES.length;
  };

  return {
    start: () => {
      // Show first message immediately
      updateMessage();

      // Start rotation
      intervalId = window.setInterval(updateMessage, intervalMs);
    },
    stop: () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      element.classList.remove('rotating');
    },
  };
}
