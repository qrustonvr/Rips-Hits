// Booster pack: pillowed foil body + separate tear strip along the top.
import * as THREE from 'three';
import { createTearStrip } from './tearStrip.js';

export const PACK = { W: 1.6, H: 2.3, D: 0.18, STRIP_H: 0.16 };

// ---------------------------------------------------------------------------
// Texture zone fractions — how much of the pack art image is each region.
// The art is laid out top-to-bottom: [top crimp | body art | bottom crimp].
// Adjust these if the pack art has different proportions.
// ---------------------------------------------------------------------------
const TOP_FRAC  = 0.09;   // top crimp (heat-sealed fold) zone
const BOT_FRAC  = 0.14;   // bottom crimp zone
const BODY_FRAC = 1 - TOP_FRAC - BOT_FRAC;   // ≈ 0.69 main art

// Raw texture cache (one load per URL).
const _texCache = new Map();
function loadTex(url) {
  if (!url) return null;
  if (_texCache.has(url)) return _texCache.get(url);
  const tex = new THREE.TextureLoader().load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  _texCache.set(url, tex);
  return tex;
}

// Clone a texture and restrict its UV window to [offsetY, offsetY+repeatY].
function croppedTex(orig, offsetY, repeatY) {
  if (!orig) return null;
  const t = orig.clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.repeat.set(1, repeatY);
  t.offset.set(0, offsetY);
  return t;
}

export function createPack(packTexturePath) {
  const { W, H, D, STRIP_H } = PACK;
  const group = new THREE.Group();

  const artTexOrig = packTexturePath ? loadTex(packTexturePath) : null;

  // Three UV-cropped copies — one per zone.
  //   BOT zone:  image rows 0%–14%  → offset 0,    repeat BOT_FRAC
  //   BODY zone: image rows 14%–83% → offset BOT_FRAC, repeat BODY_FRAC
  //   TOP zone:  image rows 83%–100%→ offset (1-TOP_FRAC), repeat TOP_FRAC
  const bodyTex = croppedTex(artTexOrig, BOT_FRAC, BODY_FRAC);
  const botTex  = croppedTex(artTexOrig, 0,         BOT_FRAC);
  const topTex  = croppedTex(artTexOrig, 1 - TOP_FRAC, TOP_FRAC);

  // Body — front & back get the cropped body art texture.
  const foilBase = new THREE.MeshPhysicalMaterial({
    color:              artTexOrig ? 0xffffff : 0xc8a832,
    map:                bodyTex ?? null,
    metalness:          artTexOrig ? 0.55 : 0.85,
    roughness:          artTexOrig ? 0.40 : 0.35,
    clearcoat:          0.6,
    clearcoatRoughness: 0.25,
  });

  // Spine / edge material — metallic foil accent.
  const foilEdge = new THREE.MeshPhysicalMaterial({
    color:              0xd4a010,
    metalness:          0.92,
    roughness:          0.20,
    clearcoat:          0.8,
    clearcoatRoughness: 0.15,
  });

  // Bottom crimp material — uses the bottom zone of the art texture.
  const crimpBotMat = new THREE.MeshPhysicalMaterial({
    color:              artTexOrig ? 0xffffff : 0xb8940e,
    map:                botTex ?? null,
    metalness:          artTexOrig ? 0.80 : 0.90,
    roughness:          artTexOrig ? 0.35 : 0.55,
    clearcoat:          0.5,
    clearcoatRoughness: 0.3,
  });

  // Top crimp / tear strip material — uses the top zone of the art texture.
  const topCrimpMat = new THREE.MeshPhysicalMaterial({
    color:              artTexOrig ? 0xffffff : 0xd4a010,
    map:                topTex ?? null,
    metalness:          artTexOrig ? 0.80 : 0.92,
    roughness:          artTexOrig ? 0.30 : 0.20,
    clearcoat:          0.7,
    clearcoatRoughness: 0.2,
  });

  // body: [right, left, top-side, bot-side, front, back]
  const bodyMats = [foilEdge, foilEdge, foilEdge, foilEdge, foilBase, foilBase];

  const bodyH = H - STRIP_H;
  const bodyGeo = new THREE.BoxGeometry(W, bodyH, D, 24, 32, 1);
  shapePack(bodyGeo, W, bodyH);
  const body = new THREE.Mesh(bodyGeo, bodyMats);
  body.position.y = -STRIP_H / 2;
  group.add(body);

  // Dark interior revealed when strip peels.
  const interior = new THREE.Mesh(
    new THREE.BoxGeometry(W * 0.96, 0.06, 0.04),
    new THREE.MeshStandardMaterial({ color: 0x0b0b10, roughness: 1, metalness: 0 })
  );
  interior.position.y = H / 2 - STRIP_H + 0.01;
  group.add(interior);

  // Bottom crimp — uses the bottom zone of the art texture.
  const crimpBot = new THREE.Mesh(
    new THREE.BoxGeometry(W, 0.22, 0.04),
    crimpBotMat
  );
  crimpBot.position.y = -(H / 2 + 0.1) + 0.05;
  group.add(crimpBot);

  // Tear strip (top crimp + grab tab) — uses the top zone art texture.
  const strip = createTearStrip(PACK, topCrimpMat);
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
