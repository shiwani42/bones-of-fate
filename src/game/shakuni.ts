import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from '@iwsdk/core';
import { AssetManager } from '@iwsdk/core';
import { ShakuniHuman } from './human.js';
import { Gaddi } from './seat.js';

/** Model-space height of the pelvis bone (tools/shakuni build output). */
const MODEL_PELVIS_Y = 0.958;
/** Rotation that turns the generated turban's front toward +z (set after viewing it). */
const TURBAN_FRONT_YAW = 0;
/** Sitting cross-legged: pelvis bone sits this far above the mattress top. */
const PELVIS_ABOVE_SEAT = 0.1;
/** Seat top is this far below the table top (≈ chair-to-table offset). */
const SEAT_BELOW_TABLE = 0.33;
/** Pelvis z relative to the Shakuni group, so he sits centred on the gaddi. */
const MODEL_PELVIS_Z = -0.068;

/**
 * Shakuni: a spectral bust that sits across the table. Built from primitives
 * so there is nothing to license, with a Fresnel rim so he reads as a spirit
 * (and so it looks intentional when he overlaps a real wall).
 *
 * Gaze is the core of the stealth loop:
 *   watch → (look away) away → (warning flicker) returning → watch …
 * The player can only cheat safely while he is "away".
 */

export type Gaze = 'watch' | 'away' | 'returning' | 'focus';

