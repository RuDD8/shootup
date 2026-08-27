import { TICK_RATE } from './constants.js';

// How far behind "now" remote avatars are interpolated. The client extrapolates
// forward by the same amount so models line up with server hitboxes.
export const INTERP_DELAY_MS = 90;
export const MAX_LAG_COMP_MS = 220;

export function lagCompTicks(pingMs = 0) {
  const ms = Math.min(MAX_LAG_COMP_MS, Math.max(0, Math.round(pingMs / 2)));
  return Math.round((ms / 1000) * TICK_RATE);
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

/** Pull an interpolated position forward to match the authoritative sim time. */
export function extrapolateRender(x, z, vx, vz, delayMs = INTERP_DELAY_MS) {
  const step = delayMs / 1000;
  return { x: x + vx * step, z: z + vz * step };
}
