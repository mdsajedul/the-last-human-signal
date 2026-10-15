import * as THREE from 'three';
import type { Memory } from '../memories/story';

export interface MemoryNode {
  memory: Memory;
  group: THREE.Group;
  hit: THREE.Mesh;
  position: THREE.Vector3;
  color: THREE.Color;
  update(t: number, discovered: boolean, near: number): void;
}

const metal = (c = 0x2a2e35, r = 0.55) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.8, roughness: r });

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function beaconMaterial(color: THREE.Color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color.clone() }, uTime: { value: 0 }, uFound: { value: 0 }, uNear: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main(){ vUv=uv; vW=(modelMatrix*vec4(position,1.0)).xyz; vN=normalize(mat3(modelMatrix)*normal);
        gl_Position=projectionMatrix*viewMatrix*vec4(vW,1.0);} `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uTime; uniform float uFound; uniform float uNear;
      varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main(){
        vec3 V=normalize(cameraPosition-vW);
        float soft=pow(abs(dot(normalize(vN),V)),3.0);
        float fade=pow(1.0-vUv.y,1.6);
        float travel=0.6+0.4*sin(vUv.y*40.0-uTime*3.0);
        // Undiscovered: a pale, searching flicker. Found: a steady warm column.
        vec3 cold=vec3(0.75,0.85,1.0)*(0.55+0.45*sin(uTime*7.0+sin(uTime*3.1)*2.0));
        vec3 c=mix(cold*travel,uColor*1.3,uFound);
        float a=soft*fade*(0.35+uNear*0.6)*mix(1.0,0.7,uFound);
        float close=smoothstep(3.0,12.0,length(cameraPosition-vW));
        gl_FragColor=vec4(c*a*close,1.0);
      }`,
  });
}

