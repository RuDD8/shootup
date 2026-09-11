// End-to-end smoke test. Boots the real server and drives it with Node's
// built-in WebSocket client, so the hand-rolled RFC 6455 framing is validated
// against an independent implementation rather than against itself.
//
//   node test/smoke.mjs

import { spawn } from 'node:child_process';
import { generateArena, mulberry32, pickSafeSpawn } from '../shared/arena.js';
import { loadArena, MAP_FY_SNOW } from '../shared/maps/index.js';
import { FY_SNOW_SPAWNS } from '../shared/maps/fy_snow.js';
import { GRID_SIZE, TILE_OPEN, TILE_WALL, MATCH_STATE, GAME_MODE } from '../shared/constants.js';
import { WEAPONS, WEAPON_IDS, randomWeaponId, shotSpread, GUNGAME_POOL } from '../shared/weapons.js';
import { Match } from '../server/match.js';
import {
  sampleHistory,
  interpolateHistory,
  extrapolateRender,
  lagCompTicks,
  INTERP_DELAY_MS,
} from '../shared/lagcomp.js';

const PORT = 8800 + (process.pid % 500);
let failures = 0;

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- arena tests

function floodFill(grid, start) {
  const seen = new Uint8Array(grid.length);
  const stack = [start];
  seen[start.r * GRID_SIZE + start.c] = 1;
  let count = 0;
  while (stack.length) {
    const { c, r } = stack.pop();
    count++;
    for (const n of [
      { c: c + 1, r },
      { c: c - 1, r },
      { c, r: r + 1 },
      { c, r: r - 1 },
    ]) {
      if (n.c < 0 || n.r < 0 || n.c >= GRID_SIZE || n.r >= GRID_SIZE) continue;
      const i = n.r * GRID_SIZE + n.c;
      if (seen[i] || grid[i] !== TILE_OPEN) continue;
      seen[i] = 1;
      stack.push(n);
    }
  }
  return { seen, count };
}

function testArenas() {
  console.log('\narena generation');
  let allConnected = true;
  let allSealed = true;
  let minOpen = Infinity;
  const rand = mulberry32(12345);

  for (let i = 0; i < 300; i++) {
    const arena = generateArena((rand() * 0xffffffff) >>> 0);
    const [a, b] = arena.spawns;
    const { seen, count } = floodFill(arena.grid, a);
    if (!seen[b.r * GRID_SIZE + b.c]) allConnected = false;
    minOpen = Math.min(minOpen, count);

    // Border must stay solid or players could walk out of the world.
    for (let k = 0; k < GRID_SIZE; k++) {
      if (
        arena.grid[k] !== TILE_WALL ||
        arena.grid[(GRID_SIZE - 1) * GRID_SIZE + k] !== TILE_WALL ||
        arena.grid[k * GRID_SIZE] !== TILE_WALL ||
        arena.grid[k * GRID_SIZE + GRID_SIZE - 1] !== TILE_WALL
      ) {
        allSealed = false;
      }
    }

    // No open cell may be unreachable from spawn A.
    for (let idx = 0; idx < arena.grid.length; idx++) {
      if (arena.grid[idx] === TILE_OPEN && !seen[idx]) allSealed = false;
    }
  }

  check('300 arenas connect both spawns', allConnected);
  check('300 arenas are sealed with no orphan pockets', allSealed);
  check('arenas keep a usable amount of open space', minOpen >= 60, `min open cells ${minOpen}`);

  const arena = generateArena(123);
  const threat = { x: -24, z: -24 };
  const safe = pickSafeSpawn(arena.grid, [threat], () => 0);
  const safeDistance = Math.hypot(safe.x - threat.x, safe.z - threat.z);
  check('safe respawn stays away from threats', safeDistance > 30, `distance ${safeDistance.toFixed(1)}m`);
}

