// Holo fragment shader — front face only.
//
// Layers:
//   1. Sampled card art (or procedural placeholder if no art yet).
//   2. Thin-film iridescence at grazing angles (fresnel).
//   3. Rainbow diffraction sweep driven by uTilt + uTime.
//   4. Preset holo masks: cosmos | vertical-beam | cracked-ice | full-art.
//   5. Subtle sparkle grain so foil has texture.
//
// Intentionally subtle — art should always read clearly.
precision highp float;

uniform sampler2D uArt;
uniform float uHasArt;      // 1.0 = sample uArt, 0.0 = procedural face
uniform vec3  uBaseColor;
uniform vec2  uTilt;        // -1..1 each axis
uniform float uTime;
uniform float uPattern;     // 0 none, 1 cosmos, 2 vertical-beam, 3 cracked-ice, 4 full-art
uniform float uIntensity;   // 0..1 overall holo strength

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vViewDir;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1,0)), c = hash(i + vec2(0,1)), d = hash(i + vec2(1,1));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
vec3 spectrum(float h) {
  h = fract(h);
  vec3 c = abs(h * 6.0 - vec3(3,2,4)) * vec3(1,-1,-1) + vec3(-1,2,2);
  return clamp(c, 0.0, 1.0);
}

float patternMask(vec2 uv) {
  int p = int(uPattern + 0.5);
  if (p == 1) {
    float n = noise(uv * 9.0) * noise(uv * 23.0 + 7.0);
    float stars = step(0.72, hash(floor(uv * 60.0)));
    return clamp(n * 1.6 + stars * 0.5, 0.0, 1.0);
  } else if (p == 2) {
    float bands = 0.5 + 0.5 * sin(uv.x * 34.0);
    return pow(bands, 2.0);
  } else if (p == 3) {
    vec2 g = uv * 7.0;
    float n = noise(g) - noise(g + 0.35);
    return smoothstep(0.0, 0.18, abs(n));
  } else if (p == 4) {
    return 1.0;
  }
  return 0.0;
}

void main() {
  // Base face — art or procedural placeholder
  vec3 base;
  if (uHasArt > 0.5) {
    base = texture2D(uArt, vUv).rgb;
  } else {
    float grad = mix(0.10, 0.32, vUv.y);
    base = uBaseColor * (0.35 + grad);
    vec2 d = abs(vUv - 0.5);
    float frame = step(0.40, max(d.x, d.y)) - step(0.46, max(d.x, d.y));
    base = mix(base, uBaseColor * 0.9, frame * 0.6);
    float emb = smoothstep(0.16, 0.0, length((vUv - vec2(0.5, 0.58)) * vec2(1.0, 0.8)));
    base += uBaseColor * emb * 0.25;
  }

  // Fresnel + sweep
  float ndv     = clamp(dot(normalize(vWorldNormal), normalize(vViewDir)), 0.0, 1.0);
  float fresnel = pow(1.0 - ndv, 2.5);

  float sweep = (vUv.x + vUv.y) * 1.5
              + uTilt.x * 1.2 - uTilt.y * 0.8
              + (1.0 - ndv) * 2.0
              + uTime * 0.05;

  vec3 iris = spectrum(sweep);
  iris = mix(iris, spectrum(sweep * 2.0 + 0.33), 0.35);

  float mask    = patternMask(vUv);
  float grain   = noise(vUv * 220.0) * 0.5 + 0.5;
  float sparkle = pow(grain, 8.0) * 1.2;    // tighter, subtler sparkle

  // Holo overlay — kept light so art stays readable.
  // Max additive contribution: ~0.22 at full intensity + full fresnel.
  float holoAmt = uIntensity * mask * (0.10 + 0.25 * fresnel);

  vec3 col = base;
  col += iris * holoAmt;
  col += iris * sparkle * uIntensity * mask * 0.25;
  col += vec3(1.0) * fresnel * uIntensity * 0.04;

  gl_FragColor = vec4(col, 1.0);
}