function motes(color: THREE.Color, count = 50) {
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) p.set([(Math.random() - 0.5) * 5, Math.random(), (Math.random() - 0.5) * 5], i * 3);
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const m = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color.clone() }, uTime: { value: 0 }, uFound: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uFound; varying float vA;
      void main(){
        vec3 p=position;
        float life=fract(p.y+uTime*(0.05+uFound*0.05));
        p.y=life*(6.0+uFound*8.0);
        p.xz*=1.0-life*0.5;
        p.x+=sin(uTime+position.z*3.0)*0.3;
        vec4 mv=modelViewMatrix*vec4(p,1.0);
        gl_Position=projectionMatrix*mv;
        vA=sin(life*3.14159)*(0.4+uFound*0.6);
        gl_PointSize=clamp(60.0/-mv.z,1.0,8.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uFound; varying float vA;
      void main(){ float d=length(gl_PointCoord-0.5);
        vec3 c=mix(vec3(0.8,0.88,1.0),uColor,uFound);
        gl_FragColor=vec4(c*smoothstep(0.5,0.0,d)*vA,1.0);} `,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  return pts;
}

function rubble(group: THREE.Group, n: number, spread: number) {
  const mat = metal(0x1c1f24, 0.9);
  for (let i = 0; i < n; i++) {
    const s = 0.2 + Math.random() * 0.7;
    const m = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.6, s * (0.6 + Math.random())), mat);
    const a = Math.random() * Math.PI * 2;
    const r = 1.2 + Math.random() * spread;
    m.position.set(Math.cos(a) * r, s * 0.25, Math.sin(a) * r);
    m.rotation.set(Math.random(), Math.random() * 3, Math.random());
    group.add(m);
  }
}

// ---------------------------------------------------------------- objects

function gardener(g: THREE.Group, color: THREE.Color) {
  const body = metal(0x3a3f47, 0.45);
  const joint = metal(0x15171b, 0.7);
  const bot = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.55, 6, 12), body);
  torso.position.set(0, 1.25, 0);
  torso.rotation.x = 0.35;
  bot.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 14), body);
  head.scale.set(1, 0.9, 1.1);
  head.position.set(0, 1.85, 0.28);
  head.rotation.x = 0.6;
  bot.add(head);
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.05, 0.05),
    new THREE.MeshBasicMaterial({ color: 0x223040 }),
  );
  visor.position.set(0, 1.83, 0.5);
  visor.rotation.x = 0.6;
  bot.add(visor);
  // kneeling legs
  for (const s of [-1, 1]) {
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.45, 4, 8), joint);
    thigh.position.set(s * 0.2, 0.62, 0.15);
    thigh.rotation.x = -1.1;
    bot.add(thigh);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.5, 4, 8), body);
    shin.position.set(s * 0.2, 0.15, -0.2);
    shin.rotation.x = Math.PI / 2;
    bot.add(shin);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.55, 4, 8), body);
    arm.position.set(s * 0.25, 1.25, 0.45);
    arm.rotation.x = 1.15;
    arm.rotation.z = -s * 0.35;
    bot.add(arm);
  }
  // the pot, cracked and mended
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.12, 0.25, 16), new THREE.MeshStandardMaterial({ color: 0x6a3a28, roughness: 0.9 }));
  pot.position.set(0, 1.08, 0.78);
  bot.add(pot);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4), new THREE.MeshStandardMaterial({ color: 0x2f5a2a }));
  stem.position.set(0, 1.4, 0.78);
  bot.add(stem);
  const flower = new THREE.Group();
  const petal = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.6 });
  for (let i = 0; i < 7; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), petal);
    const a = (i / 7) * Math.PI * 2;
    p.scale.set(1, 0.5, 1.6);
    p.position.set(Math.cos(a) * 0.06, 0, Math.sin(a) * 0.06);
    p.rotation.y = -a;
    p.rotation.z = 0.5;
    flower.add(p);
  }
  flower.position.set(0, 1.62, 0.78);
  bot.add(flower);
  bot.rotation.y = Math.PI * 0.85;
  g.add(bot);
  rubble(g, 10, 3);
  return (t: number, found: boolean) => {
    flower.rotation.y = t * 0.2;
    petal.emissiveIntensity = found ? 1.2 + Math.sin(t * 2) * 0.2 : 0.35 + Math.sin(t * 1.3) * 0.1;
  };
}

function helmet(g: THREE.Group, color: THREE.Color) {
  const shell = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, metalness: 0.3, roughness: 0.55 });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x1a1408,
    metalness: 1,
    roughness: 0.15,
    emissive: color,
    emissiveIntensity: 0.08,
  });
  const h = new THREE.Group();
  h.add(new THREE.Mesh(new THREE.SphereGeometry(0.62, 32, 24), shell));
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.635, 32, 16, -1.1, 2.2, 0.75, 1.1), visorMat);
  h.add(visor);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.08, 10, 32), metal(0x5a5e66, 0.4));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.52;
  h.add(ring);
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.12), new THREE.MeshBasicMaterial({ color: 0x8a5a2a }));
  patch.position.set(0.45, 0.25, -0.35);
  patch.lookAt(1.5, 0.8, -1.2);
  h.add(patch);
  h.position.set(0, 0.55, 0);
  h.rotation.set(-0.35, Math.PI * 1.15, 0.25);
  g.add(h);
  rubble(g, 14, 2.5);
  return (t: number, found: boolean) => {
    visorMat.emissiveIntensity = found ? 0.6 : 0.08 + Math.max(0, Math.sin(t * 0.7)) * 0.08;
  };
}

function familyTexture() {
  return canvasTexture(512, 340, (c) => {
    c.fillStyle = '#000';
    c.fillRect(0, 0, 512, 340);
    const grad = c.createLinearGradient(0, 0, 0, 340);
    grad.addColorStop(0, 'rgba(120,220,255,0.15)');
    grad.addColorStop(1, 'rgba(255,190,120,0.25)');
    c.fillStyle = grad;
    c.fillRect(0, 0, 512, 340);
    const person = (x: number, y: number, s: number) => {
      c.beginPath();
      c.arc(x, y - 70 * s, 22 * s, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.moveTo(x - 42 * s, 340);
      c.quadraticCurveTo(x - 46 * s, y - 40 * s, x, y - 44 * s);
      c.quadraticCurveTo(x + 46 * s, y - 40 * s, x + 42 * s, 340);
      c.fill();
    };
    c.fillStyle = 'rgba(190,240,255,0.85)';
    person(170, 190, 1.25);
    person(320, 200, 1.15);
    c.fillStyle = 'rgba(255,220,170,0.9)';
    person(250, 250, 0.8);
    // the dog, a blur
    c.filter = 'blur(6px)';
    c.beginPath();
    c.ellipse(405, 300, 46, 24, -0.2, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(445, 270, 18, 0, Math.PI * 2);
    c.fill();
    c.filter = 'none';
    for (let y = 0; y < 340; y += 3) {
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fillRect(0, y, 512, 1);
    }
  });
}

function photograph(g: THREE.Group, color: THREE.Color) {
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.35, 20), metal(0x23272d));
  base.position.y = 0.17;
  g.add(base);
  const lens = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshBasicMaterial({ color }));
  lens.position.y = 0.4;
  g.add(lens);
  const uniforms = { uTex: { value: familyTexture() }, uTime: { value: 0 }, uFound: { value: 0 } };
  const holo = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 1.72),
    new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex; uniform float uTime; uniform float uFound; varying vec2 vUv;
        float h(float x){return fract(sin(x*91.7)*43758.5);}
        void main(){
          float glitch=(1.0-uFound)*0.8+0.08;
          float row=floor(vUv.y*40.0);
          float jump=step(0.85,h(row+floor(uTime*8.0)))*glitch;
          vec2 uv=vUv+vec2((h(row+floor(uTime*12.0))-0.5)*0.12*jump,0.0);
          vec3 c=vec3(texture2D(uTex,uv+vec2(0.006*glitch,0.0)).r,texture2D(uTex,uv).g,texture2D(uTex,uv-vec2(0.006*glitch,0.0)).b);
          float scan=0.75+0.25*sin(vUv.y*300.0+uTime*6.0);
          float flick=0.75+0.25*step(0.15,h(floor(uTime*14.0)));
          float edge=smoothstep(0.0,0.04,vUv.x)*smoothstep(1.0,0.96,vUv.x)*smoothstep(0.0,0.05,vUv.y)*smoothstep(1.0,0.95,vUv.y);
          gl_FragColor=vec4(c*scan*flick*edge*(0.6+uFound*0.6),1.0);
        }`,
    }),
  );
  holo.position.y = 1.65;
  g.add(holo);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(1.4, 1.0, 4, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  cone.position.y = 0.9;
  cone.rotation.set(Math.PI, Math.PI / 4, 0);
  g.add(cone);
  g.rotation.y = 0.9;
  rubble(g, 8, 3);
  return (t: number, found: boolean) => {
    uniforms.uTime.value = t;
    uniforms.uFound.value += ((found ? 1 : 0) - uniforms.uFound.value) * 0.03;
  };
}