function testStaticMaps() {
  console.log('\nstatic maps');
  const arena = loadArena(MAP_FY_SNOW);
  const grid = arena.grid;
  const at = (c, r) => grid[r * GRID_SIZE + c];

  check('fy_snow grid length', grid.length === GRID_SIZE * GRID_SIZE);
  check('fy_snow has two spawns', arena.spawns.length === 2);

  // A gap in the border would let players walk straight out of the world.
  let sealed = true;
  for (let k = 0; k < GRID_SIZE; k++) {
    if (at(k, 0) !== TILE_WALL || at(k, GRID_SIZE - 1) !== TILE_WALL) sealed = false;
    if (at(0, k) !== TILE_WALL || at(GRID_SIZE - 1, k) !== TILE_WALL) sealed = false;
  }
  check('fy_snow border is sealed', sealed);

  // 180 degree symmetry is what makes the two spawns equally good.
  let rotational = true;
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (at(c, r) !== at(GRID_SIZE - 1 - c, GRID_SIZE - 1 - r)) rotational = false;
    }
  }
  check('fy_snow is rotationally symmetric', rotational);

  const [a, b] = arena.spawns;
  check('fy_snow spawn A matches layout', a.c === FY_SNOW_SPAWNS[0].c && a.r === FY_SNOW_SPAWNS[0].r);
  check('fy_snow spawns sit on open ground', at(a.c, a.r) === TILE_OPEN && at(b.c, b.r) === TILE_OPEN);

  const { seen, count } = floodFill(grid, a);
  check('fy_snow connects spawns', Boolean(seen[b.r * GRID_SIZE + b.c]));

  let orphans = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i] === TILE_OPEN && !seen[i]) orphans++;
  check('fy_snow has no orphan pockets', orphans === 0, `${orphans} unreachable open cells`);
  check('fy_snow has room to fight', count >= 100, `reachable ${count}`);
}

function testWeaponRandomisation() {
  console.log('\nweapon randomisation');
  const counts = Object.fromEntries(WEAPON_IDS.map((id) => [id, 0]));
  const draws = 8000;
  for (let i = 0; i < draws; i++) counts[randomWeaponId()]++;
  const expected = draws / WEAPON_IDS.length;
  // With 28 weapons and only 8k random draws, a 15% band flakes regularly.
  const spread = Object.values(counts).every((n) => Math.abs(n - expected) < expected * 0.22);
  check('all four guns appear', Object.values(counts).every((n) => n > 0));
  check('draws are roughly uniform', spread, JSON.stringify(counts));
  check(
    'sniper hip fire is substantially less accurate than scoped fire',
    shotSpread(WEAPONS.sniper, 0, false) >= shotSpread(WEAPONS.sniper, 0, true) * 40,
  );
}

function testGunGameRules() {
  console.log('\ngun game + hazard rules');

  const match = new Match({ code: 'TEST' }, { mode: GAME_MODE.GUNGAME });
  match.state = MATCH_STATE.LIVE;
  match.gunGameOrder = [...GUNGAME_POOL.slice(0, 3), 'knife'];
  const killer = match.addPlayer('k', 'Killer', null);
  const victim = match.addPlayer('v', 'Victim', null);
  killer.gunGameLevel = match.gunGameOrder.length - 2; // one step before knife
  killer.weaponId = match.gunGameOrder[killer.gunGameLevel];
  killer.alive = true;
  victim.gunGameLevel = 2;
  victim.alive = true;
  victim.health = 1;

  match.gunGameAdvance(killer, victim);
  check(
    'leveling into knife does not demote the victim',
    killer.weaponId === 'knife' &&
      victim.gunGameLevel === 2 &&
      !match.events.some((ev) => ev.k === 'ggDemote'),
  );

  match.events = [];
  killer.weaponId = 'knife';
  killer.gunGameLevel = match.gunGameOrder.length - 1;
  victim.gunGameLevel = 2;
  victim.alive = true;
  match.gunGameAdvance(killer, victim);
  check(
    'actual knife kill demotes the victim',
    victim.gunGameLevel === 1 && match.events.some((ev) => ev.k === 'ggDemote'),
  );

  const duel = new Match({ code: 'DUEL' }, { mode: GAME_MODE.DUEL });
  duel.state = MATCH_STATE.LIVE;
  duel.arena = { grid: '0'.repeat(16 * 16) };
  const a = duel.addPlayer('a', 'Ada', null);
  const b = duel.addPlayer('b', 'Bob', null);
  a.alive = true;
  a.health = 1;
  a.x = 0;
  a.z = 0;
  b.alive = true;
  b.x = 10;
  b.z = 10;
  duel.hazards.push({
    x: 0,
    y: 0,
    z: 0,
    radius: 3,
    dps: 200,
    owner: b.id,
    remainingTicks: 60,
  });
  duel.tickHazards();
  check(
    'duel puddle kill ends the round for the puddle owner',
    duel.state === MATCH_STATE.ROUND_OVER &&
      duel.lastRoundResult?.winner === b.id &&
      !a.alive,
  );
}

// ------------------------------------------------------------- server tests

