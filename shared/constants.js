// Tuning shared verbatim by the server simulation and the client predictor.
// If the two ever disagree, prediction visibly fights the server, so both
// sides import this exact file rather than keeping parallel copies.

export const TICK_RATE = 60;
export const TICK_DT = 1 / TICK_RATE;

// Snapshots go out every other tick (30 Hz); inputs arrive at the full 60 Hz.
export const SNAPSHOT_INTERVAL = 2;

// World is a grid of 4m columns. 0 = open, 1 = full wall, 2 = waist-high cover
// you can shoot over, jump onto, but not walk through.
export const GRID_SIZE = 16;
export const CELL = 4;
export const WORLD_SIZE = GRID_SIZE * CELL;
export const WALL_H = 4;
export const COVER_H = 1.5;

export const TILE_OPEN = 0;
export const TILE_WALL = 1;
export const TILE_COVER = 2;

// Player is a vertical cylinder; the camera sits at EYE_HEIGHT above its feet.
export const PLAYER_RADIUS = 0.4;
export const PLAYER_HEIGHT = 1.8;
export const EYE_HEIGHT = 1.62;
export const HEAD_HEIGHT = 1.45; // hits above this count as headshots

export const MOVE_SPEED = 5.4;
export const ACCEL = 60;
export const FRICTION = 9;
export const AIR_ACCEL = 8;
export const GRAVITY = 22;
export const JUMP_SPEED = 7.6;
export const STEP_UP = 0.35;

export const MAX_HEALTH = 100;

export const ROUNDS_TO_WIN = 7;
export const COUNTDOWN_SECONDS = 3;
export const ROUND_END_SECONDS = 3.5;
export const MATCH_END_SECONDS = 10;
export const ROUND_TIME_LIMIT = 90;

export const ROOM_CODE_LENGTH = 4;
export const MAX_PITCH = Math.PI / 2 - 0.02;

export const GAME_MODE = {
  DUEL: 'duel',
  DEATHMATCH: 'deathmatch',
};

export const MAX_PLAYERS_DUEL = 2;
export const MAX_PLAYERS_DM = 10;
export const DM_MIN_MINUTES = 3;
export const DM_MAX_MINUTES = 20;
export const DM_DEFAULT_MINUTES = 5;
export const DM_RESPAWN_SECONDS = 3;
export const DM_SPAWN_PROTECT_SECONDS = 2;

export const MATCH_STATE = {
  WAITING: 'waiting',
  COUNTDOWN: 'countdown',
  LIVE: 'live',
  ROUND_OVER: 'roundover',
  MATCH_OVER: 'matchover',
};

// One distinct colour per slot (0–9). Used for avatars and the DM leaderboard.
export const PLAYER_COLORS = [
  '#38bdf8',
  '#fb7185',
  '#34d399',
  '#fbbf24',
  '#a78bfa',
  '#f472b6',
  '#2dd4bf',
  '#fb923c',
  '#818cf8',
  '#4ade80',
];

export function playerColor(slot) {
  return PLAYER_COLORS[slot % PLAYER_COLORS.length];
}

export function clampDmMinutes(value) {
  const n = Number(value) || DM_DEFAULT_MINUTES;
  return Math.max(DM_MIN_MINUTES, Math.min(DM_MAX_MINUTES, Math.round(n)));
}

// Legacy aliases kept for duel scoreboard styling.
export const SLOT_COLORS = PLAYER_COLORS;
export const SLOT_NAMES = ['CYAN', 'ROSE'];
