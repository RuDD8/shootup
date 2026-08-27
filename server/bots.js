import { EYE_HEIGHT, MAX_PITCH, MATCH_STATE } from '../shared/constants.js';
import { raycastWorld } from '../shared/physics.js';
import { WEAPONS, PRIMARY_WEAPON_IDS } from '../shared/weapons.js';

const KEY = {
  FORWARD: 1,
  BACK: 2,
  LEFT: 4,
  RIGHT: 8,
  JUMP: 16,
  SHOOT: 32,
  RELOAD: 64,
  ZOOM: 128,
};

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
    yaw,
    pitch,
  };
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

function computeBotInput(match, player) {
  if (!match.arena) {
    return decodeInput(0, player.yaw, player.pitch);
  }

  const target = pickTarget(match, player);
  if (!target) {
    return decodeInput(0, player.yaw, player.pitch);
  }

  const dx = target.x - player.x;
  const dz = target.z - player.z;
  const dy = target.y + EYE_HEIGHT * 0.92 - (player.y + EYE_HEIGHT);
  const horiz = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dx, -dz);
  const pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, Math.atan2(dy, Math.max(horiz, 0.01))));

  if (!player.botState) {
    player.botState = { strafe: 1, nextStrafeTick: match.tick + 90 };
  }
  if (match.tick >= player.botState.nextStrafeTick) {
    player.botState.strafe = player.botState.strafe > 0 ? -1 : 1;
    player.botState.nextStrafeTick = match.tick + 60 + Math.floor(Math.random() * 90);
  }

  let mask = 0;
  const weapon = WEAPONS[player.weaponId] || WEAPONS.pistol;
  const canSee = hasLineOfSight(match, player, target);

  if (horiz > 10) {
    mask |= KEY.FORWARD;
  } else if (horiz < 4) {
    mask |= KEY.BACK;
  }

  if (player.botState.strafe > 0) mask |= KEY.RIGHT;
  else mask |= KEY.LEFT;

  if (player.onGround && horiz > 6 && match.tick % 150 < 8) {
    mask |= KEY.JUMP;
  }

  if (player.ammo <= 0 && player.reloadUntilTick === 0) {
    mask |= KEY.RELOAD;
  } else if (
    match.state === MATCH_STATE.LIVE &&
    canSee &&
    horiz < 42 &&
    player.ammo > 0
  ) {
    mask |= KEY.SHOOT;
    if (player.weaponId === 'sniper' && horiz > 12) {
      mask |= KEY.ZOOM;
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

export function randomPrimaryWeaponId(rand = Math.random) {
  return PRIMARY_WEAPON_IDS[Math.floor(rand() * PRIMARY_WEAPON_IDS.length)];
}
