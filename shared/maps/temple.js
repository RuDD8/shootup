import { rotationalGrid, rotatedSpawn } from './util.js';

/**
 * Mossy Temple — medium jungle ruin around a climbable ziggurat (16×16),
 * a nod to Krunker's Sky Temple.
 *
 * The centrepiece is a 6×6 stepped pyramid: an 0.8 ring, a 1.5 ring, and a
 * 2.6 summit, climbable from all four sides. The summit sees over every
 * crate and pillar on the map — total information — but it is naked to
 * attack from 360 degrees and every fall is a commitment. Freestanding
 * pillars and crate piles break the courtyard sightlines so ground players
 * can rotate pillar-to-pillar without ever being fully exposed.
 *
 * Tiles: 0 open · 1 wall/pillar · 2 mossy block 1.5 · 3 step 0.8 · 4 summit 2.6.
 */
const TOP = [
  '1111111111111111',
  '1000000000000001',
  '1020010000100201',
  '1000000000000001',
  '1001000000001001',
  '1000033333300001',
  '1020032222300201',
  '1000032442300001',
];

export const TEMPLE_GRID = rotationalGrid(TOP);

const SPAWN_A = { c: 7, r: 1 };
export const TEMPLE_SPAWNS = [SPAWN_A, rotatedSpawn(SPAWN_A, 16)];
