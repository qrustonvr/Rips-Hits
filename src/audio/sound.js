// Sound manager — fully procedural Web Audio (no asset files needed yet).
// The foil tear is a looped noise bed whose gain/brightness scrub with pull
// velocity, plus randomized crackle bursts. Everything is pitch-randomized
// so repeats never sound identical. Real recorded sfx can replace/layer
// these later without changing the API.
//
// API:
//   unlock()                    call inside a user gesture (mobile autoplay)
//   tick()                      tab-grab click
//   startTear() / endTear()     foil bed lifecycle
//   setTearVelocity(v, dt)      scrub bed + spawn crackles (v = progress/sec)
//   pop()                       strip detach
//   haptic(pattern)             navigator.vibrate wrapper

export class SoundManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.tear = null;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.noiseBuf = makeNoiseBuffer(this.ctx, 1.5);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  haptic(pattern = 10) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  // Tiny click when the tab is grabbed
  tick() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1400 + Math.random() * 200, t);
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  // Continuous foil bed, silent until velocity arrives
  startTear() {
    if (!this.ctx || this.tear) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500;
    bp.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    src.connect(bp).connect(g).connect(this.master);
    src.start();
    this.tear = { src, bp, g };
  }

  setTearVelocity(v, dt) {
    if (!this.ctx || !this.tear) return;
    const t = this.ctx.currentTime;
    const speed = Math.abs(v);

    // Bed loudness + brightness follow pull speed
    const gain = Math.min(speed * 0.35, 0.55);
    this.tear.g.gain.setTargetAtTime(gain, t, 0.03);
    this.tear.bp.frequency.setTargetAtTime(
      1100 + speed * 1800 + Math.random() * 250, t, 0.05
    );

    // Discrete crackles — the perforations giving way
    const rate = Math.min(speed * 12, 25); // per second
    if (Math.random() < rate * dt) this.crackle(0.25 + Math.min(speed * 0.2, 0.3));
  }

  endTear() {
    if (!this.tear) return;
    const t = this.ctx.currentTime;
    this.tear.g.gain.setTargetAtTime(0, t, 0.04);
    const { src } = this.tear;
    setTimeout(() => { try { src.stop(); } catch {} }, 200);
    this.tear = null;
  }

  // One short foil crackle, randomized
  crackle(amp = 0.3) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dur = 0.018 + Math.random() * 0.03;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.7;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500 + Math.random() * 3200;
    bp.Q.value = 1.6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  // Strip detaches: bright burst + low thump + a couple of stray crackles
  pop() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    const burst = this.ctx.createBufferSource();
    burst.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.7;
    const bg = this.ctx.createGain();
    bg.gain.setValueAtTime(0.5, t);
    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    burst.connect(bp).connect(bg).connect(this.master);
    burst.start(t, Math.random());
    burst.stop(t + 0.15);

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(240, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.14);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.4, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(og).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.18);

    setTimeout(() => this.crackle(0.35), 40);
    setTimeout(() => this.crackle(0.2), 110);
  }
}

function makeNoiseBuffer(ctx, seconds) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}
