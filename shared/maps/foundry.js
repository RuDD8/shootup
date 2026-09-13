import { rotationalGrid, rotatedSpawn } from './util.js';

/**
 * Lava Foundry — medium forge hall with opposing elevated galleries (16×16),
 * a high-low layout in the spirit of CS Nuke's rafters.
 *
 * Full-length raised galleries (4 = 2.6) run along the west and east walls.
 * Each gallery has exactly one staircase — west climbs from the north end,
 * east from the south — so taking the high ground is a flank commitment.
 * Two conveyor walls cross the hall with three gaps each (the chokes); the
 * galleries overlook their own half of mid but the tall conveyors block
 * cross-map sniping. Slag blocks give ground players cover at the chokes
 * and centre steps offer a quick peek over mid.
 *
 * Tiles: 0 open · 1 wall · 2 slag 1.5 · 3 step 0.8 · 4 gallery 2.6.
 */
const TOP = [
  '1111111111111111',
  '1000000000000001',
  '1330000220000001',
  '1220000000000001',
  '1440111001110441',
  '1440000000000441',
  '1440020000200441',
  '1440000330000441',
];

export const FOUNDRY_GRID = rotationalGrid(TOP);

const SPAWN_A = { c: 7, r: 1 };
export const FOUNDRY_SPAWNS = [SPAWN_A, rotatedSpawn(SPAWN_A, 16)];
