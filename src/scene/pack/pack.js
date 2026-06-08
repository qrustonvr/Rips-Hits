// Booster pack: pillowed foil body + separate tear strip along the top.
import * as THREE from 'three';
import { createTearStrip } from './tearStrip.js';

export const PACK = { W: 1.6, H: 2.3, D: 0.18, STRIP_H: 0.26 };

// Texture cache so repeated ripAnother() calls don't re-fetch.
const _texCache = new Map();
function loadTex(url) {
  if (!url) return null;
  if (_texCache.has(url)) return _texCache.get(url);
  const tex = new THREE.TextureLoader().load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  _texCache.set(url, tex);
  return tex;
}

export function createPack(packTexturePath) {
  const { W, H, D, STRIP_H } = PACK;
  const group = new THREE.Group();

  // Load pack art if a path is supplied. Falls back to tinted foil.
  const artTex = packTexturePath ? loadTex(packTexturePath) : null;

  const foilBase = new THREE.MeshPhysicalMaterial({
    color:               artTex ? 0xffffff : 0xc8a832,
    map:                 artTex ?? null,
    metalness:           artTex ? 0.55 : 0.85,
    roughness:           artTex ? 0.40 : 0.35,
    clearcoat:           0.6,
    clearcoatRoughness:  0.25,
  });

  // Spine / edge material — metallic foil accent strip
  const foilEdge = new THREE.MeshPhysicalMaterial({
    color:               0xd4a010,
    metalness:           0.92,
    roughness:           0.20,
    clearcoat:           0.8,
    clearcoatRoughness:  0.15,
  });

  // Body uses an array of materials: [right, left, top-side, bot-side, front, back]
  // front (index 4) and back (index 5) get the art; sides get the foil edge.
  const bodyMats = [foilEdge, foilEdge, foilEdge, foilEdge, foilBase, foilBase];

  const bodyH = H - STRIP_H;
  const bodyGeo = new THREE.BoxGeometry(W, bodyH, D, 24, 32, 1);
  shapePack(bodyGeo, W, bodyH);
  const body = new THREE.Mesh(bodyGeo, bodyMats);
  body.position.y = -STRIP_H / 2;
  group.add(body);

  // Dark interior revealed as the strip peels away
  const interior = new THREE.Mesh(
    new THREE.BoxGeometry(W * 0.96, 0.06, 0.04),
    new THREE.MeshStandardMaterial({ color: 0x0b0b10, roughness: 1, metalness: 0 })
  );
  interior.position.y = H / 2 - STRIP_H + 0.01;
  group.add(interior);

  // Bottom crimp
  const crimpBot = new THREE.Mesh(
    new THREE.BoxGeometry(W, 0.22, 0.04),
    new THREE.MeshStandardMaterial({ color: 0xb8940e, metalness: 0.9, roughness: 0.55 })
  );
  crimpBot.position.y = -(H / 2 + 0.1);
  group.add(crimpBot);

  // Tear strip (includes top crimp + grab tab)
  const strip = createTearStrip(PACK, foilEdge);
  group.add(strip.group);

  const state = {
    group,
    strip,
    open:      false,
    grabbed:   false,
    targetRot: new THREE.Euler(),
    kickT:     -1,

    update(dt, t) {
      const idleX = Math.sin(t * 0.8) * 0.03;
      const idleY = Math.sin(t * 0.5) * 0.05;
      group.rotation.x += (state.targetRot.x + idleX - group.rotation.x) * Math.min(dt * 8, 1);
      group.rotation.y += (state.targetRot.y + idleY - group.rotation.y) * Math.min(dt * 8, 1);

      if (!state.grabbed && !state.open) {
        strip.tab.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
      } else {
        strip.tab.scale.setScalar(1);
      }

      if (state.kickT >= 0) {
        state.kickT += dt;
        const a = 0.09 * Math.exp(-state.kickT * 6);
        group.position.x = -a * Math.cos(state.kickT * 26);
        group.position.y =  a * 0.5 * Math.sin(state.kickT * 31);
        if (a < 0.002) { state.kickT = -1; group.position.set(0, 0, 0); }
      }
    },
  };

  return state;
}

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
