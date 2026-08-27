import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { attachWebSocket } from './wsserver.js';
import { RoomManager } from './rooms.js';
import { playerColor } from '../shared/constants.js';
import { mapName } from '../shared/maps/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const SHARED_DIR = path.join(ROOT, 'shared');

const PORT = Number(process.env.PORT) || 8787;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// Resolve a URL path inside one of the served directories, refusing anything
// that escapes it.
function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const base = clean.startsWith('/shared/') ? SHARED_DIR : PUBLIC_DIR;
  const relative = clean.startsWith('/shared/') ? clean.slice('/shared/'.length) : clean.slice(1);
  const target = path.resolve(base, relative === '' ? 'index.html' : relative);
  if (target !== base && !target.startsWith(base + path.sep)) return null;
  return target;
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end('Method Not Allowed');
    return;
  }

  const file = resolveFile(req.url || '/');
  if (!file) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      // The client is served fresh every load; the vendored engine is large
      // but immutable, so let the browser keep it.
      'Cache-Control': ext === '.js' && file.includes('vendor') ? 'max-age=604800' : 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
});

const rooms = new RoomManager();
rooms.start();

attachWebSocket(server, (conn) => {
  const session = { room: null, playerId: null };

  conn.sendJSON({ t: 'hello' });

  conn.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg.t !== 'string') return;

    switch (msg.t) {
      case 'create': {
        if (session.room) return;
        const mode = msg.mode === 'deathmatch' ? 'deathmatch' : 'duel';
        const room = rooms.create({ mode, dmMinutes: msg.dmMinutes, mapId: msg.mapId });
        const { player } = rooms.seat(room, cleanName(msg.name), conn);
        session.room = room;
        session.playerId = player.id;
        conn.sendJSON({
          t: 'joined',
          code: room.code,
          id: player.id,
          slot: player.slot,
          mode: room.mode,
          dmMinutes: room.dmMinutes,
          mapId: room.mapId,
          mapName: mapName(room.mapId),
          isHost: true,
          maxPlayers: room.match.maxPlayers,
          color: playerColor(player.slot),
          players: rooms.roster(room),
        });
        break;
      }

      case 'join': {
        if (session.room) return;
        const result = rooms.join(msg.code, cleanName(msg.name), conn);
        if (result.error) {
          conn.sendJSON({ t: 'error', msg: result.error });
          return;
        }
        session.room = result.room;
        session.playerId = result.player.id;
        const roster = rooms.roster(result.room);
        conn.sendJSON({
          t: 'joined',
          code: result.room.code,
          id: result.player.id,
          slot: result.player.slot,
          mode: result.room.mode,
          dmMinutes: result.room.dmMinutes,
          mapId: result.room.mapId,
          mapName: mapName(result.room.mapId),
          isHost: result.player.id === result.room.match.hostId,
          maxPlayers: result.room.match.maxPlayers,
          color: playerColor(result.player.slot),
          players: roster,
        });
        result.room.match.broadcast({ t: 'peers', players: roster });
        break;
      }

      case 'start': {
        if (!session.room) return;
        const started = session.room.match.tryStart(session.playerId);
        if (!started) {
          conn.sendJSON({ t: 'error', msg: 'Cannot start yet — need at least 2 players.' });
        }
        break;
      }

      case 'addbot': {
        if (!session.room) return;
        const result = rooms.addBot(session.room, session.playerId);
        if (result.error) {
          conn.sendJSON({ t: 'error', msg: result.error });
          return;
        }
        const roster = rooms.roster(session.room);
        session.room.match.broadcast({ t: 'peers', players: roster });
        break;
      }

      case 'i':
        if (session.room) session.room.match.queueInput(session.playerId, msg);
        break;

      case 'ping':
        conn.sendJSON({ t: 'pong', c: msg.c });
        break;

      default:
        break;
    }
  });

  conn.on('close', () => {
    if (!session.room) return;
    const room = session.room;
    const leaving = session.playerId;
    session.room = null;
    rooms.leave(room, leaving);
    room.match.broadcast({
      t: 'opponentleft',
      players: rooms.roster(room),
    });
  });
});

function cleanName(value) {
  const name = String(value || '').replace(/[^\w \-]/g, '').trim().slice(0, 14);
  return name || 'Player';
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use.`);
    console.error(`  Start on another port instead:  PORT=9000 npm start\n`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, '0.0.0.0', () => {
  const urls = [`http://localhost:${PORT}`];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) urls.push(`http://${net.address}:${PORT}`);
    }
  }
  console.log('\n  DUEL ARENA — 1v1 FPS\n');
  console.log('  Open one of these in a browser:');
  for (const url of urls) console.log(`    ${url}`);
  console.log('\n  One player clicks CREATE and reads out the code.');
  console.log('  The other picks JOIN and types it in.\n');
});