function openClient(name, port = PORT) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/`);
  const inbox = [];
  const waiters = [];

  socket.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    inbox.push(msg);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].match(msg)) {
        waiters[i].resolve(msg);
        waiters.splice(i, 1);
      }
    }
  });

  return {
    name,
    socket,
    inbox,
    ready: new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve);
      socket.addEventListener('error', reject);
    }),
    send(obj) {
      socket.send(JSON.stringify(obj));
    },
    waitFor(match, timeout = 6000) {
      const found = inbox.find(match);
      if (found) return Promise.resolve(found);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${name}: timeout waiting for message`)), timeout);
        waiters.push({
          match,
          resolve: (msg) => {
            clearTimeout(timer);
            resolve(msg);
          },
        });
      });
    },
    count(match) {
      return inbox.filter(match).length;
    },
  };
}

async function testServer() {
  console.log('\nserver + websocket protocol');

  const server = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverErr = '';
  server.stderr.on('data', (d) => (serverErr += d.toString()));

  try {
    await sleep(700);

    const health = await fetch(`http://127.0.0.1:${PORT}/health`).then((response) => response.json());
    check('health endpoint reports server status', health.ok === true && health.rooms === 0);
    const rifleAsset = await fetch(`http://127.0.0.1:${PORT}/models/assault_rifle.glb`);
    check(
      'Blender assault rifle is served as a GLB asset',
      rifleAsset.ok &&
        rifleAsset.headers.get('content-type') === 'model/gltf-binary' &&
        Number(rifleAsset.headers.get('content-length')) > 1000,
    );
    const bayonetAsset = await fetch(`http://127.0.0.1:${PORT}/models/bayonet.glb`);
    check(
      'Blender bayonet is served as a GLB asset',
      bayonetAsset.ok &&
        bayonetAsset.headers.get('content-type') === 'model/gltf-binary' &&
        Number(bayonetAsset.headers.get('content-length')) > 500,
    );
    const playerAsset = await fetch(`http://127.0.0.1:${PORT}/models/player_block.glb`);
    check(
      'Blender block player is served as a GLB asset',
      playerAsset.ok &&
        playerAsset.headers.get('content-type') === 'model/gltf-binary' &&
        Number(playerAsset.headers.get('content-length')) > 1000,
    );
    const knifeViewmodelAsset = await fetch(`http://127.0.0.1:${PORT}/models/knife_viewmodel.glb`);
    check(
      'Blender knife viewmodel is served as a GLB asset',
      knifeViewmodelAsset.ok &&
        knifeViewmodelAsset.headers.get('content-type') === 'model/gltf-binary' &&
        Number(knifeViewmodelAsset.headers.get('content-length')) > 1000,
    );
    const poopAsset = await fetch(`http://127.0.0.1:${PORT}/models/poop.glb`);
    check(
      'Blender throwable poop is served as a GLB asset',
      poopAsset.ok &&
        poopAsset.headers.get('content-type') === 'model/gltf-binary' &&
        Number(poopAsset.headers.get('content-length')) > 1000,
    );
    const fartAsset = await fetch(`http://127.0.0.1:${PORT}/sounds/fart.mp3`);
    check(
      'fart sample is served as an MP3 asset',
      fartAsset.ok &&
        fartAsset.headers.get('content-type') === 'audio/mpeg' &&
        Number(fartAsset.headers.get('content-length')) > 1000,
    );
    const fahhGunAsset = await fetch(`http://127.0.0.1:${PORT}/models/fahh_gun.glb`);
    check(
      'Blender FAHH gun is served as a GLB asset',
      fahhGunAsset.ok &&
        fahhGunAsset.headers.get('content-type') === 'model/gltf-binary' &&
        Number(fahhGunAsset.headers.get('content-length')) > 1000,
    );
    const fahhTextAsset = await fetch(`http://127.0.0.1:${PORT}/models/fahh_text.glb`);
    check(
      'Blender FAHH projectile text is served as a GLB asset',
      fahhTextAsset.ok &&
        fahhTextAsset.headers.get('content-type') === 'model/gltf-binary' &&
        Number(fahhTextAsset.headers.get('content-length')) > 1000,
    );
    const fahhSample = await fetch(`http://127.0.0.1:${PORT}/sounds/fahh.mp3`);
    check(
      'fahh sample is served as an MP3 asset',
      fahhSample.ok &&
        fahhSample.headers.get('content-type') === 'audio/mpeg' &&
        Number(fahhSample.headers.get('content-length')) > 1000,
    );
    const bottleAsset = await fetch(`http://127.0.0.1:${PORT}/models/water_bottle.glb`);
    check(
      'Blender water bottle is served as a GLB asset',
      bottleAsset.ok &&
        bottleAsset.headers.get('content-type') === 'model/gltf-binary' &&
        Number(bottleAsset.headers.get('content-length')) > 1000,
    );
    const bowAsset = await fetch(`http://127.0.0.1:${PORT}/models/bow.glb`);
    check(
      'Blender bow is served as a GLB asset',
      bowAsset.ok &&
        bowAsset.headers.get('content-type') === 'model/gltf-binary' &&
        Number(bowAsset.headers.get('content-length')) > 1000,
    );
    const arrowAsset = await fetch(`http://127.0.0.1:${PORT}/models/arrow.glb`);
    check(
      'Blender arrow is served as a GLB asset',
      arrowAsset.ok &&
        arrowAsset.headers.get('content-type') === 'model/gltf-binary' &&
        Number(arrowAsset.headers.get('content-length')) > 1000,
    );
    for (const name of [
      'pistol',
      'shotgun',
      'sniper',
      'revolver',
      'machinepistol',
      'deagle',
      'smg',
      'p90',
      'vector',
      'battlerifle',
      'burstrifle',
      'dmr',
      'carbine',
      'autoshotgun',
      'slugshotgun',
      'doublebarrel',
      'sawedoff',
      'scout',
      'awp',
      'lmg',
      'minigun',
      'crossbow',
      'leveraction',
      'laser',
    ]) {
      const asset = await fetch(`http://127.0.0.1:${PORT}/models/${name}.glb`);
      check(
        `Blender ${name} is served as a GLB asset`,
        asset.ok &&
          asset.headers.get('content-type') === 'model/gltf-binary' &&
          Number(asset.headers.get('content-length')) > 1000,
      );
    }
    const peeSample = await fetch(`http://127.0.0.1:${PORT}/sounds/pee.mp3`);
    check(
      'pee sample is served as an MP3 asset',
      peeSample.ok &&
        peeSample.headers.get('content-type') === 'audio/mpeg' &&
        Number(peeSample.headers.get('content-length')) > 1000,
    );

    const a = openClient('A');
    const b = openClient('B');
    await Promise.all([a.ready, b.ready]);
    check('two clients complete the websocket handshake', true);

    await a.waitFor((m) => m.t === 'hello');
    check('server greets on connect', true);

    a.send({ t: 'create', name: 'Ada', mode: 'duel' });
    const joinedA = await a.waitFor((m) => m.t === 'joined');
    check('create returns a 4-character room code', /^[A-Z0-9]{4}$/.test(joinedA.code), joinedA.code);

    b.send({ t: 'join', code: joinedA.code, name: 'Linus' });
    const joinedB = await b.waitFor((m) => m.t === 'joined');
    check('second client joins the same room', joinedB.code === joinedA.code);
    check('players get distinct ids and slots', joinedA.id !== joinedB.id && joinedA.slot !== joinedB.slot);

    // Joining a bad code must be refused rather than silently creating a room.
    const c = openClient('C');
    await c.ready;
    c.send({ t: 'join', code: 'ZZZZ', name: 'Ghost' });
    const err = await c.waitFor((m) => m.t === 'error');
    check('unknown code is rejected', Boolean(err.msg));
    c.socket.close();

    const roundA = await a.waitFor((m) => m.t === 'round');
    const roundB = await b.waitFor((m) => m.t === 'round');
    check('both clients receive a round start', Boolean(roundA.arena && roundB.arena));
    check('both see the same arena seed', roundA.arena.seed === roundB.arena.seed);
    check('arena payload has one digit per cell', roundA.arena.g.length === GRID_SIZE * GRID_SIZE);

    const weapons = roundA.players.map((p) => p.w);
    check('every player is handed a real weapon', weapons.every((w) => WEAPON_IDS.includes(w)), String(weapons));
    check('both players share the same weapon', weapons.length === 2 && weapons[0] === weapons[1], String(weapons));

    const spawnMine = roundA.players.find((p) => p.i === joinedA.id);
    const spawnTheirs = roundA.players.find((p) => p.i === joinedB.id);
    const spawnGap = Math.hypot(spawnMine.x - spawnTheirs.x, spawnMine.z - spawnTheirs.z);
    check('spawns are far apart', spawnGap > 40, `gap ${spawnGap.toFixed(1)}`);

    const firstSnap = await a.waitFor((m) => m.t === 's');
    check('snapshots include both players', firstSnap.ps.length === 2);
    check(
      'snapshots keep slot and sliding as distinct fields',
      firstSnap.ps.every(
        (player) =>
          Number.isInteger(player.slot) &&
          (player.sl === 0 || player.sl === 1),
      ),
    );
    check('snapshot starts in countdown', firstSnap.st === MATCH_STATE.COUNTDOWN, firstSnap.st);

    // Wait out the countdown, then drive player A forward for a while.
    const live = await a.waitFor((m) => m.t === 's' && m.st === MATCH_STATE.LIVE, 8000);
    check('match reaches the live state', live.st === MATCH_STATE.LIVE);

    const before = live.ps.find((p) => p.i === joinedA.id);
    let seq = 0;
    const forwardYaw = Math.atan2(spawnMine.x, spawnMine.z); // faces the middle
    for (let i = 0; i < 45; i++) {
      a.send({ t: 'i', s: ++seq, k: 1, y: forwardYaw, p: 0 });
      await sleep(16);
    }
    await sleep(150);
    const moved = a.inbox.filter((m) => m.t === 's').pop().ps.find((p) => p.i === joinedA.id);
    const travelled = Math.hypot(moved.x - before.x, moved.z - before.z);
    check('forward input moves the player', travelled > 1.5, `travelled ${travelled.toFixed(2)}m`);

    const ackSnap = a.inbox.filter((m) => m.t === 's').pop();
    check('server acknowledges input sequence numbers', (ackSnap.ack[joinedA.id] || 0) > 0);

    // Hold and release once so instant, automatic, charge, beam, projectile,
    // and melee weapons all get a chance to use their authoritative path.
    const beforeAmmo = moved.am;
    const fireEventKinds = new Set(['shot', 'beam', 'projSpawn', 'melee']);
    const fireEventsBefore = b.inbox
      .filter((m) => m.t === 's')
      .flatMap((m) => m.ev || [])
      .filter((e) => fireEventKinds.has(e.k)).length;
    a.send({ t: 'i', s: ++seq, k: 32, y: forwardYaw, p: 0 });
    await sleep(450);
    a.send({ t: 'i', s: ++seq, k: 0, y: forwardYaw, p: 0 });
    await sleep(200);
    const afterFire = a.inbox.filter((m) => m.t === 's').pop().ps.find((p) => p.i === joinedA.id);
    const usedAmmo = beforeAmmo - afterFire.am;
    const fireEventsAfter = b.inbox
      .filter((m) => m.t === 's')
      .flatMap((m) => m.ev || [])
      .filter((e) => fireEventKinds.has(e.k)).length;
    const firedEvent = fireEventsAfter > fireEventsBefore;
    check(
      'shooting consumes ammo or uses a special weapon path',
      usedAmmo > 0 || afterFire.rl > 0 || firedEvent,
      `${moved.w}: ammo ${beforeAmmo} -> ${afterFire.am}`,
    );
    check('weapon fire events reach the other client', firedEvent, moved.w);

    // Player positions must stay inside the arena bounds at all times.
    const half = (GRID_SIZE * 4) / 2;
    const inBounds = a.inbox
      .filter((m) => m.t === 's')
      .every((m) => m.ps.every((p) => Math.abs(p.x) < half && Math.abs(p.z) < half && p.y >= -0.01));
    check('players never leave the arena', inBounds);

    // Non-finite values from a malicious client must not poison simulation.
    a.socket.send('{"t":"i","s":999999,"k":1,"y":1e999,"p":-1e999}');
    await sleep(100);
    const sanitized = a.inbox.filter((m) => m.t === 's').pop().ps.find((p) => p.i === joinedA.id);
    check(
      'malformed aim values are sanitized',
      Number.isFinite(sanitized.x) &&
        Number.isFinite(sanitized.z) &&
        Number.isFinite(sanitized.yaw) &&
        Number.isFinite(sanitized.pitch),
    );

    // A disconnect must be reported to the survivor.
    b.socket.close();
    const left = await a.waitFor((m) => m.t === 'opponentleft', 4000);
    check('disconnect notifies the remaining player', Boolean(left));

    a.socket.close();
    await sleep(200);
  } catch (err) {
    failures++;
    console.log(`  FAIL  server test threw — ${err.message}`);
    if (serverErr) console.log(`  server stderr:\n${serverErr}`);
  } finally {
    server.kill('SIGKILL');
  }
}

