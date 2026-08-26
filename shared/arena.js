import {
  GRID_SIZE,
  CELL,
  WALL_H,
  COVER_H,
  TILE_OPEN,
  TILE_WALL,
  TILE_COVER,
} from './constants.js';

// Deterministic PRNG so an arena can be reproduced from its seed alone, which
// keeps the client build and the server simulation in agreement.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const idx = (c, r) => r * GRID_SIZE + c;

// Spawns sit on the two ends of the main diagonal so the 180 degree rotation
// maps one onto the other exactly.
const SPAWN_A = { c: 2, r: 2 };
const SPAWN_B = { c: GRID_SIZE - 3, r: GRID_SIZE - 3 };

export function tileAt(grid, c, r) {
  if (c < 0 || r < 0 || c >= GRID_SIZE || r >= GRID_SIZE) return TILE_WALL;
  return grid[idx(c, r)];
}

export function tileHeight(tile) {
  if (tile === TILE_WALL) return WALL_H;
  if (tile === TILE_COVER) return COVER_H;
  return 0;
}

// Height of whatever occupies the column containing this world position.
export function solidHeightAt(grid, x, z) {
  const c = Math.floor((x + GRID_SIZE * CELL * 0.5) / CELL);
  const r = Math.floor((z + GRID_SIZE * CELL * 0.5) / CELL);
  return tileHeight(tileAt(grid, c, r));
}

// World-space centre of a cell. The grid is centred on the origin so the
// camera and the meshes share a natural coordinate space.
export function cellCenter(c, r) {
  const half = GRID_SIZE * CELL * 0.5;
  return { x: c * CELL - half + CELL / 2, z: r * CELL - half + CELL / 2 };
}

export function cellOf(x, z) {
  const half = GRID_SIZE * CELL * 0.5;
  return { c: Math.floor((x + half) / CELL), r: Math.floor((z + half) / CELL) };
}

function stamp(grid, c, r, tile) {
  if (c <= 0 || r <= 0 || c >= GRID_SIZE - 1 || r >= GRID_SIZE - 1) return;
  grid[idx(c, r)] = tile;
  // 180 degree rotation keeps the two halves mirror-fair.
  const mc = GRID_SIZE - 1 - c;
  const mr = GRID_SIZE - 1 - r;
  grid[idx(mc, mr)] = tile;
}

function clearAround(grid, c, r, radius) {
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc <= 0 || nr <= 0 || nc >= GRID_SIZE - 1 || nr >= GRID_SIZE - 1) continue;
      grid[idx(nc, nr)] = TILE_OPEN;
    }
  }
}

// Flood fill across walkable cells only. Cover blocks movement, so it does not
// count as walkable; a layout that fences a spawn in with cover is rejected.
function reachableCells(grid, start) {
  const seen = new Uint8Array(GRID_SIZE * GRID_SIZE);
  const queue = [start];
  seen[idx(start.c, start.r)] = 1;
  let count = 0;
  while (queue.length) {
    const { c, r } = queue.pop();
    count++;
    const neighbours = [
      { c: c + 1, r },
      { c: c - 1, r },
      { c, r: r + 1 },
      { c, r: r - 1 },
    ];
    for (const n of neighbours) {
      if (n.c < 0 || n.r < 0 || n.c >= GRID_SIZE || n.r >= GRID_SIZE) continue;
      const i = idx(n.c, n.r);
      if (seen[i]) continue;
      if (grid[i] !== TILE_OPEN) continue;
      seen[i] = 1;
      queue.push(n);
    }
  }
  return { seen, count };
}

