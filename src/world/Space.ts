import * as THREE from 'three';
import { NOISE } from './glsl';

const PLANET_R = 10;
/** Where on the planet's night side the signal is blinking. */
export const SIGNAL_DIR = new THREE.Vector3(0.18, 0.22, 1).normalize();
const SUN_DIR = new THREE.Vector3(-0.75, 0.22, -1).normalize();

/**
 * Act I and the epilogue: deep space, a mostly dark Earth,
 * a lone blinking light, and (eventually) the satellite.
 */
export class SpaceScene {
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  uniforms = {
    uTime: { value: 0 },
    uReveal: { value: 0 }, // stars emerging 0..1
    uPlanet: { value: 0 }, // planet fade 0..1
    uLights: { value: 0 }, // epilogue: humanity remembered
    uSignal: { value: 0 }, // the blinking light
  };
  private satellite: THREE.Group;
  private pulses: THREE.Mesh[] = [];
  private pulseMat: THREE.ShaderMaterial;
  private signalSprite: THREE.Mesh;
  epilogue = false;
  private epilogueStart = 0;

  constructor(aspect: number, lowPower: boolean) {
    this.camera = new THREE.PerspectiveCamera(38, aspect, 0.01, 2000);
    this.camera.position.set(0, 0, 38);
    this.scene.background = new THREE.Color(0x000000);
    this.buildStars(lowPower ? 1800 : 3500);
    this.buildPlanet();

    // The blinking signal light.
    this.signalSprite = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform float uSignal;
          varying vec2 vUv;
          void main(){
            vec2 p=vUv-0.5; float d=length(p);
            float beat=pow(0.5+0.5*sin(uTime*2.2),6.0);
            float core=exp(-d*d*900.0);
            float halo=exp(-d*d*60.0)*(0.25+0.6*beat);
            float flare=exp(-abs(p.y)*220.0)*exp(-abs(p.x)*9.0)*0.5*beat;
            vec3 c=vec3(1.0,0.78,0.55)*(core*1.6+halo)+vec3(0.7,0.85,1.0)*flare;
            gl_FragColor=vec4(c*uSignal,1.0);
          }`,
      }),
    );
    this.signalSprite.position.copy(SIGNAL_DIR).multiplyScalar(PLANET_R * 1.003);
    this.signalSprite.scale.setScalar(3.2);
    this.scene.add(this.signalSprite);

    this.satellite = this.buildSatellite();
    this.satellite.visible = false;
    this.scene.add(this.satellite);

    this.pulseMat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: /* glsl */ `
        uniform float uT; varying vec2 vUv;
        void main(){
          float d=length(vUv-0.5)*2.0;
          float ring=exp(-pow((d-0.92)*28.0,2.0));
          gl_FragColor=vec4(vec3(1.0,0.75,0.5)*ring*(1.0-uT)*0.9,1.0);
        }`,
    });
  }

  private buildStars(count: number) {
    const pos = new Float32Array(count * 3);
    const data = new Float32Array(count * 3); // threshold, size, warmth
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const r = 500 + Math.random() * 300;
      const s = Math.sqrt(1 - u * u);
      pos.set([Math.cos(th) * s * r, u * r, Math.sin(th) * s * r], i * 3);
      // Stars near the galactic band emerge first and are denser.
      data.set([Math.random() * 0.95, Math.pow(Math.random(), 4) * 3 + 0.6, Math.random()], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aData', new THREE.BufferAttribute(data, 3));
    const m = new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, uPixel: { value: Math.min(window.devicePixelRatio, 1.5) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uReveal; uniform float uPixel;
        attribute vec3 aData; varying float vA; varying float vW;
        void main(){
          vec4 mv=modelViewMatrix*vec4(position,1.0);
          gl_Position=projectionMatrix*mv;
          float born=smoothstep(aData.x,aData.x+0.08,uReveal);
          float tw=0.65+0.35*sin(uTime*(0.6+aData.z*2.0)+aData.x*90.0);
          vA=born*tw; vW=aData.z;
          gl_PointSize=aData.y*uPixel*1.6;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA; varying float vW;
        void main(){
          float d=length(gl_PointCoord-0.5);
          float a=smoothstep(0.5,0.0,d);
          vec3 c=mix(vec3(0.7,0.8,1.0),vec3(1.0,0.85,0.7),step(0.85,vW));
          gl_FragColor=vec4(c*a*vA,1.0);
        }`,
    });
    this.scene.add(new THREE.Points(g, m));
  }

  private buildPlanet() {
    const sunDir = { value: SUN_DIR };
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(PLANET_R, 128, 96),
      new THREE.ShaderMaterial({
        uniforms: { ...this.uniforms, uSun: sunDir },
        vertexShader: /* glsl */ `
          varying vec3 vN; varying vec3 vP; varying vec3 vW;
          void main(){
            vP=normalize(position); vN=normalize(mat3(modelMatrix)*normal);
            vW=(modelMatrix*vec4(position,1.0)).xyz;
            gl_Position=projectionMatrix*viewMatrix*vec4(vW,1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform float uPlanet; uniform float uLights; uniform vec3 uSun;
          varying vec3 vN; varying vec3 vP; varying vec3 vW;
          ${NOISE}
          void main(){
            vec3 N=normalize(vN); vec3 V=normalize(cameraPosition-vW);
            float n=fbm(vP*2.1);
            float land=smoothstep(0.0,0.06,n);
            float detail=fbm(vP*9.0);
            vec3 ocean=vec3(0.012,0.03,0.055);
            vec3 ground=mix(vec3(0.08,0.08,0.085),vec3(0.17,0.15,0.13),detail*0.5+0.5);
            vec3 base=mix(ocean,ground,land);
            float clouds=smoothstep(0.15,0.6,fbm(vP*3.5+vec3(uTime*0.004,0.0,0.0)));
            float ndl=dot(N,uSun);
            float day=smoothstep(-0.05,0.35,ndl);
            vec3 col=base*day*1.6+vec3(0.55,0.6,0.7)*clouds*day*0.5;
            col+=vec3(0.9,0.45,0.2)*0.25*exp(-pow(ndl*7.0,2.0))*(0.4+land);
            float night=1.0-smoothstep(-0.2,0.02,ndl);
            float cityMask=land*smoothstep(-0.1,0.4,fbm(vP*5.0+3.0));
            float cities=smoothstep(0.25,0.85,snoise(vP*55.0))*cityMask;
            float sparks=step(0.985,hash21(floor(vP.xy*400.0)+floor(uTime*0.3)));
            float lit=cities*uLights*1.9+cities*sparks*0.4;
            col+=vec3(1.0,0.6,0.28)*lit*night*(1.0-clouds*0.6);
            float fr=pow(1.0-max(dot(N,V),0.0),3.0);
            col+=vec3(0.3,0.5,0.95)*fr*smoothstep(-0.5,0.5,ndl)*0.9;
            col+=vec3(1.0,0.65,0.35)*fr*uLights*night*0.35;
            gl_FragColor=vec4(col*uPlanet,1.0);
          }`,
      }),
    );
    this.scene.add(planet);

    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(PLANET_R * 1.08, 96, 64),
      new THREE.ShaderMaterial({
        uniforms: { ...this.uniforms, uSun: sunDir },
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          varying vec3 vN; varying vec3 vW;
          void main(){ vN=normalize(mat3(modelMatrix)*normal); vW=(modelMatrix*vec4(position,1.0)).xyz;
            gl_Position=projectionMatrix*viewMatrix*vec4(vW,1.0);} `,
        fragmentShader: /* glsl */ `
          uniform float uPlanet; uniform float uLights; uniform vec3 uSun;
          varying vec3 vN; varying vec3 vW;
          void main(){
            vec3 V=normalize(cameraPosition-vW);
            float f=-dot(normalize(vN),V);
            float rim=pow(smoothstep(0.0,0.4,f),3.0);
            float sun=smoothstep(-0.3,0.8,dot(normalize(vN),uSun));
            vec3 c=vec3(0.35,0.6,1.0)*rim*(0.25+sun*1.6);
            c+=vec3(1.0,0.6,0.3)*rim*uLights*0.35;
            gl_FragColor=vec4(c*uPlanet,1.0);
          }`,
      }),
    );
    this.scene.add(atmo);
  }

  private buildSatellite() {
    const g = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1d22, metalness: 0.9, roughness: 0.35 });
    const panel = new THREE.MeshStandardMaterial({ color: 0x1a2c50, metalness: 0.5, roughness: 0.3, emissive: 0x0c1a36 });
    const gold = new THREE.MeshStandardMaterial({ color: 0x8a6a2a, metalness: 1, roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.8), gold);
    g.add(body);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.35, 24, 12, 0, Math.PI * 2, 0, Math.PI / 3.2), dark);
    dish.rotation.x = Math.PI / 2;
    dish.position.z = -0.55;
    g.add(dish);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6), dark);
      arm.rotation.z = Math.PI / 2;
      arm.position.x = s * 0.55;
      g.add(arm);
      for (let k = 0; k < 3; k++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.02, 0.9), panel);
        p.position.x = s * (0.95 + k * 0.6);
        g.add(p);
      }
    }
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffc080 }),
    );
    eye.position.z = -0.62;
    g.add(eye);
    const key = new THREE.DirectionalLight(0xb0c8ff, 2.2);
    key.position.copy(SUN_DIR).multiplyScalar(50);
    this.scene.add(key);
    this.scene.add(new THREE.AmbientLight(0x202838, 0.6));
    const fill = new THREE.DirectionalLight(0x8fa6d0, 1.4);
    fill.position.set(0, 2, 60);
    this.scene.add(fill);
    const earthGlow = new THREE.DirectionalLight(0xffa868, 1.2);
    earthGlow.position.set(0, -10, -20);
    this.scene.add(earthGlow);
    g.scale.setScalar(0.6);
    const warm = new THREE.PointLight(0xffa060, 4, 6);
    warm.position.set(0, -1, -2);
    g.add(warm);
    return g;
  }

  startEpilogue(time: number) {
    this.epilogue = true;
    this.epilogueStart = time;
    this.uniforms.uPlanet.value = 1;
    this.uniforms.uReveal.value = 1;
    this.uniforms.uSignal.value = 0;
    this.satellite.visible = true;
  }

  /** Emit a ring of light from the satellite: the reply. */
  pulse() {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.pulseMat.clone());
    m.userData.born = this.uniforms.uTime.value;
    m.position.copy(this.satellite.position);
    m.lookAt(this.camera.position);
    this.scene.add(m);
    this.pulses.push(m);
  }

  update(time: number, arrivalT: number, reduced: boolean) {
    this.uniforms.uTime.value = time;
    const cam = this.camera;
    if (!this.epilogue) {
      // Slow, almost imperceptible drift during the arrival.
      const d = reduced ? 0 : arrivalT;
      cam.position.set(Math.sin(d * 0.03) * 2.5, 1.2 + Math.sin(d * 0.05) * 0.8, (38 - Math.min(d, 30) * 0.12) * this.fit());
      cam.lookAt(SIGNAL_DIR.x * 4, SIGNAL_DIR.y * 4, 0);
    } else {
      const t = time - this.epilogueStart;
      this.uniforms.uLights.value = Math.min(1, Math.max(0, (t - 1.5) / 9));
      // Pull away; the satellite drifts into the foreground.
      const k = 1 - Math.exp(-t * (reduced ? 0.5 : 0.12));
      cam.position.set(-4 + k * 2, 2 + k * 1.5, (30 + k * 16) * this.fit());
      this.satellite.position.set(cam.position.x + 2.6, cam.position.y - 1.1, cam.position.z - 9);
      this.satellite.rotation.set(0.25, time * 0.05 + 0.6, 0.15);
      cam.lookAt(0, 0, 0);
      for (let i = this.pulses.length - 1; i >= 0; i--) {
        const p = this.pulses[i];
        const age = (time - p.userData.born) / 6;
        if (age >= 1) {
          this.scene.remove(p);
          (p.material as THREE.Material).dispose();
          this.pulses.splice(i, 1);
          continue;
        }
        p.scale.setScalar(0.5 + age * 60);
        (p.material as THREE.ShaderMaterial).uniforms.uT.value = age;
      }
    }
  }

  /** Pull the camera back on portrait screens so the planet still fits. */
  private fit() {
    return Math.max(1, Math.pow(1 / this.camera.aspect, 0.75));
  }

  /** Point in world space to dive toward. */
  signalPoint() {
    return SIGNAL_DIR.clone().multiplyScalar(PLANET_R);
  }
}
