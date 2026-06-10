// Tear strip: a segmented mesh along the pack top that peels upward
// as you pull the tab across, then detaches and flies up.
// Deformation is CPU-side (small vertex count, mobile-cheap).
import * as THREE from 'three';

// Tune peeling feel here.
const CURL_R   = 0.18;   // cylinder radius of the upward curl
const CURL_MAX = Math.PI * 0.9;  // max arc angle (slightly past vertical)
const Z_DAMP   = 0.45;   // fraction of curl radius applied to Z (keeps strip close to pack)

export function createTearStrip(PACK, foilMaterial) {
  const { W, H, STRIP_H } = PACK;

  const group = new THREE.Group();

  const yBot    = H / 2 - STRIP_H;        // perforation line
  const stripH  = STRIP_H + 0.06;         // strip + crimped area above pack top
  const yCenter = yBot + stripH / 2;
  const depth   = 0.06;
  const yTab    = H / 2 - 0.1;

  const geo  = new THREE.BoxGeometry(W, stripH, depth, 48, 6, 1);
  geo.translate(0, yCenter, 0);           // pack-local coords baked in
  const orig = geo.attributes.position.array.slice();

  const mat = foilMaterial.clone();
  mat.transparent = true;
  mat.side = THREE.DoubleSide;            // inside shows when peeled
  const mesh = new THREE.Mesh(geo, mat);
  group.add(mesh);

  // Grab tab
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

    // Deform the strip for pull progress p (0 = sealed, ~1.1 = fully off).
    // The torn portion peels UPWARD (Y) with a gentle forward tilt (Z).
    // X position is unchanged — the strip lifts straight up like a banner peel.
    setProgress(p, time) {
      this.progress = p;
      const pos = geo.attributes.position;
      const front = -W / 2 + p * (W * 1.08);
      const flutterAmp = 0.010 * Math.min(Math.abs(this.velocity) * 6, 1);

      for (let i = 0; i < pos.count; i++) {
        const ox = orig[i * 3];
        const oy = orig[i * 3 + 1];
        const oz = orig[i * 3 + 2];

        if (ox >= front) {
          pos.setXYZ(i, ox, oy, oz);
          continue;
        }

        // Distance behind the tear front, mapped to a curl angle.
        const d   = front - ox;
        const th  = Math.min(d / CURL_R, CURL_MAX);
        const flutter = Math.sin(time * 22 + oy * 9 + th * 2) * flutterAmp * Math.min(th, 1);

        // Cylindrical peel in the YZ plane:
        //   y lifts upward  (sin goes 0 → 1 → 0 through the arc)
        //   z tilts toward viewer (1-cos goes 0 → 1)
        pos.setXYZ(
          i,
          ox,                                          // x unchanged
          oy + CURL_R * Math.sin(th) + flutter,        // peels upward
          oz + CURL_R * (1 - Math.cos(th)) * Z_DAMP   // slight forward tilt
        );
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();

      // Tab rides the tear front.
      tab.position.set(Math.min(front, W / 2), yTab, 0.14);
    },

    detach() {
      if (this.detached) return;
      this.detached = true;
      // Fly mostly upward since the strip was peeling up.
      flyVel.set(0.4, 4.2, 1.2);
      spin.set(7, 2, 5);
    },

    // Fly-off animation after detach.
    update(dt) {
      if (!this.detached || this.done) return;
      flyVel.y -= 5.0 * dt;   // gentler gravity so it floats up longer
      group.position.addScaledVector(flyVel, dt);
      group.rotation.x += spin.x * dt;
      group.rotation.y += spin.y * dt;
      group.rotation.z += spin.z * dt;
      this._fadeT += dt;
      const o = Math.max(1 - this._fadeT * 1.4, 0);
      mat.opacity     = o;
      tabMat.opacity  = o;
      if (this._fadeT > 0.85) {
        this.done          = true;
        group.visible      = false;
      }
    },
  };

  return state;
}
