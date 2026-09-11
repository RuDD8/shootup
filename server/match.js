import {
  TICK_RATE,
  TICK_DT,
  SNAPSHOT_INTERVAL,
  MAX_HEALTH,
  MAX_PITCH,
  MATCH_STATE,
  GAME_MODE,
  COUNTDOWN_SECONDS,
  ROUND_END_SECONDS,
  MATCH_END_SECONDS,
  ROUND_TIME_LIMIT,
  ROUNDS_TO_WIN,
  MAX_PLAYERS_DUEL,
  MAX_PLAYERS_DM,
  DM_RESPAWN_SECONDS,
  DM_SPAWN_PROTECT_SECONDS,
  GUNGAME_RESPAWN_SECONDS,
  GUNGAME_SPAWN_PROTECT_SECONDS,
  GUNGAME_DEMOTE_ON_KNIFE_DEATH,
  playerColor,
  playerEyeHeight,
  playerHeight,
  playerHeadHeight,
} from '../shared/constants.js';
import { interpolateHistory, lagCompTicks, historyCapacity } from '../shared/lagcomp.js';
import { serializeArena, cellCenter, pickSafeSpawn } from '../shared/arena.js';
import { loadArena, MAP_RANDOM, normalizeMapId, mapName } from '../shared/maps/index.js';
import { stepPlayer, raycastWorld, rayCylinder } from '../shared/physics.js';
import {
  WEAPONS,
  GUNGAME_POOL,
  randomWeaponId,
  shotInterval,
  shotSpread,
  damageAtRange,
  chargeDamageMult,
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
  CROUCH: 256,
  RUN: 512,
};

const HIT_RADIUS = 0.45;
const MAX_SHOT_RANGE = 400;

// Ballistic pee stream: these mirror the client droplet launch (waist height,
// upward bias, launch speed, spark gravity) so damage lands exactly where the
// liquid visually falls — not where the crosshair points.
const STREAM_SPEED = 8.5;
const STREAM_UP_BIAS = 0.18;
const STREAM_GRAVITY = 11;
const STREAM_WAIST_DROP = 0.55;
const STREAM_STEP = 1 / 60;
const STREAM_MAX_STEPS = 90; // 1.5 s of flight, plenty for a 9 m lob
const INPUT_QUEUE_LIMIT = 6;
const MAX_INPUT_QUEUE = 24;
const INPUT_IDLE_TICKS = Math.round(TICK_RATE * 0.5);
const INPUT_MASK = 0x3ff;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeAngle(angle) {
  const tau = Math.PI * 2;
  return ((angle + Math.PI) % tau + tau) % tau - Math.PI;
}

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

const IDLE_INPUT = decodeInput(0, 0, 0);

export class Match {
  constructor(room, { mode = GAME_MODE.DUEL, dmMinutes = 5, mapId = MAP_RANDOM } = {}) {
    this.room = room;
    this.mode = mode;
    this.dmMinutes = dmMinutes;
    this.mapId = normalizeMapId(mapId);
    this.arenaSeed = 0;
    this.hostId = null;
    this.players = [];
    this.tick = 0;
    this.state = MATCH_STATE.WAITING;
    this.stateTimer = 0;
    this.roundNumber = 0;
    this.arena = null;
    this.events = [];
    this.lastRoundResult = null;
    this.projectiles = [];
    this.hazards = [];
    this.gunGameOrder = [];
  }

  get isDM() {
    return this.mode === GAME_MODE.DEATHMATCH;
  }

  get isGunGame() {
    return this.mode === GAME_MODE.GUNGAME;
  }

  get maxPlayers() {
    return this.isDM || this.isGunGame ? MAX_PLAYERS_DM : MAX_PLAYERS_DUEL;
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
      crouching: false,
      sliding: false,
      slideTime: 0,
      prevCrouch: false,
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
      wantsRespawn: false,
      spawnProtectUntil: 0,
      history: [],
      inputQueue: [],
      lastInput: { ...IDLE_INPUT },
      lastSeq: 0,
      lastInputTick: this.tick,
      chargeStartTick: 0,
      heat: 0,
      overheatedUntilTick: 0,
      burstRemaining: 0,
      burstNextTick: 0,
      gunGameLevel: 0,
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
    if (this.isGunGame) {
      player.gunGameLevel = 0;
    }
    return player;
  }

