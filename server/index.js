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
  '.glb': 'model/gltf-binary',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// Resolve a URL path inside one of the served directories, refusing anything
// that escapes it.
function resolveFile(urlPath) {
  let clean;
  try {
    clean = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
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

  if ((req.url || '').split('?')[0] === '/health') {
    const body = JSON.stringify({
      ok: true,
      uptime: Math.floor(process.uptime()),
      ...rooms.stats(),
    });
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
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
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'Cross-Origin-Opener-Policy': 'same-origin',
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

const connections = attachWebSocket(server, (conn) => {
  const session = {
    room: null,
    playerId: null,
    rateWindowAt: Date.now(),
    messagesInWindow: 0,
    failedJoins: 0,
  };

  conn.sendJSON({ t: 'hello' });

  conn.on('message', (raw) => {
    const now = Date.now();
    if (now - session.rateWindowAt >= 1000) {
      session.rateWindowAt = now;
      session.messagesInWindow = 0;
    }
    session.messagesInWindow += 1;
    if (session.messagesInWindow > 180) {
      conn.close(1008);
      return;
    }

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
        const mode = msg.mode === 'deathmatch' ? 'deathmatch' : msg.mode === 'gungame' ? 'gungame' : 'duel';
        const room = rooms.create({ mode, dmMinutes: msg.dmMinutes, mapId: msg.mapId });
        if (!room) {
          conn.sendJSON({ t: 'error', msg: 'Server is at room capacity. Try again shortly.' });
          return;
        }
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
          session.failedJoins += 1;
          if (session.failedJoins > 12) {
            conn.close(1008);
            return;
          }
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

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  rooms.stop();
  for (const connection of [...connections]) connection.close(1001);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
