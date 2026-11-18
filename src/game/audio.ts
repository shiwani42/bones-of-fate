/**
 * All sound is synthesised with WebAudio: no files to license or load.
 * - SFX: pasa clacks, rattle, piece taps, gong, crack, rumble, sparkle, whoosh
 * - Music: a tanpura drone (Pa–Sa–Sa–Sa) that loops quietly under the game
 * - Voice: Shakuni's lines through speechSynthesis when the browser has it
 *   (captions always show the same text, so the game works muted).
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private droneTimer: number | null = null;
  private lastClack = 0;
  muted = false;

  /** Must be called from a user gesture (the Enter-AR click). */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.9;
        const comp = this.ctx.createDynamicsCompressor();
        this.master.connect(comp).connect(this.ctx.destination);
        this.musicBus = this.ctx.createGain();
        this.musicBus.gain.value = 0.22;
        this.musicBus.connect(this.master);
        const len = this.ctx.sampleRate * 2;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  private get t(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private out(pan = 0, bus?: AudioNode): AudioNode {
    const ctx = this.ctx!;
    if (pan === 0) return bus ?? this.master;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(bus ?? this.master);
    return p;
  }

  private noise(
    dur: number,
    filterType: BiquadFilterType,
    freq: number,
    q: number,
    gain: number,
    when = 0,
    pan = 0,
    freqEnd?: number,
  ): void {
    const ctx = this.ctx!;
    const t0 = this.t + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq, t0);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.out(pan));
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.05);
  }

  private tone(
    freq: number,
    dur: number,
    gain: number,
    type: OscillatorType = 'sine',
    when = 0,
    attack = 0.002,
    pan = 0,
    freqEnd?: number,
    bus?: AudioNode,
  ): void {
    const ctx = this.ctx!;
    const t0 = this.t + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.out(pan, bus));
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  private ok(): boolean {
    return !!this.ctx && !this.muted;
  }

  /** Bone pasa hitting cloth-over-wood or each other. */
  /** Gold coins settling on a stack: a cascade of short, bright metallic pings. */
  coins(count = 6, pan = 0): void {
    if (!this.ok()) return;
    for (let i = 0; i < count; i++) {
      const when = i * (0.035 + Math.random() * 0.03);
      const f = 2400 + Math.random() * 1400;
      const v = 0.07 * (1 - i / (count + 2));
      // a coin rings with inharmonic partials; a fast decay keeps it small and close
      this.tone(f, 0.18, v, 'sine', when, 0.001, pan);
      this.tone(f * 2.76, 0.09, v * 0.5, 'sine', when, 0.001, pan);
      this.noise(0.02, 'highpass', 5000, 1, v * 0.8, when, pan);
    }
  }

  clack(intensity = 1, pan = 0): void {
    if (!this.ok()) return;
    const now = performance.now();
    if (now - this.lastClack < 25) return;
    this.lastClack = now;
    const v = Math.min(1, intensity);
    this.noise(0.05, 'bandpass', 2600 + Math.random() * 900, 3, 0.5 * v, 0, pan);
    this.tone(700 + Math.random() * 300, 0.05, 0.25 * v, 'triangle', 0, 0.001, pan);
  }

  thud(intensity = 1, pan = 0): void {
    if (!this.ok()) return;
    this.noise(0.09, 'lowpass', 700, 1, 0.6 * Math.min(1, intensity), 0, pan);
  }

  rattle(): void {
    if (!this.ok()) return;
    for (let i = 0; i < 3; i++) {
      this.noise(0.03, 'bandpass', 3000 + Math.random() * 1500, 4, 0.18, i * 0.03);
    }
  }

  /** Piece tap. `pitch` scales the note (e.g. rise by step along a hop path). */
  tap(pan = 0, pitch = 1): void {
    if (!this.ok()) return;
    this.tone((520 + Math.random() * 60) * pitch, 0.07, 0.3, 'sine', 0, 0.001, pan);
    this.noise(0.03, 'bandpass', 1800 * pitch, 2, 0.15, 0, pan);
  }

  /** Hop landing on step `step` (0-based): taps climb a pentatonic scale. */
  hopTap(step: number, pan = 0): void {
    const SCALE = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4, 5 / 2];
    this.tap(pan, SCALE[step % SCALE.length] * (step >= SCALE.length ? 1.0 : 0.9));
  }

  /** The final, heavier landing of a move: wooden thump with a low body. */
  thump(pan = 0): void {
    if (!this.ok()) return;
    this.noise(0.12, 'lowpass', 900, 1, 0.7, 0, pan);
    this.tone(150, 0.16, 0.35, 'sine', 0, 0.002, pan, 90);
    this.tone(980, 0.09, 0.08, 'triangle', 0.005, 0.001, pan);
  }

  /** One wave of a reward reveal; call with wave 0..n-1 for a rising swell. */
  reward(wave: number, of = 4): void {
    if (!this.ok()) return;
    const k = Math.min(1, wave / Math.max(1, of - 1));
    const sa = 523.25 * Math.pow(2, (wave * 4) / 12); // rises a major third per wave
    [1, 1.25, 1.5, 2].forEach((m, i) => this.tone(sa * m, 0.45 + k * 0.4, 0.035 + 0.03 * k, 'sine', i * 0.035, 0.004));
    this.noise(0.25 + k * 0.3, 'highpass', 5000, 0.7, 0.05 + 0.06 * k, 0, 0, 9000);
    if (wave === of - 1) this.tone(sa * 0.5, 1.6, 0.09, 'triangle', 0.05, 0.02);
  }

  /** Room darkening as Shakuni manifests (on) or light returning (off). */
  dim(on: boolean): void {
    if (!this.ok()) return;
    if (on) {
      this.noise(1.6, 'lowpass', 1800, 0.8, 0.35, 0, 0, 120);
      this.tone(73.4, 2.4, 0.3, 'sine', 0, 0.4, 0, 55);
      this.tone(110, 2.0, 0.08, 'sawtooth', 0.1, 0.6, 0, 98);
    } else {
      this.noise(1.2, 'bandpass', 300, 0.8, 0.2, 0, 0, 3000);
      this.tone(261.6, 1.6, 0.05, 'sine', 0.1, 0.5);
    }
  }

  /** Soft whoof of a diya catching / flaring. */
  flare(): void {
    if (!this.ok()) return;
    this.noise(0.5, 'bandpass', 400, 0.9, 0.22, 0, 0, 1400);
  }

  whoosh(): void {
    if (!this.ok()) return;
    this.noise(0.35, 'bandpass', 500, 1.2, 0.25, 0, 0, 2400);
  }

  sparkle(): void {
    if (!this.ok()) return;
    [1760, 2217, 2637, 3520].forEach((f, i) =>
      this.tone(f, 0.5, 0.05, 'sine', i * 0.05),
    );
  }

  select(): void {
    if (!this.ok()) return;
    this.tone(880, 0.12, 0.12, 'triangle');
    this.tone(1320, 0.18, 0.08, 'sine', 0.05);
  }

  gong(): void {
    if (!this.ok()) return;
    const partials = [98, 147, 196, 262, 311, 415, 523];
    partials.forEach((f, i) =>
      this.tone(f, 4.5 - i * 0.4, 0.22 / (i * 0.6 + 1), 'sine', 0, 0.005, 0, f * 0.985),
    );
    this.noise(0.12, 'lowpass', 1200, 1, 0.5);
  }

  crack(): void {
    if (!this.ok()) return;
    this.noise(0.25, 'highpass', 2500, 0.7, 0.9);
    this.noise(0.6, 'bandpass', 1800, 1, 0.6, 0.02, 0, 200);
    this.noise(1.8, 'lowpass', 140, 1, 1.0, 0.05); // rumble
    this.tone(55, 1.4, 0.6, 'sine', 0.02, 0.01, 0, 35);
  }

  /** Swelling choir-like chord for the divine light. */
  divine(): void {
    if (!this.ok()) return;
    const sa = 261.63;
    [sa, sa * 1.25, sa * 1.5, sa * 2, sa * 3].forEach((f, i) => {
      this.tone(f, 3.2, 0.08, 'sawtooth', i * 0.04, 0.6);
      this.tone(f * 1.003, 3.2, 0.06, 'sine', i * 0.04, 0.8);
    });
  }

  /** Shankh (conch) swell for victory. */
  conch(): void {
    if (!this.ok()) return;
    const ctx = this.ctx!;
    const t0 = this.t;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(220, t0);
    o.frequency.linearRampToValueAtTime(233, t0 + 2.5);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const lg = ctx.createGain();
    lg.gain.value = 3;
    lfo.connect(lg).connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.8);
    g.gain.setValueAtTime(0.35, t0 + 2.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.2);
    o.connect(f).connect(g).connect(this.master);
    o.start(t0);
    lfo.start(t0);
    o.stop(t0 + 3.3);
    lfo.stop(t0 + 3.3);
  }

  /** Low ominous laugh-ish tremolo for Shakuni. */
  sinister(): void {
    if (!this.ok()) return;
    for (let i = 0; i < 4; i++) {
      this.tone(110 - i * 6, 0.18, 0.18, 'sawtooth', i * 0.17, 0.01, 0, 90 - i * 6);
    }
  }

  /** A breathy hush for whispered hints. */
  whisper(): void {
    if (!this.ok()) return;
    this.noise(0.5, 'bandpass', 3200, 0.8, 0.12, 0, -0.4, 1800);
  }

  warn(): void {
    if (!this.ok()) return;
    this.tone(330, 0.25, 0.12, 'triangle');
    this.tone(311, 0.3, 0.1, 'triangle', 0.18);
  }

  /** Tanpura drone: four plucked strings, Pa Sa' Sa' Sa, repeating. */
  startDrone(): void {
    if (!this.ctx || this.droneTimer !== null) return;
    const sa = 130.81; // C3
    const strings = [sa * 0.75, sa * 2, sa * 2, sa];
    let i = 0;
    const pluck = () => {
      if (!this.ctx || this.muted) return;
      const f = strings[i % 4];
      i++;
      const ctx = this.ctx;
      const t0 = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 6;
      // the "jawari" buzz: a resonance sweeping up through the harmonics
      bp.frequency.setValueAtTime(f * 3, t0);
      bp.frequency.exponentialRampToValueAtTime(f * 9, t0 + 2.6);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.4);
      o.connect(bp).connect(g).connect(this.musicBus);
      o.start(t0);
      o.stop(t0 + 3.5);
    };
    pluck();
    this.droneTimer = window.setInterval(pluck, 1100);
  }

  setMusicLevel(v: number): void {
    if (this.ctx) this.musicBus.gain.setTargetAtTime(v, this.t, 0.4);
  }

  speak(text: string, opts: { pitch?: number; rate?: number } = {}): void {
    if (this.muted) return;
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.pitch = opts.pitch ?? 0.55;
      u.rate = opts.rate ?? 0.92;
      u.volume = 0.9;
      const voices = synth.getVoices();
      const v =
        voices.find((x) => /en-IN/i.test(x.lang)) ??
        voices.find((x) => /male|daniel|george|rishi/i.test(x.name)) ??
        voices.find((x) => /^en/i.test(x.lang));
      if (v) u.voice = v;
      synth.speak(u);
    } catch {
      /* speech is optional */
    }
  }
}

export const sfx = new Sfx();
