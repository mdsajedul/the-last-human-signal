import * as THREE from 'three';
import { FOG, NOISE, VNOISE } from './glsl';
import { MEMORIES } from '../memories/story';

export interface Obstacle {
  x: number;
  z: number;
  hw: number;
  hd: number;
}

export const MOON_DIR = new THREE.Vector3(0.05, 0.6, 1).normalize();
export const CORE_POS = new THREE.Vector3(2, 0, 70);
const MAX_WAVES = 5;

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * "Remembrance waves": every recovered memory sends a warm wavefront
 * through the city that switches its windows back on, as they were.
 */
const WAVES = /* glsl */ `
uniform vec3 uWaveO[${MAX_WAVES}];
uniform float uWaveT[${MAX_WAVES}];
uniform vec3 uWaveC[${MAX_WAVES}];
uniform float uRestore;
uniform vec3 uCore;
uniform float uWaveCount;
// returns (ring flash rgb) in .rgb, and writes local warmth into 'inside'.
vec3 waves(vec3 wp, float t, float h, out vec3 lit){
  vec3 flash=vec3(0.0); lit=vec3(0.0);
  for(int i=0;i<${MAX_WAVES};i++){
    if(float(i)>=uWaveCount) break; // only waves that exist cost anything
    float age=t-uWaveT[i];
    float r=age*24.0;
    float d=distance(wp.xz,uWaveO[i].xz);
    float reach=min(r,85.0);
    float inside=1.0-smoothstep(reach-12.0,reach,d);
    float density=0.06+0.5*smoothstep(95.0,0.0,d);
    lit+=mix(vec3(1.0,0.68,0.38),uWaveC[i],0.3)*inside*step(h,density);
    if(r<160.0) flash+=uWaveC[i]*exp(-pow((d-r)/4.0,2.0))*smoothstep(160.0,30.0,r);
  }
  if(uRestore>0.0){
    float rr=uRestore*300.0;
    float din=distance(wp.xz,uCore.xz);
    float allLit=1.0-smoothstep(rr-40.0,rr,din);
    lit=max(lit,vec3(1.0,0.66,0.36)*allLit*step(h,0.62));
    flash+=vec3(1.0,0.7,0.4)*exp(-pow((din-rr)/8.0,2.0))*(1.0-uRestore);
  }
  return flash;
}
`;

export class CityScene {
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  obstacles: Obstacle[] = [];
  uniforms = {
    uTime: { value: 0 },
    uFogColor: { value: new THREE.Color(0.032, 0.042, 0.058) },
    uFogDensity: { value: 0.0052 },
    uMoonDir: { value: MOON_DIR },
    uDim: { value: 0 },
    uRestore: { value: 0 },
    uCore: { value: CORE_POS },
    uWaveCount: { value: 0 },
    uWaveO: { value: Array.from({ length: MAX_WAVES }, () => new THREE.Vector3()) },
    uWaveT: { value: new Array(MAX_WAVES).fill(-1) as number[] },
    uWaveC: { value: Array.from({ length: MAX_WAVES }, () => new THREE.Color()) },
  };
  private waveCount = 0;
  private searchlights: THREE.Object3D[] = [];
  private towers!: { mesh: THREE.InstancedMesh; mats: THREE.Matrix4[]; seeds: number[] };
  private lastSort = new THREE.Vector3(Infinity, 0, 0);
  private lowPower: boolean;

  constructor(aspect: number, lowPower: boolean) {
    this.lowPower = lowPower;
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.1, 1400);
    this.camera.rotation.order = 'YXZ';
    this.scene.fog = new THREE.FogExp2(0x080b0f, 0.01);
    this.buildSky();
    this.buildGround();
    this.buildCity();
    this.buildMegastructures();
    this.buildBeams();
    this.buildDust(lowPower ? 900 : 2000);

