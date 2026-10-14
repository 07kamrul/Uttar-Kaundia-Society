/** Tile hosts the map talks to; connections are opened only on the map routes. */
const TILE_HOSTS = [
  'https://a.tile.openstreetmap.org',
  'https://b.tile.openstreetmap.org',
  'https://c.tile.openstreetmap.org',
  'https://server.arcgisonline.com',
];

let pending: Promise<void> | null = null;

function addLink(attrs: Record<string, string>): HTMLLinkElement {
  const link = document.createElement('link');
  for (const [key, value] of Object.entries(attrs)) link.setAttribute(key, value);
  document.head.appendChild(link);
  return link;
}

/**
 * Adds map.css (Leaflet + Geoman) and the tile-host preconnects once; the promise
 * resolves when the stylesheet is ready so the map measures its container correctly.
 */
export function loadMapStyles(): Promise<void> {
  if (pending) return pending;
  for (const href of TILE_HOSTS) addLink({ rel: 'preconnect', href });
  pending = new Promise<void>((resolve) => {
    const link = addLink({ rel: 'stylesheet', href: 'map.css', 'data-map-styles': '' });
    link.onload = () => resolve();
    // A missing stylesheet must not block the map.
    link.onerror = () => resolve();
  });
  return pending;
}

/** Test seam: forget that the styles were added. */
export function resetMapStylesForTests(): void {
  pending = null;
}
