// Three.js scene manager: renderer, camera, lights, render loop.
import * as THREE from 'three';
import { createPack } from './pack/pack.js';
import { TearGesture, PackRotateGesture } from '../interact/gestures.js';
import { SoundManager } from '../audio/sound.js';

export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.active = true;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
    this.camera.position.set(0, 0, 6);

    // Lighting: soft key + cool rim so foil has something to catch.
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2, 3, 4);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x66d9ff, 1.2);
    rim.position.set(-3, 1, -2);
    this.scene.add(rim);

    this.scene.add(new THREE.AmbientLight(0x404050, 1.5));

    // Placeholder pack
    this.pack = createPack();
    this.scene.add(this.pack.group);

    // Audio + gestures (tear registers first so the tab grab wins)
    this.sound = new SoundManager();
    this.tearGesture = new TearGesture(canvas, this.camera, this.pack, this.sound);
    this.rotateGesture = new PackRotateGesture(canvas, this.pack, this.tearGesture);

    // Unlock audio on first touch anywhere (mobile autoplay policy)
    canvas.addEventListener('pointerdown', () => this.sound.unlock(), { once: true });

    this.clock = new THREE.Clock();
    this._resize = this.resize.bind(this);
    window.addEventListener('resize', this._resize);
    this.resize();
  }

  setActive(active) {
    this.active = active;
    this.canvas.style.visibility = active ? 'visible' : 'hidden';
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start() {
    this.renderer.setAnimationLoop(() => this.tick());
  }

  tick() {
    if (!this.active) return;
    const dt = Math.min(this.clock.getDelta(), 1 / 30);
    const t = this.clock.elapsedTime;

    this.pack.update(dt, t);
    this.tearGesture.update(dt, t);
    this.rotateGesture.update(dt);

    this.renderer.render(this.scene, this.camera);
  }
}
