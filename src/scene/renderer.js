// Three.js scene manager: renderer, camera, lights, render loop.
import * as THREE from 'three';
import { createPack } from './pack/pack.js';
import { TearGesture, PackRotateGesture } from '../interact/gestures.js';
import { SoundManager } from '../audio/sound.js';
import { Particles } from './effects/particles.js';
import { RevealController } from './cards/revealController.js';
import { openManyPacks } from '../game/pulls.js';
import { CardSource } from '../game/cardSource.js';

const QTY_KEY = 'ripsandhits.pendingQty';

// Auto-rip timing constants (seconds).
const RIP_DUR = 0.32;   // duration of each back-pack rip animation
const RIP_GAP = 0.20;   // gap between successive back-pack rips starting
const MAX_VIS = 4;      // max back packs shown in the stack

// Back-pack stack offsets per level (i=1 is first behind front).
const BACK_X = -0.06;  // stack to the left
const BACK_Y =  0.02;  // stack upward
const BACK_Z = -0.05;

function easeOut(t) { return 1 - Math.pow(1 - t, 2); }

// Resolve a public-folder asset path to work on both dev (/) and GitHub Pages (/Rips-Hits/).
function asset(path) {
  if (!path) return null;
  const base = import.meta.env.BASE_URL ?? '/';
  return base.replace(/\/$/, '') + '/' + path.replace(/^\//, '');
}

export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.active = true;
    this.game   = 'pokemon-151';

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.scene  = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
    this.camera.position.set(0, 0, 6);

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2, 3, 4);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x66d9ff, 1.2);
    rim.position.set(-3, 1, -2);
    this.scene.add(rim);

    this.scene.add(new THREE.AmbientLight(0x404050, 1.5));

    this.sound     = new SoundManager();
    this.particles = new Particles(this.scene);

    this.backPacks = [];
    this._autoRip  = null;

    this.buildPack();

    this.reveal = new RevealController({
      canvas,
      camera:    this.camera,
      sound:     this.sound,
      particles: this.particles,
      pack:      this.pack,
      scene:     this.scene,
    });

    // Open N packs worth of cards in one reveal sequence.
    window.addEventListener('pack:open', () => {
      const qty   = parseInt(sessionStorage.getItem(QTY_KEY) ?? '1', 10) || 1;
      const { flat } = openManyPacks(this.game, qty);

      if (this.backPacks.length > 0) {
        // Kick off the auto-rip sequencer; reveal starts after all packs done.
        this._autoRip = { active: true, timer: 0, flat };
      } else {
        this.reveal.begin(flat);
      }
    });

    window.addEventListener('game:ripAnother', () => this.ripAnother());

    // When pack selection changes, update game id and rebuild the pack model.
    window.addEventListener('game:setGame', (e) => {
      if (e.detail?.game && e.detail.game !== this.game) {
        this.game = e.detail.game;
        if (!this.reveal.active) this.buildPack();
      }
    });

    // When the open screen is entered, reset to a fresh pack stack if idle.
    window.addEventListener('game:enterOpen', () => {
      if (!this.reveal.active) this.ripAnother();
    });

    canvas.addEventListener('pointerdown', () => this.sound.unlock(), { once: true });

    this.clock   = new THREE.Clock();
    this._resize = this.resize.bind(this);
    window.addEventListener('resize', this._resize);
    this.resize();
  }

  buildPack() {
    // Remove previous front pack.
    if (this.pack) this.scene.remove(this.pack.group);

    // Remove any existing back packs.
    if (this.backPacks) {
      this.backPacks.forEach(b => this.scene.remove(b.pack.group));
    }
    this.backPacks = [];
    this._autoRip  = null;

    const rawPath     = CardSource.getSet(this.game)?.packTexture ?? null;
    const packTexture = rawPath ? asset(rawPath) : null;

    // Front pack — user rips this one manually.
    this.pack = createPack(packTexture);
    this.scene.add(this.pack.group);

    // Back packs — purely visual; auto-ripped after user tears the front pack.
    const qty      = parseInt(sessionStorage.getItem(QTY_KEY) ?? '1', 10) || 1;
    const backCount = Math.min(qty - 1, MAX_VIS);
    for (let i = 0; i < backCount; i++) {
      const bp = createPack(packTexture);
      // Stack slightly right, down, and behind the front pack.
      bp.group.position.set((i + 1) * BACK_X, (i + 1) * BACK_Y, (i + 1) * BACK_Z);
      bp.strip.tab.visible = false;  // only the front pack shows the grab tab
      this.scene.add(bp.group);
      this.backPacks.push({ pack: bp, done: false });
    }

    this.tearGesture   = new TearGesture(this.canvas, this.camera, this.pack, this.sound);
    this.rotateGesture = new PackRotateGesture(this.canvas, this.pack, this.tearGesture);
    if (this.reveal) this.reveal.pack = this.pack;
  }

  ripAnother() {
    this.reveal.reset();
    this.buildPack();
  }

  // Drive the auto-rip animation for all back packs sequentially.
  _tickAutoRip(dt, t) {
    const ar = this._autoRip;
    if (!ar || !ar.active) return;

    ar.timer += dt;

    let sequenceDone = true;

    this.backPacks.forEach((b, i) => {
      const packStart = i * (RIP_DUR + RIP_GAP);

      if (ar.timer < packStart) {
        sequenceDone = false;
        return;
      }

      if (b.done) return;

      sequenceDone = false;

      const localT = (ar.timer - packStart) / RIP_DUR;
      const p      = Math.min(easeOut(Math.min(localT, 1.0)) * 1.18, 1.18);

      b.pack.strip.velocity = 1.0 / RIP_DUR;
      b.pack.strip.setProgress(p, t);

      if (localT >= 1.0 && !b.pack.strip.detached) {
        b.pack.strip.detach();
      }

      // Slide the pack body downward after the strip passes halfway.
      if (localT > 0.5) {
        const slideP = Math.min((localT - 0.5) / 0.7, 1.0);
        b.pack.group.position.y = (i + 1) * BACK_Y - easeOut(slideP) * 3.0;
      }

      b.pack.strip.update(dt);

      if (localT >= 1.18) b.done = true;
    });

    // Once every back pack has ripped, wait a short buffer then begin reveal.
    const lastStart   = (this.backPacks.length - 1) * (RIP_DUR + RIP_GAP);
    const finishAt    = lastStart + RIP_DUR + 0.12;
    if (ar.timer >= finishAt && sequenceDone) {
      ar.active = false;
      this.backPacks.forEach(b => this.scene.remove(b.pack.group));
      this.backPacks = [];
      this.reveal.begin(ar.flat);
    }
  }

  setActive(active) {
    this.active = active;
    this.canvas.style.visibility = active ? 'visible' : 'hidden';
    if (active) this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start() { this.renderer.setAnimationLoop(() => this.tick()); }

  tick() {
    if (!this.active) return;
    const dt = Math.min(this.clock.getDelta(), 1 / 30);
    const t  = this.clock.elapsedTime;

    this.pack.update(dt, t);
    this.tearGesture.update(dt, t);
    this.rotateGesture.update(dt);
    this.particles.update(dt);
    this.reveal.update(dt, t);

    // Update back-pack animations (idle bobbing + auto-rip sequencer).
    this.backPacks.forEach(b => b.pack.update(dt, t));
    this._tickAutoRip(dt, t);

    this.renderer.render(this.scene, this.camera);
  }
}
