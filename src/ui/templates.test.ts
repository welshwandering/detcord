/**
 * Tests for UI Templates Module
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BUTTON_TEMPLATE,
  ICONS,
  WINDOW_TEMPLATE,
  createConfettiContainer,
  createCountdownOverlay,
  createElement,
  createFeedItem,
  createPreviewItem,
  createPreviewScreenContent,
  createStatusMessageElement,
  parseTemplate,
  updateProgressRing,
} from './templates';

describe('templates module', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('createElement', () => {
    it('creates element with specified tag', () => {
      const el = createElement('div');
      expect(el.tagName).toBe('DIV');
    });

    it('applies class attribute', () => {
      const el = createElement('div', { class: 'my-class' });
      expect(el.className).toBe('my-class');
    });

    it('applies data attributes', () => {
      const el = createElement('div', { 'data-test': 'value', 'data-id': '123' });
      expect(el.dataset.test).toBe('value');
      expect(el.dataset.id).toBe('123');
    });

    it('applies aria attributes', () => {
      const el = createElement('button', { 'aria-label': 'Close', 'aria-hidden': 'true' });
      expect(el.getAttribute('aria-label')).toBe('Close');
      expect(el.getAttribute('aria-hidden')).toBe('true');
    });

    it('applies regular attributes', () => {
      const el = createElement('input', { type: 'text', name: 'username' });
      expect(el.getAttribute('type')).toBe('text');
      expect(el.getAttribute('name')).toBe('username');
    });

    it('appends string children as text nodes', () => {
      const el = createElement('p', {}, ['Hello, ', 'World']);
      expect(el.textContent).toBe('Hello, World');
      expect(el.childNodes.length).toBe(2);
    });

    it('appends Node children directly', () => {
      const span = document.createElement('span');
      span.textContent = 'child';
      const el = createElement('div', {}, [span]);
      expect(el.firstChild).toBe(span);
    });

    it('handles mixed string and Node children', () => {
      const span = document.createElement('span');
      span.textContent = 'node';
      const el = createElement('div', {}, ['text: ', span]);
      expect(el.textContent).toBe('text: node');
    });

    it('returns correctly typed element', () => {
      const input = createElement('input', { type: 'checkbox' });
      expect(input instanceof HTMLInputElement).toBe(true);

      const button = createElement('button', { type: 'submit' });
      expect(button instanceof HTMLButtonElement).toBe(true);
    });
  });

  describe('createFeedItem', () => {
    it('creates list item element', () => {
      const item = createFeedItem('Message content', '2024-01-15T12:00:00Z');
      expect(item.tagName).toBe('LI');
    });

    it('applies correct type class', () => {
      const deleted = createFeedItem('Content', '2024-01-15T12:00:00Z', 'deleted');
      expect(deleted.className).toContain('detcord-feed-item-deleted');

      const skipped = createFeedItem('Content', '2024-01-15T12:00:00Z', 'skipped');
      expect(skipped.className).toContain('detcord-feed-item-skipped');

      const error = createFeedItem('Content', '2024-01-15T12:00:00Z', 'error');
      expect(error.className).toContain('detcord-feed-item-error');

      const info = createFeedItem('Content', '2024-01-15T12:00:00Z', 'info');
      expect(info.className).toContain('detcord-feed-item-info');
    });

    it('includes time element with datetime attribute', () => {
      const item = createFeedItem('Content', '2024-01-15T12:00:00Z');
      const timeEl = item.querySelector('time');
      expect(timeEl).toBeTruthy();
      expect(timeEl?.getAttribute('datetime')).toBe('2024-01-15T12:00:00Z');
    });

    it('includes content in span element', () => {
      const item = createFeedItem('Test message content', '2024-01-15T12:00:00Z');
      const contentEl = item.querySelector('.detcord-feed-content');
      expect(contentEl?.textContent).toBe('Test message content');
    });

    it('defaults to deleted type', () => {
      const item = createFeedItem('Content', '2024-01-15T12:00:00Z');
      expect(item.className).toContain('detcord-feed-item-deleted');
    });
  });

  describe('createPreviewItem', () => {
    it('creates preview item element', () => {
      const item = createPreviewItem('Content', '2024-01-15T12:00:00Z');
      expect(item.className).toContain('detcord-preview-item');
    });

    it('truncates long content', () => {
      const longContent = 'a'.repeat(150);
      const item = createPreviewItem(longContent, '2024-01-15T12:00:00Z');
      const contentEl = item.querySelector('.detcord-preview-content');
      expect(contentEl?.textContent?.length).toBeLessThan(150);
      expect(contentEl?.textContent).toContain('...');
    });

    it('does not truncate short content', () => {
      const shortContent = 'Short message';
      const item = createPreviewItem(shortContent, '2024-01-15T12:00:00Z');
      const contentEl = item.querySelector('.detcord-preview-content');
      expect(contentEl?.textContent).toBe(shortContent);
    });

    it('shows [No content] for empty content', () => {
      const item = createPreviewItem('', '2024-01-15T12:00:00Z');
      const contentEl = item.querySelector('.detcord-preview-content');
      expect(contentEl?.textContent).toBe('[No content]');
    });

    it('includes channel name when provided', () => {
      const item = createPreviewItem('Content', '2024-01-15T12:00:00Z', 'general');
      const metaEl = item.querySelector('.detcord-preview-meta');
      expect(metaEl?.textContent).toContain('general');
    });

    it('shows only date when no channel name', () => {
      const item = createPreviewItem('Content', '2024-01-15T12:00:00Z');
      const metaEl = item.querySelector('.detcord-preview-meta');
      expect(metaEl?.textContent).not.toContain(' - ');
    });
  });

  describe('parseTemplate', () => {
    it('parses HTML string to DocumentFragment', () => {
      const fragment = parseTemplate('<div>Hello</div>');
      expect(fragment instanceof DocumentFragment).toBe(true);
    });

    it('contains parsed elements', () => {
      const fragment = parseTemplate('<div class="test">Content</div>');
      const div = fragment.querySelector('.test');
      expect(div?.textContent).toBe('Content');
    });

    it('handles multiple elements', () => {
      const fragment = parseTemplate('<span>One</span><span>Two</span>');
      expect(fragment.querySelectorAll('span').length).toBe(2);
    });

    it('trims whitespace', () => {
      const fragment = parseTemplate('  <div>Content</div>  ');
      expect(fragment.firstChild?.nodeName).toBe('DIV');
    });
  });

  describe('updateProgressRing', () => {
    it('sets strokeDashoffset based on percentage', () => {
      const ring = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'circle',
      ) as SVGCircleElement;

      updateProgressRing(ring, 0);
      expect(ring.style.strokeDashoffset).toBe('339.292');

      updateProgressRing(ring, 100);
      expect(ring.style.strokeDashoffset).toBe('0');
    });

    it('calculates correct offset for intermediate values', () => {
      const ring = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'circle',
      ) as SVGCircleElement;

      updateProgressRing(ring, 50);
      expect(Number.parseFloat(ring.style.strokeDashoffset)).toBeCloseTo(169.646, 2);
    });
  });

  describe('createPreviewScreenContent', () => {
    it('returns a DocumentFragment', () => {
      const content = createPreviewScreenContent(100, '2 minutes', []);
      expect(content instanceof DocumentFragment).toBe(true);
    });

    it('displays total message count', () => {
      const content = createPreviewScreenContent(42, '1 minute', []);
      // Append to body to query
      const container = document.createElement('div');
      container.appendChild(content);
      expect(container.textContent).toContain('42');
    });

    it('displays sample messages', () => {
      const messages = [
        { id: '1', content: 'First message', timestamp: '2024-01-15T12:00:00Z' },
        { id: '2', content: 'Second message', timestamp: '2024-01-15T12:01:00Z' },
      ];
      const content = createPreviewScreenContent(10, '30 seconds', messages);
      const container = document.createElement('div');
      container.appendChild(content);
      expect(container.textContent).toContain('First message');
      expect(container.textContent).toContain('Second message');
    });

    it('displays estimated time', () => {
      const content = createPreviewScreenContent(100, '5 minutes', []);
      const container = document.createElement('div');
      container.appendChild(content);
      expect(container.textContent?.toLowerCase()).toContain('estimated');
      expect(container.textContent).toContain('5 minutes');
    });

    it('includes warning about irreversibility', () => {
      const content = createPreviewScreenContent(10, '1 minute', []);
      const container = document.createElement('div');
      container.appendChild(content);
      expect(container.querySelector('.warning-banner')).toBeTruthy();
      expect(container.textContent?.toLowerCase()).toContain('cannot be undone');
    });
  });

  describe('createCountdownOverlay', () => {
    it('creates overlay element', () => {
      const overlay = createCountdownOverlay();
      expect(overlay.className).toContain('countdown-overlay');
    });
  });

  describe('createStatusMessageElement', () => {
    it('creates status element', () => {
      const el = createStatusMessageElement();
      expect(el.className).toContain('status-message');
    });

    it('sets initial message', () => {
      const el = createStatusMessageElement('Starting...');
      expect(el.textContent).toBe('Starting...');
    });

    it('handles empty initial message', () => {
      const el = createStatusMessageElement();
      expect(el.textContent).toBe('');
    });
  });

  describe('createConfettiContainer', () => {
    it('creates container element', () => {
      const container = createConfettiContainer();
      expect(container.className).toContain('confetti-container');
    });
  });

  describe('ICONS', () => {
    it('exports icon definitions', () => {
      expect(typeof ICONS).toBe('object');
      expect(Object.keys(ICONS).length).toBeGreaterThan(0);
    });

    it('has valid SVG strings', () => {
      for (const svg of Object.values(ICONS)) {
        expect(svg).toContain('<svg');
        expect(svg).toContain('</svg>');
      }
    });

    it('includes common icons', () => {
      expect(ICONS.bomb).toBeTruthy();
      expect(ICONS.close).toBeTruthy();
      expect(ICONS.pause).toBeTruthy();
      expect(ICONS.play).toBeTruthy();
    });
  });

  describe('BUTTON_TEMPLATE', () => {
    it('is a valid HTML template string', () => {
      expect(typeof BUTTON_TEMPLATE).toBe('string');
      expect(BUTTON_TEMPLATE).toContain('button');
    });

    it('parses to a button element', () => {
      const fragment = parseTemplate(BUTTON_TEMPLATE);
      const button = fragment.querySelector('button');
      expect(button).toBeTruthy();
    });
  });

  describe('WINDOW_TEMPLATE', () => {
    it('is a valid HTML template string', () => {
      expect(typeof WINDOW_TEMPLATE).toBe('string');
      expect(WINDOW_TEMPLATE.length).toBeGreaterThan(100);
    });

    it('contains dialog role for accessibility', () => {
      expect(WINDOW_TEMPLATE).toContain('role="dialog"');
    });

    it('contains aria-modal attribute', () => {
      expect(WINDOW_TEMPLATE).toContain('aria-modal');
    });
  });
});
