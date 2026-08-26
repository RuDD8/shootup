import { Match } from './match.js';
import { TICK_RATE, ROOM_CODE_LENGTH, MATCH_STATE } from '../shared/constants.js';

// Deliberately excludes I, O, 0 and 1 so codes can be read aloud without
// anyone mistyping them.
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

  create() {
    const code = this.makeCode();
    const room = { code, match: null, createdAt: Date.now() };
    room.match = new Match(room);
    this.rooms.set(code, room);
    return room;
  }

  get(code) {
    return this.rooms.get(String(code || '').toUpperCase().trim()) || null;
  }

  join(code, name, conn) {
    const room = this.get(code);
    if (!room) return { error: 'No match with that code.' };
    if (room.match.players.length >= 2) return { error: 'That match is already full.' };
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
    return room.match.players.map((p) => ({ i: p.id, slot: p.slot, name: p.name }));
  }

  start() {
    if (this.timer) return;
    // A single loop drives every match on the server.
    let previous = process.hrtime.bigint();
    let accumulator = 0;
    const stepNs = BigInt(Math.round(1e9 / TICK_RATE));

    this.timer = setInterval(() => {
      const now = process.hrtime.bigint();
      accumulator += Number(now - previous);
      previous = now;
      const stepMs = Number(stepNs);

      // Catch up on missed ticks, but never spiral if the process was stalled.
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
