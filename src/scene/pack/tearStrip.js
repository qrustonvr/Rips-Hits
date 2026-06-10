// Tear strip: peels up and arcs to the right like a real foil sticker being pulled.
import * as THREE from 'three';

// CURL_R must be a significant fraction of pack width (1.6) so vertices
// spread smoothly across the arc rather than all hitting the cap instantly.
const CURL_R   = 0.68;
// Just past 120° — freed end points upper-right.
const CURL_MAX = Math.PI * 0.68;
const Z_DAMP   = 0.14;   // slight forward tilt toward viewer

export function createTearStrip(PACK, foilMaterial) {
  const { W, H, STRIP_H } = PACK;

  const group = new THREE.Group();

  const yBot    = H / 2 - STRIP_H;
  const stripH  = STRIP_H + 0.06;
  const yCenter = yBot + stripH / 2;
  const depth   = 0.06;
  const yTab    = H / 2 - 0.1;

  const geo  = new THREE.BoxGeometry(W, stripH, depth, 48, 6, 1);
  geo.translate(0, yCenter, 0);
  const orig = geo.attributes.position.array.slice();

  const mat = foilMaterial.clone();
  mat.transparent = true;
  mat.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geo, mat);
  group.add(mesh);

  const tabMat = new THREE.MeshStandardMaterial({
    color:     0xb6ff3c,
    emissive:  0x5a8c10,
    metalness: 0.3,
    roughness: 0.4,
    transparent: true,
  });
  const tab = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 24), tabMat);
  tab.rotation.x = Math.PI / 2;
  tab.position.set(-W / 2 + 0.1, yTab, 0.12);
  group.add(tab);

  const flyVel = new THREE.Vector3();
  const spin   = new THREE.Vector3();

  const state = {
    group,
    mesh,
    tab,
    progress: 0,
    velocity: 0,
    detached: false,
    done:     false,
    _fadeT:   0,

    setProgress(p, time) {
      this.progress = p;
      const pos = geo.attributes.position;
      const front = -W / 2 + p * (W * 1.08);
      const flutterAmp = 0.007 * Math.min(Math.abs(this.velocity) * 6, 1);

      for (let i = 0; i < pos.count; i++) {
        const ox = orig[i * 3];
        const oy = orig[i * 3 + 1];
        const oz = orig[i * 3 + 2];

        if (ox >= front) {
          pos.setXYZ(i, ox, oy, oz);
          continue;
        }

        // Arc in XY: starts going UP (θ=0), curves to the RIGHT (θ=π/2+).
        // CURL_R is large enough that the full strip width spans < CURL_MAX,
        // keeping vertices spread smoothly across the arc with no flat pile-up.
        const d  = front - ox;
        const th = Math.min(d / CURL_R, CURL_MAX);
        const flutter = Math.sin(time * 22 + oy * 9 + th * 2) * flutterAmp * Math.min(th, 1);

        pos.setXYZ(
          i,
          ox + CURL_R * Math.sin(th),                   // sweeps right
          oy + CURL_R * (1 - Math.cos(th)) + flutter,   // lifts up
          oz + CURL_R * Math.sin(th) * Z_DAMP           // slight forward tilt
        );
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();

      // Tab sits at the tear boundary (displacement ≈ 0 there).
      tab.position.set(Math.min(front, W / 2 - 0.05), yTab, 0.15);
    },

    detach() {
      if (this.detached) return;
      this.detached = true;
      flyVel.set(2.4, 3.2, 0.9);
      spin.set(4, 3, 7);
    },

    update(dt) {
      if (!this.detached || this.done) return;
      flyVel.y -= 5.5 * dt;
      group.position.addScaledVector(flyVel, dt);
      group.rotation.x += spin.x * dt;
      group.rotation.y += spin.y * dt;
      group.rotation.z += spin.z * dt;
      this._fadeT += dt;
      const o = Math.max(1 - this._fadeT * 1.4, 0);
      mat.opacity    = o;
      tabMat.opacity = o;
      if (this._fadeT > 0.85) {
        this.done     = true;
        group.visible = false;
      }
    },
  };

  return state;
}
