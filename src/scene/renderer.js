// Three.js scene manager: renderer, camera, lights, render loop.
import * as THREE from 'three';
import { createPack } from './pack/pack.js';
import { TearGesture, PackRotateGesture } from '../interact/gestures.js';
import { SoundManager } from '../audio/sound.js';
import { Particles } from './effects/particles.js';
import { RevealController } from './cards/revealController.js';
import { openPack } from '../game/pulls.js';
import { CardSource } from '../game/cardSource.js';

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

    this.buildPack();

    this.reveal = new RevealController({
      canvas,
      camera:    this.camera,
      sound:     this.sound,
      particles: this.particles,
      pack:      this.pack,
      scene:     this.scene,
    });

    window.addEventListener('pack:open',       () => this.reveal.begin(openPack(this.game)));
    window.addEventListener('game:ripAnother', () => this.ripAnother());

    // When pack selection changes, update game id and rebuild the pack model
    // (so the correct art texture shows before the user rips it open).
    window.addEventListener('game:setGame', (e) => {
      if (e.detail?.game && e.detail.game !== this.game) {
        this.game = e.detail.game;
        if (!this.reveal.active) this.buildPack();
      }
    });

    // When the open screen is entered, reset to a fresh pack if idle.
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
    if (this.pack) this.scene.remove(this.pack.group);
    // Read pack art path from the JSON definition so each pack has its own texture.
    const packTexture = CardSource.getSet(this.game)?.packTexture ?? null;
    this.pack = createPack(packTexture);
    this.scene.add(this.pack.group);

    this.tearGesture   = new TearGesture(this.canvas, this.camera, this.pack, this.sound);
    this.rotateGesture = new PackRotateGesture(this.canvas, this.pack, this.tearGesture);
    if (this.reveal) this.reveal.pack = this.pack;
  }

  ripAnother() {
    this.reveal.reset();
    this.buildPack();
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

    this.renderer.render(this.scene, this.camera);
  }
}
