// Procedural Web Audio sound bank. Every sound is a named entry; to replace one with a recorded
// sample later, add `name: 'path/to/file.ogg'` to SOUND_FILES and it is loaded and used instead.
// No external services or downloads: all default audio is synthesized at runtime.

export const SOUND_FILES = {
  // punchHeavy: 'assets/audio/punch_heavy.ogg',
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.synths = {};
    this.buffers = {};
    this.vol = { master: 0.8, music: 0.5, sfx: 0.9 };
    this.excitement = 0;
    this.musicMode = null;
    this._registerDefaults();
  }

  /** Must be called from a user gesture (browser autoplay rules). Safe to call repeatedly. */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.music = ctx.createGain();
    this.crowd = ctx.createGain();
    this.sfx.connect(this.master);
    this.music.connect(this.master);
    this.crowd.connect(this.master);
    // Big concrete room reverb
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(2.4, 2.6);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.35;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.master);
    this.noise = this._noiseBuffer(2);
    this.applyVolumes();
    this._startCrowd();
    for (const [name, url] of Object.entries(SOUND_FILES)) this._load(name, url);
  }

  setVolumes(s) {
    this.vol = { master: s.master, music: s.music, sfx: s.sfx };
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
    this.crowd.gain.setTargetAtTime(this.vol.sfx * 0.9, t, 0.05);
    this.music.gain.setTargetAtTime(this.vol.music * 0.55, t, 0.05);
  }

  register(name, fn) {
    this.synths[name] = fn;
  }

  async _load(name, url) {
    try {
      const res = await fetch(url);
      const data = await res.arrayBuffer();
      this.buffers[name] = await this.ctx.decodeAudioData(data);
    } catch {
      /* fall back to the synthesized version */
    }
  }

  /** Play a named sound. opts: { vol, rate, pan, reverb } */
  play(name, opts = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const out = this._voiceOut(opts);
    if (this.buffers[name]) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffers[name];
      src.playbackRate.value = opts.rate || 1;
      src.connect(out);
      src.start();
      return;
    }
    const fn = this.synths[name];
    if (fn) fn(this.ctx, out, this.ctx.currentTime, opts);
  }

  _voiceOut(opts) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = opts.vol ?? 1;
    let node = g;
    if (opts.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      g.connect(p);
      node = p;
    }
    node.connect(this.sfx);
    const rv = opts.reverb ?? 0.25;
    if (rv > 0) {
      const s = ctx.createGain();
      s.gain.value = rv;
      node.connect(s);
      s.connect(this.reverbSend);
    }
    // auto-cleanup once silent (sounds are short)
    setTimeout(() => g.disconnect(), 4000);
    return g;
  }

  // ---------------------------------------------------------------------------------------------
  // Synthesis building blocks

  _noiseBuffer(sec) {
    const ctx = this.ctx;
    const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  _impulse(sec, decay) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * sec;
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  _registerDefaults() {
    const self = this;
    const env = (g, t, a, peak, dur) => {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
    };
    const noise = (ctx, out, t, { type = 'lowpass', f = 1000, f2 = null, q = 1, a = 0.002, dur = 0.1, gain = 0.5, rate = 1 }) => {
      const src = ctx.createBufferSource();
      src.buffer = self.noise;
      src.playbackRate.value = rate;
      const flt = ctx.createBiquadFilter();
      flt.type = type;
      flt.frequency.setValueAtTime(f, t);
      if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + a + dur);
      flt.Q.value = q;
      const g = ctx.createGain();
      env(g, t, a, gain, dur);
      src.connect(flt).connect(g).connect(out);
      src.start(t, Math.random() * 1.5);
      src.stop(t + a + dur + 0.05);
    };
    const tone = (ctx, out, t, { type = 'sine', f = 200, f2 = null, a = 0.003, dur = 0.2, gain = 0.5, detune = 0 }) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + dur);
      o.detune.value = detune;
      const g = ctx.createGain();
      env(g, t, a, gain, dur);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + a + dur + 0.05);
    };
    this._noise = noise;
    this._tone = tone;
    const R = (o) => o.rate || 1;

    this.register('punchLight', (ctx, out, t, o) => {
      tone(ctx, out, t, { f: 150 * R(o), f2: 60, dur: 0.09, gain: 0.7 });
      noise(ctx, out, t, { f: 2600, f2: 500, dur: 0.06, gain: 0.55 });
    });
    this.register('punchMed', (ctx, out, t, o) => {
      tone(ctx, out, t, { f: 130 * R(o), f2: 45, dur: 0.14, gain: 0.9 });
      noise(ctx, out, t, { type: 'bandpass', f: 1600, f2: 400, q: 0.8, dur: 0.09, gain: 0.9 });
    });
    this.register('punchHeavy', (ctx, out, t, o) => {
      tone(ctx, out, t, { f: 105 * R(o), f2: 32, dur: 0.32, gain: 1.0 });
      tone(ctx, out, t, { type: 'triangle', f: 70, f2: 30, dur: 0.25, gain: 0.6 });
      noise(ctx, out, t, { type: 'highpass', f: 2200, dur: 0.05, gain: 0.7 });
      noise(ctx, out, t, { f: 1200, f2: 200, dur: 0.18, gain: 0.9 });
    });
    this.register('kick', (ctx, out, t, o) => {
      tone(ctx, out, t, { f: 95 * R(o), f2: 38, dur: 0.24, gain: 1.0 });
      noise(ctx, out, t, { type: 'bandpass', f: 1100, f2: 300, q: 1.2, dur: 0.12, gain: 1.0 });
      noise(ctx, out, t, { type: 'highpass', f: 3000, dur: 0.035, gain: 0.5 });
    });
    this.register('impactHuge', (ctx, out, t) => {
      tone(ctx, out, t, { f: 70, f2: 22, dur: 0.9, gain: 1.0 });
      tone(ctx, out, t, { type: 'sawtooth', f: 55, f2: 25, dur: 0.4, gain: 0.25 });
      noise(ctx, out, t, { type: 'highpass', f: 1800, dur: 0.07, gain: 0.9 });
      noise(ctx, out, t, { f: 900, f2: 80, dur: 0.6, gain: 0.8 });
    });
    this.register('block', (ctx, out, t, o) => {
      noise(ctx, out, t, { type: 'bandpass', f: 650 * R(o), q: 1.5, dur: 0.08, gain: 0.9 });
      tone(ctx, out, t, { f: 180, f2: 90, dur: 0.07, gain: 0.4 });
    });
    this.register('parry', (ctx, out, t) => {
      tone(ctx, out, t, { type: 'triangle', f: 1400, dur: 0.45, gain: 0.35 });
      tone(ctx, out, t, { type: 'sine', f: 2120, dur: 0.35, gain: 0.25 });
      noise(ctx, out, t, { type: 'highpass', f: 3500, dur: 0.06, gain: 0.5 });
      tone(ctx, out, t, { f: 160, f2: 80, dur: 0.1, gain: 0.5 });
    });
    this.register('guardBreak', (ctx, out, t) => {
      noise(ctx, out, t, { type: 'bandpass', f: 500, f2: 120, q: 1, dur: 0.35, gain: 1.0 });
      tone(ctx, out, t, { type: 'square', f: 220, f2: 70, dur: 0.3, gain: 0.25 });
    });
    this.register('whoosh', (ctx, out, t, o) => {
      noise(ctx, out, t, { type: 'bandpass', f: 500 * R(o), f2: 2400 * R(o), q: 1.6, a: 0.04, dur: 0.14, gain: 0.35 });
    });
    this.register('dodge', (ctx, out, t) => {
      noise(ctx, out, t, { type: 'bandpass', f: 2600, f2: 500, q: 1.3, a: 0.02, dur: 0.18, gain: 0.35 });
      noise(ctx, out, t + 0.05, { f: 400, dur: 0.05, gain: 0.25 });
    });
    this.register('footstep', (ctx, out, t, o) => {
      noise(ctx, out, t, { f: 380 * R(o), dur: 0.045, gain: 0.3 });
    });
    this.register('fence', (ctx, out, t) => {
      noise(ctx, out, t, { type: 'bandpass', f: 2800, q: 6, dur: 0.5, gain: 0.7 });
      for (let i = 0; i < 4; i++) tone(ctx, out, t + i * 0.03, { type: 'square', f: 300 + Math.random() * 700, dur: 0.15, gain: 0.08 });
      tone(ctx, out, t, { f: 90, f2: 40, dur: 0.2, gain: 0.6 });
    });
    this.register('bodyfall', (ctx, out, t) => {
      tone(ctx, out, t, { f: 75, f2: 28, dur: 0.45, gain: 1.0 });
      noise(ctx, out, t, { f: 320, f2: 60, dur: 0.4, gain: 0.9 });
      noise(ctx, out, t + 0.12, { f: 250, dur: 0.2, gain: 0.4 });
    });
    this.register('bell', (ctx, out, t) => {
      for (const [f, g] of [[520, 0.35], [1247, 0.18], [1720, 0.12], [2630, 0.06]]) tone(ctx, out, t, { f, a: 0.002, dur: 2.2, gain: g });
    });
    this.register('bellTriple', (ctx, out, t) => {
      for (let i = 0; i < 3; i++) for (const [f, g] of [[520, 0.3], [1247, 0.16], [1720, 0.1]]) tone(ctx, out, t + i * 0.32, { f, dur: 1.2, gain: g });
    });
    this.register('count', (ctx, out, t) => {
      tone(ctx, out, t, { type: 'square', f: 180, f2: 120, dur: 0.12, gain: 0.25 });
      noise(ctx, out, t, { f: 500, dur: 0.06, gain: 0.5 });
    });
    this.register('specialCharge', (ctx, out, t) => {
      tone(ctx, out, t, { type: 'sawtooth', f: 80, f2: 900, a: 0.02, dur: 0.5, gain: 0.25 });
      noise(ctx, out, t, { type: 'bandpass', f: 300, f2: 4000, q: 2, a: 0.05, dur: 0.45, gain: 0.35 });
    });
    this.register('meterReady', (ctx, out, t) => {
      tone(ctx, out, t, { type: 'triangle', f: 660, dur: 0.15, gain: 0.25 });
      tone(ctx, out, t + 0.09, { type: 'triangle', f: 990, dur: 0.3, gain: 0.25 });
    });
    this.register('boneCrack', (ctx, out, t) => {
      // sharp dry snap with a short splinter tail
      noise(ctx, out, t, { type: 'highpass', f: 2500, dur: 0.025, gain: 1.0 });
      noise(ctx, out, t + 0.012, { type: 'bandpass', f: 1400, q: 4, dur: 0.06, gain: 0.8 });
      noise(ctx, out, t + 0.03, { type: 'bandpass', f: 900, q: 6, dur: 0.05, gain: 0.5 });
      tone(ctx, out, t, { type: 'square', f: 260, f2: 90, dur: 0.06, gain: 0.25 });
    });
    this.register('tear', (ctx, out, t) => {
      // wet tearing rip
      noise(ctx, out, t, { type: 'bandpass', f: 400, f2: 1600, q: 1.2, a: 0.02, dur: 0.35, gain: 0.9 });
      noise(ctx, out, t + 0.05, { f: 600, f2: 150, dur: 0.4, gain: 0.7 });
      tone(ctx, out, t, { f: 90, f2: 40, dur: 0.3, gain: 0.6 });
    });
    this.register('uiClick', (ctx, out, t) => {
      tone(ctx, out, t, { type: 'square', f: 900, f2: 500, dur: 0.035, gain: 0.12 });
    });
    this.register('uiHover', (ctx, out, t) => {
      tone(ctx, out, t, { type: 'sine', f: 1500, dur: 0.025, gain: 0.05 });
    });
    this.register('purchase', (ctx, out, t) => {
      noise(ctx, out, t, { type: 'highpass', f: 5000, dur: 0.08, gain: 0.3 });
      tone(ctx, out, t, { type: 'triangle', f: 880, dur: 0.1, gain: 0.25 });
      tone(ctx, out, t + 0.07, { type: 'triangle', f: 1320, dur: 0.25, gain: 0.25 });
    });
    this.register('victory', (ctx, out, t) => {
      const notes = [220, 277.2, 329.6, 440];
      notes.forEach((f, i) => tone(ctx, out, t + i * 0.12, { type: 'sawtooth', f, dur: 0.5 + i * 0.2, gain: 0.12 }));
      tone(ctx, out, t + 0.5, { type: 'sawtooth', f: 110, dur: 1.5, gain: 0.18 });
    });
    this.register('defeat', (ctx, out, t) => {
      [196, 185, 164.8, 130.8].forEach((f, i) => tone(ctx, out, t + i * 0.3, { type: 'sawtooth', f, f2: f * 0.97, dur: 0.6, gain: 0.12 }));
      tone(ctx, out, t, { f: 55, dur: 2, gain: 0.3 });
    });
    this.register('slowmo', (ctx, out, t) => {
      tone(ctx, out, t, { f: 300, f2: 60, a: 0.01, dur: 0.6, gain: 0.3 });
      noise(ctx, out, t, { f: 2000, f2: 150, a: 0.01, dur: 0.6, gain: 0.3 });
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Crowd

  _startCrowd() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 520;
    bp.Q.value = 0.7;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0.08;
    // slow murmur modulation
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.35;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 140;
    lfo.connect(lfoG).connect(bp.frequency);
    lfo.start();
    src.connect(bp).connect(lp).connect(this.crowdGain).connect(this.crowd);
    src.start();
    this.crowdFilter = lp;
  }

  /** 0 = quiet hall, 1 = going wild */
  setExcitement(x) {
    if (!this.ctx) return;
    this.excitement = x;
    const t = this.ctx.currentTime;
    this.crowdGain.gain.setTargetAtTime(0.06 + x * 0.22, t, 0.3);
    this.crowdFilter.frequency.setTargetAtTime(1100 + x * 1600, t, 0.3);
  }

  /** Crowd reaction: kind = 'cheer' | 'ooh' | 'roar' */
  crowdReact(kind = 'cheer', intensity = 1) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = Math.min(1.4, 0.4 + intensity * 0.6);
    out.connect(this.crowd);
    const s = ctx.createGain();
    s.gain.value = 0.4;
    out.connect(s);
    s.connect(this.reverbSend);
    setTimeout(() => out.disconnect(), 6000);
    const dur = kind === 'roar' ? 3.2 : kind === 'ooh' ? 1.1 : 1.6;
    this._noise(ctx, out, t, { type: 'bandpass', f: kind === 'ooh' ? 500 : 900, q: 0.6, a: kind === 'ooh' ? 0.08 : 0.12, dur, gain: 0.5 });
    // a handful of "voices": detuned saws through vowel formants
    const voices = kind === 'roar' ? 10 : 6;
    for (let i = 0; i < voices; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const base = 140 + Math.random() * 220;
      const st = t + Math.random() * 0.15;
      if (kind === 'ooh') {
        o.frequency.setValueAtTime(base * 1.15, st);
        o.frequency.exponentialRampToValueAtTime(base * 0.8, st + dur);
      } else {
        o.frequency.setValueAtTime(base, st);
        o.frequency.exponentialRampToValueAtTime(base * (1.1 + Math.random() * 0.3), st + dur * 0.4);
        o.frequency.exponentialRampToValueAtTime(base * 0.9, st + dur);
      }
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = kind === 'ooh' ? 450 : 800 + Math.random() * 400;
      f.Q.value = 3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.05, st + 0.15);
      g.gain.exponentialRampToValueAtTime(0.0001, st + dur);
      o.connect(f).connect(g).connect(out);
      o.start(st);
      o.stop(st + dur + 0.1);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Music: a small step sequencer for a dark, pulsing underground beat.

  setMusic(mode) {
    if (!this.ctx || mode === this.musicMode) return;
    this.musicMode = mode;
    if (this._seq) clearInterval(this._seq);
    this._seq = null;
    if (!mode) return;
    const bpm = mode === 'fight' ? 124 : mode === 'tense' ? 96 : 84;
    this._step = 0;
    this._next = this.ctx.currentTime + 0.1;
    const stepDur = 60 / bpm / 4;
    const bass = [55, 55, 43.65, 49];
    this._seq = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      while (this._next < this.ctx.currentTime + 0.2) {
        this._musicStep(this._step, this._next, mode, bass, stepDur);
        this._step++;
        this._next += stepDur;
      }
    }, 50);
  }

  _musicStep(step, t, mode, bass, stepDur) {
    const ctx = this.ctx;
    const out = this.music;
    const s16 = step % 16;
    const bar = Math.floor(step / 16) % 4;
    const fight = mode === 'fight';
    // kick
    if (s16 === 0 || s16 === 8 || (fight && (s16 === 6 || s16 === 11))) {
      this._tone(ctx, out, t, { f: 120, f2: 40, dur: 0.22, gain: fight ? 0.9 : 0.7 });
    }
    // clap/snare
    if (s16 === 4 || s16 === 12) this._noise(ctx, out, t, { type: 'bandpass', f: 1800, q: 0.7, dur: 0.12, gain: 0.35 });
    // hats
    if (fight ? s16 % 2 === 0 : s16 % 4 === 2) this._noise(ctx, out, t, { type: 'highpass', f: 7000, dur: 0.03, gain: s16 % 4 === 2 ? 0.14 : 0.07 });
    // bass
    if (s16 % (fight ? 2 : 4) === 0) {
      const f = bass[bar] * (fight && s16 % 8 === 6 ? 2 : 1);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(fight ? 420 : 260, t);
      lp.frequency.exponentialRampToValueAtTime(90, t + stepDur * 2);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.32, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + stepDur * (fight ? 1.8 : 3.6));
      o.connect(lp).connect(g).connect(out);
      o.start(t);
      o.stop(t + stepDur * 4);
    }
    // eerie pad stab each bar
    if (s16 === 0) {
      const f = bass[bar] * 4;
      for (const m of [1, 1.19, 1.5]) this._tone(ctx, out, t, { type: 'triangle', f: f * m, a: 0.4, dur: stepDur * 14, gain: 0.025 });
    }
  }
}
