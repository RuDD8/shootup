import {
  EYE_HEIGHT,
  GRID_SIZE,
  MAX_PITCH,
  MATCH_STATE,
  TICK_DT,
  TILE_OPEN,
} from '../shared/constants.js';
import { cellCenter, cellOf, listSpawnCells } from '../shared/arena.js';
import { raycastWorld } from '../shared/physics.js';
import { PRIMARY_WEAPON_IDS } from '../shared/weapons.js';

const KEY = {
  FORWARD: 1,
  BACK: 2,
  LEFT: 4,
  RIGHT: 8,
  JUMP: 16,
  SHOOT: 32,
  RELOAD: 64,
  ZOOM: 128,
  CROUCH: 256,
  RUN: 512,
};

// How close the crosshair must be before the bot pulls the trigger.
const AIM_THRESHOLD = 0.11;
// After spotting someone, wait this long before the first shot.
const REACTION_MIN_TICKS = 16;
const REACTION_MAX_TICKS = 34;
// Keep tracking the last known position briefly after LOS breaks.
const MEMORY_TICKS = 72;
const REPATH_TICKS = 18;

function decodeInput(mask, yaw, pitch) {
  return {
    forward: (mask & KEY.FORWARD) !== 0,
    back: (mask & KEY.BACK) !== 0,
    left: (mask & KEY.LEFT) !== 0,
    right: (mask & KEY.RIGHT) !== 0,
    jump: (mask & KEY.JUMP) !== 0,
    shoot: (mask & KEY.SHOOT) !== 0,
    reload: (mask & KEY.RELOAD) !== 0,
    zoom: (mask & KEY.ZOOM) !== 0,
    crouch: (mask & KEY.CROUCH) !== 0,
    run: (mask & KEY.RUN) !== 0,
    yaw,
    pitch,
  };
}

function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function lerpAngle(current, target, maxDelta) {
  const d = normalizeAngle(target - current);
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}

function pickTarget(match, player) {
  const targets = match.isDM
    ? match.opponentsOf(player)
    : [match.opponentOf(player)].filter(Boolean);

  let best = null;
  let bestDist = Infinity;
  for (const t of targets) {
    if (!t.alive) continue;
    const d = Math.hypot(t.x - player.x, t.z - player.z);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best;
}

function hasLineOfSight(match, player, target) {
  const ox = player.x;
  const oy = player.y + EYE_HEIGHT;
  const oz = player.z;
  const tx = target.x;
  const ty = target.y + EYE_HEIGHT * 0.92;
  const tz = target.z;

  const dx = tx - ox;
  const dy = ty - oy;
  const dz = tz - oz;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 0.01) return true;

  const inv = 1 / dist;
  const hit = raycastWorld(match.arena.grid, ox, oy, oz, dx * inv, dy * inv, dz * inv, dist);
  return !hit.hit || hit.dist >= dist - 1.2;
}

function aimError(yaw, pitch, dx, dy, dz, horiz) {
  const wantYaw = Math.atan2(-dx, -dz);
  const wantPitch = Math.atan2(dy, Math.max(horiz, 0.01));
  const yawErr = Math.abs(normalizeAngle(yaw - wantYaw));
  const pitchErr = Math.abs(pitch - wantPitch);
  return Math.hypot(yawErr, pitchErr);
}

/** Return the first open cell on a shortest path, or null when no path exists. */
function nextPathCell(grid, start, goal) {
  const index = (c, r) => r * GRID_SIZE + c;
  const startIndex = index(start.c, start.r);
  const goalIndex = index(goal.c, goal.r);
  if (startIndex === goalIndex) return goal;

  const previous = new Int16Array(GRID_SIZE * GRID_SIZE);
  previous.fill(-1);
  const queue = new Int16Array(GRID_SIZE * GRID_SIZE);
  let read = 0;
  let write = 0;
  queue[write++] = startIndex;
  previous[startIndex] = startIndex;

  while (read < write && previous[goalIndex] === -1) {
    const current = queue[read++];
    const c = current % GRID_SIZE;
    const r = Math.floor(current / GRID_SIZE);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= GRID_SIZE || nr >= GRID_SIZE) continue;
      const next = index(nc, nr);
      if (previous[next] !== -1 || grid[next] !== TILE_OPEN) continue;
      previous[next] = current;
      queue[write++] = next;
    }
  }

  if (previous[goalIndex] === -1) return null;
  let step = goalIndex;
  while (previous[step] !== startIndex) step = previous[step];
  return { c: step % GRID_SIZE, r: Math.floor(step / GRID_SIZE) };
}

function randomPatrolCell(match) {
  const cells = listSpawnCells(match.arena.grid);
  return cells[Math.floor(Math.random() * cells.length)] || { c: 2, r: 2 };
}

function initBotState(player, tick) {
  return {
    strafe: Math.random() > 0.5 ? 1 : -1,
    nextStrafeTick: tick + 90,
    hadLos: false,
    lastSeenTick: 0,
    reactAfterTick: Infinity,
    reactionTicks: REACTION_MIN_TICKS + Math.floor(Math.random() * (REACTION_MAX_TICKS - REACTION_MIN_TICKS)),
    aimWobble: Math.random() * Math.PI * 2,
    turnRate: 1.5 + Math.random() * 0.7,
    lastSeen: null,
    patrolCell: null,
    waypoint: null,
    nextPathTick: tick,
  };
}

