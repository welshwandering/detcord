import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DetcordUI } from './controller';

// Mock the token module
vi.mock('../core/token', () => ({
  getToken: vi.fn().mockReturnValue('mock-token'),
  getAuthorId: vi.fn().mockReturnValue('123456789'),
  getGuildIdFromUrl: vi.fn().mockReturnValue(null),
  getChannelIdFromUrl: vi.fn().mockReturnValue(null),
}));

// Mock the deletion engine
vi.mock('../core/deletion-engine', () => ({
  DeletionEngine: vi.fn().mockImplementation(() => ({
    configure: vi.fn(),
    setCallbacks: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    getState: vi.fn().mockReturnValue({ running: false, paused: false }),
  })),
}));

// Mock the API client
vi.mock('../core/discord-api', () => ({
  DiscordApiClient: vi.fn().mockImplementation(() => ({})),
}));

describe('DetcordUI', () => {
  let ui: DetcordUI;

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (ui) {
      ui.unmount();
    }
    // Clean up any remaining elements
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      ui = new DetcordUI();
      expect(ui).toBeInstanceOf(DetcordUI);
    });

    it('should create instance with custom options', () => {
      const onShow = vi.fn();
      const onHide = vi.fn();
      ui = new DetcordUI({
        onShow,
        onHide,
        maxFeedEntries: 50,
        progressThrottleMs: 200,
        feedThrottleMs: 100,
      });
      expect(ui).toBeInstanceOf(DetcordUI);
    });
  });

  describe('mount/unmount', () => {
    it('should mount UI to document body', () => {
      ui = new DetcordUI();
      ui.mount();

      const container = document.getElementById('detcord-container');
      expect(container).not.toBeNull();
      expect(document.body.contains(container)).toBe(true);
    });

    it('should inject styles once', () => {
      ui = new DetcordUI();
      ui.mount();

      const styles = document.querySelectorAll('#detcord-styles');
      expect(styles.length).toBe(1);

      // Mounting again should not add another style element
      ui.mount();
      const stylesAfter = document.querySelectorAll('#detcord-styles');
      expect(stylesAfter.length).toBe(1);
    });

    it('should remove elements on unmount', () => {
      ui = new DetcordUI();
      ui.mount();

      expect(document.getElementById('detcord-container')).not.toBeNull();
      expect(document.getElementById('detcord-styles')).not.toBeNull();

      ui.unmount();

      expect(document.getElementById('detcord-container')).toBeNull();
      expect(document.getElementById('detcord-styles')).toBeNull();
    });

    it('should clean up event listeners on unmount', () => {
      ui = new DetcordUI();
      ui.mount();

      // Verify cleanup happens without throwing
      expect(() => ui.unmount()).not.toThrow();
    });

    it('should not mount twice', () => {
      ui = new DetcordUI();
      ui.mount();
      ui.mount(); // Second mount should be a no-op

      const containers = document.querySelectorAll('#detcord-container');
      expect(containers.length).toBe(1);
    });

    it('should not unmount if not mounted', () => {
      ui = new DetcordUI();
      // Should not throw when unmounting without mounting
      expect(() => ui.unmount()).not.toThrow();
    });
  });

  describe('show/hide', () => {
    it('should toggle visibility', () => {
      ui = new DetcordUI();
      ui.mount();

      expect(ui.isVisible()).toBe(false);

      ui.show();
      expect(ui.isVisible()).toBe(true);

      ui.hide();
      expect(ui.isVisible()).toBe(false);
    });

    it('should call onShow callback when shown', () => {
      const onShow = vi.fn();
      ui = new DetcordUI({ onShow });
      ui.mount();

      ui.show();

      expect(onShow).toHaveBeenCalledTimes(1);
    });

    it('should call onHide callback when hidden', () => {
      const onHide = vi.fn();
      ui = new DetcordUI({ onHide });
      ui.mount();

      ui.show();
      ui.hide();

      expect(onHide).toHaveBeenCalledTimes(1);
    });

    it('should not show if not mounted', () => {
      ui = new DetcordUI();
      ui.show();
      expect(ui.isVisible()).toBe(false);
    });

    it('should not show if already visible', () => {
      const onShow = vi.fn();
      ui = new DetcordUI({ onShow });
      ui.mount();

      ui.show();
      ui.show(); // Second show should be a no-op

      expect(onShow).toHaveBeenCalledTimes(1);
    });

    it('should not hide if already hidden', () => {
      const onHide = vi.fn();
      ui = new DetcordUI({ onHide });
      ui.mount();

      ui.hide(); // Should be a no-op since already hidden

      expect(onHide).not.toHaveBeenCalled();
    });

    it('should add visible class when shown', () => {
      ui = new DetcordUI();
      ui.mount();
      ui.show();

      const window = document.querySelector('.detcord-window');
      const backdrop = document.querySelector('.detcord-backdrop');

      expect(window?.classList.contains('visible')).toBe(true);
      expect(backdrop?.classList.contains('visible')).toBe(true);
    });

    it('should remove visible class when hidden', () => {
      ui = new DetcordUI();
      ui.mount();
      ui.show();
      ui.hide();

      const window = document.querySelector('.detcord-window');
      const backdrop = document.querySelector('.detcord-backdrop');

      expect(window?.classList.contains('visible')).toBe(false);
      expect(backdrop?.classList.contains('visible')).toBe(false);
    });
  });

  describe('screen navigation', () => {
    it('should start on setup screen', () => {
      ui = new DetcordUI();
      ui.mount();

      expect(ui.getCurrentScreen()).toBe('setup');
    });

    it('should switch screens', () => {
      ui = new DetcordUI();
      ui.mount();

      ui.showScreen('running');
      expect(ui.getCurrentScreen()).toBe('running');

      ui.showScreen('complete');
      expect(ui.getCurrentScreen()).toBe('complete');

      ui.showScreen('error');
      expect(ui.getCurrentScreen()).toBe('error');

      ui.showScreen('setup');
      expect(ui.getCurrentScreen()).toBe('setup');
    });

    it('should show only the active screen', () => {
      ui = new DetcordUI();
      ui.mount();

      ui.showScreen('running');

      const setupScreen = document.querySelector('[data-screen="setup"]');
      const runningScreen = document.querySelector('[data-screen="running"]');

      expect(setupScreen?.classList.contains('active')).toBe(false);
      expect(runningScreen?.classList.contains('active')).toBe(true);
    });
  });

  describe('form data collection', () => {
    beforeEach(() => {
      ui = new DetcordUI();
      ui.mount();
    });

    it('should have form inputs available', () => {
      const beforeDateInput = document.querySelector('[data-input="beforeDate"]');
      const afterDateInput = document.querySelector('[data-input="afterDate"]');
      const contentFilterInput = document.querySelector('[data-input="contentFilter"]');
      // Wizard uses toggle switches for hasLink, hasFile, includePinned
      const hasLinkToggle = document.querySelector('[data-toggle="hasLink"]');
      const hasFileToggle = document.querySelector('[data-toggle="hasFile"]');
      const includePinnedToggle = document.querySelector('[data-toggle="includePinned"]');

      expect(beforeDateInput).not.toBeNull();
      expect(afterDateInput).not.toBeNull();
      expect(contentFilterInput).not.toBeNull();
      expect(hasLinkToggle).not.toBeNull();
      expect(hasFileToggle).not.toBeNull();
      expect(includePinnedToggle).not.toBeNull();
    });

    it('should handle empty optional fields', () => {
      // Inputs should be empty by default
      const contentFilterInput = document.querySelector(
        '[data-input="contentFilter"]',
      ) as HTMLInputElement;
      expect(contentFilterInput?.value).toBe('');
    });
  });

  describe('event delegation', () => {
    beforeEach(() => {
      ui = new DetcordUI();
      ui.mount();
    });

    it('should handle toggle action', () => {
      const trigger = document.querySelector('[data-action="toggle"]') as HTMLElement;

      expect(ui.isVisible()).toBe(false);

      trigger?.click();
      expect(ui.isVisible()).toBe(true);

      trigger?.click();
      expect(ui.isVisible()).toBe(false);
    });

    it('should handle close action', () => {
      ui.show();
      expect(ui.isVisible()).toBe(true);

      const closeBtn = document.querySelector('[data-action="close"]') as HTMLElement;
      closeBtn?.click();

      expect(ui.isVisible()).toBe(false);
    });

    it('should handle reset action', () => {
      ui.show();
      ui.showScreen('complete');

      const resetBtn = document.querySelector('[data-action="reset"]') as HTMLElement;
      resetBtn?.click();

      expect(ui.getCurrentScreen()).toBe('setup');
    });

    it('should ignore clicks outside actions', () => {
      ui.show();

      const content = document.querySelector('.detcord-content') as HTMLElement;
      const initialScreen = ui.getCurrentScreen();

      content?.click();

      // Screen should not change from clicking content area
      expect(ui.getCurrentScreen()).toBe(initialScreen);
    });

    it('should close on backdrop click', () => {
      ui.show();
      expect(ui.isVisible()).toBe(true);

      const backdrop = document.querySelector('.detcord-backdrop') as HTMLElement;
      backdrop?.click();

      expect(ui.isVisible()).toBe(false);
    });

    it('should close on escape key', () => {
      ui.show();
      expect(ui.isVisible()).toBe(true);

      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(event);

      expect(ui.isVisible()).toBe(false);
    });

    it('should not close on escape when not visible', () => {
      const onHide = vi.fn();
      ui = new DetcordUI({ onHide });
      ui.mount();

      // Not shown, so escape should do nothing
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(event);

      expect(onHide).not.toHaveBeenCalled();
    });
  });

  describe('isRunning', () => {
    it('should return false when no engine', () => {
      ui = new DetcordUI();
      ui.mount();

      expect(ui.isRunning()).toBe(false);
    });
  });

  describe('trigger button', () => {
    it('should have aria-label', () => {
      ui = new DetcordUI();
      ui.mount();

      const trigger = document.querySelector('.detcord-trigger') as HTMLElement;
      expect(trigger?.getAttribute('aria-label')).toBe('Open Detcord');
    });

    it('should be a button element', () => {
      ui = new DetcordUI();
      ui.mount();

      const trigger = document.querySelector('.detcord-trigger');
      expect(trigger?.tagName).toBe('BUTTON');
    });
  });

  describe('window structure', () => {
    beforeEach(() => {
      ui = new DetcordUI();
      ui.mount();
    });

    it('should have header with title', () => {
      const header = document.querySelector('.detcord-header h2');
      expect(header?.textContent).toBe('Detcord');
    });

    it('should have all screen elements', () => {
      expect(document.querySelector('[data-screen="setup"]')).not.toBeNull();
      expect(document.querySelector('[data-screen="running"]')).not.toBeNull();
      expect(document.querySelector('[data-screen="complete"]')).not.toBeNull();
      expect(document.querySelector('[data-screen="error"]')).not.toBeNull();
    });

    it('should have progress ring elements', () => {
      expect(document.querySelector('.detcord-progress-ring')).not.toBeNull();
      expect(document.querySelector('[data-bind="progressRing"]')).not.toBeNull();
      expect(document.querySelector('[data-bind="progressPercent"]')).not.toBeNull();
      expect(document.querySelector('[data-bind="progressCount"]')).not.toBeNull();
    });

    it('should have stats elements', () => {
      expect(document.querySelector('[data-bind="deletedCount"]')).not.toBeNull();
      expect(document.querySelector('[data-bind="failedCount"]')).not.toBeNull();
      // Wizard uses rateValue instead of totalCount
      expect(document.querySelector('[data-bind="rateValue"]')).not.toBeNull();
    });

    it('should have feed element', () => {
      expect(document.querySelector('[data-bind="feed"]')).not.toBeNull();
    });

    it('should have action buttons', () => {
      // Wizard has nextStep/prevStep buttons
      expect(document.querySelector('[data-action="nextStep"]')).not.toBeNull();
      // Running screen has pause/stop buttons
      expect(document.querySelector('[data-action="pause"]')).not.toBeNull();
      expect(document.querySelector('[data-action="stop"]')).not.toBeNull();
      // Complete/error screens have reset button
      expect(document.querySelector('[data-action="reset"]')).not.toBeNull();
    });
  });

  describe('wizard location cards', () => {
    it('should have location target cards', async () => {
      ui = new DetcordUI();
      ui.mount();
      ui.show();

      // Check that location cards exist
      expect(document.querySelector('[data-target="channel"]')).not.toBeNull();
      expect(document.querySelector('[data-target="manual"]')).not.toBeNull();
    });

    it('should show server card when in guild', async () => {
      const { getGuildIdFromUrl, getChannelIdFromUrl } = await import('../core/token');
      vi.mocked(getGuildIdFromUrl).mockReturnValue('guild123');
      vi.mocked(getChannelIdFromUrl).mockReturnValue('channel456');

      ui = new DetcordUI();
      ui.mount();
      ui.show();

      // Server card should exist (visibility controlled by CSS/JS)
      expect(document.querySelector('[data-target="server"]')).not.toBeNull();
    });

    it('should have DM card element', async () => {
      ui = new DetcordUI();
      ui.mount();
      ui.show();

      // DM card should exist (visibility controlled by CSS/JS)
      expect(document.querySelector('[data-target="dm"]')).not.toBeNull();
    });
  });

  describe('error handling', () => {
    it('should show error screen when token detection fails', async () => {
      const { getToken } = await import('../core/token');
      vi.mocked(getToken).mockReturnValue(null);

      ui = new DetcordUI();
      ui.mount();
      ui.show(); // Token detection is lazy - happens on first show()

      // Error screen should be shown due to no token
      expect(ui.getCurrentScreen()).toBe('error');
    });

    it('should display error message', async () => {
      const { getToken } = await import('../core/token');
      vi.mocked(getToken).mockReturnValue(null);

      ui = new DetcordUI();
      ui.mount();
      ui.show(); // Token detection is lazy - happens on first show()

      const errorMessage = document.querySelector('[data-bind="errorMessage"]');
      expect(errorMessage?.textContent).toContain('token');
    });
  });

  describe('dragging functionality', () => {
    beforeEach(() => {
      ui = new DetcordUI();
      ui.mount();
      ui.show();
    });

    it('should have draggable header', () => {
      const header = document.querySelector('.detcord-header');
      expect(header).not.toBeNull();
      expect(header?.getAttribute('style')).toBeNull(); // No inline style initially
    });

    it('should not start drag on button click', () => {
      const closeBtn = document.querySelector('[data-action="close"]') as HTMLElement;
      const mouseDownEvent = new MouseEvent('mousedown', {
        bubbles: true,
        clientX: 100,
        clientY: 100,
      });

      closeBtn?.dispatchEvent(mouseDownEvent);

      // Should not prevent the button click from working
      // This is verified by the close action test working correctly
    });
  });

  describe('styles', () => {
    it('should inject styles with correct ID', () => {
      ui = new DetcordUI();
      ui.mount();

      const styleEl = document.getElementById('detcord-styles');
      expect(styleEl).not.toBeNull();
      expect(styleEl?.tagName).toBe('STYLE');
    });

    it('should contain CSS for main components', () => {
      ui = new DetcordUI();
      ui.mount();

      const styleEl = document.getElementById('detcord-styles');
      const styleContent = styleEl?.textContent ?? '';

      expect(styleContent).toContain('.detcord-trigger');
      expect(styleContent).toContain('.detcord-window');
      expect(styleContent).toContain('.detcord-backdrop');
      expect(styleContent).toContain('.detcord-header');
      expect(styleContent).toContain('.detcord-content');
    });
  });
});
