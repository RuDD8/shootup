// Portal embeds (Newgrounds, CrazyGames, …) host the HTML/JS on their CDN
// while multiplayer + heavy GLBs stay on our Railway origin. Set
// `window.SHOOTUP` before modules load (see pack-newgrounds.mjs).

function readConfig() {
  const raw = typeof window !== 'undefined' ? window.SHOOTUP : null;
  return raw && typeof raw === 'object' ? raw : {};
}

/** Absolute site origin for assets + WS, e.g. https://shootup.up.railway.app */
export function publicOrigin() {
  const cfg = readConfig();
  if (cfg.origin) return String(cfg.origin).replace(/\/$/, '');
  if (cfg.assets) return String(cfg.assets).replace(/\/$/, '');
  return '';
}

/**
 * Resolve a root-absolute path (`/models/foo.glb`) for the current host.
 * Same-origin when unset; otherwise points at the production CDN/server.
 */
export function assetUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  const origin = publicOrigin();
  if (origin) return `${origin}${p}`;
  return p;
}

/** WebSocket URL for the matchmaking server. */
export function wsUrl() {
  const cfg = readConfig();
  if (cfg.ws) return String(cfg.ws).replace(/\/?$/, '/');

  const origin = publicOrigin();
  if (origin) {
    const u = new URL(origin);
    const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${u.host}/`;
  }

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/`;
}
