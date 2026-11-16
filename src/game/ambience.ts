import {
  AddEquation,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  Group,
  InstancedMesh,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PointLight,
  Points,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
} from '@iwsdk/core';

/**
 * The ambient life layer (our HandCraft "snow"): two brass diyas with
 * flickering flame billboards, one warm flickering PointLight (no shadow),
 * and embers + incense-like smoke wisps from one GPU-animated Points buffer.
 *
 * Draw calls: diyas 1 (instanced) + flames 1 + embers/smoke 1 = 3.
 * All coordinates are board-local; add `group` to the board root.
 *
 * Default spots avoid every busy area: the player's dice court is near-right
 * (+x,+z), Shakuni's court far-left (−x,−z), the gong near-left. Diya 1 sits in
 * the free far-right quadrant; diya 2 sits beyond the far-left edge of the
 * cross (outside the dice clamp |x|,|z| < HALF−0.01 and clear of Shakuni's
 * ghost-hand path at x≈−0.1…−0.16, z≈−0.33…−0.44).
 */

export type Mood = 'calm' | 'tense' | 'triumph';

export const DIYA_SPOTS: readonly Vector3[] = [
  new Vector3(0.175, 0, -0.175),
  new Vector3(-0.215, 0, -0.31),
];

interface MoodParams {
  height: number; // flame height, m
  width: number; // flame half-width, m
  light: number; // point light intensity (cd)
  flicker: number; // 0..1 erratic-ness
  tint: Color;
  ember: number;
  smoke: number;
}

const MOODS: Record<Mood, MoodParams> = {
  calm: { height: 0.032, width: 0.0085, light: 0.05, flicker: 0.25, tint: new Color(1, 1, 1), ember: 0.7, smoke: 0.8 },
  tense: { height: 0.023, width: 0.0072, light: 0.03, flicker: 0.85, tint: new Color(1, 0.62, 0.5), ember: 0.35, smoke: 1.3 },
  triumph: { height: 0.045, width: 0.0105, light: 0.085, flicker: 0.15, tint: new Color(1.1, 1.02, 0.86), ember: 1.4, smoke: 0.5 },
};

// ───────────────────────── diya mesh ─────────────────────────

