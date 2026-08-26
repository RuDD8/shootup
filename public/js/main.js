import * as THREE from '/vendor/three.module.js';
import {
  TICK_DT,
  EYE_HEIGHT,
  MAX_HEALTH,
  MATCH_STATE,
  PLAYER_HEIGHT,
} from '/shared/constants.js';

// Rough barrel lengths, used only to scale the opponent's held weapon.
const AVATAR_GUN_LENGTH = { pistol: 0.5, assault: 1.0, shotgun: 1.05, sniper: 1.55 };
import { deserializeArena } from '/shared/arena.js';
import { stepPlayer, raycastWorld, rayCylinder } from '/shared/physics.js';
import { WEAPONS, shotInterval } from '/shared/weapons.js';

import { Net } from './net.js';
import { InputController, KEY } from './input.js';
import { Audio } from './audio.js';
import { Hud } from './hud.js';
import { ViewModel } from './viewmodel.js';
import { Effects } from './effects.js';
import { createRenderer, createScene, buildArena, createAvatar } from './world.js';

// Render remote players this far in the past so there are always two snapshots
// to interpolate between, even with a little jitter.
const INTERP_DELAY_MS = 90;
const BASE_FOV = 82;
const HIT_RADIUS = 0.45;
const MAX_RANGE = 400;

const $ = (id) => document.getElementById(id);

const canvas = $('scene');
const renderer = createRenderer(canvas);
const scene = createScene();
const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.05, 400);
camera.rotation.order = 'YXZ';

const viewModel = new ViewModel();
const effects = new Effects(scene);
const hud = new Hud();
const audio = new Audio();
const input = new InputController(canvas);
const net = new Net();

const state = {
  phase: 'menu',
  myId: null,
  mySlot: 0,
  myName: 'Player',
  code: null,
  arena: null,
  arenaMesh: null,
  roundNumber: 1,
  target: 7,
  matchState: MATCH_STATE.WAITING,
  timer: 0,
  health: MAX_HEALTH,
  alive: false,
  weaponId: 'pistol',
  zooming: false,
  scores: new Map(),
  players: new Map(),
  local: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, onGround: true },
  smooth: new THREE.Vector3(),
  pending: [],
  seq: 0,
  snapshots: [],
  shake: 0,
  bloom: 0,
  lastCountdownStep: -1,
  serverReloadTicks: 0,
};

const localGun = { ammo: 0, nextShotAt: 0, reloadEndsAt: 0, prevShoot: false };

const tmpOrigin = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const tmpEnd = new THREE.Vector3();
const tmpMuzzle = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();

// ------------------------------------------------------------------- helpers

function weapon() {
  return WEAPONS[state.weaponId] || WEAPONS.pistol;
}

