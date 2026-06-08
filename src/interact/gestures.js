// Gesture system.
//  - TearGesture: grab the tab, pull across with resistance, yank past the
//    edge to pop the strip off. Owns tear audio + haptics.
//  - PackRotateGesture: drag anywhere else to rotate with inertia.
// Register TearGesture FIRST so its pointerdown wins on the tab.
import * as THREE from 'three';
import { PACK } from '../scene/pack/pack.js';

const TAB_GRAB_RADIUS_PX = 55;
const RESIST_START = 0.8;    // past this, pulling gets harder
const RESIST_FACTOR = 0.55;
const COMPLETE_AT = 0.96;    // reachable only by yanking past the pack edge

export class TearGesture {
  constructor(canvas, camera, pack, sound) {
    this.canvas = canvas;
    this.camera = camera;
    this.pack = pack;
    this.sound = sound;

    this.active = false;
    this.desired = 0;
    this.grabOffset = 0;
    this._lastHapticP = 0;
    this._ray = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._v3 = new THREE.Vector3();

    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', () => this.onUp());
    canvas.addEventListener('pointercancel', () => this.onUp());
  }

  onDown(e) {
    const strip = this.pack.strip;
    if (this.pack.open || strip.detached) return;

    // Screen-space grab test against the tab (forgiving radius)
    strip.tab.getWorldPosition(this._v3).project(this.camera);
    const sx = (this._v3.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-this._v3.y * 0.5 + 0.5) * window.innerHeight;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (dx * dx + dy * dy > TAB_GRAB_RADIUS_PX * TAB_GRAB_RADIUS_PX) return;

    this.active = true;
    this.pack.grabbed = true;
    this.canvas.setPointerCapture(e.pointerId);

    this.sound.unlock();
    this.sound.tick();
    this.sound.haptic(12);
    this.sound.startTear();

    // Re-grabs continue from current progress without jumping
    this.grabOffset = this.pack.strip.progress - this.pointerProgress(e);
    this.desired = this.pack.strip.progress;

    window.dispatchEvent(new CustomEvent('pack:grab'));
  }

  onMove(e) {
    if (!this.active) return;
    this.desired = this.pointerProgress(e) + this.grabOffset;
  }

  onUp() {
    if (!this.active) return;
    this.active = false;
    this.pack.grabbed = false;
    this.sound.endTear();
  }

  // Project the pointer onto the pack's front plane, map to 0..1 across width.
  pointerProgress(e) {
    this._ndc.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );
    this._ray.setFromCamera(this._ndc, this.camera);
    const o = this._ray.ray.origin;
    const d = this._ray.ray.direction;
    const t = (0.1 - o.z) / d.z; // pack front plane ~z=0.1 (pack faces camera while tearing)
    const x = o.x + d.x * t;
    return (x + PACK.W / 2) / PACK.W;
  }

  update(dt, time) {
    const strip = this.pack.strip;
    strip.update(dt); // fly-off animation (no-op until detached)
    if (strip.detached) return;

    if (this.active) {
      // Ease the pack to face the camera while tearing
      this.pack.targetRot.x *= 1 - Math.min(dt * 6, 1);
      this.pack.targetRot.y *= 1 - Math.min(dt * 6, 1);

      // Resistance curve: linear, then stiff near the end
      const want = THREE.MathUtils.clamp(this.desired, 0, 1.25);
      const eff = want <= RESIST_START
        ? want
        : RESIST_START + (want - RESIST_START) * RESIST_FACTOR;

      const prev = strip.progress;
      const p = prev + (Math.max(eff, prev) - prev) * Math.min(dt * 14, 1);
      strip.velocity = (p - prev) / Math.max(dt, 1e-4);
      strip.setProgress(p, time);
      this.sound.setTearVelocity(strip.velocity, dt);

      // Haptic ticks as perforations give way
      if (p - this._lastHapticP > 0.07) {
        this._lastHapticP = p;
        this.sound.haptic(4);
      }

      if (p >= COMPLETE_AT) this.complete(time);
    } else {
      strip.velocity *= Math.exp(-dt * 6);
    }
  }

  complete(time) {
    this.active = false;
    this.pack.grabbed = false;
    this.pack.open = true;
    this.pack.kickT = 0;

    const strip = this.pack.strip;
    strip.setProgress(1.18, time);
    strip.detach();

    this.sound.endTear();
    this.sound.pop();
    this.sound.haptic([18, 30, 45]);

    window.dispatchEvent(new CustomEvent('pack:open'));
  }
}

export class PackRotateGesture {
  constructor(canvas, pack, tearGesture) {
    this.pack = pack;
    this.tear = tearGesture;
    this.dragging = false;
    this.last = { x: 0, y: 0 };
    this.vel = { x: 0, y: 0 };

    canvas.addEventListener('pointerdown', (e) => {
      if (this.tear?.tearing || this.pack.open || this.pack.revealing) return; // tab grab / reveal wins
      this.dragging = true;
      this.last = { x: e.clientX, y: e.clientY };
      this.vel = { x: 0, y: 0 };
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging || this.tear?.tearing || this.pack.open) return;
      const dx = e.clientX - this.last.x;
      const dy = e.clientY - this.last.y;
      this.last = { x: e.clientX, y: e.clientY };

      const speed = 0.006;
      this.pack.targetRot.y += dx * speed;
      this.pack.targetRot.x += dy * speed;
      this.vel = { x: dx, y: dy };
    });

    const end = () => { this.dragging = false; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  update(dt) {
    if (this.dragging || this.tear?.tearing) return;
    // Inertia: keep spinning a touch after release, then settle.
    const decay = Math.exp(-dt * 4);
    this.vel.x *= decay;
    this.vel.y *= decay;
    this.pack.targetRot.y += this.vel.x * 0.006 * dt * 60 * 0.15;
    this.pack.targetRot.x += this.vel.y * 0.006 * dt * 60 * 0.15;

    // Clamp pitch so the pack never goes upside down
    const lim = Math.PI / 3;
    this.pack.targetRot.x = Math.max(-lim, Math.min(lim, this.pack.targetRot.x));
  }
}
