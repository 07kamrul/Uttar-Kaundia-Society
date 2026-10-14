import { afterEach, describe, expect, it } from 'vitest';
import { loadMapStyles, resetMapStylesForTests } from './load-map-styles';

describe('loadMapStyles', () => {
  afterEach(() => {
    document.head.querySelectorAll('link').forEach((l) => l.remove());
    resetMapStylesForTests();
  });

  it('adds the map stylesheet and tile preconnects once and resolves on load', async () => {
    const first = loadMapStyles();
    const second = loadMapStyles();
    expect(second).toBe(first);
    const sheets = document.head.querySelectorAll('link[data-map-styles]');
    expect(sheets.length).toBe(1);
    expect(sheets[0].getAttribute('href')).toBe('map.css');
    expect(document.head.querySelectorAll('link[rel="preconnect"]').length).toBe(4);
    (sheets[0] as HTMLLinkElement).onload?.(new Event('load'));
    await expect(first).resolves.toBeUndefined();
  });

  it('still resolves when the stylesheet fails', async () => {
    const p = loadMapStyles();
    (document.head.querySelector('link[data-map-styles]') as HTMLLinkElement).onerror?.(new Event('error'));
    await expect(p).resolves.toBeUndefined();
  });
});
