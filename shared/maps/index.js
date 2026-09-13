import { generateArena, deserializeArena } from '../arena.js';
import { FY_SNOW_GRID, FY_SNOW_SPAWNS } from './fy_snow.js';
import { DUST_BOWL_GRID, DUST_BOWL_SPAWNS } from './dust_bowl.js';
import { NEON_ALLEY_GRID, NEON_ALLEY_SPAWNS } from './neon_alley.js';
import { TEMPLE_GRID, TEMPLE_SPAWNS } from './temple.js';
import { FOUNDRY_GRID, FOUNDRY_SPAWNS } from './foundry.js';
import { HARBOR_GRID, HARBOR_SPAWNS } from './harbor.js';

export const MAP_RANDOM = 'random';
export const MAP_FY_SNOW = 'fy_snow';

export const MAPS = [
  { id: MAP_RANDOM, name: 'Random', procedural: true },
  { id: MAP_FY_SNOW, name: 'FY Snow', procedural: false },
  { id: 'dust_bowl', name: 'Dust Bowl', procedural: false },
  { id: 'neon_alley', name: 'Neon Alley', procedural: false },
  { id: 'temple', name: 'Mossy Temple', procedural: false },
  { id: 'foundry', name: 'Lava Foundry', procedural: false },
  { id: 'harbor', name: 'Harbor', procedural: false },
];

// Hand-authored map data, keyed by id. Grid side length is implied by the
// string length, so maps of different sizes coexist without extra plumbing.
export const STATIC_MAPS = {
  [MAP_FY_SNOW]: { g: FY_SNOW_GRID, spawns: FY_SNOW_SPAWNS },
  dust_bowl: { g: DUST_BOWL_GRID, spawns: DUST_BOWL_SPAWNS },
  neon_alley: { g: NEON_ALLEY_GRID, spawns: NEON_ALLEY_SPAWNS },
  temple: { g: TEMPLE_GRID, spawns: TEMPLE_SPAWNS },
  foundry: { g: FOUNDRY_GRID, spawns: FOUNDRY_SPAWNS },
  harbor: { g: HARBOR_GRID, spawns: HARBOR_SPAWNS },
};

export function mapName(mapId) {
  return MAPS.find((m) => m.id === mapId)?.name || MAPS[0].name;
}

export function normalizeMapId(mapId) {
  return MAPS.some((m) => m.id === mapId) ? mapId : MAP_RANDOM;
}

export function loadArena(mapId, seed) {
  const id = normalizeMapId(mapId);
  const data = STATIC_MAPS[id];
  if (data) {
    return deserializeArena({ seed: 0, g: data.g, spawns: data.spawns });
  }
  return generateArena(seed ?? ((Math.random() * 0xffffffff) >>> 0));
}