function opponent() {
  for (const [id, p] of state.players) if (id !== state.myId) return p;
  return null;
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function aimDirection(yaw, pitch, out) {
  const cp = Math.cos(pitch);
  return out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
}

/** Nearest world or player hit along a ray, used for local tracer endpoints. */
function localTrace(ox, oy, oz, dir) {
  if (!state.arena) return { dist: MAX_RANGE, kind: 'air' };
  const world = raycastWorld(state.arena.grid, ox, oy, oz, dir.x, dir.y, dir.z, MAX_RANGE);
  let dist = world.hit ? world.dist : MAX_RANGE;
  let kind = world.surface || 'air';

  const foe = opponent();
  if (foe && foe.alive && foe.render) {
    const t = rayCylinder(
      ox, oy, oz,
      dir.x, dir.y, dir.z,
      foe.render.x, foe.render.y, foe.render.z,
      HIT_RADIUS, PLAYER_HEIGHT,
    );
    if (t !== null && t < dist) {
      dist = t;
      kind = 'player';
    }
  }
  return { dist, kind };
}

// Approximate world position of the gun barrel, so tracers leave the weapon
// rather than the middle of the screen.
function muzzleWorld(out) {
  camera.getWorldDirection(forward);
  right.crossVectors(forward, camera.up).normalize();
  return out
    .copy(camera.position)
    .addScaledVector(forward, 0.55)
    .addScaledVector(right, state.zooming ? 0 : 0.16)
    .addScaledVector(camera.up, -0.12);
}

// -------------------------------------------------------------------- firing

function fireLocal() {
  const w = weapon();
  const view = input.viewAngles();

  const ox = state.local.x;
  const oy = state.local.y + EYE_HEIGHT;
  const oz = state.local.z;

  muzzleWorld(tmpMuzzle);
  effects.flash(tmpMuzzle.x, tmpMuzzle.y, tmpMuzzle.z, w.id === 'shotgun' ? 1.5 : 1.1);

  const spreadBase = (w.spread + state.bloom) * (state.zooming ? 0.25 : 1);

  for (let i = 0; i < w.pellets; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * spreadBase;
    const yaw = view.yaw + Math.cos(angle) * radius;
    const pitch = view.pitch + Math.sin(angle) * radius;
    aimDirection(yaw, pitch, tmpDir);

    const { dist, kind } = localTrace(ox, oy, oz, tmpDir);
    tmpEnd.set(ox, oy, oz).addScaledVector(tmpDir, dist);

    effects.tracer(tmpMuzzle, tmpEnd, w.id === 'sniper' ? 0.03 : 0.02);
    if (kind !== 'air') {
      effects.spark(tmpEnd.x, tmpEnd.y, tmpEnd.z, kind, kind === 'player' ? 6 : 4);
    }
  }

  state.bloom = Math.min(w.maxBloom, state.bloom + w.bloom);
  state.shake = Math.min(2.4, state.shake + w.shake * 0.5);
  viewModel.addRecoil(w.recoil * 0.32);
  input.addKick((Math.random() - 0.5) * w.recoil * 0.004, w.recoil * 0.006);
  audio.shot(w.id, 1);
}

function updateLocalGun(mask) {
  const w = weapon();
  const now = performance.now();
  const pressed = (mask & KEY.SHOOT) !== 0;
  const fresh = pressed && !localGun.prevShoot;
  localGun.prevShoot = pressed;

  const canAct = state.matchState === MATCH_STATE.LIVE && state.alive;

  if (localGun.reloadEndsAt) {
    if (now >= localGun.reloadEndsAt) {
      localGun.ammo = w.magazine;
      localGun.reloadEndsAt = 0;
    } else {
      return;
    }
  }

  if (!canAct) return;

  if ((mask & KEY.RELOAD) !== 0 && localGun.ammo < w.magazine) {
    localGun.reloadEndsAt = now + w.reload * 1000;
    audio.reload();
    return;
  }

  const may = w.auto ? pressed : fresh;
  if (!may) return;
  if (now < localGun.nextShotAt) return;

  if (localGun.ammo <= 0) {
    localGun.reloadEndsAt = now + w.reload * 1000;
    audio.reload();
    return;
  }

  localGun.ammo -= 1;
  localGun.nextShotAt = now + shotInterval(w) * 1000;
  fireLocal();
}

// ------------------------------------------------------------------ net flow

net.on('hello', () => {});

net.on('joined', (msg) => {
  state.myId = msg.id;
  state.mySlot = msg.slot;
  state.code = msg.code;
  showLobby(msg.code, msg.players.length);
});

net.on('peers', (msg) => {
  if (state.phase === 'lobby') {
    $('lobby-status').textContent =
      msg.players.length >= 2 ? 'Opponent connected — starting…' : 'Waiting for an opponent…';
  }
});

net.on('error', (msg) => {
  $('menu-error').textContent = msg.msg || 'Something went wrong.';
});

net.on('round', (msg) => {
  state.arena = deserializeArena(msg.arena);
  state.roundNumber = msg.n;
  state.target = msg.target;
  state.matchState = MATCH_STATE.COUNTDOWN;
  state.lastCountdownStep = -1;

  if (state.arenaMesh) state.arenaMesh.dispose();
  state.arenaMesh = buildArena(scene, state.arena);

  // Rebuild the roster: avatars are cheap and this keeps names and colours in
  // sync if anyone reconnected between rounds.
  for (const p of state.players.values()) if (p.avatar) p.avatar.dispose();
  state.players.clear();

  for (const entry of msg.players) {
    const player = {
      id: entry.i,
      slot: entry.slot,
      name: entry.name,
      weaponId: entry.w,
      alive: true,
      score: entry.score,
      avatar: null,
      render: { x: entry.x, y: entry.y, z: entry.z, yaw: entry.yaw },
    };
    state.scores.set(entry.i, entry.score);

    if (entry.i === state.myId) {
      state.weaponId = entry.w;
      state.local.x = entry.x;
      state.local.y = entry.y;
      state.local.z = entry.z;
      state.local.vx = 0;
      state.local.vy = 0;
      state.local.vz = 0;
      state.local.onGround = true;
      input.yaw = entry.yaw;
      input.pitch = 0;
      input.kickYaw = 0;
      input.kickPitch = 0;
    } else {
      player.avatar = createAvatar(scene, entry.slot);
      player.avatar.setWeaponLength(AVATAR_GUN_LENGTH[entry.w] || 1);
    }
    state.players.set(entry.i, player);
  }

  state.health = MAX_HEALTH;
  state.alive = true;
  state.pending.length = 0;
  state.snapshots.length = 0;
  state.smooth.set(0, 0, 0);
  state.bloom = 0;
  state.shake = 0;
  effects.reset();

  localGun.ammo = weapon().magazine;
  localGun.nextShotAt = 0;
  localGun.reloadEndsAt = 0;
  localGun.prevShoot = false;

  viewModel.setWeapon(state.weaponId);

  const foe = opponent();
  hud.setNames(state.myName, foe ? foe.name : 'Rival');
  hud.setRound(msg.n, msg.target);
  hud.setScores(state.scores.get(state.myId) || 0, foe ? state.scores.get(foe.id) || 0 : 0);
  hud.setHealth(MAX_HEALTH);
  hud.clearBanner();
  hud.banner(weapon().name.toUpperCase(), `Round ${msg.n}`, 2.2);

  enterGame();
});

net.on('roundover', (msg) => {
  state.matchState = MATCH_STATE.ROUND_OVER;
  for (const entry of msg.scores) state.scores.set(entry.i, entry.score);
  const foe = opponent();
  hud.setScores(state.scores.get(state.myId) || 0, foe ? state.scores.get(foe.id) || 0 : 0);

  if (msg.winner === null) {
    hud.banner('DRAW', 'Time expired', 3);
  } else if (msg.winner === state.myId) {
    hud.banner('ROUND WON', msg.reason === 'headshot' ? 'Headshot' : '', 3);
    audio.roundWin();
  } else {
    hud.banner('ROUND LOST', '', 3);
    audio.roundLoss();
  }
});

net.on('matchover', (msg) => {
  state.matchState = MATCH_STATE.MATCH_OVER;
  const won = msg.winner === state.myId;
  const mine = msg.scores.find((s) => s.i === state.myId);
  const theirs = msg.scores.find((s) => s.i !== state.myId);

  document.exitPointerLock();
  hud.hide();
  $('menu').classList.remove('hidden');
  $('menu-main').classList.add('hidden');
  $('menu-lobby').classList.add('hidden');
  $('menu-result').classList.remove('hidden');
  $('result-title').textContent = won ? 'YOU WIN THE MATCH' : 'YOU LOSE THE MATCH';
  $('result-detail').textContent = `Final score ${mine ? mine.score : 0} – ${theirs ? theirs.score : 0}   ·   ${
    mine ? mine.kills : 0
  } kills`;
  state.phase = 'result';
});

net.on('opponentleft', () => {
  state.matchState = MATCH_STATE.WAITING;
  document.exitPointerLock();
  hud.hide();
  $('menu').classList.remove('hidden');
  $('menu-main').classList.add('hidden');
  $('menu-result').classList.add('hidden');
  $('menu-lobby').classList.remove('hidden');
  $('lobby-status').textContent = 'Your opponent left. Waiting for someone to join…';
  state.phase = 'lobby';
});

net.on('s', onSnapshot);

net.onClose = () => {
  $('disconnected').classList.remove('hidden');
};

function onSnapshot(msg) {
  state.matchState = msg.st;
  state.timer = msg.tm;
  state.snapshots.push({ time: performance.now(), ps: msg.ps });
  if (state.snapshots.length > 24) state.snapshots.shift();

  for (const entry of msg.ps) {
    const player = state.players.get(entry.i);
    if (player) {
      player.alive = entry.al === 1;
      player.weaponId = entry.w;
      player.score = entry.sc;
      state.scores.set(entry.i, entry.sc);
    }

    if (entry.i !== state.myId) continue;

    state.health = entry.h;
    state.alive = entry.al === 1;
    state.serverReloadTicks = entry.rl;

    if (entry.w !== state.weaponId) {
      state.weaponId = entry.w;
      viewModel.setWeapon(entry.w);
    }

    // Reconcile: adopt the authoritative state, then replay everything the
    // server has not acknowledged yet.
    const ack = msg.ack[state.myId] || 0;
    while (state.pending.length && state.pending[0].seq <= ack) state.pending.shift();

    const prevX = state.local.x;
    const prevY = state.local.y;
    const prevZ = state.local.z;

    state.local.x = entry.x;
    state.local.y = entry.y;
    state.local.z = entry.z;
    state.local.vx = entry.vx;
    state.local.vy = entry.vy;
    state.local.vz = entry.vz;
    state.local.onGround = entry.g === 1;

    // Only replay when the server is actually moving players, otherwise the
    // client would drift forward during the freeze between rounds.
    if (state.arena && msg.st === MATCH_STATE.LIVE && state.alive) {
      const mult = WEAPONS[state.weaponId].moveMult * (entry.zm ? 0.55 : 1);
      for (const item of state.pending) {
        stepPlayer(state.arena.grid, state.local, item.input, TICK_DT, mult);
      }
    }

    // Fold the correction into a decaying offset instead of snapping the view.
    state.smooth.x += prevX - state.local.x;
    state.smooth.y += prevY - state.local.y;
    state.smooth.z += prevZ - state.local.z;
    if (state.smooth.lengthSq() > 4) state.smooth.set(0, 0, 0);

    // Server ammo wins when it has seen shots we have not, or after a reload.
    if (entry.rl > 0 && !localGun.reloadEndsAt) {
      localGun.reloadEndsAt = performance.now() + (entry.rl / 60) * 1000;
    }
    if (entry.am < localGun.ammo) localGun.ammo = entry.am;
    if (entry.rl === 0 && entry.am > localGun.ammo && !localGun.reloadEndsAt) {
      localGun.ammo = entry.am;
    }
  }

  if (msg.ev && msg.ev.length) handleEvents(msg.ev);
}

function handleEvents(events) {
  for (const ev of events) {
    if (ev.k === 'shot') {
      if (ev.p === state.myId) continue; // already shown by local prediction
      const w = WEAPONS[ev.w] || WEAPONS.pistol;
      const [ox, oy, oz] = ev.o;
      effects.flash(ox, oy, oz, w.id === 'shotgun' ? 1.5 : 1.1);
      tmpOrigin.set(ox, oy, oz);
      for (const hit of ev.hits) {
        tmpEnd.set(hit.x, hit.y, hit.z);
        effects.tracer(tmpOrigin, tmpEnd, w.id === 'sniper' ? 0.03 : 0.02);
        if (hit.s !== 'air') {
          effects.spark(hit.x, hit.y, hit.z, hit.s, hit.s === 'player' ? 6 : 4);
        }
      }
      const distance = Math.hypot(
        ox - state.local.x,
        oy - (state.local.y + EYE_HEIGHT),
        oz - state.local.z,
      );
      audio.shot(w.id, Math.max(0.14, 1 - distance / 70));
    } else if (ev.k === 'hurt') {
      if (ev.p === state.myId) {
        hud.damageFlash(0.28 + (ev.dmg / MAX_HEALTH) * 0.7);
        state.shake = Math.min(3, state.shake + 0.8);
        audio.hurt();
      } else if (ev.by === state.myId) {
        hud.hitmarker(ev.head);
        if (ev.head) audio.headshot();
        else audio.hitmarker();
      }
    } else if (ev.k === 'die') {
      const victim = state.players.get(ev.p);
      const killer = state.players.get(ev.by);
      const victimName = victim ? victim.name : 'Player';
      const killerName = killer ? killer.name : 'Player';
      const tag = ev.head ? ' <i>headshot</i>' : '';
      hud.feed(`<b>${escapeHtml(killerName)}</b> → ${escapeHtml(victimName)}${tag}`);
      if (ev.p === state.myId) state.shake = 2.4;
    }
  }
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

// -------------------------------------------------------------- interpolation

function applyRemoteInterpolation() {
  const buffer = state.snapshots;
  if (buffer.length === 0) return;

  const renderTime = performance.now() - INTERP_DELAY_MS;

  let older = null;
  let newer = null;
  for (let i = buffer.length - 1; i >= 0; i--) {
    if (buffer[i].time <= renderTime) {
      older = buffer[i];
      newer = buffer[i + 1] || null;
      break;
    }
  }
  if (!older) {
    older = buffer[0];
    newer = buffer[1] || null;
  }

  const span = newer ? newer.time - older.time : 0;
  const t = span > 0 ? Math.max(0, Math.min(1, (renderTime - older.time) / span)) : 0;

  for (const [id, player] of state.players) {
    if (id === state.myId) continue;
    const a = older.ps.find((p) => p.i === id);
    if (!a) continue;
    const b = newer ? newer.ps.find((p) => p.i === id) : null;

    const x = b ? a.x + (b.x - a.x) * t : a.x;
    const y = b ? a.y + (b.y - a.y) * t : a.y;
    const z = b ? a.z + (b.z - a.z) * t : a.z;
    const yaw = b ? lerpAngle(a.yaw, b.yaw, t) : a.yaw;

    player.render = { x, y, z, yaw };

    if (player.avatar) {
      player.avatar.group.position.set(x, y, z);
      player.avatar.group.rotation.y = yaw;
      player.avatar.group.visible = a.al === 1;
    }
  }
}

// ----------------------------------------------------------------- game loop

let last = performance.now();
let accumulator = 0;
let prevYaw = 0;
let prevPitch = 0;

function frame(now) {
  requestAnimationFrame(frame);

  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (state.phase === 'game' || state.phase === 'result') {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= TICK_DT && steps < 6) {
      accumulator -= TICK_DT;
      steps++;
      fixedStep();
    }
  }

  input.decayKick(dt);

  const w = weapon();
  state.bloom = Math.max(0, state.bloom - w.bloomDecay * dt);
  state.shake = Math.max(0, state.shake - dt * 6);

  applyRemoteInterpolation();
  updateCamera(dt);

  const moving = Math.hypot(state.local.vx, state.local.vz) > 0.7;
  const reloading = localGun.reloadEndsAt > 0;
  const reloadProgress = reloading
    ? 1 - Math.max(0, (localGun.reloadEndsAt - performance.now()) / (w.reload * 1000))
    : 0;

  viewModel.update(dt, {
    moving,
    onGround: state.local.onGround,
    zooming: state.zooming,
    reloading,
    reloadProgress,
  });

  effects.update(dt);
  hud.update(dt);
  updateHud(reloading);

  renderer.clear();
  renderer.render(scene, camera);
  renderer.clearDepth();
  renderer.render(viewModel.scene, viewModel.camera);
}

function fixedStep() {
  const sampled = input.sample();
  state.seq += 1;

  const decoded = InputController.decode(sampled.mask);
  decoded.yaw = sampled.yaw;
  decoded.pitch = sampled.pitch;

  net.send({
    t: 'i',
    s: state.seq,
    k: sampled.mask,
    y: Math.round(sampled.yaw * 1000) / 1000,
    p: Math.round(sampled.pitch * 1000) / 1000,
  });

  state.zooming = decoded.zoom && weapon().zoom > 1;
  input.zoomFactor = state.zooming ? weapon().zoom : 1;

  const canMove = state.matchState === MATCH_STATE.LIVE && state.alive && state.arena;
  if (canMove) {
    const mult = weapon().moveMult * (state.zooming ? 0.55 : 1);
    stepPlayer(state.arena.grid, state.local, decoded, TICK_DT, mult);
  }

  state.pending.push({ seq: state.seq, input: decoded });
  if (state.pending.length > 200) state.pending.shift();

  updateLocalGun(sampled.mask);
}

function updateCamera(dt) {
  // Decay the reconciliation offset so corrections arrive as a gentle drift.
  state.smooth.multiplyScalar(Math.exp(-dt * 12));

  const view = input.viewAngles();
  const shake = state.shake;
  const jitterX = shake > 0 ? (Math.random() - 0.5) * shake * 0.012 : 0;
  const jitterY = shake > 0 ? (Math.random() - 0.5) * shake * 0.012 : 0;

  camera.position.set(
    state.local.x + state.smooth.x,
    state.local.y + state.smooth.y + EYE_HEIGHT,
    state.local.z + state.smooth.z,
  );
  camera.rotation.set(view.pitch + jitterY, view.yaw + jitterX, 0);

  const targetFov = state.zooming ? BASE_FOV / weapon().zoom : BASE_FOV;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 14);
    camera.updateProjectionMatrix();
  }

  viewModel.look(view.yaw - prevYaw, view.pitch - prevPitch);
  prevYaw = view.yaw;
  prevPitch = view.pitch;
}

