import {
  TICK_RATE,
  TICK_DT,
  SNAPSHOT_INTERVAL,
  MAX_HEALTH,
  EYE_HEIGHT,
  HEAD_HEIGHT,
  PLAYER_HEIGHT,
  MATCH_STATE,
  COUNTDOWN_SECONDS,
  ROUND_END_SECONDS,
  MATCH_END_SECONDS,
  ROUND_TIME_LIMIT,
  ROUNDS_TO_WIN,
  MAX_PITCH,
} from '../shared/constants.js';
import { generateArena, serializeArena, cellCenter } from '../shared/arena.js';
import { stepPlayer, raycastWorld, rayCylinder } from '../shared/physics.js';
import {
  WEAPONS,
  randomWeaponId,
  shotInterval,
  damageAtRange,
  HEADSHOT_MULT,
} from '../shared/weapons.js';

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

// Hitboxes are a shade wider than the collision cylinder so shots that look
// like they connect actually do.
const HIT_RADIUS = 0.45;
const MAX_SHOT_RANGE = 400;
const INPUT_QUEUE_LIMIT = 6;

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

const IDLE_INPUT = decodeInput(0, 0, 0);

export class Match {
  constructor(room) {
    this.room = room;
    this.players = [];
    this.tick = 0;
    this.state = MATCH_STATE.WAITING;
    this.stateTimer = 0;
    this.roundNumber = 0;
    this.arena = null;
    this.events = [];
    this.lastRoundResult = null;
  }

  addPlayer(id, name, conn) {
    const slot = this.players.length;
    const player = {
      id,
      slot,
      name,
      conn,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      onGround: true,
      yaw: 0,
      pitch: 0,
      health: MAX_HEALTH,
      alive: false,
      weaponId: 'pistol',
      ammo: 0,
      bloom: 0,
      reloadUntilTick: 0,
      nextShotTick: 0,
      prevShoot: false,
      zooming: false,
      score: 0,
      kills: 0,
      deaths: 0,
      inputQueue: [],
      lastInput: { ...IDLE_INPUT },
      lastSeq: 0,
    };
    this.players.push(player);
    return player;
  }

  removePlayer(id) {
    this.players = this.players.filter((p) => p.id !== id);
    this.players.forEach((p, i) => {
      p.slot = i;
    });
    if (this.players.length < 2) {
      this.state = MATCH_STATE.WAITING;
      this.stateTimer = 0;
      this.roundNumber = 0;
      for (const p of this.players) {
        p.score = 0;
        p.alive = false;
      }
    }
  }

  opponentOf(player) {
    return this.players.find((p) => p.id !== player.id) || null;
  }