    this.scene.add(new THREE.HemisphereLight(0x5a6c88, 0x0a0806, 0.7));
    const moon = new THREE.DirectionalLight(0x9fb4d8, 1.0);
    moon.position.copy(MOON_DIR).multiplyScalar(100);
    this.scene.add(moon);
  }

  addWave(pos: THREE.Vector3, color: THREE.Color) {
    const i = this.waveCount % MAX_WAVES;
    this.waveCount++;
    this.uniforms.uWaveCount.value = Math.min(this.waveCount, MAX_WAVES);
    this.uniforms.uWaveO.value[i].copy(pos);
    this.uniforms.uWaveT.value[i] = this.uniforms.uTime.value;
    this.uniforms.uWaveC.value[i].copy(color).multiplyScalar(1.15);
  }

  private buildSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1000, 48, 24),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader: /* glsl */ `
          varying vec3 vW;
          void main(){ vW=(modelMatrix*vec4(position,1.0)).xyz; gl_Position=projectionMatrix*viewMatrix*vec4(vW,1.0); gl_Position.z=gl_Position.w; }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform vec3 uMoonDir; uniform vec3 uFogColor; uniform float uDim; uniform float uRestore;
          varying vec3 vW;
          ${NOISE}
          vec3 moonShade(vec2 uv, float r){
            float z=sqrt(max(1.0-r*r,0.0));
            vec3 n=vec3(uv,z);
            float l=clamp(dot(n,normalize(vec3(0.55,0.35,0.75))),0.0,1.0);
            float cr=snoise(vec3(uv*3.0,1.7))*0.35+0.5;
            return vec3(0.5,0.54,0.6)*(0.06+l*0.95)*(0.7+cr*0.45);
          }
          void main(){
            vec3 dir=normalize(vW-cameraPosition);
            float y=dir.y;
            vec3 zen=vec3(0.006,0.009,0.018);
            vec3 hor=uFogColor*1.6+vec3(0.01,0.012,0.018);
            vec3 col=mix(hor,zen,smoothstep(-0.02,0.45,y));
            col+=vec3(0.04,0.03,0.025)*exp(-abs(y)*14.0);
            // faint stars
            vec3 sd=floor(dir*420.0);
            float st=step(0.9975,hash21(sd.xy+sd.z*7.1));
            col+=st*smoothstep(0.05,0.3,y)*vec3(0.6,0.7,0.9)*(0.5+0.5*sin(uTime*2.0+sd.x));
            // the broken moon
            vec3 md=normalize(uMoonDir);
            float ang=acos(clamp(dot(dir,md),-1.0,1.0));
            vec3 t1=normalize(cross(md,vec3(0.0,1.0,0.0)));
            vec3 t2=cross(t1,md);
            float R=0.1;
            // All moon work is confined to the small patch of sky it occupies.
            if(ang<R*2.9){
              vec2 uv=vec2(dot(dir,t1),dot(dir,t2))/R;
              float r=length(uv);
              float broken=uv.x*0.8+uv.y*0.6-0.42+snoise(vec3(uv*5.0,3.0))*0.05;
              float body=smoothstep(1.0,0.985,r)*smoothstep(0.0,0.03,-broken);
              if(body>0.0) col=mix(col,moonShade(uv,r),body);
              col+=vec3(1.0,0.45,0.2)*exp(-abs(broken)*45.0)*smoothstep(1.02,0.9,r)*0.35;
              // shards drifting away from the wound
              for(int k=0;k<7;k++){
                float fk=float(k);
                vec2 c=vec2(0.55+fk*0.21,0.45+sin(fk*2.3)*0.35+fk*0.08);
                c+=vec2(sin(uTime*0.02+fk),cos(uTime*0.017+fk))*0.03;
                float rk=0.05+0.07*fract(sin(fk*91.3)*43.1);
                vec2 q=(uv-c)/rk;
                float lq=length(q);
                if(lq<1.2){
                  float m=smoothstep(1.0,0.9,lq+0.12*sin(atan(q.y,q.x)*5.0+fk));
                  col=mix(col,moonShade(q,min(lq,1.0))*0.8,m);
                }
              }
              // debris arc
              vec2 ru=mat2(0.94,-0.34,0.34,0.94)*uv;
              float ring=exp(-pow((length(ru*vec2(1.0,3.4))-1.9)*9.0,2.0))*step(0.0,ru.x+0.6);
              col+=vec3(0.5,0.55,0.65)*ring*0.12*(0.6+0.4*sin(ru.x*40.0+ru.y*23.0));
            }
            col+=vec3(0.4,0.5,0.7)*(exp(-ang*14.0)*0.16+exp(-ang*4.0)*0.05);
            col+=vec3(1.0,0.6,0.35)*uRestore*0.05*exp(-abs(y)*6.0);
            gl_FragColor=vec4(col*(1.0-uDim*0.5),1.0);
          }`,
      }),
    );
    sky.frustumCulled = false;
    sky.renderOrder = 10; // drawn last: only pixels no building covers pay for it
    this.scene.add(sky);
  }

  private buildGround() {
    const memPos = MEMORIES.map((m) => new THREE.Vector3(m.position[0], 0, m.position[1]));
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1600, 1600, 1, 1).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        uniforms: { ...this.uniforms, uMem: { value: memPos } },
        vertexShader: /* glsl */ `
          varying vec3 vW;
          void main(){ vW=(modelMatrix*vec4(position,1.0)).xyz; gl_Position=projectionMatrix*viewMatrix*vec4(vW,1.0);} `,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform float uDim; uniform vec3 uMem[5];
          varying vec3 vW;
          ${VNOISE}
          ${FOG}
          ${WAVES}
          void main(){
            vec3 V=normalize(cameraPosition-vW);
            float n=vnoise(vW.xz*0.08)*2.0-1.0;
            vec3 col=vec3(0.02,0.024,0.03)*(0.8+n*0.4);
            // cracked paving
            vec2 g=abs(fract(vW.xz/7.0)-0.5);
            col+=vec3(0.015)*smoothstep(0.485,0.5,max(g.x,g.y));
            // wet sheen at grazing angles
            float fr=pow(1.0-V.y,6.0);
            float wet=smoothstep(0.45,0.8,vnoise(vW.xz*0.05+17.0));
            col+=uFogColor*fr*0.9*(0.3+wet);
            vec3 lit;
            vec3 flash=waves(vW,uTime,0.0,lit);
            col+=flash*0.25+lit*0.02;
            for(int i=0;i<5;i++){
              float d=distance(vW.xz,uMem[i].xz);
              col+=vec3(0.9,0.6,0.4)*exp(-d*0.35)*0.06;
            }
            col=applyFog(col,vW,1.0);
            gl_FragColor=vec4(col*(1.0-uDim*0.55),1.0);
          }`,
      }),
    );
    ground.renderOrder = 5;
    this.scene.add(ground);
  }

  private buildingMaterial(fogScale: number) {
    return new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, uFogScale: { value: fogScale } },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        varying vec3 vW; varying vec3 vN; varying vec2 vF; varying float vSeed; varying float vTop; varying vec2 vEdge;
        void main(){
          vec3 sc=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
          vec3 lp=position*sc;
          vec3 n=normal;
          if(abs(n.x)>0.5){ vF=vec2(lp.z+(n.x>0.0?0.0:97.0),lp.y); vEdge=vec2(abs(position.z)*2.0,position.y); }
          else { vF=vec2(lp.x+(n.z>0.0?41.0:163.0),lp.y); vEdge=vec2(abs(position.x)*2.0,position.y); }
          vTop=n.y; vSeed=aSeed+0.5;
          vec4 wp=modelMatrix*instanceMatrix*vec4(position,1.0);
          vW=wp.xyz;
          vN=normalize(mat3(modelMatrix)*mat3(instanceMatrix)*normal);
          gl_Position=projectionMatrix*viewMatrix*wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uMoonDir; uniform float uDim; uniform float uFogScale;
        varying vec3 vW; varying vec3 vN; varying vec2 vF; varying float vSeed; varying float vTop; varying vec2 vEdge;
        float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
        ${FOG}
        ${WAVES}
        void main(){
          vec3 N=normalize(vN);
          float seed=floor(vSeed);
          float tone=hash(vec2(seed,1.3));
          vec3 base=mix(vec3(0.04,0.044,0.05),vec3(0.07,0.07,0.072),tone);
          float moon=max(dot(N,normalize(uMoonDir)),0.0);
          base+=vec3(0.06,0.075,0.1)*pow(moon,1.5);
          // grime running down from every ledge
          float streak=hash(vec2(floor(vF.x*3.0),seed));
          base*=0.75+0.25*streak*smoothstep(0.0,1.0,fract(vF.y/15.6));
          base*=0.35+0.65*smoothstep(0.0,14.0,vW.y);
          vec2 cs=vec2(1.8,2.6);
          vec2 cell=floor(vF/cs);
          vec2 fw=fract(vF/cs);
          float win=step(0.16,fw.x)*step(fw.x,0.84)*step(0.24,fw.y)*step(fw.y,0.8);
          win*=step(abs(vTop),0.5)*step(2.6,vF.y);
          float h=hash(cell+vec2(seed*7.0,seed*3.0));
          float h2=hash(cell.yx+vec2(seed*5.0+11.0,seed));
          vec3 V=normalize(cameraPosition-vW);
          float fres=pow(1.0-abs(dot(N,V)),3.0);
          float broken=step(0.82,h2);
          vec3 glass=vec3(0.006,0.009,0.015)+vec3(0.05,0.065,0.09)*(fres*0.8+moon*0.25)*(1.0-broken)+vec3(0.012)*h;
          vec3 col=mix(base,glass,win);
          // a few dying cold lights, still flickering after all this time
          float cold=step(0.996,h)*(0.55+0.45*sin(uTime*(0.7+h2*4.0)+h*60.0));
          col+=win*cold*vec3(0.4,0.55,0.8)*0.7;
          vec3 lit;
          vec3 flash=waves(vW,uTime,h,lit);
          vec3 warm=mix(vec3(1.0,0.62,0.3),vec3(1.0,0.85,0.6),h2);
          col+=win*min(lit,vec3(1.1))*warm*(0.4+0.45*h2);
          col+=flash*(0.18+win*0.9);
          // architectural edges catch the moonlight
          float edge=smoothstep(0.96,1.0,vEdge.x)*step(abs(vTop),0.5);
          float band=step(0.93,fract(vF.y/15.6))*0.5;
          col+=vec3(0.08,0.095,0.12)*(edge+band)*(0.4+moon);
          col=applyFog(col,vW,uFogScale);
          gl_FragColor=vec4(col*(1.0-uDim*0.55),1.0);
        }`,
    });
  }

  private buildCity() {
    const r = rng(2189);
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const mats: THREE.Matrix4[] = [];
    const seeds: number[] = [];
    const tops: THREE.Vector3[] = [];
    const clear = MEMORIES.map((m) => new THREE.Vector2(m.position[0], m.position[1]));
    const pitch = 15;
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let gx = -9; gx <= 9; gx++) {
      for (let gz = -9; gz <= 11; gz++) {
        if (gx === 0) continue; // the great avenue
        const cx = gx * pitch;
        const cz = gz * pitch;
        const parts = r() < 0.35 ? 4 : 1;
        for (let p = 0; p < parts; p++) {
          const size = parts === 1 ? 7 + r() * 4.5 : 3.5 + r() * 2;
          const ox = parts === 1 ? (r() - 0.5) * 2 : (p % 2 ? 1 : -1) * 3.4;
          const oz = parts === 1 ? (r() - 0.5) * 2 : (p < 2 ? 1 : -1) * 3.4;
          const x = cx + ox;
          const z = cz + oz;
          if (clear.some((c) => c.distanceTo(new THREE.Vector2(x, z)) < 13)) continue;
          if (Math.abs(x) < 16 && z < -80) continue; // landing zone
          const dist = Math.hypot(x, z - 40);
          const tallness = THREE.MathUtils.clamp(1.3 - dist / 160, 0.25, 1.2);
          let h = 8 + Math.pow(r(), 2.2) * 95 * tallness + r() * 10;
          const ruined = r() < 0.12;
          if (Math.abs(x) < 40) h = Math.min(h, 16 + r() * 22); // open sky over the avenue
          if (ruined) h = 1.5 + r() * 4;
          const w = size * (0.8 + r() * 0.4);
          const d = size * (0.8 + r() * 0.4);
          const lean = !ruined && r() < 0.07 ? (r() - 0.5) * 0.16 : 0;
          e.set(lean, r() < 0.2 ? (r() - 0.5) * 0.3 : 0, lean * 0.6);
          q.setFromEuler(e);
          mats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, ruined ? -0.5 : 0, z), q, new THREE.Vector3(w, h, d)));
          seeds.push(Math.floor(r() * 97));
          if (h > 2.6) this.obstacles.push({ x, z, hw: w / 2 + 0.4, hd: d / 2 + 0.4 });
          if (h > 55 && !lean) tops.push(new THREE.Vector3(x, h + 0.6, z));
        }
      }
    }
    this.towers = { mesh: this.addInstanced(box, mats, seeds, this.buildingMaterial(1)), mats, seeds };
    this.towers.mesh.renderOrder = -1; // nearest occluders first; everything else depth-tests against them
    this.buildAviationLights(tops);
    // searchlights on some of the tallest towers
    tops
      .sort((a, b) => b.y - a.y)
      .slice(0, 3)
      .forEach((t, i) => this.addSearchlight(t, i));
  }

  private addInstanced(geo: THREE.BufferGeometry, mats: THREE.Matrix4[], seeds: number[], mat: THREE.Material) {
    const mesh = new THREE.InstancedMesh(geo.clone(), mat, mats.length);
    mats.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(seeds), 1));
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    return mesh;
  }

  private buildMegastructures() {
    const r = rng(7);
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const mats: THREE.Matrix4[] = [];
    const seeds: number[] = [];
    const q = new THREE.Quaternion();
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + r() * 0.2;
      const rad = 200 + r() * 140;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad + 40;
      if (Math.abs(x) < 50 && z > 0) continue; // keep the moon visible down the avenue
      const w = 18 + r() * 30;
      const h = 120 + r() * 260;
      q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.06, r() * Math.PI, (r() - 0.5) * 0.06));
      mats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(w, h, w * (0.6 + r()))));
      seeds.push(Math.floor(r() * 97));
    }
    this.addInstanced(box, mats, seeds, this.buildingMaterial(0.42));

    const silhouette = new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, uFogScale: { value: 0.38 } },
      vertexShader: /* glsl */ `
        varying vec3 vW; varying vec3 vN;
        void main(){ vW=(modelMatrix*vec4(position,1.0)).xyz; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*vec4(vW,1.0);} `,
      fragmentShader: /* glsl */ `
        uniform vec3 uMoonDir; uniform float uDim; uniform float uFogScale;
        varying vec3 vW; varying vec3 vN;
        ${FOG}
        void main(){
          float m=max(dot(normalize(vN),normalize(uMoonDir)),0.0);
          vec3 col=vec3(0.03,0.035,0.045)+vec3(0.08,0.09,0.12)*pow(m,3.0);
          col=applyFog(col,vW,uFogScale);
          gl_FragColor=vec4(col*(1.0-uDim*0.5),1.0);
        }`,
    });

    // The broken halo: an orbital ring that fell, half of it still standing.
    const halo = new THREE.Mesh(new THREE.TorusGeometry(110, 3.2, 10, 180, Math.PI * 1.35), silhouette);
    halo.position.set(-170, -20, 250);
    halo.rotation.set(0.15, 0.7, 0.35);
    this.scene.add(halo);

    // The tether: a space elevator climbing out of sight.
    const tether = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.5, 2400, 12, 1, true).translate(0, 1200, 0), silhouette);
    tether.position.set(110, 0, 330);
    this.scene.add(tether);
    const tl = new THREE.BufferGeometry();
    const n = 90;
    const p = new Float32Array(n * 3);
    const ph = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      p.set([110, 20 + i * 14, 330], i * 3);
      ph[i] = i;
    }
    tl.setAttribute('position', new THREE.BufferAttribute(p, 3));
    tl.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    const tetherLights = new THREE.Points(
      tl,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          uniform float uTime; uniform float uRestore; attribute float aPhase; varying float vA;
          void main(){
            vec4 mv=modelViewMatrix*vec4(position,1.0);
            gl_Position=projectionMatrix*mv;
            float chase=fract(aPhase/30.0-uTime*0.12);
            vA=pow(chase,12.0)*0.9+0.08+uRestore*0.6;
            gl_PointSize=clamp(900.0/-mv.z,1.5,6.0);
          }`,
        fragmentShader: /* glsl */ `
          varying float vA;
          void main(){ float d=length(gl_PointCoord-0.5); gl_FragColor=vec4(vec3(1.0,0.75,0.5)*smoothstep(0.5,0.0,d)*vA,1.0);} `,
      }),
    );
    tetherLights.frustumCulled = false;
    this.scene.add(tetherLights);
  }

  private buildAviationLights(tops: THREE.Vector3[]) {
    const g = new THREE.BufferGeometry().setFromPoints(tops);
    g.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array(tops.map(() => Math.random() * 6)), 1));
    const pts = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          uniform float uTime; attribute float aPhase; varying float vA;
          void main(){
            vec4 mv=modelViewMatrix*vec4(position,1.0);
            gl_Position=projectionMatrix*mv;
            vA=smoothstep(0.85,1.0,sin(uTime*0.9+aPhase));
            gl_PointSize=clamp(1400.0/-mv.z,2.0,9.0);
          }`,
        fragmentShader: /* glsl */ `
          varying float vA;
          void main(){ float d=length(gl_PointCoord-0.5); gl_FragColor=vec4(vec3(1.0,0.2,0.12)*smoothstep(0.5,0.0,d)*vA,1.0);} `,
      }),
    );
    pts.frustumCulled = false;
    this.scene.add(pts);
  }

  private beamMaterial(color: THREE.Color, strength: number) {
    return new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, uColor: { value: color }, uStrength: { value: strength } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide, // one layer of overdraw per beam, not two
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vN; varying vec3 vW;
        void main(){ vUv=uv; vW=(modelMatrix*vec4(position,1.0)).xyz; vN=normalize(mat3(modelMatrix)*normal);
          gl_Position=projectionMatrix*viewMatrix*vec4(vW,1.0);} `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uStrength; uniform float uTime; uniform float uDim;
        varying vec2 vUv; varying vec3 vN; varying vec3 vW;
        void main(){
          vec3 V=normalize(cameraPosition-vW);
          float soft=pow(abs(dot(normalize(vN),V)),2.0);
          float along=smoothstep(0.0,0.15,vUv.y)*smoothstep(1.0,0.45,vUv.y);
          float dust=0.7+0.15*sin(vW.y*0.09-uTime*0.6+vW.x*0.05)+0.15*sin(vW.y*0.23+uTime*0.4+vW.z*0.07);
          float near=smoothstep(2.0,14.0,length(cameraPosition-vW));
          gl_FragColor=vec4(uColor*soft*along*dust*near*uStrength*(1.0-uDim*0.7),1.0);
        }`,
    });
  }

  private buildBeams() {
    // Moonlight falling between the towers.
    const r = rng(41);
    const mat = this.beamMaterial(new THREE.Color(0.55, 0.68, 0.9), this.lowPower ? 0.07 : 0.09);
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < (this.lowPower ? 2 : 4); i++) {
      const len = 160;
      const geo = new THREE.CylinderGeometry(4 + r() * 3, 1.8 + r() * 1.5, len, 16, 1, true).translate(0, -len / 2, 0);
      const m = new THREE.Mesh(geo, mat);
      const ground = new THREE.Vector3((r() - 0.5) * 180, 0, -60 + r() * 200);
      m.position.copy(ground).addScaledVector(MOON_DIR, len);
      m.quaternion.setFromUnitVectors(up, MOON_DIR);
      this.scene.add(m);
    }
  }

  private addSearchlight(top: THREE.Vector3, i: number) {
    const pivot = new THREE.Object3D();
    pivot.position.copy(top);
    const len = 260;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(14, 0.6, len, 32, 1, true).translate(0, len / 2, 0),
      this.beamMaterial(new THREE.Color(0.95, 0.85, 0.7), 0.06),
    );
    beam.rotation.z = 0.5;
    pivot.add(beam);
    pivot.userData.speed = 0.04 + i * 0.015;
    pivot.userData.phase = i * 2.1;
    this.searchlights.push(pivot);
    this.scene.add(pivot);
  }

  private buildDust(count: number) {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3);
    const s = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      p.set([Math.random() * 120, Math.random() * 40, Math.random() * 120], i * 3);
      s[i] = Math.random();
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(s, 1));
    const pts = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        uniforms: { ...this.uniforms, uPixel: { value: Math.min(window.devicePixelRatio, 1.5) } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          uniform float uTime; uniform float uPixel; attribute float aSeed; varying float vA; varying float vWarm;
          void main(){
            vec3 size=vec3(120.0,40.0,120.0);
            vec3 drift=vec3(sin(aSeed*20.0)*0.6+0.8,-0.25-aSeed*0.3,cos(aSeed*13.0)*0.5)*uTime;
            vec3 rel=mod(position+drift-cameraPosition+size*0.5,size)-size*0.5;
            vec3 wp=cameraPosition+rel;
            wp.y=mod(position.y+drift.y,40.0);
            wp.x+=sin(uTime*0.5+aSeed*30.0)*0.4;
            vec4 mv=viewMatrix*vec4(wp,1.0);
            gl_Position=projectionMatrix*mv;
            float dist=-mv.z;
            vA=smoothstep(60.0,10.0,dist)*smoothstep(0.3,2.0,dist)*(0.35+0.65*aSeed);
            vWarm=step(0.93,aSeed);
            gl_PointSize=uPixel*(1.0+aSeed*2.5)*clamp(30.0/dist,0.6,5.0);
          }`,
        fragmentShader: /* glsl */ `
          varying float vA; varying float vWarm;
          void main(){
            float d=length(gl_PointCoord-0.5);
            vec3 c=mix(vec3(0.6,0.68,0.8),vec3(1.0,0.6,0.3),vWarm);
            gl_FragColor=vec4(c*smoothstep(0.5,0.05,d)*vA*0.55,1.0);
          }`,
      }),
    );
    pts.frustumCulled = false;
    this.scene.add(pts);
  }

  /**
   * Re-order tower instances nearest-first. The window shader is the most
   * expensive thing on screen; drawing front-to-back lets the GPU's early depth
   * test discard hidden fragments before they are shaded.
   */
  private sortTowers(cam: THREE.Vector3) {
    if (this.lastSort.distanceToSquared(cam) < 36) return;
    this.lastSort.copy(cam);
    const { mesh, mats, seeds } = this.towers;
    const dist = mats.map((m, i) => {
      const e = m.elements;
      return { i, d: (e[12] - cam.x) ** 2 + (e[14] - cam.z) ** 2 };
    });
    dist.sort((a, b) => a.d - b.d);
    const seedAttr = mesh.geometry.getAttribute('aSeed') as THREE.InstancedBufferAttribute;
    dist.forEach(({ i }, slot) => {
      mesh.setMatrixAt(slot, mats[i]);
      seedAttr.setX(slot, seeds[i]);
    });
    mesh.instanceMatrix.needsUpdate = true;
    seedAttr.needsUpdate = true;
  }

  update(time: number, cam: THREE.Vector3) {
    this.uniforms.uTime.value = time;
    this.sortTowers(cam);
    for (const s of this.searchlights) {
      s.rotation.y = s.userData.phase + time * s.userData.speed;
    }
  }
}