function updateHud(reloading) {
  const w = weapon();
  hud.setHealth(state.health);
  hud.setWeapon(w.name, localGun.ammo, w.magazine, reloading);
  hud.setPing(net.ping);
  hud.setScope(state.zooming);

  const spread = (w.spread + state.bloom) * (state.zooming ? 0.25 : 1);
  hud.setCrosshairGap(5 + spread * 620);

  if (state.matchState === MATCH_STATE.COUNTDOWN) {
    const step = Math.ceil(state.timer);
    hud.setTimer(String(Math.max(0, step)));
    if (step !== state.lastCountdownStep) {
      state.lastCountdownStep = step;
      audio.countdown(step);
      if (step > 0) hud.banner(String(step), 'Get ready', 0.9);
    }
  } else if (state.matchState === MATCH_STATE.LIVE) {
    hud.setTimer(String(Math.ceil(state.timer)));
    if (state.lastCountdownStep !== -1) {
      state.lastCountdownStep = -1;
      hud.banner('FIGHT', '', 0.8);
      audio.countdown(0);
    }
  } else {
    hud.setTimer('--');
  }
}

// -------------------------------------------------------------------- screens

function showLobby(code, playerCount) {
  state.phase = 'lobby';
  $('menu-main').classList.add('hidden');
  $('menu-result').classList.add('hidden');
  $('menu-lobby').classList.remove('hidden');
  $('code-display').textContent = code;
  $('lobby-status').textContent =
    playerCount >= 2 ? 'Opponent connected — starting…' : 'Waiting for an opponent…';
}

