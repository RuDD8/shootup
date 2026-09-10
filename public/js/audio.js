// Everything is synthesised at runtime except the fart sample
// (public/sounds/fart.mp3, CC0 from bigsoundbank.com), because no oscillator
// does a real fart justice.

const SHOT_PROFILES = {
  // ── Original weapons ──────────────────────────────────────────────
  pistol:       { dur: 0.16, cutoff: 2400, thump: 150, gain: 0.50, q: 1.2 },
  assault:      { dur: 0.13, cutoff: 3200, thump: 190, gain: 0.45, q: 1.0 },
  shotgun:      { dur: 0.36, cutoff: 1300, thump: 85,  gain: 0.72, q: 0.8 },
  sniper:       { dur: 0.50, cutoff: 1800, thump: 70,  gain: 0.80, q: 1.6 },

  // ── Sidearms ──────────────────────────────────────────────────────
  revolver:      { dur: 0.30, cutoff: 1600, thump: 80,  gain: 0.74, q: 1.4 },
  machinepistol: { dur: 0.10, cutoff: 3600, thump: 210, gain: 0.35, q: 0.9 },
  deagle:        { dur: 0.25, cutoff: 2000, thump: 100, gain: 0.70, q: 1.3 },

  // ── SMGs ──────────────────────────────────────────────────────────
  smg:    { dur: 0.10, cutoff: 3500, thump: 200, gain: 0.38, q: 0.9 },
  p90:    { dur: 0.10, cutoff: 2800, thump: 180, gain: 0.42, q: 1.0 },
  vector: { dur: 0.08, cutoff: 4000, thump: 220, gain: 0.32, q: 0.8 },

  // ── Rifles ────────────────────────────────────────────────────────
  battlerifle: { dur: 0.15, cutoff: 2600, thump: 130, gain: 0.52, q: 1.1 },
  burstrifle:  { dur: 0.12, cutoff: 3000, thump: 170, gain: 0.44, q: 1.0 },
  dmr:         { dur: 0.20, cutoff: 2200, thump: 110, gain: 0.60, q: 1.4 },
  carbine:     { dur: 0.11, cutoff: 3400, thump: 185, gain: 0.42, q: 1.0 },

  // ── Shotguns ──────────────────────────────────────────────────────
  autoshotgun:  { dur: 0.28, cutoff: 1350, thump: 90,  gain: 0.62, q: 0.8 },
  slugshotgun:  { dur: 0.35, cutoff: 1100, thump: 75,  gain: 0.76, q: 0.7 },
  doublebarrel: { dur: 0.40, cutoff: 1000, thump: 65,  gain: 0.85, q: 0.6 },

  // ── Snipers ───────────────────────────────────────────────────────
  scout: { dur: 0.35, cutoff: 2100, thump: 90,  gain: 0.65, q: 1.5 },
  awp:   { dur: 0.60, cutoff: 1500, thump: 60,  gain: 0.90, q: 1.8 },

  // ── Heavy ─────────────────────────────────────────────────────────
  lmg:     { dur: 0.14, cutoff: 2400, thump: 140, gain: 0.48, q: 0.9 },
  minigun: { dur: 0.06, cutoff: 3800, thump: 240, gain: 0.30, q: 0.7 },

  // ── Exotic ────────────────────────────────────────────────────────
  crossbow:    { dur: 0.15, cutoff: 2600, thump: 200, gain: 0.44, q: 1.2 },
  sawedoff:    { dur: 0.30, cutoff: 1100, thump: 80,  gain: 0.78, q: 0.6 },
  leveraction: { dur: 0.22, cutoff: 2200, thump: 120, gain: 0.55, q: 1.3 },

  // ── Special ───────────────────────────────────────────────────────
  bow:     { dur: 0.12, cutoff: 3000, thump: 400, gain: 0.18, q: 1.8 },
  laser:   { dur: 0.04, cutoff: 5000, thump: 600, gain: 0.15, q: 2.0 },
  poopgun: { dur: 0.25, cutoff: 800,  thump: 50,  gain: 0.48, q: 0.4 },
  fahgun:  { dur: 0.40, cutoff: 1400, thump: 70,  gain: 0.70, q: 1.0 },
  knife:   { dur: 0.08, cutoff: 4500, thump: 500, gain: 0.25, q: 1.6 },
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.noise = null;
    this.master = null;
    this.volume = 0.55;
    this.samples = {};
    this.samplesLoading = {};
  }

  // Must be called from a user gesture or browsers keep the context suspended.
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.noise = this.makeNoise(1.0);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.loadSample('fart', '/sounds/fart.mp3');
    this.loadSample('fahh', '/sounds/fahh.mp3');
  }

  loadSample(key, url) {
    if (this.samples[key] || this.samplesLoading[key] || !this.ctx) return;
    this.samplesLoading[key] = true;
    fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => this.ctx.decodeAudioData(data))
      .then((buffer) => {
        this.samples[key] = buffer;
      })
      .catch(() => {
        // Retry on the next unlock; synth fallbacks cover the meantime.
        this.samplesLoading[key] = false;
      });
  }

  playSample(key, gain = 1, out = null, rateJitter = 0) {
    const buffer = this.samples[key];
    if (!buffer) return null;
    const t = this.now;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = 1 - rateJitter + Math.random() * rateJitter * 2;
    const env = this.ctx.createGain();
    env.gain.value = gain;
    src.connect(env).connect(out || this.master);
    src.start(t);
    return src;
  }

  setVolume(value) {
    if (!Number.isFinite(value)) return;
    this.volume = Math.max(0, Math.min(1, value));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.015);
    }
  }

  makeNoise(seconds) {
    const frames = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  get now() {
    return this.ctx.currentTime;
  }

  // Call once per frame with the camera pose so positional sounds keep
  // tracking the view while they play (turning rotates the sound field).
  updateListener(x, y, z, yaw, pitch) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const cp = Math.cos(pitch);
    const fx = -Math.sin(yaw) * cp;
    const fy = Math.sin(pitch);
    const fz = -Math.cos(yaw) * cp;
    if (l.positionX) {
      l.positionX.value = x;
      l.positionY.value = y;
      l.positionZ.value = z;
      l.forwardX.value = fx;
      l.forwardY.value = fy;
      l.forwardZ.value = fz;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else if (l.setPosition) {
      l.setPosition(x, y, z);
      l.setOrientation(fx, fy, fz, 0, 1, 0);
    }
  }

  // Output node fixed at a world position; the live listener pose from
  // updateListener() gives direction and distance attenuation.
  spatial(x, y, z, maxDist = 30) {
    const p = this.ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'linear';
    p.refDistance = 2;
    p.maxDistance = maxDist;
    p.rolloffFactor = 1;
    if (p.positionX) {
      p.positionX.value = x;
      p.positionY.value = y;
      p.positionZ.value = z;
    } else if (p.setPosition) {
      p.setPosition(x, y, z);
    }
    p.connect(this.master);
    return p;
  }

  shot(weaponId, gain = 1) {
    if (!this.ctx) return;
    const p = SHOT_PROFILES[weaponId] || SHOT_PROFILES.pistol;
    const t = this.now;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 1 + Math.random() * 0.12;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = p.q;
    filter.frequency.setValueAtTime(p.cutoff, t);
    filter.frequency.exponentialRampToValueAtTime(220, t + p.dur);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(p.gain * gain, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t + p.dur);

    src.connect(filter).connect(env).connect(this.master);
    src.start(t);
    src.stop(t + p.dur + 0.02);

    // Low sine gives the shot some body through small speakers.
    const osc = this.ctx.createOscillator();
    const oscEnv = this.ctx.createGain();
    osc.frequency.setValueAtTime(p.thump, t);
    osc.frequency.exponentialRampToValueAtTime(p.thump * 0.5, t + p.dur * 0.7);
    oscEnv.gain.setValueAtTime(0.34 * gain, t);
    oscEnv.gain.exponentialRampToValueAtTime(0.0001, t + p.dur * 0.8);
    osc.connect(oscEnv).connect(this.master);
    osc.start(t);
    osc.stop(t + p.dur);
  }

  blip(freq, dur = 0.06, gain = 0.3, type = 'square') {
    if (!this.ctx) return;
    const t = this.now;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.01);
  }

  hitmarker() {
    this.blip(1500, 0.05, 0.22, 'square');
  }

  headshot() {
    this.blip(2100, 0.09, 0.26, 'square');
    setTimeout(() => this.blip(2800, 0.06, 0.18, 'square'), 45);
  }

  hurt() {
    if (!this.ctx) return;
    const t = this.now;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 320;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.5, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    src.connect(filter).connect(env).connect(this.master);
    src.start(t);
    src.stop(t + 0.24);
  }

  impact(gain = 0.25) {
    if (!this.ctx) return;
    const t = this.now;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 1.6 + Math.random() * 0.5;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1800;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    src.connect(filter).connect(env).connect(this.master);
    src.start(t);
    src.stop(t + 0.1);
  }

  footstep(surface = 'default', gain = 1) {
    if (!this.ctx) return;
    const t = this.now;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 1.8 + Math.random() * 0.55;

    const filter = this.ctx.createBiquadFilter();
    filter.type = surface === 'snow' ? 'bandpass' : 'lowpass';
    filter.frequency.value = surface === 'snow' ? 1050 : 420;
    filter.Q.value = surface === 'snow' ? 0.8 : 1.3;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.12 * gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    src.connect(filter).connect(env).connect(this.master);
    src.start(t);
    src.stop(t + 0.1);
  }

  reload() {
    this.blip(320, 0.05, 0.2, 'sawtooth');
    setTimeout(() => this.blip(240, 0.07, 0.18, 'sawtooth'), 120);
  }

  // Real recorded fart for the poopgun reload, played when the hand reaches
  // the player's rear to grab a fresh one. Pass `at` ({x, y, z}) to place the
  // sound in the world so it pans and attenuates from the farter's direction.
  fart(gain = 1, at = null) {
    if (!this.ctx) return;
    const t = this.now;
    const out = at ? this.spatial(at.x, at.y, at.z) : this.master;

    // Slight pitch variance so back-to-back reloads don't sound canned.
    if (this.playSample('fart', 0.9 * gain, out, 0.09)) return;

    // Synth fallback, only heard if the sample has not finished loading.
    const dur = 0.45 + Math.random() * 0.2;

    // Low buzz dropping in pitch, chopped by an irregular flutter envelope so
    // it sputters instead of droning.
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(90 + Math.random() * 30, t);
    osc.frequency.exponentialRampToValueAtTime(36, t + dur);

    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(850, t);
    lowpass.frequency.exponentialRampToValueAtTime(240, t + dur);
    lowpass.Q.value = 2.4;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    let cursor = t;
    let level = 0.5 * gain;
    while (cursor < t + dur - 0.05) {
      const step = 0.035 + Math.random() * 0.05;
      env.gain.linearRampToValueAtTime(level * (0.45 + Math.random() * 0.55), cursor + step * 0.5);
      env.gain.linearRampToValueAtTime(level * (0.05 + Math.random() * 0.2), cursor + step);
      cursor += step;
      level *= 0.92;
    }
    env.gain.linearRampToValueAtTime(0.0001, t + dur);

    osc.connect(lowpass).connect(env).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);

    // Breathy band-passed noise underneath for the wet texture.
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.5;
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 300;
    nf.Q.value = 0.7;
    const nEnv = this.ctx.createGain();
    nEnv.gain.setValueAtTime(0.16 * gain, t);
    nEnv.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(nf).connect(nEnv).connect(out);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  countdown(step) {
    this.blip(step === 0 ? 900 : 520, step === 0 ? 0.2 : 0.09, 0.3, 'triangle');
  }

  roundWin() {
    [660, 880, 1180].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 0.28, 'triangle'), i * 110));
  }

  roundLoss() {
    [420, 330, 240].forEach((f, i) => setTimeout(() => this.blip(f, 0.2, 0.24, 'triangle'), i * 130));
  }

  // Continuous beam hum for the laser gun.  Call once to start; returns a
  // stop() handle.  The tone is a high-frequency saw filtered into a sci-fi
  // buzz that layers naturally when shot() is also called per-tick.
  beamLoop(gain = 0.12) {
    if (!this.ctx) return { stop() {} };
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 580;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1200;
    filter.Q.value = 4;

    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 30;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 200;
    lfo.connect(lfoGain).connect(filter.frequency);

    const env = this.ctx.createGain();
    env.gain.value = gain;

    osc.connect(filter).connect(env).connect(this.master);
    osc.start();
    lfo.start();

    return {
      stop: () => {
        const t = this.ctx.currentTime;
        env.gain.setTargetAtTime(0, t, 0.03);
        osc.stop(t + 0.1);
        lfo.stop(t + 0.1);
      },
    };
  }

  // The FAHH meme scream, attached to a flying rocket. Returns a handle so the
  // caller can move the sound with the projectile and cut it off on impact.
  fahhTracked(x, y, z, gain = 0.95) {
    if (!this.ctx) return null;
    const panner = this.spatial(x, y, z, 50);
    const src = this.playSample('fahh', gain, panner, 0.03);
    if (!src) {
      // Fallback while the sample loads: a regular launcher thump.
      this.shot('fahgun', gain);
      return null;
    }
    return {
      move: (nx, ny, nz) => {
        if (panner.positionX) {
          panner.positionX.value = nx;
          panner.positionY.value = ny;
          panner.positionZ.value = nz;
        } else if (panner.setPosition) {
          panner.setPosition(nx, ny, nz);
        }
      },
      stop: () => {
        try {
          src.stop();
        } catch {
          // Source already ended on its own.
        }
      },
    };
  }

  // Rocket detonation: a deep filtered noise boom with a sine thump.
  explosion(gain = 1, at = null) {
    if (!this.ctx) return;
    const t = this.now;
    const out = at ? this.spatial(at.x, at.y, at.z, 60) : this.master;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.7;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(950, t);
    lp.frequency.exponentialRampToValueAtTime(90, t + 0.7);
    lp.Q.value = 0.9;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.9 * gain, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    src.connect(lp).connect(env).connect(out);
    src.start(t);
    src.stop(t + 0.8);

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(60, t);
    osc.frequency.exponentialRampToValueAtTime(26, t + 0.6);
    const oe = this.ctx.createGain();
    oe.gain.setValueAtTime(0.7 * gain, t);
    oe.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
    osc.connect(oe).connect(out);
    osc.start(t);
    osc.stop(t + 0.7);
  }

  // Quick whooshing slash for melee knife attacks.
  meleeSwing(gain = 1) {
    if (!this.ctx) return;
    const t = this.now;

    // Filtered noise burst for the "air cut" whoosh.
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 2.2 + Math.random() * 0.4;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(3200, t);
    bp.frequency.exponentialRampToValueAtTime(800, t + 0.09);
    bp.Q.value = 1.8;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.28 * gain, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.10);

    src.connect(bp).connect(env).connect(this.master);
    src.start(t);
    src.stop(t + 0.12);

    // High sine sweep gives the slash a tonal "zing".
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(900, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.08);
    const oscEnv = this.ctx.createGain();
    oscEnv.gain.setValueAtTime(0.14 * gain, t);
    oscEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    osc.connect(oscEnv).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.10);
  }
}
