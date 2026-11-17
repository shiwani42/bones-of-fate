import {
  AdditiveBlending,
  AssetManager,
  Bone,
  BoxGeometry,
  CanvasTexture,
  Color,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  ShaderMaterial,
  SkinnedMesh,
  Sprite,
  SpriteMaterial,
  Vector3,
} from '@iwsdk/core';
import pinchData from './pinch-pose.json';
import pointData from './point-pose.json';

/**
 * A translucent "ghost" hand that demonstrates the two cheats where they happen
 * (Meta, "Hands Onboarding 101": show an unfamiliar gesture beside the object,
 * loop it, keep it until the player has done it once).
 *
 *  - swap: a pinching hand holding three spirit dice glides back toward you and
 *    dips below the table edge, waits, and comes back up;
 *  - flip: a pointing finger pokes the near edge of a resting die.
 *
 * Mesh: the WebXR generic hand (MIT, immersive-web/webxr-input-profiles), the
 * model Quest draws for your own hands. Shapes: IWER's pinch and point hand
 * poses (MIT, Meta), left-hand data mirrored for the right. Shading: a Fresnel
 * "spirit" (bright rim, clear centre) after a depth-only pre-pass, so only the
 * front surface shows. Board-local choreography, world joint matrices out.
 */

export type Side = 'left' | 'right';
export type GhostDemoKind = 'swap' | 'flip';

const JOINTS = 25;
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 9;
const JOINT_NAMES = [
  'wrist',
  'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
  'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
  'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
  'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip',
];
// IWER stores left-hand data; the right hand is its mirror image (S·M·S, S = diag(-1,1,1)).
const MIRROR = [1, -1, -1, 0, -1, 1, 1, 0, -1, 1, 1, 0, -1, 1, 1, 1];

const vertexShader = /* glsl */ `
  #include <common>
  #include <skinning_pars_vertex>
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    #include <skinbase_vertex>
    #include <beginnormal_vertex>
    #include <skinnormal_vertex>
    #include <defaultnormal_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>
    vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
    vN = normalize(transformedNormal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const fragmentShader = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float facing = clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0);
    float rim = pow(1.0 - facing, 2.0);
    float shimmer = 0.93 + 0.07 * sin(uTime * 2.6);
    gl_FragColor = vec4(uColor * (0.7 + 0.9 * rim) * shimmer, uOpacity * (0.22 + 0.78 * rim));
  }
`;

/** One captured hand shape, ready to be turned and placed by its "tip". */
class Pose {
  private readonly base: Matrix4[] = [];
  private readonly tip = new Vector3();
  private readonly basisInv = new Matrix4();
  private readonly q = new Matrix4();
  private readonly h = new Matrix4();
  private readonly m = new Matrix4();
  private readonly v = new Vector3();
  private readonly f = new Vector3();
  private readonly d = new Vector3();
  private readonly s = new Vector3();
  readonly tipBasis = new Matrix4();

  /** `tip` = the point placed on the target: the pinch point, or the index fingertip. */
  constructor(data: { matrices: number[][] }, side: Side, tip: 'pinch' | 'index') {
    for (const arr of data.matrices) {
      this.base.push(new Matrix4().fromArray(side === 'right' ? arr.map((x, i) => x * MIRROR[i]) : arr.slice()));
    }
    const p = (i: number) => new Vector3().setFromMatrixPosition(this.base[i]);
    if (tip === 'pinch') this.tip.copy(p(THUMB_TIP)).add(p(INDEX_TIP)).multiplyScalar(0.5);
    else this.tip.copy(p(INDEX_TIP));
    // pose frame: f = wrist → tip, d = back of the hand
    const f = this.tip.clone().sub(p(WRIST)).normalize();
    const d = new Vector3().setFromMatrixColumn(this.base[WRIST], 1);
    d.addScaledVector(f, -d.dot(f)).normalize();
    const s = new Vector3().crossVectors(f, d);
    this.basisInv.makeBasis(f, d, s).transpose();
  }

  /**
   * Orient so wrist→tip points along `fwd` with the back of the hand toward `back`,
   * put the tip at `at`, and write 25 joint matrices (world = toWorld · local).
   */
  compose(toWorld: Matrix4, at: Vector3, fwd: Vector3, back: Vector3, out: Float32Array): void {
    this.f.copy(fwd).normalize();
    this.d.copy(back).addScaledVector(this.f, -back.dot(this.f)).normalize();
    this.s.crossVectors(this.f, this.d);
    this.q.makeBasis(this.f, this.d, this.s).multiply(this.basisInv);
    this.tipBasis.makeBasis(this.f, this.d, this.s);
    this.v.copy(this.tip).applyMatrix4(this.q);
    this.h.copy(this.q).setPosition(at.x - this.v.x, at.y - this.v.y, at.z - this.v.z);
    this.h.premultiply(toWorld);
    for (let i = 0; i < JOINTS; i++) this.m.multiplyMatrices(this.h, this.base[i]).toArray(out, i * 16);
  }
}

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