function enterGame() {
  state.phase = 'game';
  $('menu').classList.add('hidden');
  $('menu-result').classList.add('hidden');
  hud.show();
  input.enabled = true;
  if (!input.locked) $('click-to-play').classList.remove('hidden');
}

function beginPlay() {
  $('click-to-play').classList.add('hidden');
  audio.unlock();
  input.requestLock();
}

// --------------------------------------------------------------------- wiring

$('btn-create').addEventListener('click', () => {
  state.myName = $('name-input').value.trim() || 'Player';
  audio.unlock();
  net.send({ t: 'create', name: state.myName });
});

$('btn-join').addEventListener('click', () => {
  const code = $('code-input').value.trim().toUpperCase();
  if (code.length < 4) {
    $('menu-error').textContent = 'Enter the 4-character code.';
    return;
  }
  state.myName = $('name-input').value.trim() || 'Player';
  $('menu-error').textContent = '';
  audio.unlock();
  net.send({ t: 'join', code, name: state.myName });
});

$('code-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('btn-join').click();
});

$('name-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('btn-create').click();
});

$('btn-copy').addEventListener('click', async () => {
  const link = `${location.origin}/?code=${state.code}`;
  try {
    await navigator.clipboard.writeText(link);
    $('btn-copy').textContent = 'copied!';
  } catch {
    $('btn-copy').textContent = link;
  }
  setTimeout(() => ($('btn-copy').textContent = 'copy link'), 1800);
});

$('click-to-play').addEventListener('click', beginPlay);
canvas.addEventListener('click', () => {
  if (state.phase === 'game' && !input.locked) beginPlay();
});

input.onLockChange = (locked) => {
  if (!locked && state.phase === 'game') {
    $('click-to-play').classList.remove('hidden');
  } else {
    $('click-to-play').classList.add('hidden');
  }
};

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  viewModel.resize(w / h);
});

viewModel.resize(window.innerWidth / window.innerHeight);

// Prefill the code when arriving from a shared link.
const codeParam = new URLSearchParams(location.search).get('code');
if (codeParam) $('code-input').value = codeParam.toUpperCase().slice(0, 4);

net.connect();
requestAnimationFrame(frame);
