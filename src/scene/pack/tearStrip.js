// Tear strip: a segmented mesh along the pack top that peels up and arcs
// to the right as you drag the tab across, then detaches and flies away.
import * as THREE from 'three';

// Arc radius of the curl — larger = more dramatic sweep.
const CURL_R   = 0.42;
// Max angle: just past 90° so the end points rightward.
const CURL_MAX = Math.PI * 0.58;
// How much the arc tilts toward the viewer.
const Z_DAMP   = 0.18;

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

    // Quarter-circle arc in XY: freed strip sweeps UP then curves to the RIGHT.
    //   At th=0  (just at tear front): no displacement
    //   At th=π/2 (fully freed):        dx=+CURL_R (right), dy=+CURL_R (up)
    //   Small Z forward-tilt for depth cue.
    setProgress(p, time) {
      this.progress = p;
      const pos = geo.attributes.position;
      const front = -W / 2 + p * (W * 1.08);
      const flutterAmp = 0.008 * Math.min(Math.abs(this.velocity) * 6, 1);

      for (let i = 0; i < pos.count; i++) {
        const ox = orig[i * 3];
        const oy = orig[i * 3 + 1];
        const oz = orig[i * 3 + 2];

        if (ox >= front) {
          pos.setXYZ(i, ox, oy, oz);
          continue;
        }

        const d  = front - ox;
        const th = Math.min(d / CURL_R, CURL_MAX);
        const flutter = Math.sin(time * 22 + oy * 9 + th * 2) * flutterAmp * Math.min(th, 1);

        // Arc sweeps upward (sin) then rightward (sin again past π/2),
        // anchored at the tear front so the strip stays attached at that seam.
        pos.setXYZ(
          i,
          ox + CURL_R * Math.sin(th),                   // arcs right
          oy + CURL_R * (1 - Math.cos(th)) + flutter,   // lifts up
          oz + CURL_R * Math.sin(th) * Z_DAMP           // slight forward tilt
        );
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();

      tab.position.set(Math.min(front, W / 2), yTab, 0.14);
    },

    detach() {
      if (this.detached) return;
      this.detached = true;
      // Continue the up-right trajectory.
      flyVel.set(2.8, 3.6, 1.0);
      spin.set(4, 3, 8);
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
        this.done         = true;
        group.visible     = false;
      }
    },
  };

  return state;
}
