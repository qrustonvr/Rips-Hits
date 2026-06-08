// Builds the front-face holo ShaderMaterial from the GLSL in /shaders.
// One material per card (cheap — they share compiled program). Exposes a
// small update API so the reveal/inspect code can drive tilt + time.
import * as THREE from 'three';
import vert from '../../shaders/holo.vert.glsl?raw';
import frag from '../../shaders/holo.frag.glsl?raw';

const PATTERN_ID = {
  null: 0,
  none: 0,
  cosmos: 1,
  'vertical-beam': 2,
  'cracked-ice': 3,
  'full-art': 4,
};

export function createHoloMaterial({ color = 0x9aa0a6, pattern = null, intensity = 0.0, artTexture = null } = {}) {
  const uniforms = {
    uArt: { value: artTexture },
    uHasArt: { value: artTexture ? 1.0 : 0.0 },
    uBaseColor: { value: new THREE.Color(color) },
    uTilt: { value: new THREE.Vector2(0, 0) },
    uTime: { value: 0 },
    uPattern: { value: PATTERN_ID[pattern] ?? 0 },
    uIntensity: { value: intensity },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vert,
    fragmentShader: frag,
  });

  mat.userData.holo = {
    setTilt(x, y) { uniforms.uTilt.value.set(x, y); },
    setTime(t) { uniforms.uTime.value = t; },
    setIntensity(v) { uniforms.uIntensity.value = v; },
  };

  return mat;
}