function buildCandidate(rand) {
  const grid = new Uint8Array(GRID_SIZE * GRID_SIZE);

  for (let c = 0; c < GRID_SIZE; c++) {
    grid[idx(c, 0)] = TILE_WALL;
    grid[idx(c, GRID_SIZE - 1)] = TILE_WALL;
    grid[idx(0, c)] = TILE_WALL;
    grid[idx(GRID_SIZE - 1, c)] = TILE_WALL;
  }

  // A few long walls to break sightlines into distinct lanes.
  const wallRuns = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < wallRuns; i++) {
    const horizontal = rand() < 0.5;
    const len = 3 + Math.floor(rand() * 4);
    const c0 = 2 + Math.floor(rand() * (GRID_SIZE - 5));
    const r0 = 2 + Math.floor(rand() * (GRID_SIZE - 5));
    for (let k = 0; k < len; k++) {
      stamp(grid, horizontal ? c0 + k : c0, horizontal ? r0 : r0 + k, TILE_WALL);
    }
  }

  // Compact blocks act as room dividers and hard cover.
  const blocks = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < blocks; i++) {
    const w = 2 + Math.floor(rand() * 2);
    const h = 2 + Math.floor(rand() * 2);
    const c0 = 2 + Math.floor(rand() * (GRID_SIZE - 4 - w));
    const r0 = 2 + Math.floor(rand() * (GRID_SIZE - 4 - h));
    for (let dc = 0; dc < w; dc++) {
      for (let dr = 0; dr < h; dr++) stamp(grid, c0 + dc, r0 + dr, TILE_WALL);
    }
  }

  // Waist-high cover scattered in the open, for peeking and jump-ups.
  const covers = 6 + Math.floor(rand() * 6);
  for (let i = 0; i < covers; i++) {
    const c0 = 2 + Math.floor(rand() * (GRID_SIZE - 4));
    const r0 = 2 + Math.floor(rand() * (GRID_SIZE - 4));
    if (tileAt(grid, c0, r0) !== TILE_OPEN) continue;
    const len = 1 + Math.floor(rand() * 3);
    const horizontal = rand() < 0.5;
    for (let k = 0; k < len; k++) {
      stamp(grid, horizontal ? c0 + k : c0, horizontal ? r0 : r0 + k, TILE_COVER);
    }
  }

  // Guarantee elbow room at both spawns after everything else is placed.
  clearAround(grid, SPAWN_A.c, SPAWN_A.r, 1);
  clearAround(grid, SPAWN_B.c, SPAWN_B.r, 1);

  return grid;
}

export function generateArena(seed = (Math.random() * 0xffffffff) >>> 0) {
  const interior = (GRID_SIZE - 2) * (GRID_SIZE - 2);

  for (let attempt = 0; attempt < 60; attempt++) {
    // Vary the seed per attempt so a bad draw does not retry identically.
    const rand = mulberry32((seed + attempt * 0x9e3779b9) >>> 0);
    const grid = buildCandidate(rand);
    const { seen, count } = reachableCells(grid, SPAWN_A);

    if (!seen[idx(SPAWN_B.c, SPAWN_B.r)]) continue;
    if (count < interior * 0.42) continue;

    // Drop anything walled off from the playable region so the map has no
    // sealed pockets that look reachable but are not.
    for (let r = 1; r < GRID_SIZE - 1; r++) {
      for (let c = 1; c < GRID_SIZE - 1; c++) {
        const i = idx(c, r);
        if (grid[i] === TILE_OPEN && !seen[i]) grid[i] = TILE_WALL;
      }
    }

    return { seed, grid, spawns: [{ ...SPAWN_A }, { ...SPAWN_B }] };
  }

  // Fallback: an empty box is dull but always playable.
  const grid = new Uint8Array(GRID_SIZE * GRID_SIZE);
  for (let c = 0; c < GRID_SIZE; c++) {
    grid[idx(c, 0)] = TILE_WALL;
    grid[idx(c, GRID_SIZE - 1)] = TILE_WALL;
    grid[idx(0, c)] = TILE_WALL;
    grid[idx(GRID_SIZE - 1, c)] = TILE_WALL;
  }
  return { seed, grid, spawns: [{ ...SPAWN_A }, { ...SPAWN_B }] };
}

export function serializeArena(arena) {
  return { seed: arena.seed, g: Array.from(arena.grid).join(''), spawns: arena.spawns };
}

export function deserializeArena(data) {
  const grid = new Uint8Array(GRID_SIZE * GRID_SIZE);
  for (let i = 0; i < grid.length; i++) grid[i] = Number(data.g[i]) || 0;
  return { seed: data.seed, grid, spawns: data.spawns };
}
