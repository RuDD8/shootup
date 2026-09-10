// Everything is synthesised at runtime, so the game ships with no audio files.

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
  knife:   { dur: 0.08, cutoff: 4500, thump: 500, gain: 0.25, q: 1.6 },
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.noise = null;
    this.master = null;
    this.volume = 0.55;
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
