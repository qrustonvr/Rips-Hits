// Holo shader v0 — front face only. To be wired up via THREE.ShaderMaterial
// or onBeforeCompile on MeshPhysicalMaterial.
//
// Planned layers:
//  1. Thin-film iridescence ramp driven by viewAngle (N·V)
//  2. Rainbow diffraction sweep driven by uTilt (device gyro / drag angle)
//  3. uHoloMask texture (white = holo region) OR procedural preset pattern:
//     'cosmos' | 'vertical-beam' | 'cracked-ice' | 'full-art'
//  4. Paper-grain normal perturbation for texture
//
// Uniforms (planned):
//  uniform sampler2D uArt;       // card front art
//  uniform sampler2D uHoloMask;  // optional
//  uniform vec2  uTilt;          // gyro/drag-driven
//  uniform float uPattern;       // preset selector
//  uniform float uIntensity;

precision highp float;
varying vec2 vUv;

void main() {
  // stub — replaced in week 1, day 7
  gl_FragColor = vec4(vUv, 0.5, 1.0);
}