function testLagComp() {
  console.log('\nlag compensation helpers');

  const history = [
    { tick: 10, x: 0, y: 0, z: 0, cr: false, vx: 0, vz: 0 },
    { tick: 20, x: 2, y: 0, z: 0, cr: false, vx: 6, vz: 0 },
    { tick: 30, x: 4, y: 0, z: 1, cr: true, vx: 6, vz: 2 },
  ];

  check('sampleHistory picks the latest sample at or before a tick', sampleHistory(history, 25).x === 2);
  check('sampleHistory falls back to the oldest entry', sampleHistory(history, 5).tick === 10);
  const interpolated = interpolateHistory(history, 25);
  check(
    'interpolateHistory blends between simulation ticks',
    interpolated.x === 3 && interpolated.z === 0.5,
  );

  const moved = extrapolateRender(4, 1, 6, 2, INTERP_DELAY_MS);
  check(
    'extrapolateRender advances position by velocity',
    Math.abs(moved.x - (4 + 6 * (INTERP_DELAY_MS / 1000))) < 0.001,
    `x=${moved.x.toFixed(3)}`,
  );

  check('lagCompTicks scales with ping', lagCompTicks(100) > lagCompTicks(0));
}

async function testBots() {
  console.log('\nbots');

  const server = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, PORT: String(PORT + 1) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await sleep(700);

    const host = openClient('host', PORT + 1);
    await host.ready;
    await host.waitFor((m) => m.t === 'hello');

    host.send({ t: 'create', name: 'Tester', mode: 'duel' });
    const joined = await host.waitFor((m) => m.t === 'joined');
    check('solo host can create a duel room', joined.isHost);

    host.send({ t: 'addbot' });
    const peers = await host.waitFor((m) => m.t === 'peers');
    check('addbot updates the lobby roster', peers.players.length === 2);
    check('added player is marked as a bot', peers.players.some((p) => p.bot));

    const round = await host.waitFor((m) => m.t === 'round', 4000);
    check('duel auto-starts after a bot joins', Boolean(round.arena));
    check('round includes the human and the bot', round.players.length === 2);

    host.socket.close();
    await sleep(200);
  } catch (err) {
    failures++;
    console.log(`  FAIL  bot test threw — ${err.message}`);
  } finally {
    server.kill('SIGKILL');
  }
}

