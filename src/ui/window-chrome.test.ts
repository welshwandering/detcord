import { beforeEach, describe, expect, it } from 'vitest';
import { createMiniIndicator, enableWindowDragging } from './window-chrome';

function mouse(type: string, x: number, y: number, target?: EventTarget): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
  (target ?? document).dispatchEvent(event);
  return event;
}

describe('enableWindowDragging', () => {
  let windowEl: HTMLElement;
  let header: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    windowEl = document.createElement('div');
    header = document.createElement('div');
    windowEl.appendChild(header);
    document.body.appendChild(windowEl);
    windowEl.getBoundingClientRect = (): DOMRect =>
      ({ left: 100, top: 100, width: 200, height: 100 }) as DOMRect;
  });

  it('moves the window with the pointer', () => {
    const handle = enableWindowDragging(windowEl, header);
    mouse('mousedown', 150, 150, header);
    mouse('mousemove', 170, 190);
    expect(windowEl.style.left).toBe('220px');
    expect(windowEl.style.top).toBe('190px');
    expect(windowEl.style.transform).toBe('translate(-50%, -50%)');
    handle.dispose();
  });

  it('constrains the window to the viewport', () => {
    const handle = enableWindowDragging(windowEl, header);
    mouse('mousedown', 150, 150, header);
    mouse('mousemove', -5000, -5000);
    expect(windowEl.style.left).toBe('100px');
    expect(windowEl.style.top).toBe('50px');
    handle.dispose();
  });

  it('does not drag from a button inside the header', () => {
    const handle = enableWindowDragging(windowEl, header);
    const button = document.createElement('button');
    button.setAttribute('data-action', 'close');
    header.appendChild(button);
    mouse('mousedown', 150, 150, button);
    mouse('mousemove', 400, 400);
    expect(windowEl.style.left).toBe('');
    handle.dispose();
  });

  it('stops moving once the button is released', () => {
    const handle = enableWindowDragging(windowEl, header);
    mouse('mousedown', 150, 150, header);
    mouse('mouseup', 150, 150);
    mouse('mousemove', 400, 400);
    expect(windowEl.style.left).toBe('');
    handle.dispose();
  });

  it('detaches its listeners on dispose', () => {
    const handle = enableWindowDragging(windowEl, header);
    handle.dispose();
    mouse('mousedown', 150, 150, header);
    mouse('mousemove', 400, 400);
    expect(windowEl.style.left).toBe('');
  });
});

describe('createMiniIndicator', () => {
  it('exposes the ring and percentage bindings the progress view writes to', () => {
    const indicator = createMiniIndicator();
    expect(indicator.getAttribute('data-action')).toBe('maximize');
    expect(indicator.querySelector('[data-bind="miniRing"]')).not.toBeNull();
    expect(indicator.querySelector('[data-bind="miniPercent"]')?.textContent).toBe('0%');
  });
});
