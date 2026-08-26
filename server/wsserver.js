import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

// Minimal RFC 6455 server. Only what this game needs: text frames, close,
// ping/pong, and fragment reassembly. Implemented here so the project has no
// npm dependencies and runs straight from a clean checkout.

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_PAYLOAD = 1 << 20;
const PING_INTERVAL_MS = 25000;

const OP = { CONT: 0x0, TEXT: 0x1, BINARY: 0x2, CLOSE: 0x8, PING: 0x9, PONG: 0xa };

function encodeFrame(opcode, payload) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.allocUnsafe(2);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.allocUnsafe(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  header[0] = 0x80 | opcode; // server frames are never fragmented here
  return Buffer.concat([header, payload]);
}

export class WSConnection extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.fragments = [];
    this.fragmentOpcode = null;
    this.closed = false;
    this.isAlive = true;

    socket.setNoDelay(true);
    socket.on('data', (chunk) => this.receive(chunk));
    socket.on('close', () => this.finish());
    socket.on('error', () => this.finish());
  }

  receive(chunk) {
    if (this.closed) return;
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    this.drain();
  }

  drain() {
    while (!this.closed) {
      const buf = this.buffer;
      if (buf.length < 2) return;

      const b0 = buf[0];
      const b1 = buf[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let offset = 2;

      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        const big = buf.readBigUInt64BE(2);
        if (big > BigInt(MAX_PAYLOAD)) return this.close(1009);
        len = Number(big);
        offset = 10;
      }
      if (len > MAX_PAYLOAD) return this.close(1009);

      let mask = null;
      if (masked) {
        if (buf.length < offset + 4) return;
        mask = buf.subarray(offset, offset + 4);
        offset += 4;
      }

      if (buf.length < offset + len) return;

      const payload = Buffer.from(buf.subarray(offset, offset + len));
      if (mask) {
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      }
      this.buffer = buf.subarray(offset + len);

      this.handleFrame(fin, opcode, payload);
    }
  }

  handleFrame(fin, opcode, payload) {
    switch (opcode) {
      case OP.PING:
        if (!this.closed) this.socket.write(encodeFrame(OP.PONG, payload));
        return;
      case OP.PONG:
        this.isAlive = true;
        return;
      case OP.CLOSE:
        this.close(1000);
        return;
      case OP.TEXT:
      case OP.BINARY:
        if (fin) {
          this.emitMessage(opcode, payload);
        } else {
          this.fragmentOpcode = opcode;
          this.fragments = [payload];
        }
        return;
      case OP.CONT: {
        if (this.fragmentOpcode === null) return;
        this.fragments.push(payload);
        const total = this.fragments.reduce((n, f) => n + f.length, 0);
        if (total > MAX_PAYLOAD) return this.close(1009);
        if (fin) {
          const joined = Buffer.concat(this.fragments);
          const op = this.fragmentOpcode;
          this.fragments = [];
          this.fragmentOpcode = null;
          this.emitMessage(op, joined);
        }
        return;
      }
      default:
        this.close(1002);
    }
  }

  emitMessage(opcode, payload) {
    if (opcode === OP.TEXT) this.emit('message', payload.toString('utf8'));
    else this.emit('binary', payload);
  }

  send(text) {
    if (this.closed || this.socket.destroyed) return;
    this.socket.write(encodeFrame(OP.TEXT, Buffer.from(text, 'utf8')));
  }

  sendJSON(value) {
    this.send(JSON.stringify(value));
  }

  ping() {
    if (this.closed || this.socket.destroyed) return;
    this.isAlive = false;
    this.socket.write(encodeFrame(OP.PING, Buffer.alloc(0)));
  }

  close(code = 1000) {
    if (this.closed) return;
    this.closed = true;
    try {
      const body = Buffer.allocUnsafe(2);
      body.writeUInt16BE(code, 0);
      this.socket.write(encodeFrame(OP.CLOSE, body));
    } catch {
      // socket already gone; nothing useful to do
    }
    this.socket.end();
    this.emit('close');
  }

  finish() {
    if (this.closed) return;
    this.closed = true;
    this.emit('close');
  }
}

export function attachWebSocket(server, onConnection) {
  const connections = new Set();

  server.on('upgrade', (req, socket, head) => {
    if ((req.headers.upgrade || '').toLowerCase() !== 'websocket') {
      socket.destroy();
      return;
    }
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    const accept = crypto
      .createHash('sha1')
      .update(key + GUID)
      .digest('base64');

    // No Sec-WebSocket-Extensions in the reply, so compression stays off and
    // every frame arrives exactly as the parser above expects.
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );

    const conn = new WSConnection(socket);
    connections.add(conn);
    conn.on('close', () => connections.delete(conn));
    if (head && head.length) conn.receive(head);
    onConnection(conn, req);
  });

  const heartbeat = setInterval(() => {
    for (const conn of connections) {
      if (!conn.isAlive) conn.close(1001);
      else conn.ping();
    }
  }, PING_INTERVAL_MS);
  heartbeat.unref();

  return connections;
}
