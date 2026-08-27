import {
  TICK_RATE,
  TICK_DT,
  SNAPSHOT_INTERVAL,
  MAX_HEALTH,
  EYE_HEIGHT,
  HEAD_HEIGHT,
  PLAYER_HEIGHT,
  MATCH_STATE,
  GAME_MODE,
  COUNTDOWN_SECONDS,
  ROUND_END_SECONDS,
  MATCH_END_SECONDS,
  ROUND_TIME_LIMIT,
  ROUNDS_TO_WIN,
  MAX_PITCH,
  MAX_PLAYERS_DUEL,
  MAX_PLAYERS_DM,
  DM_RESPAWN_SECONDS,
  DM_SPAWN_PROTECT_SECONDS,
  playerColor,
} from '../shared/constants.js';
import { generateArena, serializeArena, cellCenter, pickRandomSpawn } from '../shared/arena.js';
import { stepPlayer, raycastWorld, rayCylinder } from '../shared/physics.js';
import {
  WEAPONS,
  randomWeaponId,
  shotInterval,
  damageAtRange,
  HEADSHOT_MULT,
  SECONDARY_WEAPON_ID,
  DEFAULT_PRIMARY_WEAPON_ID,
  isPrimaryWeaponId,
} from '../shared/weapons.js';
import { tickBots, randomPrimaryWeaponId, createBotState } from './bots.js';

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
  constructor(room, { mode = GAME_MODE.DUEL, dmMinutes = 5 } = {}) {
    this.room = room;
    this.mode = mode;
    this.dmMinutes = dmMinutes;
    this.hostId = null;
    this.players = [];
    this.tick = 0;
    this.state = MATCH_STATE.WAITING;
    this.stateTimer = 0;
    this.roundNumber = 0;
    this.arena = null;
    this.events = [];
    this.lastRoundResult = null;
  }

  get isDM() {
    return this.mode === GAME_MODE.DEATHMATCH;
  }

  get maxPlayers() {
    return this.isDM ? MAX_PLAYERS_DM : MAX_PLAYERS_DUEL;
  }

  addPlayer(id, name, conn) {
    const slot = this.players.length;
    if (this.players.length === 0) this.hostId = id;

    const player = {
      id,
      slot,
      name,
      conn,
      isBot: false,
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
      primaryWeaponId: DEFAULT_PRIMARY_WEAPON_ID,
      activeSlot: 'primary',
      ammo: 0,
      primaryAmmo: 0,
      secondaryAmmo: 0,
      bloom: 0,
      reloadUntilTick: 0,
      nextShotTick: 0,
      prevShoot: false,
      zooming: false,
      score: 0,
      kills: 0,
      deaths: 0,
      respawnAtTick: 0,
      spawnProtectUntil: 0,
      inputQueue: [],
      lastInput: { ...IDLE_INPUT },
      lastSeq: 0,
    };
    this.players.push(player);
    return player;
  }

  addBot(id, name) {
    if (this.players.length >= this.maxPlayers) return null;
    const player = this.addPlayer(id, name, null);
    player.isBot = true;
    player.botState = createBotState(this.tick);
    if (this.isDM) {
      player.primaryWeaponId = randomPrimaryWeaponId();
    }
    return player;
  }

  removePlayer(id) {
    this.players = this.players.filter((p) => p.id !== id);
    this.players.forEach((p, i) => {
      p.slot = i;
    });

    if (this.hostId === id) this.hostId = this.players[0]?.id || null;

    if (this.isDM) {
      if (this.players.length === 0) {
        this.state = MATCH_STATE.WAITING;
        this.stateTimer = 0;
      } else if (this.state === MATCH_STATE.LIVE && this.players.length < 2) {
        this.endDeathmatch('players_left');
      }
      return;
    }

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

  tryStart(requesterId) {
    if (!this.isDM || this.state !== MATCH_STATE.WAITING) return false;
    if (requesterId !== this.hostId) return false;
    if (this.players.length < 2) return false;
    this.beginMatch();
    return true;
  }

  opponentsOf(player) {
    return this.players.filter(
      (p) =>
        p.id !== player.id &&
        p.alive &&
        this.tick >= p.spawnProtectUntil,
    );
  }

  opponentOf(player) {
    return this.players.find((p) => p.id !== player.id) || null;
  }

  queueInput(id, msg) {
    const player = this.players.find((p) => p.id === id);
    if (!player) return;
    const yaw = Number(msg.y) || 0;
    const pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, Number(msg.p) || 0));
    player.inputQueue.push({
      seq: Number(msg.s) || 0,
      input: decodeInput(Number(msg.k) || 0, yaw, pitch),
      pw: typeof msg.pw === 'string' ? msg.pw : null,
      sw: Number(msg.sw) || 0,
    });
    if (player.inputQueue.length > 24) player.inputQueue.splice(0, player.inputQueue.length - 24);
  }

  beginMatch() {
    this.roundNumber = 0;
    for (const p of this.players) {
      p.score = 0;
      p.kills = 0;
      p.deaths = 0;
      p.respawnAtTick = 0;
      p.spawnProtectUntil = 0;
    }
    if (this.isDM) this.beginDeathmatch();
    else this.startRound();
  }

  beginDeathmatch() {
    this.roundNumber = 1;
    this.arena = generateArena();
    this.lastRoundResult = null;

    for (const p of this.players) {
      const { x, z } = pickRandomSpawn(this.arena.grid);
      p.x = x;
      p.y = 0;
      p.z = z;
      p.vx = 0;
      p.vy = 0;
      p.vz = 0;
      p.onGround = true;
      p.yaw = Math.atan2(x, z);
      p.pitch = 0;
      this.initDmLoadout(p);
      p.bloom = 0;
      p.reloadUntilTick = 0;
      p.nextShotTick = 0;
      p.prevShoot = false;
      p.zooming = false;
      p.health = MAX_HEALTH;
      p.alive = true;
      p.spawnProtectUntil = 0;
      p.inputQueue.length = 0;
      p.lastInput = { ...IDLE_INPUT, yaw: p.yaw, pitch: 0 };
    }

    this.state = MATCH_STATE.COUNTDOWN;
    this.stateTimer = COUNTDOWN_SECONDS;
    this.broadcastGameStart();
  }

  startRound() {
    this.roundNumber += 1;
    this.arena = generateArena();
    this.lastRoundResult = null;
    this.matchWeapon = randomWeaponId();

    for (const p of this.players) {
      this.placeAtSpawn(p, p.slot);
      p.weaponId = this.matchWeapon;
      p.ammo = WEAPONS[p.weaponId].magazine;
      p.bloom = 0;
      p.reloadUntilTick = 0;
      p.nextShotTick = 0;
      p.prevShoot = false;
      p.zooming = false;
      p.health = MAX_HEALTH;
      p.alive = true;
      p.respawnAtTick = 0;
      p.spawnProtectUntil = 0;
      p.inputQueue.length = 0;
      p.lastInput = { ...IDLE_INPUT, yaw: p.yaw, pitch: 0 };
    }

    this.state = MATCH_STATE.COUNTDOWN;
    this.stateTimer = COUNTDOWN_SECONDS;
    this.broadcastGameStart();
  }

  placeAtSpawn(player, slotIndex) {
    const spawn = this.arena.spawns[slotIndex % this.arena.spawns.length];
    const { x, z } = cellCenter(spawn.c, spawn.r);
    player.x = x;
    player.y = 0;
    player.z = z;
    player.vx = 0;
    player.vy = 0;
    player.vz = 0;
    player.onGround = true;
    player.yaw = Math.atan2(x, z);
    player.pitch = 0;
  }

  initDmLoadout(player) {
    if (!isPrimaryWeaponId(player.primaryWeaponId)) {
      player.primaryWeaponId = DEFAULT_PRIMARY_WEAPON_ID;
    }
    player.activeSlot = 'primary';
    player.weaponId = player.primaryWeaponId;
    player.primaryAmmo = WEAPONS[player.primaryWeaponId].magazine;
    player.secondaryAmmo = WEAPONS[SECONDARY_WEAPON_ID].magazine;
    player.ammo = player.primaryAmmo;
  }

  pickPrimaryWeapon(player, weaponId) {
    if (!this.isDM || !isPrimaryWeaponId(weaponId)) return;
    player.primaryWeaponId = weaponId;

    if (player.alive && player.activeSlot === 'primary') {
      player.weaponId = weaponId;
      if (this.state === MATCH_STATE.COUNTDOWN) {
        player.primaryAmmo = WEAPONS[weaponId].magazine;
        player.ammo = player.primaryAmmo;
      } else {
        player.ammo = player.primaryAmmo;
      }
      player.reloadUntilTick = 0;
      player.bloom = 0;
    }
  }

  switchWeapon(player, slot) {
    if (!this.isDM || !player.alive) return;
    if (slot !== 'primary' && slot !== 'secondary') return;
    if (slot === player.activeSlot) return;

    if (player.activeSlot === 'primary') player.primaryAmmo = player.ammo;
    else player.secondaryAmmo = player.ammo;

    player.activeSlot = slot;
    if (slot === 'primary') {
      player.weaponId = player.primaryWeaponId;
      player.ammo = player.primaryAmmo;
    } else {
      player.weaponId = SECONDARY_WEAPON_ID;
      player.ammo = player.secondaryAmmo;
    }
    player.reloadUntilTick = 0;
    player.zooming = false;
    player.bloom = 0;
  }

  broadcastGameStart() {
    this.broadcast({
      t: 'round',
      mode: this.mode,
      dmMinutes: this.dmMinutes,
      n: this.roundNumber,
      arena: serializeArena(this.arena),
      target: this.isDM ? 0 : ROUNDS_TO_WIN,
      players: this.players.map((p) => this.playerPayload(p)),
    });
  }

  playerPayload(p) {
    return {
      i: p.id,
      slot: p.slot,
      name: p.name,
      color: playerColor(p.slot),
      w: p.weaponId,
      pw: p.primaryWeaponId,
      as: p.activeSlot === 'secondary' ? 2 : 1,
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: p.yaw,
      score: p.score,
      kills: p.kills,
    };
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

  endDeathmatch(reason = 'timeout') {
    const ranked = [...this.players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    const topKills = ranked[0]?.kills ?? 0;
    const winners = ranked.filter((p) => p.kills === topKills);
    const winner = winners.length === 1 ? winners[0] : null;

    this.state = MATCH_STATE.MATCH_OVER;
    this.stateTimer = MATCH_END_SECONDS;
    this.broadcast({
      t: 'matchover',
      mode: this.mode,
      reason,
      winner: winner ? winner.id : null,
      scores: ranked.map((p) => ({
        i: p.id,
        slot: p.slot,
        name: p.name,
        color: playerColor(p.slot),
        score: p.kills,
        kills: p.kills,
        deaths: p.deaths,
      })),
    });
  }

  update() {
    this.tick += 1;

    if (this.state === MATCH_STATE.WAITING) {
      if (!this.isDM && this.players.length === 2) this.beginMatch();
      return;
    }

    this.stateTimer -= TICK_DT;

    if (this.isDM && this.state === MATCH_STATE.LIVE) {
      this.processRespawns();
    }

    tickBots(this);

    switch (this.state) {
      case MATCH_STATE.COUNTDOWN:
        this.consumeInputs({ move: false, shoot: false });
        if (this.stateTimer <= 0) {
          this.state = MATCH_STATE.LIVE;
          this.stateTimer = this.isDM ? this.dmMinutes * 60 : ROUND_TIME_LIMIT;
        }
        break;

      case MATCH_STATE.LIVE:
        this.consumeInputs({ move: true, shoot: true });
        if (this.stateTimer <= 0) {
          if (this.isDM) this.endDeathmatch('timeout');
          else this.endRound(null, 'timeout');
        }
        break;

      case MATCH_STATE.ROUND_OVER:
        if (this.stateTimer <= 0) {
          const leader = this.players.find((p) => p.score >= ROUNDS_TO_WIN);
          if (leader) {
            this.state = MATCH_STATE.MATCH_OVER;
            this.stateTimer = MATCH_END_SECONDS;
            this.broadcast({
              t: 'matchover',
              mode: this.mode,
              winner: leader.id,
              scores: this.players.map((p) => ({
                i: p.id,
                slot: p.slot,
                name: p.name,
                color: playerColor(p.slot),
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

  processRespawns() {
    for (const p of this.players) {
      if (p.alive || !p.respawnAtTick || this.tick < p.respawnAtTick) continue;
      this.respawnPlayer(p);
    }
  }

  respawnPlayer(player) {
    const { x, z } = pickRandomSpawn(this.arena.grid);
    player.x = x;
    player.y = 0;
    player.z = z;
    player.vx = 0;
    player.vy = 0;
    player.vz = 0;
    player.onGround = true;
    player.yaw = Math.atan2(x, z);
    player.pitch = 0;
    player.health = MAX_HEALTH;
    player.alive = true;
    player.bloom = 0;
    player.reloadUntilTick = 0;
    player.nextShotTick = 0;
    player.prevShoot = false;
    player.zooming = false;
    this.initDmLoadout(player);
    player.respawnAtTick = 0;
    player.spawnProtectUntil = this.tick + Math.round(DM_SPAWN_PROTECT_SECONDS * TICK_RATE);
    this.events.push({ k: 'respawn', p: player.id, pw: player.primaryWeaponId });
  }

  consumeInputs({ move, shoot }) {
    for (const player of this.players) {
      let budget = player.inputQueue.length > INPUT_QUEUE_LIMIT ? 2 : 1;
      let consumed = 0;
      while (budget-- > 0) {
        const next = player.inputQueue.shift();
        if (!next) break;
        player.lastInput = next.input;
        player.lastSeq = next.seq;
        this.applyInput(player, next.input, { move, shoot }, false, next.pw, next.sw);
        consumed++;
      }
      if (consumed === 0) {
        this.applyInput(player, player.lastInput, { move, shoot }, true, null, 0);
      }
    }
  }

  applyInput(player, input, { move, shoot }, repeat = false, pickPrimary = null, switchSlot = 0) {
    player.yaw = input.yaw;
    player.pitch = input.pitch;

    if (this.isDM) {
      if (pickPrimary) this.pickPrimaryWeapon(player, pickPrimary);
      if (switchSlot === 1 && !repeat) this.switchWeapon(player, 'primary');
      if (switchSlot === 2 && !repeat) this.switchWeapon(player, 'secondary');
    }

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
      if (this.isDM) {
        if (player.activeSlot === 'primary') player.primaryAmmo = player.ammo;
        else player.secondaryAmmo = player.ammo;
      }
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
    if (this.isDM) {
      if (player.activeSlot === 'primary') player.primaryAmmo = player.ammo;
      else player.secondaryAmmo = player.ammo;
    }
    player.nextShotTick = this.tick + Math.max(1, Math.round(shotInterval(weapon) * TICK_RATE));

    const ox = player.x;
    const oy = player.y + EYE_HEIGHT;
    const oz = player.z;

    const targets = this.isDM ? this.opponentsOf(player) : [this.opponentOf(player)].filter(Boolean);

    const spreadBase = weapon.spread + player.bloom;
    const spread = player.zooming ? spreadBase * 0.25 : spreadBase;

    const impacts = [];
    const damageByTarget = new Map();
    let anyHeadshot = false;

    for (let i = 0; i < weapon.pellets; i++) {
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
      let hitTarget = null;

      for (const target of targets) {
        if (!target.alive) continue;
        const tHit = rayCylinder(
          ox, oy, oz, dx, dy, dz,
          target.x, target.y, target.z,
          HIT_RADIUS, PLAYER_HEIGHT,
        );
        if (tHit !== null && tHit < hitDist) {
          hitDist = tHit;
          hitTarget = target;
        }
      }

      const px = ox + dx * hitDist;
      const py = oy + dy * hitDist;
      const pz = oz + dz * hitDist;

      if (hitTarget) {
        const isHead = py > hitTarget.y + HEAD_HEIGHT;
        let dmg = damageAtRange(weapon, hitDist);
        if (isHead) {
          dmg *= HEADSHOT_MULT;
          anyHeadshot = true;
        }
        damageByTarget.set(hitTarget, (damageByTarget.get(hitTarget) || 0) + dmg);
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

    for (const [target, totalDamage] of damageByTarget) {
      if (!target.alive || totalDamage <= 0) continue;
      const dmg = Math.round(totalDamage);
      const headshot = anyHeadshot && dmg >= weapon.damage * HEADSHOT_MULT * 0.5;
      target.health -= dmg;
      this.events.push({ k: 'hurt', p: target.id, by: player.id, dmg, head: headshot });

      if (target.health <= 0) {
        this.handleKill(player, target, headshot);
      }
    }
  }

  handleKill(killer, victim, headshot) {
    victim.health = 0;
    victim.alive = false;
    victim.deaths += 1;
    killer.kills += 1;
    this.events.push({ k: 'die', p: victim.id, by: killer.id, head: headshot });

    if (this.isDM) {
      victim.respawnAtTick = this.tick + Math.round(DM_RESPAWN_SECONDS * TICK_RATE);
      return;
    }

    this.endRound(killer, headshot ? 'headshot' : 'kill');
  }

  sendSnapshot() {
    const ack = {};
    for (const p of this.players) ack[p.id] = p.lastSeq;

    const payload = {
      t: 's',
      k: this.tick,
      mode: this.mode,
      st: this.state,
      tm: Math.max(0, Number(this.stateTimer.toFixed(2))),
      ack,
      ps: this.players.map((p) => ({
        i: p.id,
        sl: p.slot,
        nm: p.name,
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
        pw: p.primaryWeaponId,
        as: p.activeSlot === 'secondary' ? 2 : 1,
        pa: p.primaryAmmo,
        sa: p.secondaryAmmo,
        am: p.ammo,
        rl: p.reloadUntilTick ? Math.max(0, p.reloadUntilTick - this.tick) : 0,
        zm: p.zooming ? 1 : 0,
        sc: p.score,
        kl: p.kills,
        dt: p.deaths,
        rs: p.respawnAtTick ? Math.max(0, p.respawnAtTick - this.tick) : 0,
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
