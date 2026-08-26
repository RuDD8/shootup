// Everything is synthesised at runtime, so the game ships with no audio files.

const SHOT_PROFILES = {
  pistol: { dur: 0.16, cutoff: 2400, thump: 150, gain: 0.5, q: 1.2 },
  assault: { dur: 0.13, cutoff: 3200, thump: 190, gain: 0.45, q: 1.0 },
  shotgun: { dur: 0.36, cutoff: 1300, thump: 85, gain: 0.72, q: 0.8 },
  sniper: { dur: 0.5, cutoff: 1800, thump: 70, gain: 0.8, q: 1.6 },
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.noise = null;
    this.master = null;
  }

  // Must be called from a user gesture or browsers keep the context suspended.
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this.noise = this.makeNoise(1.0);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
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
}
