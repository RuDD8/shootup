/**
 * FY Snow — a fight yard in the spirit of the CS 1.6 classic.
 *
 * Layout, top to bottom: an open spawn yard, a walled base front with a wide
 * centre gate and one door on each flank, a snow yard with scattered crates,
 * a pair of wall stubs that pinch the approach to mid, and a crate mound in
 * the dead centre that has to be flanked or jumped. The bottom half is the
 * same thing rotated 180 degrees, so neither side gets the better ground.
 *
 * Every row is left-right palindromic and row r equals row 15-r, which gives
 * both mirror and rotational symmetry for free. Run `node _mapcheck.mjs`-style
 * validation (border sealed, connected, no orphan pockets) after any edit.
 */
export const FY_SNOW_SPAWNS = [
  { c: 7, r: 1 },
  { c: 8, r: 14 },
];

// 16×16 row-major grid: 0 open, 1 wall, 2 cover (wood crates / snow piles).
export const FY_SNOW_GRID = [
  '1111111111111111',
  '1000000000000001',
  '1010020000200101',
  '1110110220110111',
  '1000020000200001',
  '1022000000002201',
  '1000110000110001',
  '1000002222000001',
  '1000002222000001',
  '1000110000110001',
  '1022000000002201',
  '1000020000200001',
  '1110110220110111',
  '1010020000200101',
  '1000000000000001',
  '1111111111111111',
].join('');
