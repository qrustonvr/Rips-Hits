// Booster pack: pillowed foil body + separate tear strip along the top.
// Real wrap textures + normal-mapped crinkle replace the flat foil later.
import * as THREE from 'three';
import { createTearStrip } from './tearStrip.js';

export const PACK = { W: 1.6, H: 2.3, D: 0.18, STRIP_H: 0.26 };

export function createPack() {
  const { W, H, D, STRIP_H } = PACK;
  const group = new THREE.Group();

  const foil = new THREE.MeshPhysicalMaterial({
    color: 0xb42030,            // placeholder red wrap (One Piece vibes)
    metalness: 0.85,
    roughness: 0.35,
    clearcoat: 0.6,
    clearcoatRoughness: 0.25,
  });

  // Body — everything below the perforation line. Pillowed + pinched at edges.
  const bodyH = H - STRIP_H;
  const bodyGeo = new THREE.BoxGeometry(W, bodyH, D, 24, 32, 1);
  shapePack(bodyGeo, W, bodyH);
  const body = new THREE.Mesh(bodyGeo, foil);
  body.position.y = -STRIP_H / 2;
  group.add(body);

  // Dark interior — revealed as the strip peels away.
  const interior = new THREE.Mesh(
    new THREE.BoxGeometry(W * 0.96, 0.06, 0.04),
    new THREE.MeshStandardMaterial({ color: 0x0b0b10, roughness: 1, metalness: 0 })
  );
  interior.position.y = H / 2 - STRIP_H + 0.01;
  group.add(interior);

  // Bottom crimp
  const crimpBot = new THREE.Mesh(
    new THREE.BoxGeometry(W, 0.22, 0.04),
    new THREE.MeshStandardMaterial({ color: 0x8c1825, metalness: 0.9, roughness: 0.55 })
  );
  crimpBot.position.y = -(H / 2 + 0.1);
  group.add(crimpBot);

  // Tear strip (includes the top crimp area + grab tab)
  const strip = createTearStrip(PACK, foil);
  group.add(strip.group);

  const state = {
    group,
    strip,
    open: false,
    grabbed: false,
    targetRot: new THREE.Euler(),
    kickT: -1, // >= 0 while recoil shake is playing

    update(dt, t) {
      // Idle sway — the pack feels alive even untouched
      const idleX = Math.sin(t * 0.8) * 0.03;
      const idleY = Math.sin(t * 0.5) * 0.05;
      group.rotation.x += (state.targetRot.x + idleX - group.rotation.x) * Math.min(dt * 8, 1);
      group.rotation.y += (state.targetRot.y + idleY - group.rotation.y) * Math.min(dt * 8, 1);

      // Tab pulse hint (until someone grabs it)
      if (!state.grabbed && !state.open) {
        strip.tab.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
      } else {
        strip.tab.scale.setScalar(1);
      }

      // Recoil kick when the strip pops off
      if (state.kickT >= 0) {
        state.kickT += dt;
        const a = 0.09 * Math.exp(-state.kickT * 6);
        group.position.x = -a * Math.cos(state.kickT * 26);
        group.position.y = a * 0.5 * Math.sin(state.kickT * 31);
        if (a < 0.002) {
          state.kickT = -1;
          group.position.set(0, 0, 0);
        }
      }
    },
  };

  return state;
}

// Pillow the middle (stuffed look) and pinch top/bottom edges (crimp look).
function shapePack(geo, W, Hh) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const fx = 1 - Math.pow(Math.abs(x) / (W / 2), 2);
    const fy = Math.max(1 - Math.pow(Math.abs(y) / (Hh / 2), 2), 0);
    const pinch = 0.35 + 0.65 * Math.sqrt(fy);
    const bulge = fx * fy * 0.1;
    pos.setZ(i, z * pinch + Math.sign(z) * bulge);
  }
  geo.computeVertexNormals();
}
