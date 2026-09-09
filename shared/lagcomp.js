import { TICK_RATE } from './constants.js';

// How far behind "now" remote avatars are interpolated. The client extrapolates
// forward by the same amount so models line up with server hitboxes.
export const INTERP_DELAY_MS = 90;
export const MAX_LAG_COMP_MS = 220;

export function lagCompTicks(pingMs = 0) {
  const ms = Math.min(MAX_LAG_COMP_MS, Math.max(0, Math.round(pingMs / 2)));
  return (ms / 1000) * TICK_RATE;
}

export function historyCapacity() {
  return Math.ceil((MAX_LAG_COMP_MS / 1000) * TICK_RATE) + 8;
}

/** Nearest history sample at or before `tick`. */
export function sampleHistory(history, tick) {
  if (!history || history.length === 0) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].tick <= tick) return history[i];
  }
  return history[0];
}

/** Interpolate between history ticks so rewind does not stair-step at 60 Hz. */
export function interpolateHistory(history, tick) {
  if (!history || history.length === 0) return null;
  if (tick <= history[0].tick) return history[0];

  for (let i = 1; i < history.length; i++) {
    const newer = history[i];
    if (newer.tick < tick) continue;
    const older = history[i - 1];
    const span = newer.tick - older.tick;
    const t = span > 0 ? Math.max(0, Math.min(1, (tick - older.tick) / span)) : 0;
    return {
      tick,
      x: older.x + (newer.x - older.x) * t,
      y: older.y + (newer.y - older.y) * t,
      z: older.z + (newer.z - older.z) * t,
      vx: older.vx + (newer.vx - older.vx) * t,
      vy: (older.vy || 0) + ((newer.vy || 0) - (older.vy || 0)) * t,
      vz: older.vz + (newer.vz - older.vz) * t,
      cr: t < 0.5 ? older.cr : newer.cr,
    };
  }
  return history[history.length - 1];
}

/** Pull an interpolated position forward to match the authoritative sim time. */
export function extrapolateRender(x, z, vx, vz, delayMs = INTERP_DELAY_MS) {
  const step = delayMs / 1000;
  return { x: x + vx * step, z: z + vz * step };
}