  removePlayer(id) {
    this.players = this.players.filter((p) => p.id !== id);
    this.players.forEach((p, i) => {
      p.slot = i;
    });

    if (this.hostId === id) this.hostId = this.players[0]?.id || null;

    if (this.isDM || this.isGunGame) {
      if (this.players.length === 0) {
        this.state = MATCH_STATE.WAITING;
        this.stateTimer = 0;
      } else if (this.state === MATCH_STATE.LIVE && this.players.length < 2) {
        if (this.isGunGame) this.endGunGame(this.players[0] || null);
        else this.endDeathmatch('players_left');
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
    if (!(this.isDM || this.isGunGame) || this.state !== MATCH_STATE.WAITING) return false;
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

    // Click-to-respawn request; only honored once the respawn delay passed.
    if (
      msg.rq === 1 &&
      !player.alive &&
      this.state === MATCH_STATE.LIVE &&
      player.respawnAtTick &&
      this.tick >= player.respawnAtTick
    ) {
      player.wantsRespawn = true;
    }

    const yaw = normalizeAngle(finiteNumber(msg.y, player.yaw));
    const pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, finiteNumber(msg.p, player.pitch)));
    const newestQueuedSeq = player.inputQueue.at(-1)?.seq ?? player.lastSeq;
    const seq = Math.max(0, Math.floor(finiteNumber(msg.s, newestQueuedSeq)));
    if (seq <= newestQueuedSeq) return;

    player.inputQueue.push({
      seq,
      input: decodeInput(Math.floor(finiteNumber(msg.k)) & INPUT_MASK, yaw, pitch),
      pw: typeof msg.pw === 'string' ? msg.pw : null,
      sw: Math.floor(finiteNumber(msg.sw)),
    });
    player.lastInputTick = this.tick;
    if (player.inputQueue.length > MAX_INPUT_QUEUE) {
      player.inputQueue.splice(0, player.inputQueue.length - MAX_INPUT_QUEUE);
    }
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
    if (this.isGunGame) this.beginGunGame();
    else if (this.isDM) this.beginDeathmatch();
    else this.startRound();
  }

  loadArenaForRound() {
    if (this.mapId === MAP_RANDOM) {
      this.arenaSeed = (Math.random() * 0xffffffff) >>> 0;
    }
    this.arena = loadArena(this.mapId, this.arenaSeed);
  }

