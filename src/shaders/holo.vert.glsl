// Holo vertex shader. Hands the fragment shader everything it needs to fake
// view-dependent iridescence: UVs, world-space normal, and the view
// direction from the surface to the camera.
precision highp float;

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vViewDir;

void main() {
  vUv = uv;

  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - worldPos.xyz);

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