export function wallTexture(found: boolean) {
  return canvasTexture(1024, 512, (c) => {
    c.fillStyle = '#4a4744';
    c.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 9000; i++) {
      const v = 50 + Math.random() * 40;
      c.fillStyle = `rgba(${v},${v - 3},${v - 6},0.5)`;
      c.fillRect(Math.random() * 1024, Math.random() * 512, 2, 2);
    }
    // a million names, scratched over each other
    c.font = '14px serif';
    const names = ['Ines', 'Nour', 'A. Okafor', 'Teo', 'Mira', 'Hal', 'Yusuf', 'Lena', 'Kofi', 'Ana', 'Sami', 'Ren', 'Jo', 'Priya', 'Eli'];
    for (let i = 0; i < 900; i++) {
      c.fillStyle = `rgba(20,18,16,${0.15 + Math.random() * 0.3})`;
      c.save();
      c.translate(Math.random() * 1024, Math.random() * 512);
      c.rotate((Math.random() - 0.5) * 0.4);
      c.fillText(names[(Math.random() * names.length) | 0], 0, 0);
      c.restore();
    }
    c.font = 'bold 110px Georgia, serif';
    c.textAlign = 'center';
    c.fillStyle = found ? 'rgba(255,190,120,0.95)' : 'rgba(18,16,14,0.85)';
    c.fillText('WE WERE HERE', 512, 220);
    c.font = '30px Georgia, serif';
    c.fillStyle = found ? 'rgba(255,200,150,0.8)' : 'rgba(25,22,20,0.7)';
    c.fillText('we were kind sometimes. please remember that part.', 512, 440);
  });
}

function wall(g: THREE.Group, color: THREE.Color) {
  const tex = wallTexture(false);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, emissive: color, emissiveIntensity: 0, emissiveMap: tex });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(9, 4.5, 0.8), [
    metal(0x2b2a29, 0.9),
    metal(0x2b2a29, 0.9),
    metal(0x2b2a29, 0.9),
    metal(0x2b2a29, 0.9),
    mat,
    metal(0x2b2a29, 0.9),
  ]);
  slab.position.y = 2.25;
  g.add(slab);
  const broken = new THREE.Mesh(new THREE.BoxGeometry(3, 2.5, 0.8), metal(0x2b2a29, 0.9));
  broken.position.set(3.2, 5.3, 0);
  broken.rotation.z = -0.4;
  g.add(broken);
  for (const s of [-1, 1]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 9, 12), metal(0x25262a, 0.8));
    col.position.set(s * 5.2, 4.5, 0.2);
    g.add(col);
  }
  g.rotation.y = Math.PI * 1.2;
  rubble(g, 16, 5);
  let swapped = false;
  return (_t: number, found: boolean) => {
    if (found && !swapped) {
      swapped = true;
      const t2 = wallTexture(true);
      mat.map = t2;
      mat.emissiveMap = t2;
      mat.needsUpdate = true;
    }
    mat.emissiveIntensity += ((found ? 0.55 : 0) - mat.emissiveIntensity) * 0.02;
  };
}

