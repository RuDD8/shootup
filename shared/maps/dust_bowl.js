import { rotationalGrid, rotatedSpawn } from './util.js';

/**
 * Dust Bowl — small desert arena built around one power position (12×12).
 *
 * A raised sandstone site (4 = platform) sits dead centre, climbed by a
 * stair ramp on each rotated side: low step -> crate -> platform. Whoever
 * holds the site sees over every crate on the map — but two wall pillars
 * flank it, so ground players always have a covered approach, and the site
 * holder is exposed from both flanks at once. Aim-map pacing: first fight
 * happens within seconds, then the map becomes a battle for the middle.
 *
 * Tiles: 0 open · 1 wall · 2 crate 1.5 · 3 step 0.8 · 4 platform 2.6.
 */
const TOP = [
  '111111111111',
  '100000000001',
  '102000000201',
  '100003000001',
  '100002000021',
  '100104401001',
];

export const DUST_BOWL_GRID = rotationalGrid(TOP);

const SPAWN_A = { c: 5, r: 1 };
export const DUST_BOWL_SPAWNS = [SPAWN_A, rotatedSpawn(SPAWN_A, 12)];