  beginDeathmatch() {
    this.roundNumber = 1;
    this.loadArenaForRound();
    this.lastRoundResult = null;

    for (const p of this.players) {
      const threats = this.players.filter((other) => other !== p && other.alive);
      const { x, z } = pickSafeSpawn(this.arena.grid, threats);
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
      p.crouching = false;
      p.sliding = false;
      p.slideTime = 0;
      p.prevCrouch = false;
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

  beginGunGame() {
    const pool = [...GUNGAME_POOL];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    pool.push('knife');
    this.gunGameOrder = pool;

    this.roundNumber = 1;
    this.loadArenaForRound();
    this.lastRoundResult = null;
    this.projectiles = [];
    this.hazards = [];

    for (const p of this.players) {
      p.gunGameLevel = 0;
      const threats = this.players.filter((o) => o !== p && o.alive);
      const { x, z } = pickSafeSpawn(this.arena.grid, threats);
      p.x = x;
      p.y = 0;
      p.z = z;
      p.vx = 0;
      p.vy = 0;
      p.vz = 0;
      p.onGround = true;
      p.yaw = Math.atan2(x, z);
      p.pitch = 0;
      this.initGunGameLoadout(p);
      p.bloom = 0;
      p.reloadUntilTick = 0;
      p.nextShotTick = 0;
      p.prevShoot = false;
      p.zooming = false;
      p.crouching = false;
      p.sliding = false;
      p.slideTime = 0;
      p.prevCrouch = false;
      p.health = MAX_HEALTH;
      p.alive = true;
      p.spawnProtectUntil = 0;
      p.heat = 0;
      p.overheatedUntilTick = 0;
      p.chargeStartTick = 0;
      p.burstRemaining = 0;
      p.burstNextTick = 0;
      p.inputQueue.length = 0;
      p.lastInput = { ...IDLE_INPUT, yaw: p.yaw, pitch: 0 };
    }

    this.state = MATCH_STATE.COUNTDOWN;
    this.stateTimer = COUNTDOWN_SECONDS;
    this.broadcastGameStart();
  }

  initGunGameLoadout(player) {
    const wid = this.gunGameOrder[player.gunGameLevel] || 'pistol';
    player.weaponId = wid;
    player.activeSlot = 'primary';
    const w = WEAPONS[wid];
    player.ammo = w.magazine;
    player.primaryAmmo = player.ammo;
    player.secondaryAmmo = 0;
    player.heat = 0;
    player.overheatedUntilTick = 0;
    player.chargeStartTick = 0;
    player.burstRemaining = 0;
    player.burstNextTick = 0;
  }

  endGunGame(winner) {
    this.state = MATCH_STATE.MATCH_OVER;
    this.stateTimer = MATCH_END_SECONDS;
    const ranked = [...this.players].sort(
      (a, b) => b.gunGameLevel - a.gunGameLevel || b.kills - a.kills,
    );
    this.broadcast({
      t: 'matchover',
      mode: this.mode,
      reason: 'gungame_complete',
      winner: winner ? winner.id : null,
      scores: ranked.map((p) => ({
        i: p.id,
        slot: p.slot,
        name: p.name,
        color: playerColor(p.slot),
        score: p.gunGameLevel,
        kills: p.kills,
        deaths: p.deaths,
      })),
    });
  }

  startRound() {
    this.roundNumber += 1;
    this.loadArenaForRound();
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
      p.crouching = false;
      p.sliding = false;
      p.slideTime = 0;
      p.prevCrouch = false;
      p.health = MAX_HEALTH;
      p.alive = true;
      p.respawnAtTick = 0;
      p.spawnProtectUntil = 0;
      p.heat = 0;
      p.overheatedUntilTick = 0;
      p.chargeStartTick = 0;
      p.chargeFrac = 0;
      p.burstRemaining = 0;
      p.burstNextTick = 0;
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
    player.crouching = false;
    player.sliding = false;
    player.slideTime = 0;
    player.prevCrouch = false;
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
    const payload = {
      t: 'round',
      mode: this.mode,
      dmMinutes: this.dmMinutes,
      n: this.roundNumber,
      mapId: this.mapId,
      mapName: mapName(this.mapId),
      arena: serializeArena(this.arena),
      target: this.isGunGame ? this.gunGameOrder.length : this.isDM ? 0 : ROUNDS_TO_WIN,
      players: this.players.map((p) => this.playerPayload(p)),
    };
    if (this.isGunGame) payload.gunGameOrder = this.gunGameOrder;
    this.broadcast(payload);
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
      deaths: p.deaths,
      ggLv: p.gunGameLevel,
    };
  }

  endRound(winner, reason) {
    if (this.state !== MATCH_STATE.LIVE) return;
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
      if (!this.isDM && !this.isGunGame && this.players.length === 2) this.beginMatch();
      return;
    }

    this.stateTimer -= TICK_DT;

    if ((this.isDM || this.isGunGame) && this.state === MATCH_STATE.LIVE) {
      this.processRespawns();
    }

    tickBots(this);

    if (this.state === MATCH_STATE.LIVE || this.state === MATCH_STATE.COUNTDOWN) {
      this.tickProjectiles();
      this.tickHazards();
    }

    switch (this.state) {
      case MATCH_STATE.COUNTDOWN:
        this.consumeInputs({ move: false, shoot: false });
        if (this.stateTimer <= 0) {
          this.state = MATCH_STATE.LIVE;
          if (this.isGunGame) {
            this.stateTimer = Infinity;
          } else {
            this.stateTimer = this.isDM ? this.dmMinutes * 60 : ROUND_TIME_LIMIT;
          }
        }
        break;

      case MATCH_STATE.LIVE:
        this.consumeInputs({ move: true, shoot: true });
        if (this.stateTimer <= 0) {
          if (this.isDM) this.endDeathmatch('timeout');
          else if (!this.isGunGame) this.endRound(null, 'timeout');
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
    this.recordHistory();
  }

  recordHistory() {
    for (const p of this.players) {
      if (!p.history) p.history = [];
      p.history.push({
        tick: this.tick,
        x: p.x,
        y: p.y,
        z: p.z,
        cr: p.crouching,
        vx: p.vx,
        vy: p.vy,
        vz: p.vz,
      });
      const cap = historyCapacity();
      if (p.history.length > cap) p.history.shift();
    }
  }

  targetStateAtShot(shooter, target) {
    // RTT comes from the server's WebSocket ping/pong exchange. Never trust a
    // client-provided number to choose how far authoritative hitboxes rewind.
    const rewind = lagCompTicks(shooter.conn?.rttMs || 0);
    if (rewind <= 0) {
      return { x: target.x, y: target.y, z: target.z, cr: target.crouching };
    }
    const sample = interpolateHistory(target.history, this.tick - rewind);
    if (!sample) {
      return { x: target.x, y: target.y, z: target.z, cr: target.crouching };
    }
    return { x: sample.x, y: sample.y, z: sample.z, cr: sample.cr };
  }

  processRespawns() {
    for (const p of this.players) {
      if (p.alive || !p.respawnAtTick || this.tick < p.respawnAtTick) continue;
      // Humans respawn on request (click); bots come back automatically.
      if (!p.isBot && !p.wantsRespawn) continue;
      this.respawnPlayer(p);
    }
  }

  respawnPlayer(player) {
    const threats = this.players.filter((other) => other !== player && other.alive);
    const { x, z } = pickSafeSpawn(this.arena.grid, threats);
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
    player.crouching = false;
    player.sliding = false;
    player.slideTime = 0;
    player.prevCrouch = false;
    if (this.isGunGame) {
      this.initGunGameLoadout(player);
    } else {
      this.initDmLoadout(player);
    }
    player.respawnAtTick = 0;
    player.wantsRespawn = false;
    const protectSec = this.isGunGame
      ? GUNGAME_SPAWN_PROTECT_SECONDS
      : DM_SPAWN_PROTECT_SECONDS;
    player.spawnProtectUntil = this.tick + Math.round(protectSec * TICK_RATE);
    this.events.push({ k: 'respawn', p: player.id, pw: player.primaryWeaponId || player.weaponId });
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
        const stale =
          !player.isBot &&
          this.tick - player.lastInputTick > INPUT_IDLE_TICKS;
        const repeatedInput = stale
          ? decodeInput(0, player.yaw, player.pitch)
          : player.lastInput;
        this.applyInput(player, repeatedInput, { move, shoot }, true, null, 0);
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

    // Cool while not firing, and always during an overheat lockout so holding
    // fire through the cooldown cannot immediately re-lock the weapon.
    if (weapon.overheat && (!input.shoot || this.tick < player.overheatedUntilTick)) {
      player.heat = Math.max(0, player.heat - weapon.heatDecay);
    }

    if (player.reloadUntilTick && this.tick >= player.reloadUntilTick) {
      player.ammo = weapon.magazine;
      if (this.isDM) {
        if (player.activeSlot === 'primary') player.primaryAmmo = player.ammo;
        else player.secondaryAmmo = player.ammo;
      }
      if (this.isGunGame) player.primaryAmmo = player.ammo;
      player.reloadUntilTick = 0;
    }

    // Poopgun reload gag: broadcast a fart when the reaching hand arrives at
    // the player's rear (35% into the reload) so nearby players hear it too.
    if (!player.reloadUntilTick) {
      player.fartedThisReload = false;
    } else if (player.weaponId === 'poopgun' && !player.fartedThisReload) {
      const grabTick = player.reloadUntilTick - Math.round(weapon.reload * TICK_RATE * 0.65);
      if (this.tick >= grabTick) {
        player.fartedThisReload = true;
        this.events.push({ k: 'fart', p: player.id, x: player.x, y: player.y, z: player.z });
      }
    }

    // Process burst continuation (fires remaining burst shots automatically)
    if (player.burstRemaining > 0 && shoot && this.tick >= player.burstNextTick) {
      if (player.ammo > 0) {
        this.fire(player, weapon);
        player.burstRemaining -= 1;
        if (player.burstRemaining > 0) {
          player.burstNextTick = this.tick + Math.max(1, Math.round(shotInterval(weapon) * TICK_RATE));
        } else {
          player.nextShotTick = this.tick + Math.round((weapon.burstCooldown || 0.3) * TICK_RATE);
        }
      } else {
        player.burstRemaining = 0;
      }
      player.prevShoot = Boolean(input.shoot);
      return;
    }

    if (!shoot) {
      player.prevShoot = Boolean(input.shoot);
      return;
    }

    // Overheat lockout
    if (weapon.overheat && this.tick < player.overheatedUntilTick) {
      player.prevShoot = Boolean(input.shoot);
      return;
    }

    const reloading = player.reloadUntilTick > 0;
    const wantsReload = input.reload && !reloading && player.ammo < weapon.magazine && !weapon.overheat && !weapon.melee;
    if (wantsReload) {
      player.reloadUntilTick = this.tick + Math.round(weapon.reload * TICK_RATE);
      player.prevShoot = Boolean(input.shoot);
      return;
    }

    const pressed = Boolean(input.shoot);
    const freshPress = pressed && !player.prevShoot;

    // Charge weapon (Bow): start charge on press, fire on release
    if (weapon.charge) {
      if (freshPress && player.ammo > 0 && !reloading) {
        player.chargeStartTick = this.tick;
      } else if (!pressed && player.prevShoot && player.chargeStartTick > 0) {
        const chargeTicks = this.tick - player.chargeStartTick;
        const maxTicks = Math.round(weapon.chargeTime * TICK_RATE);
        player.chargeFrac = Math.min(1, chargeTicks / maxTicks);
        this.fire(player, weapon);
        player.chargeStartTick = 0;
        player.chargeFrac = 0;
      }
      if (player.ammo <= 0 && !reloading && weapon.reload > 0) {
        player.reloadUntilTick = this.tick + Math.round(weapon.reload * TICK_RATE);
      }
      player.prevShoot = pressed;
      return;
    }

    const mayFire = weapon.auto ? pressed : freshPress && !repeat;
    player.prevShoot = pressed;

    if (!mayFire || reloading) return;
    if (this.tick < player.nextShotTick) return;

    if (!weapon.melee && !weapon.overheat && player.ammo <= 0) {
      if (weapon.reload > 0) {
        player.reloadUntilTick = this.tick + Math.round(weapon.reload * TICK_RATE);
      }
      return;
    }

    // Beam weapons (laser) fire every tick, governed by overheat
    if (weapon.beam && weapon.overheat) {
      player.heat += weapon.heatPerTick;
      if (player.heat >= 1) {
        player.heat = 1;
        player.overheatedUntilTick = this.tick + Math.round(weapon.overheatCooldown * TICK_RATE);
        this.events.push({ k: 'overheat', p: player.id });
        return;
      }
    }

    // Burst weapon: start burst
    if (weapon.burst && weapon.burst > 1) {
      this.fire(player, weapon);
      player.burstRemaining = weapon.burst - 1;
      player.burstNextTick = this.tick + Math.max(1, Math.round(shotInterval(weapon) * TICK_RATE));
      return;
    }

    this.fire(player, weapon);
  }

  fire(player, weapon) {
    // Melee weapons don't consume ammo
    if (!weapon.melee && !weapon.overheat) {
      player.ammo -= 1;
      if (this.isDM) {
        if (player.activeSlot === 'primary') player.primaryAmmo = player.ammo;
        else player.secondaryAmmo = player.ammo;
      }
      if (this.isGunGame) player.primaryAmmo = player.ammo;
    }
    if (!weapon.burst) {
      player.nextShotTick = this.tick + Math.max(1, Math.round(shotInterval(weapon) * TICK_RATE));
    }

    const ox = player.x;
    const oy = player.y + playerEyeHeight(player.crouching);
    const oz = player.z;

    // Projectile weapons spawn a projectile instead of hitscan
    if (weapon.projectile) {
      this.fireProjectile(player, weapon, ox, oy, oz);
      return;
    }

    // Melee weapons use a short-range check
    if (weapon.melee) {
      this.fireMelee(player, weapon, ox, oy, oz);
      return;
    }

    // The pee stream is ballistic: hits register along the arc the liquid
    // actually travels, not along the straight crosshair ray.
    if (weapon.stream) {
      this.fireStream(player, weapon, ox, oy, oz);
      return;
    }

    const targets = (this.isDM || this.isGunGame) ? this.opponentsOf(player) : [this.opponentOf(player)].filter(Boolean);

    const chargeFrac = weapon.charge ? (player.chargeFrac || 0) : 1;
    const spread = shotSpread(weapon, player.bloom, player.zooming, chargeFrac);

    const impacts = [];
    const damageByTarget = new Map();

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

      // Short-range weapons (the pee stream) cap the ray well before the
      // arena-wide maximum.
      const maxRange = weapon.range || MAX_SHOT_RANGE;
      const world = raycastWorld(this.arena.grid, ox, oy, oz, dx, dy, dz, maxRange);
      let hitDist = world.hit ? Math.min(world.dist, maxRange) : maxRange;
      let hitTarget = null;
      let hitLagComp = null;

      for (const target of targets) {
        if (!target.alive) continue;
        const tState = this.targetStateAtShot(player, target);
        const tHit = rayCylinder(
          ox, oy, oz, dx, dy, dz,
          tState.x, tState.y, tState.z,
          HIT_RADIUS, playerHeight(tState.cr),
        );
        if (tHit !== null && tHit < hitDist) {
          hitDist = tHit;
          hitTarget = target;
          hitLagComp = tState;
        }
      }

      const px = ox + dx * hitDist;
      const py = oy + dy * hitDist;
      const pz = oz + dz * hitDist;

      if (hitTarget) {
        const tState = hitLagComp || {
          x: hitTarget.x,
          y: hitTarget.y,
          z: hitTarget.z,
          cr: hitTarget.crouching,
        };
        const isHead = py > tState.y + playerHeadHeight(tState.cr);
        let dmg = damageAtRange(weapon, hitDist);
        if (weapon.charge) dmg *= chargeDamageMult(weapon, chargeFrac);
        if (isHead) dmg *= HEADSHOT_MULT;
        const damage = damageByTarget.get(hitTarget) || { total: 0, head: 0 };
        damage.total += dmg;
        if (isHead) damage.head += dmg;
        damageByTarget.set(hitTarget, damage);
        impacts.push({ x: px, y: py, z: pz, s: 'player' });
      } else {
        impacts.push({ x: px, y: py, z: pz, s: world.surface || 'air' });
      }
    }

    player.bloom = Math.min(weapon.maxBloom, player.bloom + weapon.bloom);

    this.events.push({
      k: weapon.beam ? 'beam' : 'shot',
      p: player.id,
      w: weapon.id,
      o: [ox, oy, oz],
      hits: impacts,
    });

    for (const [target, damage] of damageByTarget) {
      if (!target.alive || damage.total <= 0) continue;
      if (this.tick < target.spawnProtectUntil) continue;
      const dmg = Math.round(damage.total);
      const headshot = damage.head > 0;
      target.health -= dmg;
      this.events.push({ k: 'hurt', p: target.id, by: player.id, dmg, head: headshot });

      if (target.health <= 0) {
        this.handleKill(player, target, headshot);
      }
    }
  }

  // Integrate the pee arc in substeps, checking players (lag compensated) and
  // walls along each segment. The whole arc resolves within the firing tick,
  // like a hitscan that bends under gravity.
  fireStream(player, weapon, ox, oy, oz) {
    const targets = (this.isDM || this.isGunGame)
      ? this.opponentsOf(player)
      : [this.opponentOf(player)].filter(Boolean);

    const spread = shotSpread(weapon, player.bloom, player.zooming, 1);
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

    let px = ox;
    let py = oy - STREAM_WAIST_DROP;
    let pz = oz;
    const vx = dx * STREAM_SPEED;
    let vy = (dy + STREAM_UP_BIAS) * STREAM_SPEED;
    const vz = dz * STREAM_SPEED;

    const impacts = [];
    let hitTarget = null;
    let hitState = null;
    let hitPoint = null;

    outer: for (let i = 0; i < STREAM_MAX_STEPS; i++) {
      vy -= STREAM_GRAVITY * STREAM_STEP;
      const nx = px + vx * STREAM_STEP;
      const ny = py + vy * STREAM_STEP;
      const nz = pz + vz * STREAM_STEP;
      const sx = nx - px;
      const sy = ny - py;
      const sz = nz - pz;
      const segLen = Math.hypot(sx, sy, sz);
      if (segLen < 1e-6) break;
      const ux = sx / segLen;
      const uy = sy / segLen;
      const uz = sz / segLen;

      for (const target of targets) {
        if (!target.alive) continue;
        const tState = this.targetStateAtShot(player, target);
        const t = rayCylinder(
          px, py, pz, ux, uy, uz,
          tState.x, tState.y, tState.z,
          HIT_RADIUS, playerHeight(tState.cr),
        );
        if (t !== null && t <= segLen) {
          hitTarget = target;
          hitState = tState;
          hitPoint = { x: px + ux * t, y: py + uy * t, z: pz + uz * t };
          impacts.push({ ...hitPoint, s: 'player' });
          break outer;
        }
      }

      const world = raycastWorld(this.arena.grid, px, py, pz, ux, uy, uz, segLen);
      if (world.hit) {
        impacts.push({
          x: px + ux * world.dist,
          y: py + uy * world.dist,
          z: pz + uz * world.dist,
          s: world.surface || 'wall',
        });
        break;
      }

      px = nx;
      py = ny;
      pz = nz;
      if (py <= 0.02) {
        impacts.push({ x: px, y: 0.02, z: pz, s: 'floor' });
        break;
      }
    }

    if (!impacts.length) impacts.push({ x: px, y: py, z: pz, s: 'air' });

    this.events.push({
      k: weapon.beam ? 'beam' : 'shot',
      p: player.id,
      w: weapon.id,
      o: [ox, oy, oz],
      hits: impacts,
    });

    if (!hitTarget || !hitTarget.alive) return;
    if (this.tick < hitTarget.spawnProtectUntil) return;

    const travel = Math.hypot(hitPoint.x - ox, hitPoint.z - oz);
    const isHead = hitPoint.y > hitState.y + playerHeadHeight(hitState.cr);
    let dmg = damageAtRange(weapon, travel);
    if (isHead) dmg *= HEADSHOT_MULT;
    dmg = Math.round(dmg);
    if (dmg <= 0) return;

    hitTarget.health -= dmg;
    this.events.push({ k: 'hurt', p: hitTarget.id, by: player.id, dmg, head: isHead });
    if (hitTarget.health <= 0) {
      this.handleKill(player, hitTarget, isHead);
    }
  }

  fireProjectile(player, weapon, ox, oy, oz) {
    const cp = Math.cos(player.pitch);
    const dx = -Math.sin(player.yaw) * cp;
    const dy = Math.sin(player.pitch);
    const dz = -Math.cos(player.yaw) * cp;

    // Charge weapons (the bow) launch slower and weaker on a partial draw:
    // a tap lobs the arrow a few metres, a full draw sends it fast and flat.
    const chargeFrac = weapon.charge ? (player.chargeFrac ?? 1) : 1;
    const speed = weapon.projSpeed * (weapon.charge ? 0.35 + 0.65 * chargeFrac : 1);

    const proj = {
      id: `proj_${this.tick}_${player.id}`,
      owner: player.id,
      weapon,
      x: ox,
      y: oy,
      z: oz,
      vx: dx * speed,
      vy: dy * speed + (weapon.projArc ?? 3),
      vz: dz * speed,
      damage: Math.round(
        weapon.damage * (weapon.charge ? chargeDamageMult(weapon, chargeFrac) : 1),
      ),
      age: 0,
    };
    this.projectiles.push(proj);
    this.events.push({
      k: 'projSpawn',
      p: player.id,
      id: proj.id,
      w: weapon.id,
      x: ox, y: oy, z: oz,
      vx: proj.vx, vy: proj.vy, vz: proj.vz,
    });
  }

  // Radial explosion damage with distance falloff. The direct-hit victim (if
  // any) already took the projectile's contact damage and is excluded.
  explodeProjectile(proj, x, y, z, directHitId = null) {
    const weapon = proj.weapon;
    if (!weapon.explodeRadius) return;
    const owner = this.players.find((p) => p.id === proj.owner);
    for (const target of this.players) {
      if (!target.alive || target.id === directHitId) continue;
      if (this.tick < target.spawnProtectUntil) continue;
      const dx = target.x - x;
      const dy = target.y + playerHeight(target.crouching) * 0.5 - y;
      const dz = target.z - z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > weapon.explodeRadius) continue;
      const falloff = 1 - dist / weapon.explodeRadius;
      let dmg = Math.round((weapon.explodeDamage || 60) * (0.35 + 0.65 * falloff));
      if (target.id === proj.owner) dmg = Math.round(dmg * 0.5); // softer self-blast
      if (dmg <= 0) continue;
      target.health -= dmg;
      this.events.push({ k: 'hurt', p: target.id, by: proj.owner, dmg, head: false });
      if (target.health <= 0) {
        if (owner && owner.id !== target.id) this.handleKill(owner, target, false);
        else this.handleEnvironmentalDeath(target);
      }
    }
  }