  queueInput(id, msg) {
    const player = this.players.find((p) => p.id === id);
    if (!player) return;
    const seq = Number(msg.s) || 0;
    const yaw = Number(msg.y) || 0;
    const pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, Number(msg.p) || 0));
    player.inputQueue.push({ seq, input: decodeInput(Number(msg.k) || 0, yaw, pitch) });
    if (player.inputQueue.length > 24) player.inputQueue.splice(0, player.inputQueue.length - 24);
  }

  // ---------------------------------------------------------------- rounds

  beginMatch() {
    this.roundNumber = 0;
    for (const p of this.players) {
      p.score = 0;
      p.kills = 0;
      p.deaths = 0;
    }
    this.startRound();
  }

  startRound() {
    this.roundNumber += 1;
    this.arena = generateArena();
    this.lastRoundResult = null;
    const roundWeapon = randomWeaponId();

    for (const p of this.players) {
      const spawn = this.arena.spawns[p.slot % this.arena.spawns.length];
      const { x, z } = cellCenter(spawn.c, spawn.r);
      p.x = x;
      p.y = 0;
      p.z = z;
      p.vx = 0;
      p.vy = 0;
      p.vz = 0;
      p.onGround = true;
      // Face the middle of the arena so nobody starts staring at a wall.
      p.yaw = Math.atan2(x, z);
      p.pitch = 0;
      p.health = MAX_HEALTH;
      p.alive = true;
      p.weaponId = roundWeapon;
      p.ammo = WEAPONS[p.weaponId].magazine;
      p.bloom = 0;
      p.reloadUntilTick = 0;
      p.nextShotTick = 0;
      p.prevShoot = false;
      p.zooming = false;
      p.inputQueue.length = 0;
      p.lastInput = { ...IDLE_INPUT, yaw: p.yaw, pitch: 0 };
    }

    this.state = MATCH_STATE.COUNTDOWN;
    this.stateTimer = COUNTDOWN_SECONDS;

    this.broadcast({
      t: 'round',
      n: this.roundNumber,
      arena: serializeArena(this.arena),
      target: ROUNDS_TO_WIN,
      players: this.players.map((p) => ({
        i: p.id,
        slot: p.slot,
        name: p.name,
        w: p.weaponId,
        x: p.x,
        y: p.y,
        z: p.z,
        yaw: p.yaw,
        score: p.score,
      })),
    });
  }

  endRound(winner, reason) {
    if (winner) winner.score += 1;
    this.lastRoundResult = {
      winner: winner ? winner.id : null,
      reason,
      scores: this.players.map((p) => ({ i: p.id, score: p.score })),
    };
    this.state = MATCH_STATE.ROUND_OVER;
    this.stateTimer = ROUND_END_SECONDS;
    this.broadcast({
      t: 'roundover',
      winner: winner ? winner.id : null,
      reason,
      scores: this.lastRoundResult.scores,
    });
  }

  // ------------------------------------------------------------------ loop

  update() {
    this.tick += 1;

    if (this.state === MATCH_STATE.WAITING) {
      if (this.players.length === 2) this.beginMatch();
      return;
    }

    this.stateTimer -= TICK_DT;

    switch (this.state) {
      case MATCH_STATE.COUNTDOWN:
        // Look around during the freeze, but no movement or shooting.
        this.consumeInputs({ move: false, shoot: false });
        if (this.stateTimer <= 0) {
          this.state = MATCH_STATE.LIVE;
          this.stateTimer = ROUND_TIME_LIMIT;
        }
        break;

      case MATCH_STATE.LIVE:
        this.consumeInputs({ move: true, shoot: true });
        if (this.stateTimer <= 0) this.endRound(null, 'timeout');
        break;

      case MATCH_STATE.ROUND_OVER:
        if (this.stateTimer <= 0) {
          const leader = this.players.find((p) => p.score >= ROUNDS_TO_WIN);
          if (leader) {
            this.state = MATCH_STATE.MATCH_OVER;
            this.stateTimer = MATCH_END_SECONDS;
            this.broadcast({
              t: 'matchover',
              winner: leader.id,
              scores: this.players.map((p) => ({
                i: p.id,
                score: p.score,
                kills: p.kills,
                deaths: p.deaths,
              })),
            });
          } else {
            this.startRound();
          }
        }
        break;

      case MATCH_STATE.MATCH_OVER:
        if (this.stateTimer <= 0) this.beginMatch();
        break;

      default:
        break;
    }

    if (this.tick % SNAPSHOT_INTERVAL === 0) this.sendSnapshot();
  }

  consumeInputs({ move, shoot }) {
    for (const player of this.players) {
      // One input per tick keeps the client's replay in lockstep; drain two
      // when a burst of packets arrives late so the queue cannot creep.
      let budget = player.inputQueue.length > INPUT_QUEUE_LIMIT ? 2 : 1;
      let consumed = 0;
      while (budget-- > 0) {
        const next = player.inputQueue.shift();
        if (!next) break;
        player.lastInput = next.input;
        player.lastSeq = next.seq;
        this.applyInput(player, next.input, { move, shoot });
        consumed++;
      }
      if (consumed === 0) {
        // Nothing arrived this tick: keep simulating the last known input so
        // movement stays smooth, without re-acking, so the client retains its
        // unacknowledged inputs for replay.
        this.applyInput(player, player.lastInput, { move, shoot }, true);
      }
    }
  }

  applyInput(player, input, { move, shoot }, repeat = false) {
    player.yaw = input.yaw;
    player.pitch = input.pitch;
    player.zooming = Boolean(input.zoom) && WEAPONS[player.weaponId].zoom > 1;

    if (!player.alive) return;

    const weapon = WEAPONS[player.weaponId];

    if (move) {
      const mult = weapon.moveMult * (player.zooming ? 0.55 : 1);
      stepPlayer(this.arena.grid, player, input, TICK_DT, mult);
    }

    if (player.bloom > 0) {
      player.bloom = Math.max(0, player.bloom - weapon.bloomDecay * TICK_DT);
    }

    if (player.reloadUntilTick && this.tick >= player.reloadUntilTick) {
      player.ammo = weapon.magazine;
      player.reloadUntilTick = 0;
    }

    if (!shoot) {
      player.prevShoot = Boolean(input.shoot);
      return;
    }

    const reloading = player.reloadUntilTick > 0;
    const wantsReload = input.reload && !reloading && player.ammo < weapon.magazine;
    if (wantsReload) {
      player.reloadUntilTick = this.tick + Math.round(weapon.reload * TICK_RATE);
      player.prevShoot = Boolean(input.shoot);
      return;
    }

    const pressed = Boolean(input.shoot);
    const freshPress = pressed && !player.prevShoot;
    const mayFire = weapon.auto ? pressed : freshPress && !repeat;
    player.prevShoot = pressed;

    if (!mayFire || reloading) return;
    if (this.tick < player.nextShotTick) return;

    if (player.ammo <= 0) {
      player.reloadUntilTick = this.tick + Math.round(weapon.reload * TICK_RATE);
      return;
    }

    this.fire(player, weapon);
  }

  fire(player, weapon) {
    player.ammo -= 1;
    player.nextShotTick = this.tick + Math.max(1, Math.round(shotInterval(weapon) * TICK_RATE));

    const ox = player.x;
    const oy = player.y + EYE_HEIGHT;
    const oz = player.z;
    const target = this.opponentOf(player);

    const spreadBase = weapon.spread + player.bloom;
    const spread = player.zooming ? spreadBase * 0.25 : spreadBase;

    const impacts = [];
    let totalDamage = 0;
    let headshot = false;

    for (let i = 0; i < weapon.pellets; i++) {
      // Uniform disc offset applied to the aim angles.
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * spread;
      const yaw = player.yaw + Math.cos(angle) * radius;
      const pitch = Math.max(
        -MAX_PITCH,
        Math.min(MAX_PITCH, player.pitch + Math.sin(angle) * radius),
      );

      const cp = Math.cos(pitch);
      const dx = -Math.sin(yaw) * cp;
      const dy = Math.sin(pitch);
      const dz = -Math.cos(yaw) * cp;

      const world = raycastWorld(this.arena.grid, ox, oy, oz, dx, dy, dz, MAX_SHOT_RANGE);
      let hitDist = world.hit ? world.dist : MAX_SHOT_RANGE;
      let hitPlayer = false;

      if (target && target.alive) {
        const tHit = rayCylinder(
          ox,
          oy,
          oz,
          dx,
          dy,
          dz,
          target.x,
          target.y,
          target.z,
          HIT_RADIUS,
          PLAYER_HEIGHT,
        );
        if (tHit !== null && tHit < hitDist) {
          hitDist = tHit;
          hitPlayer = true;
        }
      }

      const px = ox + dx * hitDist;
      const py = oy + dy * hitDist;
      const pz = oz + dz * hitDist;

      if (hitPlayer) {
        const isHead = py > target.y + HEAD_HEIGHT;
        let dmg = damageAtRange(weapon, hitDist);
        if (isHead) {
          dmg *= HEADSHOT_MULT;
          headshot = true;
        }
        totalDamage += dmg;
        impacts.push({ x: px, y: py, z: pz, s: 'player' });
      } else {
        impacts.push({ x: px, y: py, z: pz, s: world.surface || 'air' });
      }
    }

    player.bloom = Math.min(weapon.maxBloom, player.bloom + weapon.bloom);

    this.events.push({
      k: 'shot',
      p: player.id,
      w: weapon.id,
      o: [ox, oy, oz],
      hits: impacts,
    });

    if (totalDamage > 0 && target && target.alive) {
      const dmg = Math.round(totalDamage);
      target.health -= dmg;
      this.events.push({ k: 'hurt', p: target.id, by: player.id, dmg, head: headshot });

      if (target.health <= 0) {
        target.health = 0;
        target.alive = false;
        target.deaths += 1;
        player.kills += 1;
        this.events.push({ k: 'die', p: target.id, by: player.id, head: headshot });
        this.endRound(player, headshot ? 'headshot' : 'kill');
      }
    }
  }

  // ------------------------------------------------------------- messaging

  sendSnapshot() {
    const ack = {};
    for (const p of this.players) ack[p.id] = p.lastSeq;

    const payload = {
      t: 's',
      k: this.tick,
      st: this.state,
      tm: Math.max(0, Number(this.stateTimer.toFixed(2))),
      ack,
      ps: this.players.map((p) => ({
        i: p.id,
        x: round(p.x),
        y: round(p.y),
        z: round(p.z),
        vx: round(p.vx),
        vy: round(p.vy),
        vz: round(p.vz),
        yaw: round(p.yaw, 3),
        pitch: round(p.pitch, 3),
        h: p.health,
        al: p.alive ? 1 : 0,
        g: p.onGround ? 1 : 0,
        w: p.weaponId,
        am: p.ammo,
        rl: p.reloadUntilTick ? Math.max(0, p.reloadUntilTick - this.tick) : 0,
        zm: p.zooming ? 1 : 0,
        sc: p.score,
      })),
      ev: this.events,
    };

    this.broadcast(payload);
    this.events = [];
  }

  broadcast(message) {
    const text = JSON.stringify(message);
    for (const p of this.players) {
      if (p.conn && !p.conn.closed) p.conn.send(text);
    }
  }
}

function round(value, digits = 2) {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
