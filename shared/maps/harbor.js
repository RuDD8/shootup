import { rotationalGrid, rotatedSpawn } from './util.js';

/**
 * Harbor — the big one: a container port with real verticality (24×24),
 * a Krunker Freight / Burg hybrid built for 10-player deathmatch.
 *
 * Landmarks, each rotated onto both halves:
 *  - Crane nests: 3.4 sniper decks in two corners, climbed crate -> double
 *    stack -> deck. They watch the long dock lanes but not past the
 *    warehouses, and the climb is loud commitment.
 *  - Raised mid: a 0.8 concrete plaza with a 1.5 container core — Burg's
 *    raised mid. Hop up anywhere; holds the centre without hiding you.
 *  - S-bend: staggered wall stubs through the middle so no single sightline
 *    crosses the map.
 *  - Container yards: single (1.5) and double (2.6) stacks to climb, plus
 *    warehouse blocks and 2×2 bunkers for hard cover.
 *
 * Tiles: 0 open · 1 wall · 2 container 1.5 · 3 plaza 0.8 · 4 stack 2.6 ·
 * 5 crane deck 3.4.
 */
const TOP = [
  '111111111111111111111111',
  '100000000000000000000001',
  '105500000000000022000001',
  '105542001111000024000001',
  '100000001111000000030001',
  '100002000000000000000001',
  '101100220000000022001101',
  '101100420000110022001101',
  '100000000000110000000001',
  '100002200000110000220001',
  '100000000033330000000001',
  '100000000032230000000001',
];

export const HARBOR_GRID = rotationalGrid(TOP);

const SPAWN_A = { c: 2, r: 1 };
export const HARBOR_SPAWNS = [SPAWN_A, rotatedSpawn(SPAWN_A, 24)];