  fireMelee(player, weapon, ox, oy, oz) {
    const cp = Math.cos(player.pitch);
    const dx = -Math.sin(player.yaw) * cp;
    const dy = Math.sin(player.pitch);
    const dz = -Math.cos(player.yaw) * cp;
    const range = weapon.range || 2.5;

    const targets = (this.isDM || this.isGunGame) ? this.opponentsOf(player) : [this.opponentOf(player)].filter(Boolean);
    let hitTarget = null;
    let hitDist = range;

    for (const target of targets) {
      if (!target.alive) continue;
      const tState = this.targetStateAtShot(player, target);
      const tHit = rayCylinder(
        ox, oy, oz, dx, dy, dz,
        tState.x, tState.y, tState.z,
        HIT_RADIUS, playerHeight(tState.cr),
      );
      if (tHit !== null && tHit < hitDist) {
        hitDist = tHit;
        hitTarget = target;
      }
    }

    this.events.push({
      k: 'melee',
      p: player.id,
      w: weapon.id,
      hit: hitTarget ? hitTarget.id : null,
    });

    if (hitTarget && hitTarget.alive) {
      if (this.tick >= hitTarget.spawnProtectUntil) {
        hitTarget.health -= weapon.damage;
        const isHead = false;
        this.events.push({ k: 'hurt', p: hitTarget.id, by: player.id, dmg: weapon.damage, head: isHead });
        if (hitTarget.health <= 0) {
          this.handleKill(player, hitTarget, isHead);
        }
      }
    }
  }

