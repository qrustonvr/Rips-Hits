// Tear strip: the pack's top crimp, modelled as a corrugated foil band with
// a serrated perforation edge. Pocket-style tear: a glowing slice traces the
// cut as you pull, the freed foil lifts and leans back like a lid (rippling
// like a banner), then the whole strip pops upward and floats off.
// Deformation is CPU-side (small vertex count, mobile-cheap).
import * as THREE from 'three';

const ss = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};
const tri = (x, p) => {
  const t = ((x / p) % 1 + 1) % 1;
  return Math.abs(t * 2 - 1) * 2 - 1;
};

// ---------------------------------------------------------------------------
// Strip geometry: front + back sheets covering [perforation .. above pack
// top]. The bottom rows bulge to meet the body's pinched thickness, the rest
// flattens into the corrugated crimp. The bottom edge is zig-zagged so the
// torn-off strip reads as perforated. UVs sample the top zone of the same
// full pack texture the body uses (v -> 1 at the pack top).
// ---------------------------------------------------------------------------
function buildStripGeometry(PACK) {
  const { W, H, D, STRIP_H } = PACK;
  const yBot = H / 2 - STRIP_H;        // perforation line
  const yTop = H / 2 + 0.06;           // crimped area extends above pack top
  const NX = 64, NY = 8;
  const crimpHalf = 0.009;

  const pos = [], uvs = [], idx = [];
  for (const s of [1, -1]) {
    const base = pos.length / 3;
    for (let iy = 0; iy <= NY; iy++) {
      for (let ix = 0; ix <= NX; ix++) {
        const x = -W / 2 + (ix / NX) * W;
        let y = yBot + (iy / NY) * (yTop - yBot);
        // Serrated tear edge, overlapping the body slightly so no gap shows
        // while sealed.
        if (iy === 0) y = yBot - 0.025 + 0.02 * (0.5 + 0.5 * tri(x, 0.1));

        // Match the body's pinched thickness at the perforation, then
        // flatten into the crimp.
        const fx = Math.max(1 - Math.pow(Math.abs(2 * x / W), 2.4), 0);
        const bodyHalf = (D / 2) * Math.sqrt(fx) * 0.30;
        const k = ss(yBot + 0.02, yBot + 0.10, y);
        const taper = ss(0, 0.018, W / 2 - Math.abs(x)) *
                      (1 - 0.6 * ss(yTop - 0.025, yTop, y));
        // +0.004 keeps the overlap proud of the body (no z-fighting).
        const half = (Math.max(bodyHalf * (1 - k), crimpHalf) + 0.004 * (1 - k)) * taper;
        const wave = 0.011 * tri(x, 0.082) * k;   // crimp corrugation

        pos.push(x, y, wave + s * half);
        // Cap v just below 1 — the art's topmost pixel rows are dark border.
        uvs.push(s > 0 ? ix / NX : 1 - ix / NX, Math.min((y + H / 2) / H, 0.985));
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

// Grab tab: rounded pull-tag with an embossed chevron pointing along the
// tear direction. Returned as a group so the pulse/scale in pack.js works.
function buildTab() {
  const tab = new THREE.Group();

  const w = 0.26, h = 0.14, r = 0.055;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  shape.lineTo(w / 2, h / 2 - r);
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  shape.lineTo(-w / 2 + r, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  shape.lineTo(-w / 2, -h / 2 + r);
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);

  const tagGeo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.025,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 2,
  });
  tagGeo.center();
  const tagMat = new THREE.MeshStandardMaterial({
    color: 0xb6ff3c,
    emissive: 0x5a8c10,
    metalness: 0.3,
    roughness: 0.35,
    transparent: true,
  });
  tab.add(new THREE.Mesh(tagGeo, tagMat));

  const chev = new THREE.Shape();
  chev.moveTo(-0.035, 0.045);
  chev.lineTo(0.01, 0.045);
  chev.lineTo(0.055, 0);
  chev.lineTo(0.01, -0.045);
  chev.lineTo(-0.035, -0.045);
  chev.lineTo(0.01, 0);
  chev.closePath();
  const chevMat = new THREE.MeshBasicMaterial({ color: 0x1c2a08, transparent: true });
  const chevMesh = new THREE.Mesh(new THREE.ShapeGeometry(chev), chevMat);
  chevMesh.position.z = 0.024;
  tab.add(chevMesh);

  return { tab, mats: [tagMat, chevMat] };
}

// Soft radial glow sprite texture for the tear-front spark (built once).
let _glowTex = null;
function getGlowTex() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,230,160,0.8)');
  grad.addColorStop(1, 'rgba(255,210,120,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  _glowTex = new THREE.CanvasTexture(c);
  return _glowTex;
}

export function createTearStrip(PACK, foilMaterial) {
  const { W, H, STRIP_H } = PACK;

  const group = new THREE.Group();
  const yTab = H / 2 - 0.1;
  const yPerf = H / 2 - STRIP_H;       // perforation line

  const geo = buildStripGeometry(PACK);
  const orig = geo.attributes.position.array.slice();

  const mat = foilMaterial.clone();
  mat.transparent = true;
  mat.side = THREE.DoubleSide;         // inside shows as the lid lifts
  const mesh = new THREE.Mesh(geo, mat);
  group.add(mesh);

  const { tab, mats: tabMats } = buildTab();
  tab.position.set(-W / 2 + 0.1, yTab, 0.12);
  group.add(tab);

  // Glowing slice: a spark riding the tear front + a hot line along the cut.
  const glowTex = getGlowTex();
  const sparkMat = new THREE.MeshBasicMaterial({
    map: glowTex,
    color: 0xffe9a8,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const spark = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sparkMat);
  spark.scale.setScalar(0.3);
  spark.position.set(-W / 2, yPerf, 0.14);
  spark.visible = false;
  group.add(spark);

  const lineMat = new THREE.MeshBasicMaterial({
    color: 0xffd76a,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const line = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.028), lineMat);
  line.position.set(0, yPerf, 0.07);
  line.visible = false;
  group.add(line);

  const flyVel = new THREE.Vector3();
  const spin = new THREE.Vector3();

  const state = {
    group,
    mesh,
    tab,
    progress: 0,
    velocity: 0,      // dProgress/dt, drives audio + flutter
    detached: false,
    done: false,
    _fadeT: 0,

    // Deform the strip for pull progress p (0 = sealed, ~1.1 = fully off).
    setProgress(p, time) {
      this.progress = p;
      const pos = geo.attributes.position;
      const front = -W / 2 + p * (W * 1.08);
      const vAmp = Math.min(Math.abs(this.velocity) * 6, 1);

      for (let i = 0; i < pos.count; i++) {
        const ox = orig[i * 3];
        const oy = orig[i * 3 + 1];
        const oz = orig[i * 3 + 2];
        if (ox >= front) {
          pos.setXYZ(i, ox, oy, oz);
          continue;
        }
        // Freed foil hinges back at the perforation like a lid and slides up.
        // k drives the initial peel-open; kk keeps growing with distance so
        // the older foil never freezes flat — it keeps leaning past vertical,
        // keeps climbing, and undulates like a streamer.
        const d = front - ox;
        const k = Math.min(d / (W * 0.55), 1);
        const kk = d / W;
        const ry = oy - yPerf;
        const ang = Math.min(0.9 * k + 0.5 * kk, 2.0);   // lean on past ~90°
        const rise = 0.4 * k * k + 0.22 * kk;
        const wave = Math.sin(d * 4.5 - time * 12) *
                     (0.04 + 0.06 * vAmp) * Math.min(0.3 * k + kk, 1.2);
        pos.setXYZ(
          i,
          ox,
          yPerf + ry * Math.cos(ang) + rise + wave * 0.5,
          oz * Math.cos(ang) - ry * Math.sin(ang) + wave
        );
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();

      // Glow rides the cut; intensity follows pull velocity.
      const cutX = THREE.MathUtils.clamp(front, -W / 2, W / 2);
      const slicing = !this.detached && p > 0.01 && p < 1.05;
      spark.visible = line.visible = slicing;
      spark.position.x = cutX;
      spark.scale.setScalar(0.24 + 0.28 * vAmp + Math.sin(time * 30) * 0.02);
      line.scale.x = Math.max(cutX + W / 2, 1e-3);
      line.position.x = (cutX - W / 2) / 2;
      lineMat.opacity = 0.45 + 0.35 * vAmp;

      // Tab rides the tear front
      tab.position.set(Math.min(front, W / 2), yTab, 0.12);
    },

    detach() {
      if (this.detached) return;
      this.detached = true;
      spark.visible = false;
      line.visible = false;
      flyVel.set(0.5, 2.6, 1.2);   // pops upward, drifting toward the camera
      spin.set(-2.2, 0.8, 0.6);    // lazy backward tumble
    },

    // Fly-off animation after detach.
    update(dt) {
      if (!this.detached || this.done) return;
      flyVel.y -= 6.5 * dt;
      group.position.addScaledVector(flyVel, dt);
      group.rotation.x += spin.x * dt;
      group.rotation.y += spin.y * dt;
      group.rotation.z += spin.z * dt;
      this._fadeT += dt;
      const o = Math.max(1 - this._fadeT * 1.4, 0);
      mat.opacity = o;
      for (const m of tabMats) m.opacity = o;
      if (this._fadeT > 0.85) {
        this.done = true;
        group.visible = false;
      }
    },
  };

  return state;
}
