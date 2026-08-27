import { Match } from './match.js';
import { TICK_RATE, ROOM_CODE_LENGTH, MATCH_STATE, GAME_MODE, clampDmMinutes, playerColor } from '../shared/constants.js';
import { normalizeMapId, MAP_RANDOM } from '../shared/maps/index.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

let nextPlayerId = 1;

export class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.timer = null;
  }

  makeCode() {
    for (let attempt = 0; attempt < 500; attempt++) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('room code space exhausted');
  }

  create({ mode = GAME_MODE.DUEL, dmMinutes = 5, mapId = MAP_RANDOM } = {}) {
    const code = this.makeCode();
    const room = {
      code,
      match: null,
      createdAt: Date.now(),
      mode: mode === GAME_MODE.DEATHMATCH ? GAME_MODE.DEATHMATCH : GAME_MODE.DUEL,
      dmMinutes: clampDmMinutes(dmMinutes),
      mapId: normalizeMapId(mapId),
    };
    room.match = new Match(room, { mode: room.mode, dmMinutes: room.dmMinutes, mapId: room.mapId });
    this.rooms.set(code, room);
    return room;
  }

  get(code) {
    return this.rooms.get(String(code || '').toUpperCase().trim()) || null;
  }

  join(code, name, conn) {
    const room = this.get(code);
    if (!room) return { error: 'No match with that code.' };
    if (room.match.state !== MATCH_STATE.WAITING) {
      return { error: 'That match has already started.' };
    }
    if (room.match.players.length >= room.match.maxPlayers) {
      return { error: 'That match is already full.' };
    }
    return this.seat(room, name, conn);
  }

  seat(room, name, conn) {
    const id = `p${nextPlayerId++}`;
    const player = room.match.addPlayer(id, name, conn);
    return { room, player };
  }

  leave(room, playerId) {
    if (!room) return;
    room.match.removePlayer(playerId);
    if (room.match.players.length === 0) this.rooms.delete(room.code);
  }

  roster(room) {
    return room.match.players.map((p) => ({
      i: p.id,
      slot: p.slot,
      name: p.name,
      color: playerColor(p.slot),
      bot: Boolean(p.isBot),
    }));
  }

  addBot(room, requesterId) {
    if (requesterId !== room.match.hostId) {
      return { error: 'Only the host can add bots.' };
    }
    if (room.match.state !== MATCH_STATE.WAITING) {
      return { error: 'Bots can only be added before the match starts.' };
    }
    if (room.match.players.length >= room.match.maxPlayers) {
      return { error: 'Room is full.' };
    }
    const botNum = room.match.players.filter((p) => p.isBot).length + 1;
    const id = `p${nextPlayerId++}`;
    const player = room.match.addBot(id, `Bot ${botNum}`);
    if (!player) return { error: 'Room is full.' };
    return { player };
  }

  start() {
    if (this.timer) return;
    let previous = process.hrtime.bigint();
    let accumulator = 0;
    const stepNs = BigInt(Math.round(1e9 / TICK_RATE));

    this.timer = setInterval(() => {
      const now = process.hrtime.bigint();
      accumulator += Number(now - previous);
      previous = now;
      const stepMs = Number(stepNs);

      let steps = 0;
      while (accumulator >= stepMs && steps < 5) {
        accumulator -= stepMs;
        steps++;
        for (const room of this.rooms.values()) {
          if (room.match.players.length > 0) room.match.update();
        }
      }
      if (steps === 5) accumulator = 0;
    }, 1000 / TICK_RATE);
  }

  stats() {
    let players = 0;
    let live = 0;
    for (const room of this.rooms.values()) {
      players += room.match.players.length;
      if (room.match.state !== MATCH_STATE.WAITING) live++;
    }
    return { rooms: this.rooms.size, players, live };
  }
}
