import * as THREE from 'three';
import { SpaceScene } from './Space';
import { CityScene, CORE_POS } from './City';
import { buildMemoryNodes, MemoryNode } from './MemoryObjects';
import { MEMORIES } from '../memories/story';

type Mode = 'arrival' | 'dive' | 'landing' | 'city' | 'glide' | 'focus' | 'ascend' | 'void' | 'epilogue';

export interface Marker {
  id: string;
  x: number;
  y: number;
  onScreen: boolean;
  angle: number;
  dist: number;
}

export interface EngineEvents {
  onDiveDone?: () => void;
  onNear?: (id: string | null) => void;
  onArrive?: (id: string) => void;
  onAscentDone?: () => void;
}

const START = new THREE.Vector3(0, 3.2, -104);
const EYE = 3.2;
const NEAR_DIST = 9;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Engine {
  renderer: THREE.WebGLRenderer;
  space: SpaceScene;
  city: CityScene;
  nodes: MemoryNode[];
  mode: Mode = 'arrival';
  events: EngineEvents = {};
  reduced: boolean;
  discovered = new Set<string>();
  proximity = 0;
  nearId: string | null = null;
  markers: Marker[] = [];
  /** Pointer speed, fed into the signal visualisation. */
  activity = 0;
  /** Dev aid for slow software renderers. */
  timeScale = 1;

  private clock = new THREE.Clock();
  private time = 0;
  private modeStart = 0;
  private yaw = Math.PI;
  private pitch = 0;
  private pos = START.clone();
  private vel = new THREE.Vector3();
  private keys = new Set<string>();
  private drag: { x: number; y: number; sx: number; sy: number; t: number; moved: boolean } | null = null;
  private glideTarget: THREE.Vector3 | null = null;
  private glideMemory: string | null = null;
  private from = { pos: new THREE.Vector3(), yaw: 0, pitch: 0 };
  private focusTarget = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private canvas: HTMLCanvasElement;
  private disposed = false;
  /** Drag input not yet applied; eased in over a few frames so looking feels smooth. */
  private look = { yaw: 0, pitch: 0 };
  private glideCheck = { t: 0, dist: Infinity };
  // Adaptive resolution: render fewer pixels when the GPU can't keep up.
  private dpr = 1;
  private maxDpr = 1;
  private perf = { frames: 0, total: 0, good: 0 };

  constructor(canvas: HTMLCanvasElement, reduced: boolean) {
    this.canvas = canvas;
    this.reduced = reduced;
    const lowPower = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
    // MSAA is expensive and barely visible on high-density screens.
    const antialias = !lowPower && devicePixelRatio <= 1.25;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias, powerPreference: 'high-performance', stencil: false });
    this.maxDpr = Math.min(devicePixelRatio, lowPower ? 1.25 : 1.5);
    this.dpr = Math.min(this.maxDpr, lowPower ? 1 : 1.25);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    const aspect = innerWidth / innerHeight;
    this.space = new SpaceScene(aspect, lowPower);
    this.city = new CityScene(aspect, lowPower);
    this.nodes = buildMemoryNodes(MEMORIES, this.city.scene);

    addEventListener('resize', this.onResize);
    addEventListener('keydown', this.onKeyDown);
    addEventListener('keyup', this.onKeyUp);
    addEventListener('blur', this.onBlur);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    addEventListener('pointermove', this.onPointerMove);
    addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });

    // Compile shaders up-front so the first transitions don't hitch.
    this.renderer.compile(this.space.scene, this.space.camera);
    this.renderer.compile(this.city.scene, this.city.camera);
    this.renderer.setAnimationLoop(this.frame);
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    removeEventListener('resize', this.onResize);
    removeEventListener('keydown', this.onKeyDown);
    removeEventListener('keyup', this.onKeyUp);
    removeEventListener('blur', this.onBlur);
    removeEventListener('pointermove', this.onPointerMove);
    removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.renderer.dispose();
  }

  // ------------------------------------------------------------ story API

  private setMode(m: Mode) {
    this.mode = m;
    this.modeStart = this.time;
  }

  /** Jump the opening to its resting state. */
  skipArrival() {
    if (this.mode === 'arrival') this.modeStart = this.time - 12;
  }

  dive() {
    if (this.mode !== 'arrival') return;
    this.from.pos.copy(this.space.camera.position);
    this.setMode('dive');
  }

  enterCity() {
    this.pos.copy(START).setY(70);
    this.yaw = Math.PI;
    this.pitch = -0.55;
    this.setMode('landing');
  }

  /** Glide toward a memory, then open it. */
  approach(id: string) {
    const node = this.nodes.find((n) => n.memory.id === id);
    if (!node || !this.isFree()) return;
    // Pick the open spot around the object that is closest to us.
    let best: THREE.Vector3 | null = null;
    let bestD = Infinity;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const p = new THREE.Vector3(node.position.x + Math.cos(a) * 6.5, EYE, node.position.z + Math.sin(a) * 6.5);
      if (this.blocked(p)) continue;
      const d = p.distanceTo(this.pos);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    this.startGlide(best ?? node.position.clone().setY(EYE), id);
  }

  private startGlide(target: THREE.Vector3, memory: string | null) {
    this.glideTarget = target;
    this.glideMemory = memory;
    this.glideCheck = { t: this.time, dist: Infinity };
    this.setMode('glide');
  }

  private blocked(p: THREE.Vector3) {
    return this.city.obstacles.some((o) => Math.abs(p.x - o.x) < o.hw + 1.4 && Math.abs(p.z - o.z) < o.hd + 1.4);
  }

  focus(id: string) {
    const node = this.nodes.find((n) => n.memory.id === id);
    if (!node) return;
    const dir = this.pos.clone().sub(node.position).setY(0).normalize();
    if (dir.lengthSq() < 0.01) dir.set(0, 0, -1);
    const dist = id === 'wall' ? 9 : 4.6;
    this.focusTarget.pos.copy(node.position).addScaledVector(dir, dist).setY(id === 'wall' ? 3 : 2.2);
    this.focusTarget.look.copy(node.position).setY(id === 'wall' ? 2.6 : 1.4);
    this.from.pos.copy(this.pos);
    this.from.yaw = this.yaw;
    this.from.pitch = this.pitch;
    this.vel.set(0, 0, 0);
    this.setMode('focus');
  }

  release() {
    if (this.mode !== 'focus') return;
    this.pos.copy(this.focusTarget.pos).setY(EYE);
    this.setMode('city');
  }

  remember(id: string) {
    const node = this.nodes.find((n) => n.memory.id === id);
    if (!node || this.discovered.has(id)) return;
    this.discovered.add(id);
    this.city.addWave(node.position, node.color);
    this.nearId = null;
  }

  ascend() {
    this.from.pos.copy(this.pos);
    this.from.yaw = this.yaw;
    this.from.pitch = this.pitch;
    this.setMode('ascend');
  }

  startEpilogue() {
    this.space.startEpilogue(this.time);
    this.setMode('epilogue');
  }

  pulse() {
    this.space.pulse();
  }

  isFree() {
    return this.mode === 'city' || this.mode === 'glide';
  }

  // ------------------------------------------------------------ input

  private onResize = () => {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.setSize(w, h, false);
    for (const cam of [this.space.camera, this.city.camera]) {
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', 'q', 'e'].includes(k)) {
      this.keys.add(k);
      if (this.isFree() && k.startsWith('arrow')) e.preventDefault();
      if (this.mode === 'glide' && k !== 'shift' && k !== 'e') this.setMode('city');
    }
  };

  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
  private onBlur = () => this.keys.clear();

  private onPointerDown = (e: PointerEvent) => {
    this.drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false };
  };

  private onPointerMove = (e: PointerEvent) => {
    this.activity = Math.min(1, this.activity + Math.hypot(e.movementX || 0, e.movementY || 0) * 0.004);
    if (!this.drag) return;
    const dx = e.clientX - this.drag.x;
    const dy = e.clientY - this.drag.y;
    this.drag.x = e.clientX;
    this.drag.y = e.clientY;
    if (Math.hypot(e.clientX - this.drag.sx, e.clientY - this.drag.sy) > 6) this.drag.moved = true;
    if (this.drag.moved && this.isFree()) {
      const s = e.pointerType === 'touch' ? 0.006 : 0.0035;
      this.look.yaw -= dx * s;
      this.look.pitch -= dy * s;
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    const d = this.drag;
    this.drag = null;
    if (!d || d.moved || performance.now() - d.t > 450 || !this.isFree()) return;
    if (e.target !== this.canvas) return;
    const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.city.camera);
    const hits = this.raycaster.intersectObjects(this.nodes.map((n) => n.hit), false);
    if (hits.length) {
      const id = hits[0].object.userData.id as string;
      if (!this.discovered.has(id)) this.approach(id);
      return;
    }
    const p = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, p) && p.distanceTo(this.pos) < 160) {
      this.startGlide(p.setY(EYE), null);
    }
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.isFree()) return;
    e.preventDefault();
    if (this.mode === 'glide') this.setMode('city');
    const f = this.forward();
    this.vel.addScaledVector(f, THREE.MathUtils.clamp(-e.deltaY * 0.03, -6, 6));
  };

  private forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  // ------------------------------------------------------------ simulation

  private collide(p: THREE.Vector3) {
    const R = 1.4;
    for (const o of this.city.obstacles) {
      const dx = p.x - o.x;
      const dz = p.z - o.z;
      const ox = o.hw + R - Math.abs(dx);
      const oz = o.hd + R - Math.abs(dz);
      if (ox > 0 && oz > 0) {
        if (ox < oz) p.x += Math.sign(dx) * ox;
        else p.z += Math.sign(dz) * oz;
      }
    }
    p.x = THREE.MathUtils.clamp(p.x, -150, 150);
    p.z = THREE.MathUtils.clamp(p.z, -125, 180);
  }

  private walk(dt: number) {
    const k = this.keys;
    const f = this.forward();
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const speed = k.has('shift') ? 22 : 11;
    const input = new THREE.Vector3();
    if (k.has('w') || k.has('arrowup')) input.add(f);
    if (k.has('s') || k.has('arrowdown')) input.sub(f);
    if (k.has('d')) input.add(r);
    if (k.has('a')) input.sub(r);
    const ease = Math.min(1, dt * 18);
    this.yaw += this.look.yaw * ease;
    this.pitch = THREE.MathUtils.clamp(this.pitch + this.look.pitch * ease, -1.1, 0.9);
    this.look.yaw *= 1 - ease;
    this.look.pitch *= 1 - ease;
    if (k.has('arrowleft') || k.has('q')) this.yaw += dt * 1.6;
    if (k.has('arrowright')) this.yaw -= dt * 1.6;
    if (input.lengthSq()) this.vel.addScaledVector(input.normalize(), speed * dt * 6);

    if (this.mode === 'glide' && this.glideTarget) {
      const to = this.glideTarget.clone().sub(this.pos).setY(0);
      const dist = to.length();
      const want = Math.atan2(-to.x, -to.z);
      let dy = want - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += dy * Math.min(1, dt * 3);
      this.pitch += (-0.05 - this.pitch) * Math.min(1, dt * 2);
      // Blocked by a building and making no progress? Stop instead of pushing forever.
      if (this.time - this.glideCheck.t > 1.2) {
        const stuck = this.glideCheck.dist - dist < 0.6;
        this.glideCheck = { t: this.time, dist };
        if (stuck) {
          this.vel.multiplyScalar(0.3);
          this.setMode('city');
          const node = this.nodes.find((n) => n.memory.id === this.glideMemory);
          if (node && node.position.distanceTo(this.pos) < 16) this.events.onArrive?.(node.memory.id);
          this.glideMemory = null;
        }
      }
      if (this.mode !== 'glide') {
        // stopped above
      } else if (dist < 1.5) {
        this.setMode('city');
        if (this.glideMemory) this.events.onArrive?.(this.glideMemory);
        this.glideMemory = null;
      } else {
        this.vel.addScaledVector(to.normalize(), Math.min(14, dist * 1.8) * dt * 4);
      }
    }
    this.vel.multiplyScalar(Math.exp(-dt * 4));
    this.pos.addScaledVector(this.vel, dt);
    this.collide(this.pos);
    const bob = this.reduced ? 0 : Math.sin(this.time * 0.9) * 0.12;
    this.pos.y = EYE + bob;
  }

  private updateProximity() {
    let best: MemoryNode | null = null;
    let bestD = Infinity;
    for (const n of this.nodes) {
      if (this.discovered.has(n.memory.id)) continue;
      const d = Math.hypot(n.position.x - this.pos.x, n.position.z - this.pos.z);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    this.proximity = best ? THREE.MathUtils.clamp(1 - bestD / 70, 0, 1) : 0;
    const near = best && bestD < NEAR_DIST && this.mode === 'city' ? best.memory.id : null;
    if (near !== this.nearId) {
      this.nearId = near;
      this.events.onNear?.(near);
    }
  }

  private updateMarkers() {
    const cam = this.city.camera;
    const v = new THREE.Vector3();
    this.markers = this.nodes.map((n) => {
      v.copy(n.position).setY(2.5).project(cam);
      const behind = v.z > 1;
      let x = v.x;
      let y = v.y;
      if (behind) {
        x = -x;
        y = -y;
      }
      const onScreen = !behind && Math.abs(x) < 0.92 && Math.abs(y) < 0.88;
      const angle = Math.atan2(y, x);
      if (!onScreen) {
        const m = Math.max(Math.abs(x) / 0.9, Math.abs(y) / 0.84, 0.0001);
        x /= m;
        y /= m;
        if (behind && Math.abs(x) < 0.89 && Math.abs(y) < 0.83) y = -0.84;
      }
      return {
        id: n.memory.id,
        x: (x * 0.5 + 0.5) * innerWidth,
        y: (-y * 0.5 + 0.5) * innerHeight,
        onScreen,
        angle,
        dist: n.position.distanceTo(this.pos),
      };
    });
  }

  /** Lower the render resolution when frames are slow; raise it back when there's headroom. */
  private adapt(raw: number) {
    if (raw > 0.25) return; // tab switch or hitch: ignore
    const p = this.perf;
    p.frames++;
    p.total += raw;
    if (p.frames < 40) return;
    const avg = p.total / p.frames;
    p.frames = 0;
    p.total = 0;
    let next = this.dpr;
    if (avg > 1 / 45) {
      next = Math.max(0.6, this.dpr - (avg > 1 / 30 ? 0.25 : 0.12));
      p.good = 0;
    } else if (avg < 1 / 58) {
      // Only climb back after several smooth windows, to avoid see-sawing.
      if (++p.good >= 4 && this.dpr < this.maxDpr) {
        next = Math.min(this.maxDpr, this.dpr + 0.1);
        p.good = 0;
      }
    } else p.good = 0;
    if (Math.abs(next - this.dpr) > 0.01) {
      this.dpr = next;
      this.renderer.setPixelRatio(next);
      this.renderer.setSize(innerWidth, innerHeight, false);
    }
  }

  private frame = () => {
    if (this.disposed) return;
    const raw = this.clock.getDelta();
    this.adapt(raw);
    const dt = Math.min(raw, 0.1) * this.timeScale;
    this.time += dt;
    const t = this.time - this.modeStart;
    this.activity *= Math.exp(-dt * 2.5);

    switch (this.mode) {
      case 'arrival': {
        const u = this.space.uniforms;
        const sm = (a: number, b: number) => THREE.MathUtils.smoothstep(t, a, b);
        u.uSignal.value = sm(1.2, 2.8);
        u.uReveal.value = THREE.MathUtils.clamp((t - 3) / 8, 0, 1);
        u.uPlanet.value = sm(5, 12);
        this.space.update(this.time, this.time, this.reduced);
        this.renderer.render(this.space.scene, this.space.camera);
        return;
      }
      case 'dive': {
        const dur = this.reduced ? 1.4 : 3.6;
        const k = Math.min(1, t / dur);
        const e = k * k * k;
        const target = this.space.signalPoint();
        const cam = this.space.camera;
        this.space.update(this.time, this.time, true);
        cam.position.lerpVectors(this.from.pos, target, e * 0.985);
        cam.lookAt(target);
        if (!this.reduced) {
          cam.fov = 38 + e * 50;
          cam.updateProjectionMatrix();
        }
        this.renderer.render(this.space.scene, cam);
        if (k >= 1) {
          cam.fov = 38;
          cam.updateProjectionMatrix();
          this.setMode('void');
          this.events.onDiveDone?.();
        }
        return;
      }
      case 'void': {
        this.renderer.setClearColor(0x000000);
        this.renderer.clear();
        return;
      }
      case 'epilogue': {
        this.space.update(this.time, 0, this.reduced);
        this.renderer.render(this.space.scene, this.space.camera);
        return;
      }
    }

    // ---- city modes
    const cam = this.city.camera;
    const dim = this.city.uniforms.uDim;
    dim.value += ((this.mode === 'focus' ? 1 : 0) - dim.value) * Math.min(1, dt * 2);

    if (this.mode === 'landing') {
      const dur = this.reduced ? 2 : 6;
      const k = ease(Math.min(1, t / dur));
      this.pos.set(START.x, 70 + (EYE - 70) * k, START.z - 30 * (1 - k));
      this.pitch = -0.55 * (1 - k) + 0.14 * k;
      if (t >= dur) this.setMode('city');
    } else if (this.mode === 'city' || this.mode === 'glide') {
      this.walk(dt);
    } else if (this.mode === 'focus') {
      const k = ease(Math.min(1, t / (this.reduced ? 0.6 : 1.8)));
      this.pos.lerpVectors(this.from.pos, this.focusTarget.pos, k);
      const look = this.focusTarget.look.clone().sub(this.pos);
      const wantYaw = Math.atan2(-look.x, -look.z);
      const wantPitch = Math.atan2(look.y, Math.hypot(look.x, look.z));
      let dy = wantYaw - this.from.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw = this.from.yaw + dy * k;
      this.pitch = this.from.pitch + (wantPitch - this.from.pitch) * k;
      if (!this.reduced) this.pos.y += Math.sin(this.time * 0.6) * 0.05;
    } else if (this.mode === 'ascend') {
      const dur = this.reduced ? 8 : 14;
      const k = ease(Math.min(1, t / dur));
      const target = new THREE.Vector3(CORE_POS.x, 190, CORE_POS.z - 190);
      this.pos.lerpVectors(this.from.pos, target, k);
      let dy = Math.PI - this.from.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw = this.from.yaw + dy * k;
      this.pitch = this.from.pitch + (-0.62 - this.from.pitch) * k;
      this.city.uniforms.uRestore.value = THREE.MathUtils.clamp((t - 2) / (dur - 4), 0, 1);
      if (t >= dur + 1.5) {
        this.setMode('void');
        this.events.onAscentDone?.();
        return;
      }
    }

    cam.position.copy(this.pos);
    cam.rotation.set(this.pitch, this.yaw, 0);
    this.city.update(this.time, this.pos);
    for (const n of this.nodes) {
      const d = n.position.distanceTo(this.pos);
      n.update(this.time, this.discovered.has(n.memory.id), THREE.MathUtils.clamp(1 - d / 30, 0, 1));
    }
    this.updateProximity();
    this.updateMarkers();
    this.renderer.render(this.city.scene, cam);
  };
}
