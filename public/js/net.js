// Thin JSON transport over WebSocket, plus a round-trip time probe so the HUD
// can show a real latency figure.

export class Net {
  constructor() {
    this.socket = null;
    this.handlers = new Map();
    this.ping = 0;
    this.pingCounter = 0;
    this.pingSentAt = new Map();
    this.pingTimer = null;
    this.onClose = null;
  }

  on(type, fn) {
    this.handlers.set(type, fn);
    return this;
  }

  connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}/`);
    this.socket = socket;

    socket.addEventListener('message', (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.t === 'pong') {
        const sent = this.pingSentAt.get(msg.c);
        if (sent !== undefined) {
          this.ping = Math.round(performance.now() - sent);
          this.pingSentAt.delete(msg.c);
        }
        return;
      }
      const handler = this.handlers.get(msg.t);
      if (handler) handler(msg);
    });

    socket.addEventListener('open', () => {
      this.pingTimer = setInterval(() => this.probe(), 2000);
      this.probe();
      const handler = this.handlers.get('open');
      if (handler) handler();
    });

    const shutdown = () => {
      clearInterval(this.pingTimer);
      if (this.onClose) this.onClose();
    };
    socket.addEventListener('close', shutdown);
    socket.addEventListener('error', shutdown);

    return this;
  }

  probe() {
    const id = ++this.pingCounter;
    this.pingSentAt.set(id, performance.now());
    // Drop stale probes so a flaky link cannot grow this map without bound.
    if (this.pingSentAt.size > 20) {
      const oldest = this.pingSentAt.keys().next().value;
      this.pingSentAt.delete(oldest);
    }
    this.send({ t: 'ping', c: id });
  }

  get ready() {
    return this.socket && this.socket.readyState === WebSocket.OPEN;
  }

  send(obj) {
    if (!this.ready) return;
    this.socket.send(JSON.stringify(obj));
  }
}
