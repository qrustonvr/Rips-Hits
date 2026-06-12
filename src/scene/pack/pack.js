// Booster pack: procedurally modelled foil envelope in the style of modern
// Pokémon booster packs — a pillowed tube body with corrugated heat-seal
// crimps top and bottom, a card-stack plateau pressed against the foil, and
// a separate tear-off top-crimp strip (see tearStrip.js).
//
// The whole envelope shares ONE texture: the pack art maps continuously from
// the bottom crimp (v=0) up through the body and onto the tear strip (v=1),
// so UVs index straight into the default pack texture with no cropping.
import * as THREE from 'three';
import { createTearStrip } from './tearStrip.js';

export const PACK = { W: 1.6, H: 2.3, D: 0.18, STRIP_H: 0.16 };

const ss = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};
const tri = (x, p) => {
  const t = ((x / p) % 1 + 1) % 1;
  return Math.abs(t * 2 - 1) * 2 - 1;
};

// Raw texture cache (one load per URL).
const _texCache = new Map();
function loadTex(url) {
  if (!url) return null;
  if (_texCache.has(url)) return _texCache.get(url);
  const tex = new THREE.TextureLoader().load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  _texCache.set(url, tex);
  return tex;
}

// Tiny procedural "studio" cube map so the foil has something to reflect —
// bright ceiling, dark floor, and softbox streaks on the walls. Built once.
let _envTex = null;
function studioEnv() {
  if (_envTex) return _envTex;
  const mk = (paint) => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    paint(c.getContext('2d'));
    return c;
  };
  const wall = () => mk((g) => {
    const lg = g.createLinearGradient(0, 0, 0, 64);
    lg.addColorStop(0, '#cdd5e2');
    lg.addColorStop(0.55, '#565e6e');
    lg.addColorStop(1, '#13141a');
    g.fillStyle = lg;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.fillRect(0, 9, 64, 5);
    g.fillStyle = 'rgba(255,238,196,0.55)';
    g.fillRect(0, 31, 64, 3);
  });
  const flat = (color) => mk((g) => { g.fillStyle = color; g.fillRect(0, 0, 64, 64); });
  // Face order: px, nx, py, ny, pz, nz
  _envTex = new THREE.CubeTexture([wall(), wall(), flat('#f1f4fa'), flat('#0a0a10'), wall(), wall()]);
  _envTex.colorSpace = THREE.SRGBColorSpace;
  _envTex.needsUpdate = true;
  return _envTex;
}

// ---------------------------------------------------------------------------
// Envelope geometry: front + back foil sheets welded shut at the sides and
// bottom. Cross-section is a rounded tube; vertically it flattens into the
// corrugated bottom crimp and pinches in below the tear-strip perforation.
// ---------------------------------------------------------------------------
function buildBodyGeometry() {
  const { W, H, D, STRIP_H } = PACK;
  const yBot = -H / 2;
  const yTop = H / 2 - STRIP_H;        // perforation line
  const yCrimpTop = yBot + 0.13;       // top of the flat bottom-crimp band
  const NX = 56, NY = 80;
  const crimpHalf = 0.009;             // half-thickness of crimped (sealed) foil

  const pos = [], uvs = [], idx = [];
  for (const s of [1, -1]) {           // s=+1 front sheet, s=-1 back sheet
    const base = pos.length / 3;
    for (let iy = 0; iy <= NY; iy++) {
      const y = yBot + (iy / NY) * (yTop - yBot);
      for (let ix = 0; ix <= NX; ix++) {
        const x = -W / 2 + (ix / NX) * W;

        // Rounded tube cross-section, vertical-tangent at the side seams.
        const fx = Math.max(1 - Math.pow(Math.abs(2 * x / W), 2.4), 0);
        const cz = (D / 2) * Math.sqrt(fx);

        // Vertical envelope: flat crimp → full pillow → pinched at the seal.
        const e1 = ss(yCrimpTop - 0.03, yCrimpTop + 0.32, y);
        const e2 = 1 - 0.70 * ss(yTop - 0.36, yTop - 0.03, y);
        const env = e1 * e2;

        // Card stack pressed against the foil — soft rectangular plateau.
        const rx = ss(-W * 0.47, -W * 0.33, x) * (1 - ss(W * 0.33, W * 0.47, x));
        const ry = ss(yCrimpTop + 0.10, yCrimpTop + 0.34, y) *
                   (1 - ss(yTop - 0.46, yTop - 0.22, y));
        const card = 0.016 * rx * ry * Math.min(env * 2, 1);

        let half = Math.max(cz * env + card, crimpHalf);

        // Crimp corrugation: vertical ridges pressed through both sheets.
        // (Top-zone corrugation lives on the tear strip, which overlaps here.)
        const wB = 1 - ss(yCrimpTop - 0.02, yCrimpTop + 0.08, y);
        const wave = wB * 0.013 * tri(x, 0.082);

        // Fold micro-creases where the tube transitions into the crimps,
        // plus a faint large-scale waviness across the big foil faces.
        const tz = e1 * (1 - e1) + e2 * (1 - e2);
        const crease = 0.006 * tz * Math.sin(x * 34 + (s > 0 ? 0 : 1.7));
        const sheenW = 0.004 * env * Math.sin(x * 7.1 + y * 3.3) * Math.sin(y * 5.7);

        // Weld the seams shut at the side edges and the bottom edge.
        const taper = ss(0, 0.018, W / 2 - Math.abs(x)) * ss(0, 0.02, y - yBot);

        pos.push(x, y, wave + s * taper * (half + crease + sheenW));
        // Continuous full-image UVs; back sheet flips u so art reads
        // correctly when the pack is turned around.
        uvs.push(s > 0 ? ix / NX : 1 - ix / NX, (y + H / 2) / H);
      }
    }
    for (let iy = 0; iy < NY; iy++) {
      for (let ix = 0; ix < NX; ix++) {
        const a = base + iy * (NX + 1) + ix;
        const b = a + 1, c = a + NX + 1, d = c + 1;
        if (s > 0) idx.push(a, b, d, a, d, c);
        else       idx.push(a, d, b, a, c, d);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export function createPack(packTexturePath) {
  const { W, H, STRIP_H } = PACK;
  const group = new THREE.Group();

  const artTex = packTexturePath ? loadTex(packTexturePath) : null;

  // One foil material for the whole envelope (and cloned by the tear strip).
  const foil = new THREE.MeshPhysicalMaterial({
    color:              artTex ? 0xffffff : 0xc8a832,
    map:                artTex ?? null,
    metalness:          artTex ? 0.50 : 0.85,
    roughness:          artTex ? 0.32 : 0.30,
    clearcoat:          1.0,
    clearcoatRoughness: 0.18,
    envMap:             studioEnv(),
    envMapIntensity:    0.9,
  });

  const body = new THREE.Mesh(buildBodyGeometry(), foil);
  group.add(body);

  // Dark interior revealed when the strip peels.
  // Thin enough to stay hidden behind the pinched foil until the tear.
  const interior = new THREE.Mesh(
    new THREE.BoxGeometry(W * 0.86, 0.06, 0.016),
    new THREE.MeshStandardMaterial({ color: 0x0b0b10, roughness: 1, metalness: 0 })
  );
  interior.position.y = H / 2 - STRIP_H - 0.045;
  group.add(interior);

  // Tear strip (top crimp + grab tab) — samples the top zone of the same art.
  const strip = createTearStrip(PACK, foil);
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
