// Holo fragment shader — front face only.
//
// Layers (top of PLAN.md holo notes):
//   1. Procedural card face (or sampled art if uHasArt).
//   2. Thin-film iridescence ramp driven by view angle (N·V).
//   3. Rainbow diffraction sweep driven by uTilt (gyro / drag angle).
//   4. Preset holo masks: cosmos | vertical-beam | cracked-ice | full-art.
//   5. Paper-grain sparkle so the foil has texture under the sweep.
//
// All cheap: hash noise, no loops, no derivatives required.
precision highp float;

uniform sampler2D uArt;
uniform float uHasArt;      // 1.0 = sample uArt, 0.0 = procedural face
uniform vec3  uBaseColor;   // procedural face tint (rarity color)
uniform vec2  uTilt;        // -1..1 each axis, from drag / gyro
uniform float uTime;
uniform float uPattern;     // 0 none, 1 cosmos, 2 vertical-beam, 3 cracked-ice, 4 full-art
uniform float uIntensity;   // 0..1 overall holo strength

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vViewDir;

// --- cheap hash noise ---
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// hue -> rgb (smooth rainbow)
vec3 spectrum(float h) {
  h = fract(h);
  vec3 c = abs(h * 6.0 - vec3(3.0, 2.0, 4.0)) * vec3(1.0, -1.0, -1.0)
           + vec3(-1.0, 2.0, 2.0);
  return clamp(c, 0.0, 1.0);
}

// --- preset holo masks (0..1 coverage of the foil region) ---
float patternMask(vec2 uv) {
  int p = int(uPattern + 0.5);
  if (p == 1) {
    // cosmos — galaxy sparkle: clustered high-frequency noise
    float n = noise(uv * 9.0) * noise(uv * 23.0 + 7.0);
    float stars = step(0.72, hash(floor(uv * 60.0)));
    return clamp(n * 1.6 + stars * 0.5, 0.0, 1.0);
  } else if (p == 2) {
    // vertical-beam — bright vertical foil columns
    float bands = 0.5 + 0.5 * sin(uv.x * 34.0);
    return pow(bands, 2.0);
  } else if (p == 3) {
    // cracked-ice — angular shards via cell noise
    vec2 g = uv * 7.0;
    float n = noise(g) - noise(g + 0.35);
    return smoothstep(0.0, 0.18, abs(n));
  } else if (p == 4) {
    // full-art — whole card foils
    return 1.0;
  }
  return 0.0;
}

void main() {
  // --- base face ---
  vec3 base;
  if (uHasArt > 0.5) {
    base = texture2D(uArt, vUv).rgb;
  } else {
    // Procedural placeholder face: soft vertical gradient + frame + emblem.
    float grad = mix(0.10, 0.32, vUv.y);
    base = uBaseColor * (0.35 + grad);
    vec2 d = abs(vUv - 0.5);
    float frame = step(0.40, max(d.x, d.y)) - step(0.46, max(d.x, d.y));
    base = mix(base, uBaseColor * 0.9, frame * 0.6);
    float emb = smoothstep(0.16, 0.0, length((vUv - vec2(0.5, 0.58)) * vec2(1.0, 0.8)));
    base += uBaseColor * emb * 0.25;
  }

  // --- view + tilt drive the iridescence phase ---
  float ndv = clamp(dot(normalize(vWorldNormal), normalize(vViewDir)), 0.0, 1.0);
  float fresnel = pow(1.0 - ndv, 2.0);

  // Diagonal sweep coordinate, pushed by tilt and view angle.
  float sweep = (vUv.x + vUv.y) * 1.5
              + uTilt.x * 1.2 - uTilt.y * 0.8
              + (1.0 - ndv) * 2.0
              + uTime * 0.05;

  float hue = sweep;
  vec3 iris = spectrum(hue);
  iris = mix(iris, spectrum(hue * 2.0 + 0.33), 0.35);

  // --- mask + grain ---
  float mask = patternMask(vUv);
  float grain = noise(vUv * 220.0) * 0.5 + 0.5;
  float sparkle = pow(grain, 6.0) * 1.5;

  // Holo shows most at grazing angles and where the mask is bright.
  float holoAmt = uIntensity * mask * (0.35 + 0.65 * fresnel);

  vec3 col = base;
  col += iris * holoAmt;
  col += iris * sparkle * uIntensity * mask * 0.6;
  col += vec3(1.0) * fresnel * uIntensity * 0.08;

  gl_FragColor = vec4(col, 1.0);
}
