import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const initSpy = vi.fn();
vi.mock('./index', () => ({ init: initSpy }));

describe('userscript entry', () => {
  const globals = globalThis as Record<string, unknown>;

  beforeEach(() => {
    vi.resetModules();
    initSpy.mockClear();
  });

  afterEach(() => {
    delete globals.GM_info;
  });

  it('does nothing when no userscript manager is present', async () => {
    const { bootstrap } = await import('./userscript');
    bootstrap();
    expect(initSpy).not.toHaveBeenCalled();
  });

  it('initialises immediately when the page has already loaded', async () => {
    globals.GM_info = { script: { name: 'Detcord' } };
    Object.defineProperty(document, 'readyState', { configurable: true, value: 'complete' });
    await import('./userscript');
    expect(initSpy).toHaveBeenCalledTimes(1);
  });

  it('waits for the load event when the page is still loading', async () => {
    globals.GM_info = { script: { name: 'Detcord' } };
    Object.defineProperty(document, 'readyState', { configurable: true, value: 'loading' });
    await import('./userscript');
    expect(initSpy).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('load'));
    expect(initSpy).toHaveBeenCalledTimes(1);
  });

  it('exports nothing but bootstrap, so the built IIFE exposes no library surface', async () => {
    const mod = await import('./userscript');
    expect(Object.keys(mod)).toEqual(['bootstrap']);
  });
});