export class GhostDemo {
  readonly root = new Group();
  private models: Record<Side, { obj: Object3D; bones: (Bone | undefined)[] }> | null = null;
  private readonly mat: ShaderMaterial;
  private readonly glowMat: SpriteMaterial;
  private readonly glow: Sprite;
  private readonly dice: Mesh[] = [];
  private readonly poses: Record<'pinch' | 'point', Record<Side, Pose>>;
  private readonly joints = new Float32Array(JOINTS * 16);
  private readonly armInv = new Matrix4();
  private readonly tmp = new Matrix4();
  private alpha = 0;
  private kind: GhostDemoKind | null = null;
  private side: Side = 'right';
  private t = 0;
  // choreography inputs (board-local)
  readonly from = new Vector3();
  readonly to = new Vector3();
  readonly target = new Vector3();
  // scratch
  private readonly p = new Vector3();
  private readonly fwd = new Vector3();
  private readonly back = new Vector3();
  private readonly a = new Vector3();

  constructor() {
    this.root.name = 'ghost-demo';
    this.root.visible = false;
    this.mat = new ShaderMaterial({
      uniforms: {
        uColor: { value: new Color(0.72, 0.9, 1.0) }, // cool spirit light: reads as "a hint" against the warm hall
        uOpacity: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
    });
    this.poses = {
      pinch: { left: new Pose(pinchData, 'left', 'pinch'), right: new Pose(pinchData, 'right', 'pinch') },
      point: { left: new Pose(pointData, 'left', 'index'), right: new Pose(pointData, 'right', 'index') },
    };
    // three spirit pasa in the pinch (the real ones stay in your hand)
    const g = new BoxGeometry(0.015, 0.015, 0.066);
    for (let i = 0; i < 3; i++) {
      const m = new Mesh(g, this.mat);
      m.renderOrder = 21;
      m.raycast = () => {};
      this.dice.push(m);
      this.root.add(m);
    }
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d')!;
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.3, 'rgba(255,255,255,0.5)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 64, 64);
    this.glowMat = new SpriteMaterial({
      map: new CanvasTexture(c),
      color: new Color(0.75, 0.92, 1),
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    });
    this.glow = new Sprite(this.glowMat);
    this.glow.scale.setScalar(0.03);
    this.glow.renderOrder = 22;
    this.root.add(this.glow);
  }

  /** Load both hand meshes. Without them the demo simply never shows. */
  async load(base: string): Promise<boolean> {
    try {
      const build = async (side: Side) => {
        const gltf = await AssetManager.loadGLTF(`${base}models/hands/generic-hand-${side}.glb`, `ghost-hand-${side}`);
        // the scene itself, not clone(true): a cloned SkinnedMesh stays bound to the original bones
        const obj = gltf.scene;
        const bones = JOINT_NAMES.map((n) => obj.getObjectByName(n) as Bone | undefined);
        const depthOnly = new MeshBasicMaterial({ colorWrite: false, depthWrite: true, transparent: true });
        const skinned: SkinnedMesh[] = [];
        obj.traverse((o) => {
          if ((o as SkinnedMesh).isSkinnedMesh) skinned.push(o as SkinnedMesh);
        });
        for (const sk of skinned) {
          sk.frustumCulled = false;
          sk.material = depthOnly;
          sk.renderOrder = 20;
          const front = sk.clone();
          front.material = this.mat;
          front.renderOrder = 21;
          sk.parent?.add(front);
        }
        obj.visible = false;
        this.root.add(obj);
        return { obj, bones };
      };
      this.models = { left: await build('left'), right: await build('right') };
      return true;
    } catch {
      return false;
    }
  }

  get showing(): GhostDemoKind | null {
    return this.alpha > 0.02 ? this.kind : null;
  }

  /** Ask for a demo (or null to fade it out). Restarts the loop on a new kind. */
  play(kind: GhostDemoKind | null, side: Side = this.side): void {
    if (kind && (kind !== this.kind || side !== this.side) && this.alpha < 0.05) this.t = 0;
    if (kind) {
      this.kind = kind;
      this.side = side;
    }
    this.want = kind ? 1 : 0;
  }
  private want = 0;

  update(dt: number, time: number, boardToWorld: Matrix4): void {
    this.alpha += (this.want - this.alpha) * (1 - Math.exp(-dt * (this.want ? 5 : 8)));
    const on = this.alpha > 0.01 && !!this.models && !!this.kind;
    this.root.visible = on;
    if (!on || !this.models || !this.kind) return;
    this.t += dt;
    this.mat.uniforms.uTime.value = time;
    const sign = this.side === 'right' ? 1 : -1;
    let opacity = 0.85;
    let glow = 0;

    if (this.kind === 'swap') {
      // 2.4 s: hold · back toward you and down below the edge · wait · up · rest
      const T = 2.4;
      const u = this.t % T;
      const down = smooth((u - 0.3) / 0.7);
      const up = smooth((u - 1.6) / 0.55);
      const k = down * (1 - up);
      // arc: first draw back toward the body, then drop (reads as "off the edge, under it")
      this.p.lerpVectors(this.from, this.to, k);
      this.p.z = this.from.z + (this.to.z - this.from.z) * smooth(k * 1.6);
      this.p.y = this.from.y + (this.to.y - this.from.y) * smooth(k * 1.25 - 0.25);
      // fingers forward and a little inward, back of the hand up; tipping down as it dips
      this.fwd.set(-0.25 * sign, -0.35 - 0.45 * k, -0.9 + 0.3 * k);
      this.back.set(0.35 * sign, 1, 0.15);
      this.poses.pinch[this.side].compose(boardToWorld, this.p, this.fwd, this.back, this.joints);
      // spirit dice held in the pinch, across the hand
      const tb = this.poses.pinch[this.side].tipBasis;
      this.a.setFromMatrixColumn(tb, 2); // across the palm
      for (let i = 0; i < 3; i++) {
        const d = this.dice[i];
        d.visible = true;
        d.position.copy(this.p).addScaledVector(this.a, (i - 1) * 0.0165);
        d.position.y -= 0.012;
        d.quaternion.setFromRotationMatrix(tb); // box z (its length) lies across the palm…
        d.rotateY(Math.PI / 2 + (i - 1) * 0.08); // …turned to point along the fingers, slightly fanned
      }
      opacity *= 1 - 0.35 * k; // fades a little "into hiding"
      glow = 0;
    } else {
      // 1.7 s: hover · down onto the near edge · poke · lift · rest
      for (const d of this.dice) d.visible = false;
      const T = 1.7;
      const u = this.t % T;
      const reach = smooth(u / 0.55) * (1 - smooth((u - 0.85) / 0.45));
      const poke = Math.sin(Math.PI * Math.min(1, Math.max(0, (u - 0.55) / 0.3)));
      // hover point above-and-in-front of the die (toward the player)
      this.a.set(0, 0.07, 0.06).add(this.target);
      // contact: the top of the die's near edge
      this.p.set(this.target.x, this.target.y + 0.0085, this.target.z + 0.006);
      this.p.lerpVectors(this.a, this.p, reach);
      this.p.z -= 0.006 * poke; // push across: the bar tips away from you
      this.p.y -= 0.002 * poke;
      this.fwd.set(-0.3 * sign, -0.8, -0.55);
      this.back.set(0.35 * sign, 1, 0.25);
      this.poses.point[this.side].compose(boardToWorld, this.p, this.fwd, this.back, this.joints);
      glow = reach > 0.95 ? 0.4 + 0.6 * poke : 0;
    }

    this.mat.uniforms.uOpacity.value = opacity * this.alpha;
    this.glow.position.copy(this.p);
    this.glowMat.opacity = glow * this.alpha;
    this.glow.visible = glow > 0.01;
    for (const s of ['left', 'right'] as Side[]) this.models[s].obj.visible = s === this.side;
    this.setJoints(this.models[this.side]);
  }

  /** Dev: world position of the demo wrist. */
  wristWorld(): number[] {
    return [this.joints[12], this.joints[13], this.joints[14]].map((v) => +v.toFixed(3));
  }

  private setJoints(model: { bones: (Bone | undefined)[] }): void {
    const armature = model.bones[0]?.parent;
    if (!armature) return;
    armature.updateWorldMatrix(true, false);
    this.armInv.copy(armature.matrixWorld).invert();
    for (let i = 0; i < JOINTS; i++) {
      const bone = model.bones[i];
      if (!bone) continue;
      this.tmp.fromArray(this.joints, i * 16).premultiply(this.armInv);
      this.tmp.decompose(bone.position, bone.quaternion, bone.scale);
    }
  }
}
