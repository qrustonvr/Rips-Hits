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
//   stCommon/stUncommon/stRare/stUltra/stSecret()   rarity reveal stingers

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

  // --- rarity reveal stingers (fired at the flip midpoint) -------------------

  // One enveloped tone. freq can ramp from->to for sweeps.
  tone({ type = 'sine', from = 440, to = null, dur = 0.3, amp = 0.25, delay = 0, attack = 0.005 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  stCommon() {
    this.unlock();
    this.tone({ type: 'sine', from: 320, to: 200, dur: 0.12, amp: 0.18 });
  }

  stUncommon() {
    this.unlock();
    this.tone({ type: 'triangle', from: 880, dur: 0.4, amp: 0.18 });
    this.tone({ type: 'sine', from: 1320, dur: 0.5, amp: 0.1, delay: 0.04 });
  }

  stRare() {
    this.unlock();
    this.tone({ type: 'triangle', from: 520, to: 1040, dur: 0.5, amp: 0.22 });
    this.tone({ type: 'sine', from: 780, to: 1560, dur: 0.55, amp: 0.12, delay: 0.02 });
  }

  stUltra() {
    this.unlock();
    const notes = [523, 659, 784, 1046]; // C E G C
    notes.forEach((f, i) => this.tone({
      type: 'triangle', from: f, dur: 0.6 - i * 0.05, amp: 0.2, delay: i * 0.07,
    }));
    this.tone({ type: 'sine', from: 130, to: 90, dur: 0.5, amp: 0.3 });
  }

  stSecret() {
    this.unlock();
    this.tone({ type: 'sine', from: 160, to: 55, dur: 1.1, amp: 0.45 });
    const chord = [392, 494, 587, 784, 988];
    chord.forEach((f, i) => this.tone({
      type: 'sawtooth', from: f * 0.5, to: f, dur: 1.0, amp: 0.12, delay: i * 0.05,
    }));
    for (let i = 0; i < 6; i++) {
      this.tone({ type: 'sine', from: 1500 + Math.random() * 2500, dur: 0.4, amp: 0.06, delay: 0.3 + i * 0.08 });
    }
    this.haptic([20, 40, 20, 60, 30, 90]);
  }
}

function makeNoiseBuffer(ctx, seconds) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}