function core(g: THREE.Group, color: THREE.Color) {
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 0.8, 8), metal(0x1f2228, 0.5));
  ped.position.y = 0.4;
  g.add(ped);
  const innerMat = new THREE.MeshBasicMaterial({ color });
  const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 3), innerMat);
  inner.position.y = 2.3;
  g.add(inner);
  const shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.95, 1),
    new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.35 }),
  );
  shell.position.y = 2.3;
  g.add(shell);
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.3 + i * 0.3, 0.025, 6, 80), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 }));
    r.position.y = 2.3;
    rings.push(r);
    g.add(r);
  }
  // cables snaking into the ground
  const cable = metal(0x101215, 0.6);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(a) * 1.2, 0.6, Math.sin(a) * 1.2),
      new THREE.Vector3(Math.cos(a) * 2.5, 0.1, Math.sin(a) * 2.5),
      new THREE.Vector3(Math.cos(a + 0.3) * 4.5, 0.05, Math.sin(a + 0.3) * 4.5),
    ]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.06, 6), cable));
  }
  return (t: number, found: boolean) => {
    const beat = Math.pow(0.5 + 0.5 * Math.sin(t * 2.2), 4);
    inner.scale.setScalar(0.85 + beat * (found ? 0.15 : 0.3));
    shell.rotation.set(t * 0.2, t * 0.3, 0);
    rings.forEach((r, i) => {
      r.rotation.set(t * (0.3 + i * 0.2) + i, t * (0.2 - i * 0.1), i * 0.7);
    });
    innerMat.color.copy(color).multiplyScalar(found ? 1.4 : 0.6 + beat * 0.6);
  };
}

const BUILDERS = { gardener, helmet, photograph, wall, core } as const;

export function buildMemoryNodes(memories: Memory[], scene: THREE.Scene): MemoryNode[] {
  return memories.map((memory) => {
    const color = new THREE.Color(memory.hue);
    const group = new THREE.Group();
    const position = new THREE.Vector3(memory.position[0], 0, memory.position[1]);
    group.position.copy(position);
    const animate = BUILDERS[memory.id as keyof typeof BUILDERS](group, color);

    const light = new THREE.PointLight(color, 0, 22, 1.6);
    light.position.set(0, 3.5, 0);
    group.add(light);

    const beamMat = beaconMaterial(color);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 140, 24, 1, true).translate(0, 70, 0), beamMat);
    group.add(beam);
    const ringMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: color.clone() }, uTime: { value: 0 }, uFound: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uTime; uniform float uFound; varying vec2 vUv;
        void main(){
          float d=length(vUv-0.5)*2.0;
          float r=fract(uTime*0.25);
          float ring=exp(-pow((d-r)*18.0,2.0))*(1.0-r);
          float pool=exp(-d*d*6.0)*0.25;
          vec3 c=mix(vec3(0.7,0.8,1.0),uColor,uFound);
          gl_FragColor=vec4(c*(ring*0.5+pool*(0.4+uFound)),1.0);
        }`,
    });
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(12, 12).rotateX(-Math.PI / 2), ringMat);
    ring.position.y = 0.03;
    group.add(ring);
    const mote = motes(color);
    group.add(mote);

    const hit = new THREE.Mesh(new THREE.SphereGeometry(3.2, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 1.8;
    hit.userData.id = memory.id;
    group.add(hit);
    scene.add(group);

    let found = 0;
    return {
      memory,
      group,
      hit,
      position,
      color,
      update(t, discovered, near) {
        found += ((discovered ? 1 : 0) - found) * 0.02;
        animate(t, discovered);
        beamMat.uniforms.uTime.value = t;
        beamMat.uniforms.uFound.value = found;
        beamMat.uniforms.uNear.value = near;
        ringMat.uniforms.uTime.value = t;
        ringMat.uniforms.uFound.value = found;
        (mote.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
        (mote.material as THREE.ShaderMaterial).uniforms.uFound.value = found;
        light.intensity = 3 + found * 22 + near * 6 + Math.sin(t * 1.7) * 0.6;
      },
    };
  });
}