function computeBotInput(match, player) {
  if (!match.arena) {
    return decodeInput(0, player.yaw, player.pitch);
  }

  if (!player.botState) {
    player.botState = initBotState(player, match.tick);
  }
  const bs = player.botState;

  const target = pickTarget(match, player);
  if (!target) {
    return decodeInput(0, player.yaw, player.pitch);
  }

  const dx = target.x - player.x;
  const dz = target.z - player.z;
  const dy = target.y + EYE_HEIGHT * 0.92 - (player.y + EYE_HEIGHT);
  const horiz = Math.hypot(dx, dz);
  const canSee = hasLineOfSight(match, player, target);

  if (canSee) {
    if (!bs.hadLos) {
      bs.hadLos = true;
      bs.reactAfterTick = match.tick + bs.reactionTicks;
    }
    bs.lastSeenTick = match.tick;
    bs.lastSeen = { x: target.x, y: target.y, z: target.z };
  } else if (match.tick - bs.lastSeenTick > MEMORY_TICKS) {
    bs.hadLos = false;
  }

  const hasMemory = Boolean(bs.lastSeen) && match.tick - bs.lastSeenTick <= MEMORY_TICKS;
  const trackTarget = canSee || hasMemory;

  let wantYaw = player.yaw;
  let wantPitch = player.pitch;

  if (trackTarget) {
    const aimAt = canSee ? target : bs.lastSeen;
    const aimDx = aimAt.x - player.x;
    const aimDz = aimAt.z - player.z;
    const aimDy = aimAt.y + EYE_HEIGHT * 0.92 - (player.y + EYE_HEIGHT);
    const aimHoriz = Math.hypot(aimDx, aimDz);
    const wobble = Math.sin(match.tick * 0.06 + bs.aimWobble) * 0.028;
    wantYaw = Math.atan2(-aimDx, -aimDz) + wobble;
    wantPitch = Math.max(
      -MAX_PITCH,
      Math.min(MAX_PITCH, Math.atan2(aimDy, Math.max(aimHoriz, 0.01)) + wobble * 0.4),
    );
  }

  // When sight is blocked, follow the open-cell graph toward the last seen
  // position. Once memory expires, patrol instead of staring into a wall.
  let navigating = false;
  if (!canSee) {
    const currentCell = cellOf(player.x, player.z);
    const reachedPatrol =
      bs.patrolCell &&
      currentCell.c === bs.patrolCell.c &&
      currentCell.r === bs.patrolCell.r;
    if (!hasMemory && (!bs.patrolCell || reachedPatrol)) {
      bs.patrolCell = randomPatrolCell(match);
    }
    const goal = hasMemory ? cellOf(bs.lastSeen.x, bs.lastSeen.z) : bs.patrolCell;
    if (goal && match.tick >= bs.nextPathTick) {
      bs.nextPathTick = match.tick + REPATH_TICKS;
      bs.waypoint = nextPathCell(match.arena.grid, currentCell, goal);
    }
    if (bs.waypoint) {
      const point = cellCenter(bs.waypoint.c, bs.waypoint.r);
      const navDx = point.x - player.x;
      const navDz = point.z - player.z;
      if (Math.hypot(navDx, navDz) > 0.35) {
        wantYaw = Math.atan2(-navDx, -navDz);
        wantPitch = 0;
        navigating = true;
      }
    }
  }

  const turnMult = canSee ? 1 : 0.45;
  const maxTurn = bs.turnRate * TICK_DT * turnMult;
  const yaw = lerpAngle(player.yaw, wantYaw, maxTurn);
  const pitch = lerpAngle(player.pitch, wantPitch, maxTurn);

  if (match.tick >= bs.nextStrafeTick) {
    bs.strafe = bs.strafe > 0 ? -1 : 1;
    bs.nextStrafeTick = match.tick + 60 + Math.floor(Math.random() * 90);
  }

  let mask = 0;

  if (navigating || horiz > 10) {
    mask |= KEY.FORWARD;
  } else if (horiz < 4) {
    mask |= KEY.BACK;
  }

  if (!navigating) {
    if (bs.strafe > 0) mask |= KEY.RIGHT;
    else mask |= KEY.LEFT;
  }

  if (player.onGround && horiz > 6 && match.tick % 150 < 8) {
    mask |= KEY.JUMP;
  }

  if (player.ammo <= 0 && player.reloadUntilTick === 0) {
    mask |= KEY.RELOAD;
  } else if (match.state === MATCH_STATE.LIVE && canSee && horiz < 38 && player.ammo > 0) {
    const onTarget = aimError(yaw, pitch, dx, dy, dz, horiz) < AIM_THRESHOLD;
    const reacted = match.tick >= bs.reactAfterTick;
    if (onTarget && reacted) {
      mask |= KEY.SHOOT;
      if (player.weaponId === 'sniper' && horiz > 12 && onTarget) {
        mask |= KEY.ZOOM;
      }
    }
  }

  return decodeInput(mask, yaw, pitch);
}

/** Queue one tick of input for every bot in the match. */
export function tickBots(match) {
  if (match.state !== MATCH_STATE.LIVE && match.state !== MATCH_STATE.COUNTDOWN) return;
  if (!match.arena) return;

  for (const player of match.players) {
    if (!player.isBot) continue;

    const input = computeBotInput(match, player);
    player.inputQueue.push({
      seq: player.lastSeq + 1,
      input,
      pw: null,
      sw: 0,
    });
    if (player.inputQueue.length > 24) {
      player.inputQueue.splice(0, player.inputQueue.length - 24);
    }
  }
}

export function createBotState(tick) {
  return initBotState({ yaw: 0, pitch: 0 }, tick);
}

export function randomPrimaryWeaponId(rand = Math.random) {
  return PRIMARY_WEAPON_IDS[Math.floor(rand() * PRIMARY_WEAPON_IDS.length)];
}
