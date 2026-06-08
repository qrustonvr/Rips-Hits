// A single 3D card: holo front + shared back + a soft rarity glow halo.
//
//   outer (position / scale — slide + stack)
//     glow  (additive halo behind, faces camera, tinted by rarity)
//     flip  (rotation.y — the flip; PI = back to camera, 0 = front)
//       front (holo ShaderMaterial)
//       back  (shared card-back texture)
import * as THREE from 'three';
import { createHoloMaterial } from './holoMaterial.js';
import { cardBackTexture, glowTexture } from './textures.js';
import { rarityOf } from '../../game/rarity.js';

export const CARD = { W: 1.5, H: 2.1 };

export function createCard(data) {
  const r = rarityOf(data.tier);
  const outer = new THREE.Group();

  // --- glow halo (behind, slightly larger; only the margin shows) ---
  const glowMat = new THREE.SpriteMaterial({
    map: glowTexture(),
    color: new THREE.Color(r.color),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.set(CARD.W * 2.0, CARD.H * 1.7, 1);
  glow.position.z = -0.06;
  outer.add(glow);

  // --- flip group ---
  const flip = new THREE.Group();
  outer.add(flip);

  const frontGeo = new THREE.PlaneGeometry(CARD.W, CARD.H, 1, 1);
  const frontMat = createHoloMaterial({
    color: r.color,
    pattern: data.holoPattern,
    intensity: 0,
    artTexture: null,
  });
  const front = new THREE.Mesh(frontGeo, frontMat);
  front.position.z = 0.012;
  flip.add(front);

  const backGeo = new THREE.PlaneGeometry(CARD.W, CARD.H, 1, 1);
  const backMat = new THREE.MeshBasicMaterial({ map: cardBackTexture() });
  const back = new THREE.Mesh(backGeo, backMat);
  back.position.z = -0.012;
  back.rotation.y = Math.PI;        // faces -z so it shows when flip.y = PI
  flip.add(back);

  flip.rotation.y = Math.PI;        // start showing the back

  const holo = frontMat.userData.holo;

  return {
    data,
    rarity: r,
    group: outer,
    flip,
    glow,
    holo,
    // expose for the controller
    setGlow(v) { glowMat.opacity = v; },
    setHoloIntensity(v) { holo.setIntensity(v); },
    setHoloTilt(x, y) { holo.setTilt(x, y); },
    setTime(t) { holo.setTime(t); },

    // Load a card-art image URL into the holo shader.
    // Safe to call at any time — the texture swaps in when ready.
    setArt(url) {
      if (!url) return;
      console.log('[card] setArt loading:', url);
      const loader = new THREE.TextureLoader();
      loader.crossOrigin = 'anonymous';
      loader.load(
        url,
        (tex) => {
          console.log('[card] art loaded OK:', url);
          tex.colorSpace = THREE.SRGBColorSpace;
          frontMat.uniforms.uArt.value = tex;
          frontMat.uniforms.uHasArt.value = 1.0;
        },
        undefined,
        (err) => {
          console.error('[card] art load FAILED:', url, err);
        }
      );
    },

    dispose() {
      frontGeo.dispose(); backGeo.dispose();
      frontMat.dispose(); backMat.dispose(); glowMat.dispose();
      const artTex = frontMat.uniforms?.uArt?.value;
      if (artTex && artTex.dispose) artTex.dispose();
    },
  };
}