function rimMaterial(color: string, power = 2.2, strength = 1.2): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(color) },
      uPower: { value: power },
      uStrength: { value: strength },
      uOpacity: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      #include <common>
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform vec3 uColor; uniform float uPower; uniform float uStrength; uniform float uOpacity;
      varying vec3 vN; varying vec3 vV;
      void main(){
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPower);
        gl_FragColor = vec4(uColor * f * uStrength * uOpacity, 1.0);
      }`,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
}

export class Shakuni {
  readonly group = new Group();
  readonly head = new Group();
  readonly hand = new Group();
  readonly handTarget = new Vector3();
  readonly handVel = new Vector3();
  /** The realistic rigged human, once loaded (otherwise the procedural bust is shown). */
  human: ShakuniHuman | null = null;
  /** Left-hand idle fidget: stroking the beard. */
  private strokeT = 6;
  private stroking = 0;
  private laughS = 0;
  private angerS = 0;
  private readonly drive = {
    lookAt: new Vector3(), rightHand: new Vector3(), leftHand: null as Vector3 | null,
    watching: true, away: false, laugh: 0, anger: 0, suspicion: 0.2, grip: 0,
  };
  private readonly beardPt = new Vector3();
  private readonly tmpN = new Vector3();
  private readonly tmpP = new Vector3();
  grip = 0;
  /** His gaddi (seat); the group origin of the seat is the real floor. */
  readonly seat = new Gaddi();
  private tableHeight = 0.72;

  /** Real table height above the floor (m): sets his seat and how he sits. */
  setTableHeight(h: number): void {
    if (Math.abs(h - this.tableHeight) < 0.005) return;
    this.tableHeight = h;
    this.applyTableHeight();
  }

  private applyTableHeight(): void {
    const h = Math.max(0.2, this.tableHeight);
    const seatH = Math.min(0.5, Math.max(0.06, h - SEAT_BELOW_TABLE));
    // group origin = table top; floor is at -h
    this.seat.group.position.set(0, -h, MODEL_PELVIS_Z + 0.02);
    this.seat.setHeight(seatH);
    if (this.human) this.human.root.position.set(0, -h + seatH + PELVIS_ABOVE_SEAT - MODEL_PELVIS_Y, 0);
  }
  private eyes: Mesh[] = [];
  private eyeMat: MeshBasicMaterial;
  private rims: ShaderMaterial[] = [];
  private bodyMats: MeshStandardMaterial[] = [];
  private suspicionFill: Mesh;
  private suspicionBack: Mesh;
  private fingers: Mesh[] = [];

  gaze: Gaze = 'focus';
  gazeT = 0;
  private gazeDur = 2;
  /** Where he looks while watching (board-local). */
  readonly lookTarget = new Vector3(0, 0.1, 0.3);
  private headYaw = 0;
  private headPitch = 0;
  private bob = 0;
  laughT = 0;
  angerT = 0;
  fade = 0;
  /** 0..100 */
  suspicion = 20;
  /** Called when he starts turning back (the warning). */
  onWarn: () => void = () => {};
  /** Called when he turns away. */
  onTurnAway: () => void = () => {};
  /** The player is holding the dice: drives the gaze cycle. */
  cycling = false;
  private forceWatchT = 0;

  constructor() {
    this.group.name = 'shakuni';
    const robe = new MeshStandardMaterial({ color: '#2a1440', roughness: 0.7, transparent: true });
    const skin = new MeshStandardMaterial({ color: '#7a4e33', roughness: 0.6, transparent: true });
    const hair = new MeshStandardMaterial({ color: '#2b2522', roughness: 0.9, transparent: true });
    const gold = new MeshStandardMaterial({ color: '#d9a441', metalness: 0.9, roughness: 0.3, transparent: true });
    const turban = new MeshStandardMaterial({ color: '#4b1e6b', roughness: 0.65, transparent: true });
    this.bodyMats.push(robe, skin, hair, gold, turban);

    // Torso: a lathe robe rising from below the table edge.
    const prof = [
      [0.0, -0.15], [0.17, -0.15], [0.165, 0.05], [0.15, 0.17], [0.12, 0.25],
      [0.06, 0.29], [0.04, 0.32], [0.0, 0.32],
    ].map(([r, y]) => new Vector2(r, y));
    const torso = new Mesh(new LatheGeometry(prof, 28), robe);
    torso.scale.set(1.3, 1, 0.7);
    this.group.add(torso);
    const shawl = new Mesh(new TorusGeometry(0.15, 0.012, 8, 32, Math.PI), gold);
    shawl.position.set(0, 0.2, 0.0);
    shawl.rotation.set(0.35, 0, Math.PI);
    shawl.scale.set(1.25, 1, 0.9);
    this.group.add(shawl);
    const necklace = new Mesh(new TorusGeometry(0.055, 0.005, 6, 24), gold);
    necklace.position.set(0, 0.275, 0.02);
    necklace.rotation.x = Math.PI / 2 - 0.4;
    this.group.add(necklace);

    // Head
    this.head.position.set(0, 0.4, 0);
    this.group.add(this.head);
    const face = new Mesh(new SphereGeometry(0.072, 28, 20), skin);
    face.scale.set(0.9, 1.12, 0.95);
    this.head.add(face);
    const tur = new Mesh(new SphereGeometry(0.084, 28, 16), turban);
    tur.scale.set(1.06, 0.66, 1.08);
    tur.position.set(0, 0.088, -0.008);
    this.head.add(tur);
    const band = new Mesh(new TorusGeometry(0.078, 0.007, 8, 32), gold);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.05;
    band.scale.set(1.0, 1.08, 1);
    this.head.add(band);
    const jewel = new Mesh(
      new SphereGeometry(0.011, 12, 10),
      new MeshStandardMaterial({ color: '#c0102a', emissive: new Color('#7a0010'), emissiveIntensity: 0.6, metalness: 0.4, roughness: 0.2 }),
    );
    jewel.position.set(0, 0.065, 0.08);
    this.head.add(jewel);
    const plume = new Mesh(new ConeGeometry(0.008, 0.09, 8), gold);
    plume.position.set(0.01, 0.15, 0.03);
    plume.rotation.z = -0.35;
    this.head.add(plume);
    const beard = new Mesh(new ConeGeometry(0.048, 0.11, 16), hair);
    beard.rotation.x = Math.PI;
    beard.position.set(0, -0.085, 0.03);
    beard.scale.z = 0.7;
    this.head.add(beard);
    for (const s of [-1, 1]) {
      const m = new Mesh(new ConeGeometry(0.008, 0.05, 8), hair);
      m.position.set(s * 0.022, -0.034, 0.064);
      m.rotation.set(0, 0, s * 1.9);
      this.head.add(m);
      const brow = new Mesh(new BoxGeometry(0.03, 0.006, 0.01), hair);
      brow.position.set(s * 0.025, 0.026, 0.066);
      brow.rotation.z = s * 0.35; // sly, angled brows
      this.head.add(brow);
    }
    const nose = new Mesh(new ConeGeometry(0.01, 0.032, 8), skin);
    nose.position.set(0, -0.004, 0.074);
    nose.rotation.x = Math.PI / 2 + 0.25;
    this.head.add(nose);

    this.eyeMat = new MeshBasicMaterial({ color: '#ff3b2f', toneMapped: false, transparent: true });
    for (const s of [-1, 1]) {
      const eye = new Mesh(new SphereGeometry(0.008, 12, 8), this.eyeMat);
      eye.position.set(s * 0.025, 0.01, 0.064);
      eye.scale.set(1.3, 0.75, 0.6);
      this.head.add(eye);
      this.eyes.push(eye);
    }

    // Spectral rim shells.
    for (const [obj, color] of [
      [torso, '#9d6bff'],
      [face, '#ffb26b'],
      [tur, '#c58bff'],
    ] as [Mesh, string][]) {
      const rm = rimMaterial(color);
      this.rims.push(rm);
      const shell = new Mesh(obj.geometry, rm);
      shell.scale.setScalar(1.04);
      obj.add(shell);
    }
    // soft violet aura behind him
    const auraMat = rimMaterial('#6a2cff', 2.5, 0.35);
    auraMat.side = BackSide;
    this.rims.push(auraMat);
    const aura = new Mesh(new SphereGeometry(0.32, 24, 16), auraMat);
    aura.position.y = 0.2;
    aura.scale.set(0.8, 0.9, 0.4);
    this.group.add(aura);

    // Suspicion meter under his chin, facing the player.
    this.suspicionBack = new Mesh(
      new PlaneGeometry(0.16, 0.012),
      new MeshBasicMaterial({ color: '#1a0a08', transparent: true, opacity: 0.7, depthWrite: false }),
    );
    this.suspicionBack.position.set(0, 0.255, 0.2);
    this.group.add(this.suspicionBack);
    this.suspicionFill = new Mesh(
      new PlaneGeometry(0.156, 0.008),
      new MeshBasicMaterial({ color: '#ff5a2a', toneMapped: false, depthWrite: false, transparent: true }),
    );
    this.suspicionFill.position.set(0, 0.255, 0.201);
    this.group.add(this.suspicionFill);

    // Ghost hand
    const handMat = rimMaterial('#b48cff', 1.6, 1.6);
    this.rims.push(handMat);
    const handCore = new MeshStandardMaterial({
      color: '#3a2060', transparent: true, opacity: 0.55, emissive: new Color('#5a2ca0'), emissiveIntensity: 0.6,
    });
    const palm = new Mesh(new BoxGeometry(0.07, 0.022, 0.075), handCore);
    this.hand.add(palm);
    palm.add(new Mesh(palm.geometry, handMat));
    for (let i = 0; i < 4; i++) {
      const f = new Mesh(new CapsuleGeometry(0.008, 0.045, 4, 8), handCore);
      f.rotation.x = Math.PI / 2;
      f.position.set(-0.026 + i * 0.0175, 0, 0.06);
      this.hand.add(f);
      this.fingers.push(f);
    }
    const thumb = new Mesh(new CapsuleGeometry(0.009, 0.03, 4, 8), handCore);
    thumb.rotation.set(Math.PI / 2, 0, 0.9);
    thumb.position.set(0.045, 0, 0.02);
    this.hand.add(thumb);
    this.hand.name = 'shakuni-hand';
    this.setFade(0);
  }

  setFade(v: number): void {
    this.fade = v;
    for (const m of this.bodyMats) m.opacity = v;
    for (const r of this.rims) r.uniforms.uOpacity.value = v;
    this.group.visible = v > 0.01;
    this.human?.setFade(v);
    this.hand.visible = v > 0.01;
  }

  /** Watching = he would see a cheat right now. */
  get watching(): boolean {
    return this.gaze === 'watch' || this.gaze === 'focus' || (this.gaze === 'returning' && this.gazeT > 0.45);
  }

  setGaze(g: Gaze, dur = 2): void {
    this.gaze = g;
    this.gazeT = 0;
    this.gazeDur = dur;
  }

  /** Make him stare for a while (suspicious line, false accusation, etc.). */
  stare(seconds: number): void {
    this.forceWatchT = seconds;
    if (this.gaze !== 'watch' && this.gaze !== 'focus') this.setGaze('watch', seconds);
  }

  private nextGaze(): void {
    const s = this.suspicion / 100;
    if (this.forceWatchT > 0) {
      this.setGaze('watch', this.forceWatchT);
      return;
    }
    switch (this.gaze) {
      case 'watch':
      case 'focus':
        this.setGaze('away', 1.7 + Math.random() * 1.5 - s * 0.9);
        this.onTurnAway();
        break;
      case 'away':
        this.setGaze('returning', 0.75);
        this.onWarn();
        break;
      case 'returning':
        this.setGaze('watch', 1.6 + Math.random() * 1.6 + s * 1.5);
        break;
    }
  }

  /** Fingers curl around held dice. */
  setGrip(closed: number): void {
    this.grip = closed;
    this.fingers.forEach((f, i) => {
      f.rotation.x = Math.PI / 2 + closed * (0.9 + i * 0.05);
      f.position.y = -closed * 0.015;
    });
  }

  update(dt: number, time: number): void {
    this.gazeT += dt;
    if (this.forceWatchT > 0) this.forceWatchT = Math.max(0, this.forceWatchT - dt);
    if (this.cycling && this.gazeT > this.gazeDur) this.nextGaze();
    if (!this.cycling && this.gaze !== 'focus') this.setGaze('focus');

    // Head orientation
    let yaw = 0;
    let pitch = 0;
    if (this.gaze === 'away') {
      yaw = 1.15;
      pitch = 0.1 + Math.sin(time * 2.2) * 0.05;
    } else if (this.gaze === 'returning') {
      const t = Math.min(1, this.gazeT / 0.75);
      yaw = 1.15 * (1 - t * t);
    }
    if (this.gaze === 'watch' || this.gaze === 'focus' || this.gaze === 'returning') {
      const dx = this.lookTarget.x - this.group.position.x;
      const dz = this.lookTarget.z - this.group.position.z;
      const dy = this.lookTarget.y - (this.group.position.y + this.head.position.y);
      const w = this.gaze === 'returning' ? Math.min(1, this.gazeT / 0.75) : 1;
      yaw += Math.atan2(dx, dz) * w;
      pitch += -Math.atan2(dy, Math.hypot(dx, dz)) * w;
    }
    const k = 1 - Math.exp(-dt * 7);
    this.headYaw += (yaw - this.headYaw) * k;
    this.headPitch += (pitch - this.headPitch) * k;
    this.head.rotation.set(this.headPitch, this.headYaw, 0, 'YXZ');

    // Laugh bob / anger lean
    if (this.laughT > 0) {
      this.laughT -= dt;
      this.bob = Math.abs(Math.sin(time * 14)) * 0.012;
    } else this.bob *= 0.9;
    if (this.angerT > 0) this.angerT -= dt;
    this.head.position.y = 0.4 + this.bob;
    this.head.position.z = this.angerT > 0 ? 0.04 : 0;

    // Eyes: blazing red when watching, dim ember when away, flicker on warning
    let glow = this.watching ? 1 : 0.18;
    if (this.gaze === 'returning') glow = Math.sin(this.gazeT * 40) > 0 ? 1 : 0.3;
    if (this.angerT > 0) glow = 1.6;
    this.eyeMat.color.setRGB(1.0 * glow + 0.15, 0.22 * glow + 0.05, 0.12 * glow);
    const blink = Math.sin(time * 0.9) > 0.995 ? 0.1 : 1;
    for (const e of this.eyes) e.scale.y = 0.75 * blink;

    // Suspicion meter
    const s = Math.max(0.001, Math.min(1, this.suspicion / 100));
    this.suspicionFill.scale.x = s;
    this.suspicionFill.position.x = -0.078 * (1 - s);
    (this.suspicionFill.material as MeshBasicMaterial).color.setRGB(1, 0.6 - 0.45 * s, 0.15);

    // Ghost hand: critically damped spring toward its target
    const w = 14;
    const p = this.hand.position;
    const ax = (this.handTarget.x - p.x) * w * w - this.handVel.x * 2 * w;
    const ay = (this.handTarget.y - p.y) * w * w - this.handVel.y * 2 * w;
    const az = (this.handTarget.z - p.z) * w * w - this.handVel.z * 2 * w;
    this.handVel.x += ax * dt;
    this.handVel.y += ay * dt;
    this.handVel.z += az * dt;
    p.addScaledVector(this.handVel, dt);
    this.updateHuman(dt);
    if (this.human) this.seat.update(time);
  }

  /** Attach the ghost hand to the same parent as the body (board root). */
  /** Load the realistic model; the procedural bust stays as a fallback if this fails. */
  async loadHuman(url: string): Promise<boolean> {
    try {
      const gltf = await AssetManager.loadGLTF(url, 'shakuni-human');
      const scene = gltf.scene;
      const human = new ShakuniHuman(scene);
      if (!human.ok) return false;
      // hide the procedural bust (keep the group, the hand marker and labels)
      for (const c of this.group.children) c.visible = false;
      for (const c of this.hand.children) c.visible = false;
      this.group.add(scene);
      this.group.add(this.seat.group);
      this.human = human;
      this.applyTableHeight();
      human.setFade(this.fade);
      // a generated turban (tools/freegen → public/models/props/turban.glb), if present
      void import('./props.js').then(async ({ loadNormalised }) => {
        const t = await loadNormalised(url.replace('shakuni.glb', 'props/turban.glb'), 0.2, TURBAN_FRONT_YAW);
        if (t && this.human) this.human.wearTurban(t);
      });
      return true;
    } catch (e) {
      console.warn('[chausar] realistic Shakuni failed to load, using fallback', e);
      return false;
    }
  }

  /** Idle fidget on demand: stroke the beard with the left hand. */
  strokeBeard(): void {
    this.stroking = 3.2;
  }

  talk(text: string): void {
    this.human?.talk(text);
  }

  /** Drive the realistic human from the same state the procedural bust uses. */
  private updateHuman(dt: number): void {
    const h = this.human;
    const parent = this.group.parent;
    if (!h || !parent) return;
    parent.updateWorldMatrix(true, false);
    // clip everything below the table top (y = 0 in board space)
    this.tmpP.set(0, 0.002, 0);
    parent.localToWorld(this.tmpP);
    this.tmpN.set(0, 1, 0).transformDirection(parent.matrixWorld);
    h.setTablePlane(this.tmpP, this.tmpN);
    const d = this.drive;
    d.lookAt.copy(this.lookTarget);
    parent.localToWorld(d.lookAt);
    d.rightHand.copy(this.hand.position);
    parent.localToWorld(d.rightHand);
    d.watching = this.watching && this.cycling;
    d.away = this.gaze === 'away' || (this.gaze === 'returning' && this.gazeT < 0.3);
    this.laughS += ((this.laughT > 0 ? 1 : 0) - this.laughS) * (1 - Math.exp(-dt * 6));
    this.angerS += ((this.angerT > 0 ? 1 : 0) - this.angerS) * (1 - Math.exp(-dt * 6));
    d.laugh = this.laughS;
    d.anger = this.angerS;
    d.suspicion = Math.min(1, this.suspicion / 100);
    d.grip = this.grip;
    // idle fidget: now and then he strokes his beard with the left hand
    this.strokeT -= dt;
    if (this.strokeT <= 0 && !d.away) {
      this.stroking = 3.2;
      this.strokeT = 9 + Math.random() * 8;
    }
    if (this.stroking > 0) {
      this.stroking -= dt;
      // two slow strokes from chin to point, fingertips on the hair
      const phase = ((3.2 - this.stroking) / 1.4) % 1;
      const stroke = phase < 0.75 ? phase / 0.75 : 1 - (phase - 0.75) / 0.25;
      h.beardPoint(this.beardPt, Math.max(0, Math.min(1, stroke)));
      d.leftHand = this.beardPt;
      h.leftIsFingertip = true;
    } else {
      d.leftHand = null;
      h.leftIsFingertip = false;
    }
    h.update(dt, d);
  }

  attachTo(parent: Object3D): void {
    parent.add(this.group);
    parent.add(this.hand);
  }
}
