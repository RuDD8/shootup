import { generateArena, deserializeArena } from '../arena.js';
import { FY_SNOW_GRID, FY_SNOW_SPAWNS } from './fy_snow.js';

export const MAP_RANDOM = 'random';
export const MAP_FY_SNOW = 'fy_snow';

export const MAPS = [
  { id: MAP_RANDOM, name: 'Random', procedural: true },
  { id: MAP_FY_SNOW, name: 'FY Snow', procedural: false },
];

export function mapName(mapId) {
  return MAPS.find((m) => m.id === mapId)?.name || MAPS[0].name;
}

export function normalizeMapId(mapId) {
  return MAPS.some((m) => m.id === mapId) ? mapId : MAP_RANDOM;
}

export function loadArena(mapId, seed) {
  const id = normalizeMapId(mapId);
  if (id === MAP_FY_SNOW) {
    return deserializeArena({ seed: 0, g: FY_SNOW_GRID, spawns: FY_SNOW_SPAWNS });
  }
  return generateArena(seed ?? ((Math.random() * 0xffffffff) >>> 0));
}
