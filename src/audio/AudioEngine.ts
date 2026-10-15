/**
 * Fully procedural soundscape. Nothing is created until the visitor
 * makes a gesture (start()), so no audio can ever play unexpectedly.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private droneFilter!: BiquadFilterNode;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private signalBus!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private voices: { osc: OscillatorNode; gain: GainNode }[] = [];
  private enabled = true;
  private started = false;

  get isStarted() {
    return this.started;
  }

  get isEnabled() {
    return this.enabled;
  }

  start() {
    if (this.started) {
      this.ctx?.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.started = true;
    const ctx = new AC();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(4.5, 2.6);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.55;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.master);

    // Low drone: detuned saws through a slow breathing lowpass.
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 180;
    this.droneFilter.Q.value = 6;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.16;
    this.droneFilter.connect(droneGain);
    droneGain.connect(this.master);
    droneGain.connect(this.reverbSend);
    [55, 55.4, 82.4, 110.2].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'sawtooth' : 'triangle';
      o.frequency.value = f;
      o.connect(this.droneFilter);
      o.start();
    });
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 90;
    lfo.connect(lfoGain).connect(this.droneFilter.frequency);
    lfo.start();

    // Wind: filtered noise with a wandering bandpass.
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer(4);
    noise.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 0.8;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.05;
    noise.connect(this.windFilter).connect(this.windGain).connect(this.master);
    noise.start();
    const wlfo = ctx.createOscillator();
    wlfo.frequency.value = 0.07;
    const wlfoGain = ctx.createGain();
    wlfoGain.gain.value = 300;
    wlfo.connect(wlfoGain).connect(this.windFilter.frequency);
    wlfo.start();

    // The signal: voices are added as memories are recovered.
    this.signalBus = ctx.createGain();
    this.signalBus.gain.value = 0.05;
    this.signalBus.connect(this.master);
    this.signalBus.connect(this.reverbSend);

    this.applyEnabled(3);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.applyEnabled(0.6);
  }

  private applyEnabled(ramp: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(this.enabled ? 0.8 : 0, t + ramp);
    if (this.enabled) this.ctx.resume();
  }

  /** Gentle crystalline ping. */
  chime(freq = 880, vol = 0.12, dur = 2.5) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    [1, 2.01, 3.98].forEach((m, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq * m;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol / (i + 1), t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur / (i + 1));
      o.connect(g);
      g.connect(this.master);
      g.connect(this.reverbSend);
      o.start(t);
      o.stop(t + dur);
    });
  }

  /** Tiny UI tick. */
  tick(freq = 1400) {
    this.chime(freq, 0.03, 0.25);
  }

  /** A low swell used for transitions. */
  swell(dur = 4, freq = 73.4) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(100, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + dur * 0.7);
    f.frequency.exponentialRampToValueAtTime(200, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.2, t + dur * 0.6);
    g.gain.linearRampToValueAtTime(0, t + dur);
    [1, 1.5, 2, 3].forEach((m, i) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq * m * (1 + i * 0.002);
      o.connect(f);
      o.start(t);
      o.stop(t + dur);
    });
    f.connect(g);
    g.connect(this.master);
    g.connect(this.reverbSend);
  }

  /** Add a permanent voice to the signal chord. */
  addSignalVoice(freq: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const trem = ctx.createOscillator();
    trem.frequency.value = 0.15 + this.voices.length * 0.07;
    const tremG = ctx.createGain();
    tremG.gain.value = 0.25;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 6);
    trem.connect(tremG).connect(g.gain);
    o.connect(g).connect(this.signalBus);
    o.start();
    trem.start();
    this.voices.push({ osc: o, gain: g });
    this.droneFilter.frequency.setTargetAtTime(180 + this.voices.length * 70, t, 3);
  }

  /** Signal intensity follows proximity to undiscovered memories. */
  setProximity(p: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.signalBus.gain.setTargetAtTime(0.05 + p * 0.12, t, 0.4);
    this.windGain.gain.setTargetAtTime(0.05 * (1 - p * 0.6), t, 0.8);
  }

  /** The ending: silence the wind, open the drone, let the chord bloom. */
  finale() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0, t, 2);
    this.droneFilter.frequency.setTargetAtTime(900, t, 6);
    this.signalBus.gain.setTargetAtTime(0.22, t, 5);
  }

  heartbeat() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    [0, 0.22].forEach((d, i) => {
      const t = ctx.currentTime + d;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(70, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(i ? 0.25 : 0.35, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.35);
    });
  }

  private noiseBuffer(seconds: number) {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      // Brown-ish noise: softer, more like distant air.
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    return buf;
  }

  private impulse(seconds: number, decay: number) {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
}

export const audio = new AudioEngine();