function diyaGeometry(): LatheGeometry {
  // radius, height (m). The last points are the oil surface inside the bowl.
  const prof: [number, number][] = [
    [0, 0], [0.015, 0], [0.0165, 0.0018], [0.012, 0.004], [0.0065, 0.008],
    [0.0055, 0.012], [0.0075, 0.0155], [0.016, 0.018], [0.0235, 0.022],
    [0.0268, 0.0262], [0.0272, 0.0285], [0.0255, 0.0292], [0.0232, 0.0262],
    [0.022, 0.0248], [0.012, 0.0248], [0, 0.0248],
  ];
  const OIL_FROM = 13;
  const pts = prof.map(([r, y]) => new Vector2(r, y));
  const geo = new LatheGeometry(pts, 28);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const brass = new Color('#e4b45a');
  const oil = new Color('#3a1a04');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // pinch a spout toward +x on the bowl
    const th = Math.atan2(z, x);
    const f = Math.pow(Math.max(0, Math.cos(th)), 8);
    const h = Math.min(1, Math.max(0, (y - 0.016) / 0.012));
    const k = 1 + 0.42 * f * h * h;
    pos.setXYZ(i, x * k, y + 0.002 * f * h, z * (1 - 0.25 * f * h));
    const c = i % pts.length >= OIL_FROM ? oil : brass;
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

/** Spout tip in diya-local space, where the flame sits. */
const SPOUT = new Vector3(0.0365, 0.0305, 0);

// ───────────────────────── shaders ─────────────────────────

const NOISE = /* glsl */ `
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}`;

const FLAME_VERT = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uHeight;
uniform float uWidth;
uniform float uFlicker;
attribute vec2 aCorner;  // x -1..1, y 0..1
attribute float aKind;   // 0 flame, 1 halo
attribute float aSeed;
varying vec2 vUv;
varying float vKind;
varying float vSeed;
varying float vFlick;
${NOISE}
void main() {
  vec4 wc = modelMatrix * vec4(position, 1.0);
  vec3 up = normalize((modelMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  vec3 toCam = cameraPosition - wc.xyz;
  vec3 right = cross(up, toCam);
  right = length(right) > 1e-5 ? normalize(right) : vec3(1.0, 0.0, 0.0);
  float t = uTime;
  float n = vnoise(vec2(t * (3.0 + 6.0 * uFlicker), aSeed * 17.0));
  float flick = 0.86 + 0.28 * n + 0.06 * sin(t * 17.0 + aSeed * 9.0);
  vFlick = flick;
  float isHalo = step(0.5, aKind);
  float h = uHeight * flick * mix(1.0, 2.6, isHalo);
  float w = uWidth * mix(1.0, 4.2, isHalo);
  float drop = mix(0.06, 0.4, isHalo) * h;
  vec3 p = wc.xyz + right * aCorner.x * w + up * (aCorner.y * h - drop);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  vUv = vec2(aCorner.x * 0.5 + 0.5, aCorner.y);
  vKind = aKind;
  vSeed = aSeed;
}`;

const FLAME_FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform vec3 uTint;
uniform float uIntensity;
varying vec2 vUv;
varying float vKind;
varying float vSeed;
varying float vFlick;
${NOISE}
void main() {
  if (vKind > 0.5) {
    vec2 d = (vUv - vec2(0.5, 0.36)) * vec2(1.0, 1.25);
    float g = exp(-dot(d, d) * 16.0) * 0.32 * uIntensity * vFlick;
    if (g < 0.003) discard;
    vec3 c = uTint * vec3(1.0, 0.5, 0.16) * g;
    gl_FragColor = vec4(c, g * 0.15);
    #include <colorspace_fragment>
    return;
  }
  float y = vUv.y;
  float x = (vUv.x - 0.5) * 2.0;
  float n = vnoise(vec2(vUv.x * 3.0 + vSeed * 5.0, y * 3.5 - uTime * 7.0));
  x += (n - 0.5) * 0.55 * y + 0.22 * sin(uTime * 4.3 + vSeed * 9.0) * y * y;
  float prof = sin(clamp(y, 0.0, 1.0) * 3.0 + 0.16) * (1.0 - 0.5 * y);
  float d = abs(x) / max(prof, 0.001);
  float body = smoothstep(1.0, 0.6, d) * smoothstep(1.0, 0.78, y) * smoothstep(0.0, 0.06, y);
  float core = smoothstep(0.6, 0.0, d) * smoothstep(0.62, 0.12, y);
  vec3 col = mix(vec3(1.0, 0.34, 0.05), vec3(1.0, 0.78, 0.32), smoothstep(0.95, 0.35, d));
  col = mix(col, vec3(1.0, 0.97, 0.86), core);
  col = mix(col, vec3(0.35, 0.45, 1.0), smoothstep(0.16, 0.0, y) * 0.55 * smoothstep(1.0, 0.3, d));
  float a = body * uIntensity;
  if (a < 0.003) discard;
  gl_FragColor = vec4(col * uTint * a * 1.7, a * 0.55);
  #include <colorspace_fragment>
}`;

const MOTE_VERT = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uEmber;
uniform float uSmoke;
uniform float uScale;
attribute float aSeed;
attribute float aType; // 0 ember, 1 smoke
varying float vAlpha;
varying float vType;
${NOISE}
void main() {
  float smoke = step(0.5, aType);
  float life = mix(1.5 + aSeed * 1.3, 4.5 + aSeed * 1.5, smoke);
  float cyc = uTime / life + aSeed * 7.13;
  float age = fract(cyc);
  float gate = step(0.45, hash21(vec2(floor(cyc), aSeed * 31.0))); // embers come and go
  vec3 p = position;
  float size;
  float a;
  if (smoke < 0.5) {
    p.y += age * (0.07 + aSeed * 0.07);
    p.x += sin(age * 6.0 + aSeed * 40.0) * 0.012 * age;
    p.z += cos(age * 5.0 + aSeed * 30.0) * 0.012 * age;
    size = 0.0026 * (1.0 - age * 0.6);
    a = (1.0 - age) * uEmber * gate * (0.6 + 0.4 * sin(uTime * 25.0 + aSeed * 50.0));
  } else {
    p.y += 0.012 + age * 0.24;
    float sway = vnoise(vec2(age * 3.0, aSeed * 9.0)) - 0.5;
    p.x += sway * 0.05 * age + sin(age * 4.0 + aSeed * 20.0) * 0.012 * age;
    p.z += cos(age * 3.0 + aSeed * 13.0) * 0.015 * age;
    size = 0.006 + age * 0.03;
    a = smoothstep(0.0, 0.2, age) * (1.0 - age) * (1.0 - age) * 0.11 * uSmoke;
  }
  vAlpha = a;
  vType = smoke;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = size * uScale / max(-mv.z, 0.05);
  gl_Position = projectionMatrix * mv;
}`;

const MOTE_FRAG = /* glsl */ `
precision highp float;
varying float vAlpha;
varying float vType;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r = length(q);
  float soft = smoothstep(1.0, 0.0, r);
  float a = vAlpha * mix(soft * soft * soft, soft * soft, vType);
  if (a < 0.003) discard;
  vec3 ember = vec3(1.0, 0.55, 0.15) * (1.0 + 1.5 * smoothstep(0.4, 0.0, r));
  vec3 smoke = vec3(0.62, 0.58, 0.55);
  vec3 c = mix(ember, smoke, vType);
  gl_FragColor = vec4(c * a, a * mix(0.4, 1.0, vType));
  #include <colorspace_fragment>
}`;

function premultiplied(m: ShaderMaterial): ShaderMaterial {
  m.transparent = true;
  m.depthWrite = false;
  m.toneMapped = false;
  m.blending = CustomBlending;
  m.blendEquation = AddEquation;
  m.blendSrc = OneFactor;
  m.blendDst = OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = OneFactor;
  m.blendDstAlpha = OneMinusSrcAlphaFactor;
  return m;
}

export interface Ambience {
  group: Group;
  /** The one warm flickering light (no shadow). Created once so shaders never recompile. */
  light: PointLight;
  /** Diya world anchors (board-local flame tips), e.g. for extra fx. */
  flames: Vector3[];
  update(dt: number, time: number): void;
  /** Smoothly blend flame size, colour, light and particles (≈1.2 s). */
  setMood(m: Mood): void;
  /** Momentary flare (e.g. a capture, the gong, Shakuni's entrance). */
  flare(strength?: number): void;
}

export function createAmbience(spots: readonly Vector3[] = DIYA_SPOTS): Ambience {
  const group = new Group();
  group.name = 'ambience';

  // diyas: one instanced draw, spout turned toward the board centre
  const diyaMat = new MeshStandardMaterial({ vertexColors: true, metalness: 0.92, roughness: 0.3 });
  const diyas = new InstancedMesh(diyaGeometry(), diyaMat, spots.length);
  diyas.castShadow = true;
  diyas.receiveShadow = false;
  const o = new Object3D();
  const flames: Vector3[] = [];
  spots.forEach((s, i) => {
    o.position.copy(s);
    o.rotation.set(0, Math.atan2(s.z, -s.x), 0); // +x (spout) faces the centre
    o.updateMatrix();
    diyas.setMatrixAt(i, o.matrix);
    flames.push(SPOUT.clone().applyMatrix4(o.matrix));
  });
  group.add(diyas);

  // flames: 2 quads per diya (flame + halo), billboarded around board-up in the shader
  const nQ = spots.length * 2;
  const fpos = new Float32Array(nQ * 4 * 3);
  const corner = new Float32Array(nQ * 4 * 2);
  const kind = new Float32Array(nQ * 4);
  const seed = new Float32Array(nQ * 4);
  const idx: number[] = [];
  const C = [[-1, 0], [1, 0], [1, 1], [-1, 1]];
  for (let q = 0; q < nQ; q++) {
    const f = flames[q >> 1];
    const sd = Math.random();
    for (let v = 0; v < 4; v++) {
      const j = q * 4 + v;
      fpos.set([f.x, f.y, f.z], j * 3);
      corner.set(C[v], j * 2);
      kind[j] = q & 1 ? 0 : 1; // even quads are halos, drawn first
      seed[j] = (q >> 1) * 0.37 + sd * 0.1;
    }
    const b = q * 4;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const fg = new BufferGeometry();
  fg.setAttribute('position', new BufferAttribute(fpos, 3));
  fg.setAttribute('aCorner', new BufferAttribute(corner, 2));
  fg.setAttribute('aKind', new BufferAttribute(kind, 1));
  fg.setAttribute('aSeed', new BufferAttribute(seed, 1));
  fg.setIndex(idx);
  const flameU = {
    uTime: { value: 0 },
    uHeight: { value: MOODS.calm.height },
    uWidth: { value: MOODS.calm.width },
    uFlicker: { value: MOODS.calm.flicker },
    uTint: { value: MOODS.calm.tint.clone() },
    uIntensity: { value: 1 },
  };
  const flameMesh = new Mesh(
    fg,
    premultiplied(new ShaderMaterial({ uniforms: flameU, vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG })),
  );
  flameMesh.frustumCulled = false;
  flameMesh.renderOrder = 15;
  flameMesh.name = 'diya-flames';
  group.add(flameMesh);

  // embers + smoke: one Points, fully GPU-animated
  const PER_EMBER = 14;
  const PER_SMOKE = 16;
  const N = spots.length * (PER_EMBER + PER_SMOKE);
  const mpos = new Float32Array(N * 3);
  const mseed = new Float32Array(N);
  const mtype = new Float32Array(N);
  let k = 0;
  for (const f of flames) {
    for (let i = 0; i < PER_EMBER + PER_SMOKE; i++, k++) {
      mpos.set([f.x, f.y + 0.012, f.z], k * 3);
      mseed[k] = Math.random();
      mtype[k] = i < PER_EMBER ? 0 : 1;
    }
  }
  const mg = new BufferGeometry();
  mg.setAttribute('position', new BufferAttribute(mpos, 3));
  mg.setAttribute('aSeed', new BufferAttribute(mseed, 1));
  mg.setAttribute('aType', new BufferAttribute(mtype, 1));
  const moteU = {
    uTime: { value: 0 },
    uEmber: { value: MOODS.calm.ember },
    uSmoke: { value: MOODS.calm.smoke },
    uScale: { value: 720 },
  };
  const motes = new Points(
    mg,
    premultiplied(new ShaderMaterial({ uniforms: moteU, vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG })),
  );
  motes.frustumCulled = false;
  motes.renderOrder = 14;
  motes.name = 'diya-motes';
  group.add(motes);

  // one warm light between the lamps, a little above them
  const light = new PointLight('#ff9640', MOODS.calm.light, 1.2, 2);
  light.castShadow = false;
  light.position.set(0, 0, 0);
  for (const f of flames) light.position.add(f);
  light.position.divideScalar(flames.length);
  light.position.y += 0.06;
  group.add(light);

  const cur: MoodParams = { ...MOODS.calm, tint: MOODS.calm.tint.clone() };
  let target: MoodParams = MOODS.calm;
  let flareV = 0;

  return {
    group,
    light,
    flames,
    setMood(m: Mood) {
      target = MOODS[m];
    },
    flare(strength = 1) {
      flareV = Math.max(flareV, strength);
    },
    update(dt: number, time: number) {
      const a = 1 - Math.exp(-dt / 0.4);
      cur.height += (target.height - cur.height) * a;
      cur.width += (target.width - cur.width) * a;
      cur.light += (target.light - cur.light) * a;
      cur.flicker += (target.flicker - cur.flicker) * a;
      cur.ember += (target.ember - cur.ember) * a;
      cur.smoke += (target.smoke - cur.smoke) * a;
      cur.tint.lerp(target.tint, a);
      flareV = Math.max(0, flareV - dt * 1.2);
      const fl = 1 + flareV * 0.8;
      flameU.uTime.value = time;
      flameU.uHeight.value = cur.height * fl;
      flameU.uWidth.value = cur.width * (1 + flareV * 0.3);
      flameU.uFlicker.value = cur.flicker;
      flameU.uTint.value.copy(cur.tint);
      flameU.uIntensity.value = 1 + flareV * 0.5;
      moteU.uTime.value = time;
      moteU.uEmber.value = cur.ember * (1 + flareV * 2);
      moteU.uSmoke.value = cur.smoke;
      // flicker 0.8–1.2 (more erratic when tense): two incommensurate sines + a jitter
      const f =
        1 +
        0.11 * Math.sin(time * 7.3) * Math.sin(time * 3.1 + 1.7) +
        0.06 * Math.sin(time * 13.7 + 0.5) +
        cur.flicker * 0.12 * Math.sin(time * 23.0) * Math.sin(time * 1.3);
      light.intensity = cur.light * Math.max(0.6, f) * fl;
      light.color.setRGB(1, 0.59 * cur.tint.g, 0.25 * cur.tint.b);
    },
  };
}

// ───────────────────────── room dimmer ─────────────────────────

export interface RoomDimmer {
  mesh: Mesh;
  /** 0 = untouched passthrough, 1 = room dimmed to ≈40 %. Immediate. */
  setAmount(v: number): void;
  /** Ease toward `v` over about `seconds` (needs update(dt)). */
  fadeTo(v: number, seconds?: number): void;
  update(dt: number): void;
  readonly amount: number;
}

/**
 * Turns the real room into a torch-lit sabha: a big inside-out sphere of warm
 * black drawn first among transparents with depth test on and no depth write.
 * Opaque virtual content (board, pieces, diyas, Shakuni) is already in the depth
 * buffer, so only passthrough pixels behind it get darkened. Add the mesh under
 * the anchor (radius 3 m keeps the viewer inside).
 */
export function createRoomDimmer(radius = 3): RoomDimmer {
  const mat = new MeshBasicMaterial({
    color: '#120703',
    side: BackSide,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    fog: false,
  });
  const mesh = new Mesh(new SphereGeometry(radius, 24, 16), mat);
  mesh.name = 'room-dimmer';
  mesh.renderOrder = -50;
  mesh.frustumCulled = false;
  mesh.visible = false;
  let amount = 0;
  let target = 0;
  let rate = 1;
  const apply = () => {
    mat.opacity = amount * 0.6;
    mesh.visible = amount > 0.002;
  };
  return {
    mesh,
    get amount() {
      return amount;
    },
    setAmount(v: number) {
      amount = target = Math.max(0, Math.min(1, v));
      apply();
    },
    fadeTo(v: number, seconds = 1.5) {
      target = Math.max(0, Math.min(1, v));
      rate = 1 / Math.max(0.05, seconds);
    },
    update(dt: number) {
      if (amount === target) return;
      const step = rate * dt;
      amount = Math.abs(target - amount) <= step ? target : amount + Math.sign(target - amount) * step;
      apply();
    },
  };
}