  tickProjectiles() {
    const toRemove = [];
    for (let i = 0; i < this.projectiles.length; i++) {
      const proj = this.projectiles[i];
      proj.age += 1;
      const gravity = proj.weapon.projGravity || 15;
      proj.vy -= gravity * TICK_DT;
      const nx = proj.x + proj.vx * TICK_DT;
      const ny = proj.y + proj.vy * TICK_DT;
      const nz = proj.z + proj.vz * TICK_DT;

      // World collision
      const world = raycastWorld(
        this.arena.grid, proj.x, proj.y, proj.z,
        proj.vx * TICK_DT, proj.vy * TICK_DT, proj.vz * TICK_DT,
        Math.hypot(proj.vx, proj.vy, proj.vz) * TICK_DT,
      );

      let hitWorld = false;
      if (world.hit || ny <= 0) {
        hitWorld = true;
        const hx = ny <= 0 ? nx : proj.x + (world.dist / Math.hypot(proj.vx, proj.vy, proj.vz) / TICK_DT) * proj.vx * TICK_DT;
        const hy = ny <= 0 ? 0 : proj.y + (world.dist / Math.hypot(proj.vx, proj.vy, proj.vz) / TICK_DT) * proj.vy * TICK_DT;
        const hz = ny <= 0 ? nz : proj.z + (world.dist / Math.hypot(proj.vx, proj.vy, proj.vz) / TICK_DT) * proj.vz * TICK_DT;

        this.events.push({
          k: 'projImpact',
          id: proj.id,
          x: hx, y: Math.max(0, hy), z: hz,
          direct: false,
          boom: proj.weapon.explodeRadius || 0,
        });
        this.explodeProjectile(proj, hx, Math.max(0, hy), hz);

        if (proj.weapon.hazardRadius) {
          this.hazards.push({
            x: hx,
            y: 0,
            z: hz,
            radius: proj.weapon.hazardRadius,
            dps: proj.weapon.hazardDps || 8,
            owner: proj.owner,
            remainingTicks: Math.round((proj.weapon.hazardDuration || 5) * TICK_RATE),
          });
          this.events.push({
            k: 'hazardSpawn',
            x: hx, y: 0, z: hz,
            r: proj.weapon.hazardRadius,
            dur: proj.weapon.hazardDuration || 5,
          });
        }
        toRemove.push(i);
        continue;
      }

      // Player collision
      const targets = this.opponentsOf(
        this.players.find((p) => p.id === proj.owner) || this.players[0],
      );
      let hitPlayer = null;
      for (const target of targets) {
        if (!target.alive) continue;
        const tdx = nx - target.x;
        const tdz = nz - target.z;
        const dist2d = Math.hypot(tdx, tdz);
        if (dist2d < HIT_RADIUS + 0.3 && ny >= target.y && ny <= target.y + playerHeight(target.crouching)) {
          hitPlayer = target;
          break;
        }
      }

      if (hitPlayer) {
        if (this.tick >= hitPlayer.spawnProtectUntil) {
          const dmg = Math.round(proj.damage ?? proj.weapon.damage);
          hitPlayer.health -= dmg;
          this.events.push({ k: 'hurt', p: hitPlayer.id, by: proj.owner, dmg, head: false });
          if (hitPlayer.health <= 0) {
            const killer = this.players.find((p) => p.id === proj.owner);
            if (killer) this.handleKill(killer, hitPlayer, false);
          }
        }
        if (proj.weapon.hazardRadius) {
          this.hazards.push({
            x: nx, y: 0, z: nz,
            radius: proj.weapon.hazardRadius,
            dps: proj.weapon.hazardDps || 8,
            owner: proj.owner,
            remainingTicks: Math.round((proj.weapon.hazardDuration || 5) * TICK_RATE),
          });
          this.events.push({
            k: 'hazardSpawn',
            x: nx, y: 0, z: nz,
            r: proj.weapon.hazardRadius,
            dur: proj.weapon.hazardDuration || 5,
          });
        }
        this.events.push({
          k: 'projImpact',
          id: proj.id,
          x: nx, y: ny, z: nz,
          direct: true,
          boom: proj.weapon.explodeRadius || 0,
        });
        this.explodeProjectile(proj, nx, ny, nz, hitPlayer.id);
        toRemove.push(i);
        continue;
      }

      proj.x = nx;
      proj.y = ny;
      proj.z = nz;

      if (proj.age > TICK_RATE * 10) toRemove.push(i);
    }
    for (let i = toRemove.length - 1; i >= 0; i--) {
      this.projectiles.splice(toRemove[i], 1);
    }
  }

