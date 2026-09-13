import { rotationalGrid, rotatedSpawn } from './util.js';

/**
 * Neon Alley — small cyberpunk backstreet with a rooftop catwalk (12×12),
 * in the spirit of Krunker Burg's raised mid.
 *
 * Three north-south alleys run between the spawns, split by two solid
 * buildings. A full-width elevated catwalk (4 = 2.6 platform) crosses the
 * middle of the map; ground players squeeze past it through the outer
 * alleys, or climb the stair (low step -> crate) in the centre alley and
 * fight along the top. Catwalk control watches the centre alley both ways,
 * but side-alley flankers pop out right at its blind edges.
 *
 * Tiles: 0 open · 1 wall · 2 crate 1.5 · 3 step 0.8 · 4 catwalk 2.6.
 */
const TOP = [
  '111111111111',
  '100100001001',
  '130100001031',
  '100103001001',
  '100002000001',
  '100444444001',
];

export const NEON_ALLEY_GRID = rotationalGrid(TOP);

const SPAWN_A = { c: 5, r: 1 };
export const NEON_ALLEY_SPAWNS = [SPAWN_A, rotatedSpawn(SPAWN_A, 12)];