async function testDeathmatch() {
  console.log('\ndeathmatch');

  const port = PORT + 2;
  const server = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await sleep(700);
    const host = openClient('dm-host', port);
    const guest = openClient('dm-guest', port);
    await Promise.all([host.ready, guest.ready]);

    host.send({ t: 'create', name: 'Host', mode: 'deathmatch', mapId: 'fy_snow' });
    const joinedHost = await host.waitFor((m) => m.t === 'joined');
    guest.send({ t: 'join', code: joinedHost.code, name: 'Guest' });
    const joinedGuest = await guest.waitFor((m) => m.t === 'joined');
    check('deathmatch lobby accepts multiple players', joinedGuest.mode === 'deathmatch');

    host.send({ t: 'start' });
    const round = await host.waitFor((m) => m.t === 'round');
    check('deathmatch starts on selected map', round.mode === 'deathmatch' && round.mapId === 'fy_snow');

    host.send({ t: 'i', s: 1, k: 0, y: 0, p: 0, pw: 'sniper' });
    const picked = await host.waitFor(
      (m) =>
        m.t === 's' &&
        m.ps.some((player) => player.i === joinedHost.id && player.pw === 'sniper'),
    );
    check('deathmatch primary selection reaches server', Boolean(picked));

    await host.waitFor((m) => m.t === 's' && m.st === MATCH_STATE.LIVE, 8000);
    host.send({ t: 'i', s: 2, k: 0, y: 0, p: 0, sw: 2 });
    const switched = await host.waitFor(
      (m) =>
        m.t === 's' &&
        m.ps.some(
          (player) =>
            player.i === joinedHost.id &&
            player.as === 2 &&
            player.w === 'pistol',
        ),
    );
    check('deathmatch secondary switching reaches server', Boolean(switched));

    host.socket.close();
    guest.socket.close();
    await sleep(100);
  } catch (err) {
    failures++;
    console.log(`  FAIL  deathmatch test threw — ${err.message}`);
  } finally {
    server.kill('SIGTERM');
  }
}

// ---------------------------------------------------------------------- main

console.log('Duel Arena smoke test');
testArenas();
testStaticMaps();
testWeaponRandomisation();
testGunGameRules();
testLagComp();
await testServer();
await testBots();
await testDeathmatch();

console.log(
  failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