  tickHazards() {
    const toRemove = [];
    for (let i = 0; i < this.hazards.length; i++) {
      const hz = this.hazards[i];
      hz.remainingTicks -= 1;
      if (hz.remainingTicks <= 0) {
        toRemove.push(i);
        this.events.push({ k: 'hazardExpire', x: hz.x, y: hz.y, z: hz.z });
        continue;
      }
      if (this.state !== MATCH_STATE.LIVE) continue;

      const dmgPerTick = (hz.dps || 8) / TICK_RATE;
      for (const player of this.players) {
        if (!player.alive) continue;
        if (this.tick < player.spawnProtectUntil) continue;
        const dx = player.x - hz.x;
        const dz = player.z - hz.z;
        if (Math.hypot(dx, dz) >= hz.radius + HIT_RADIUS) continue;

        const dmg = Math.round(dmgPerTick * 100) / 100;
        player.health -= dmg;
        if (player.health > 0) continue;

        const killer = this.players.find((p) => p.id === hz.owner);
        if (killer && killer.id !== player.id) {
          // Same kill pipeline as bullets so duel rounds and Gun Game advance correctly.
          this.handleKill(killer, player, false);
        } else {
          this.handleEnvironmentalDeath(player);
        }
      }
    }
    for (let i = toRemove.length - 1; i >= 0; i--) {
      this.hazards.splice(toRemove[i], 1);
    }
  }

