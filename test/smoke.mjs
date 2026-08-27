// End-to-end smoke test. Boots the real server and drives it with Node's
// built-in WebSocket client, so the hand-rolled RFC 6455 framing is validated
// against an independent implementation rather than against itself.
//
//   node test/smoke.mjs

import { spawn } from 'node:child_process';
import { generateArena, mulberry32 } from '../shared/arena.js';
import { GRID_SIZE, TILE_OPEN, TILE_WALL, MATCH_STATE } from '../shared/constants.js';
import { WEAPON_IDS, randomWeaponId } from '../shared/weapons.js';
import {
  sampleHistory,
  extrapolateRender,
  lagCompTicks,
  INTERP_DELAY_MS,
} from '../shared/lagcomp.js';

const PORT = 8899;
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
}

function testWeaponRandomisation() {
  console.log('\nweapon randomisation');
  const counts = Object.fromEntries(WEAPON_IDS.map((id) => [id, 0]));
  const draws = 8000;
  for (let i = 0; i < draws; i++) counts[randomWeaponId()]++;
  const expected = draws / WEAPON_IDS.length;
  const spread = Object.values(counts).every((n) => Math.abs(n - expected) < expected * 0.15);
  check('all four guns appear', Object.values(counts).every((n) => n > 0));
  check('draws are roughly uniform', spread, JSON.stringify(counts));
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

    // Firing must consume ammo through the authoritative path.
    const beforeAmmo = moved.am;
    for (let i = 0; i < 8; i++) {
      a.send({ t: 'i', s: ++seq, k: 32, y: forwardYaw, p: 0 });
      await sleep(16);
      a.send({ t: 'i', s: ++seq, k: 0, y: forwardYaw, p: 0 });
      await sleep(16);
    }
    await sleep(200);
    const afterFire = a.inbox.filter((m) => m.t === 's').pop().ps.find((p) => p.i === joinedA.id);
    const usedAmmo = beforeAmmo - afterFire.am;
    check('shooting consumes ammo', usedAmmo > 0 || afterFire.rl > 0, `ammo ${beforeAmmo} -> ${afterFire.am}`);
    check('shot events reach the other client', b.count((m) => m.t === 's' && (m.ev || []).some((e) => e.k === 'shot')) > 0);

    // Player positions must stay inside the arena bounds at all times.
    const half = (GRID_SIZE * 4) / 2;
    const inBounds = a.inbox
      .filter((m) => m.t === 's')
      .every((m) => m.ps.every((p) => Math.abs(p.x) < half && Math.abs(p.z) < half && p.y >= -0.01));
    check('players never leave the arena', inBounds);

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

// ---------------------------------------------------------------------- main

console.log('Duel Arena smoke test');
testArenas();
testWeaponRandomisation();
testLagComp();
await testServer();
await testBots();

console.log(
  failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
