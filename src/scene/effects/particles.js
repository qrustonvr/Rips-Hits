// Lightweight GPU-points particle bursts for rarity reveals. One pooled
// BufferGeometry per active burst; bursts self-expire and clean up. Presets
// map to the PLAN.md rarity table (sparkle / gold-dust / prismatic / explosion).
import * as THREE from 'three';

const PRESETS = {
  none: null,
  sparkle: { count: 24, speed: 1.4, size: 0.05, life: 0.9, gravity: 0.4, spread: 0.5, rainbow: false },
  'gold-dust': { count: 70, speed: 2.4, size: 0.06, life: 1.2, gravity: 1.6, spread: 0.8, rainbow: false },
  'prismatic-cascade': { count: 130, speed: 3.0, size: 0.07, life: 1.5, gravity: 1.2, spread: 1.1, rainbow: true },
  explosion: { count: 240, speed: 4.6, size: 0.085, life: 1.9, gravity: 1.0, spread: 1.6, rainbow: true },
};

function discTexture() {
  const s = 64;
  const c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export class Particles {
  constructor(scene) {
    this.scene = scene;
    this.bursts = [];
    this.tex = discTexture();
  }

  burst(preset, { color = 0xffffff, origin = new THREE.Vector3() } = {}) {
    const cfg = PRESETS[preset];
    if (!cfg) return;

    const n = cfg.count;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    const base = new THREE.Color(color);

    for (let i = 0; i < n; i++) {
      positions[i * 3] = origin.x;
      positions[i * 3 + 1] = origin.y;
      positions[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.2;

      // random direction in a forward-biased hemisphere
      const a = Math.random() * Math.PI * 2;
      const el = (Math.random() - 0.2) * Math.PI;
      const sp = cfg.speed * (0.4 + Math.random() * 0.6);
      vel[i * 3] = Math.cos(a) * Math.cos(el) * sp * cfg.spread;
      vel[i * 3 + 1] = Math.sin(el) * sp + cfg.speed * 0.3;
      vel[i * 3 + 2] = Math.sin(a) * Math.cos(el) * sp * 0.6 + sp * 0.4;

      let col = base;
      if (cfg.rainbow) col = new THREE.Color().setHSL(Math.random(), 0.9, 0.6);
      colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: cfg.size,
      map: this.tex,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 1,
    });

    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.bursts.push({ points, geo, mat, vel, life: cfg.life, age: 0, gravity: cfg.gravity });
  }

  update(dt) {
    for (let b = this.bursts.length - 1; b >= 0; b--) {
      const burst = this.bursts[b];
      burst.age += dt;
      const k = burst.age / burst.life;
      if (k >= 1) {
        this.scene.remove(burst.points);
        burst.geo.dispose(); burst.mat.dispose();
        this.bursts.splice(b, 1);
        continue;
      }
      const pos = burst.geo.attributes.position.array;
      const vel = burst.vel;
      for (let i = 0; i < vel.length; i += 3) {
        vel[i + 1] -= burst.gravity * dt;
        pos[i] += vel[i] * dt;
        pos[i + 1] += vel[i + 1] * dt;
        pos[i + 2] += vel[i + 2] * dt;
      }
      burst.geo.attributes.position.needsUpdate = true;
      burst.mat.opacity = 1 - k * k;
    }
  }
}