  handleEnvironmentalDeath(victim) {
    if (!victim.alive && victim.health > 0) return;
    victim.health = 0;
    victim.alive = false;
    victim.deaths += 1;
    this.events.push({ k: 'die', p: victim.id, by: victim.id, head: false });

    if (this.isGunGame || this.isDM) {
      const respawnSec = this.isGunGame ? GUNGAME_RESPAWN_SECONDS : DM_RESPAWN_SECONDS;
      victim.respawnAtTick = this.tick + Math.round(respawnSec * TICK_RATE);
      victim.wantsRespawn = false;
      return;
    }

    // Duel suicide / self-puddle: award the round to the remaining opponent.
    const foe = this.opponentOf(victim);
    this.endRound(foe, 'suicide');
  }

  handleKill(killer, victim, headshot) {
    if (!victim.alive && victim.health <= 0) return;
    if (this.state !== MATCH_STATE.LIVE) return;

    victim.health = 0;
    victim.alive = false;
    victim.deaths += 1;
    killer.kills += 1;
    this.events.push({ k: 'die', p: victim.id, by: killer.id, head: headshot });

    if (this.isGunGame) {
      this.gunGameAdvance(killer, victim);
      return;
    }

    if (this.isDM) {
      victim.respawnAtTick = this.tick + Math.round(DM_RESPAWN_SECONDS * TICK_RATE);
      victim.wantsRespawn = false;
      return;
    }

    this.endRound(killer, headshot ? 'headshot' : 'kill');
  }

  gunGameAdvance(killer, victim) {
    // Capture the kill weapon before any level-up swap. Leveling *into* knife
    // must not demote the victim; only an actual knife kill should.
    const killedWithKnife = killer.weaponId === 'knife';
    const oldLevel = killer.gunGameLevel;
    killer.gunGameLevel = Math.min(killer.gunGameLevel + 1, this.gunGameOrder.length - 1);
    killer.score = killer.gunGameLevel;

    if (oldLevel !== killer.gunGameLevel) {
      const newWid = this.gunGameOrder[killer.gunGameLevel];
      killer.weaponId = newWid;
      const w = WEAPONS[newWid];
      killer.ammo = w.magazine;
      killer.primaryAmmo = killer.ammo;
      killer.reloadUntilTick = 0;
      killer.nextShotTick = 0;
      killer.heat = 0;
      killer.overheatedUntilTick = 0;
      killer.chargeStartTick = 0;
      killer.burstRemaining = 0;
      killer.burstNextTick = 0;
      killer.bloom = 0;
      this.events.push({
        k: 'ggLevelUp',
        p: killer.id,
        lv: killer.gunGameLevel,
        w: newWid,
        wName: w.name,
      });
    }

    if (GUNGAME_DEMOTE_ON_KNIFE_DEATH && killedWithKnife && victim.gunGameLevel > 0) {
      victim.gunGameLevel = Math.max(0, victim.gunGameLevel - 1);
      victim.score = victim.gunGameLevel;
      this.events.push({
        k: 'ggDemote',
        p: victim.id,
        lv: victim.gunGameLevel,
      });
    }

    // Win only when the killer was already on the final knife level.
    if (oldLevel === this.gunGameOrder.length - 1) {
      this.endGunGame(killer);
      return;
    }

    const respawnSec = GUNGAME_RESPAWN_SECONDS;
    victim.respawnAtTick = this.tick + Math.round(respawnSec * TICK_RATE);
    victim.wantsRespawn = false;
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
        slot: p.slot,
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
        cr: p.crouching ? 1 : 0,
        sl: p.sliding ? 1 : 0,
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
        sp: p.spawnProtectUntil > this.tick ? p.spawnProtectUntil - this.tick : 0,
        ht: round(p.heat, 3),
        oh: p.overheatedUntilTick > this.tick ? p.overheatedUntilTick - this.tick : 0,
        cs: p.chargeStartTick > 0 ? this.tick - p.chargeStartTick : 0,
        ggLv: p.gunGameLevel,
      })),
      ev: this.events,
    };

    if (this.projectiles.length || this.hazards.length) {
      payload.projs = this.projectiles.map((pr) => ({
        id: pr.id, x: round(pr.x), y: round(pr.y), z: round(pr.z),
      }));
      payload.hazards = this.hazards.map((hz) => ({
        x: round(hz.x), y: round(hz.y), z: round(hz.z),
        r: hz.radius, rem: round(hz.remainingTicks / TICK_RATE, 1),
      }));
    }

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
