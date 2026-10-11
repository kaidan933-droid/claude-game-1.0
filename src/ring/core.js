import * as THREE from 'three';
import {T} from './sim/world.js';

/* seeded random so the scenery is the same every load */
let seed=19270618;
export function rnd(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const sstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
export const lin=h=>new THREE.Color(h).convertSRGBToLinear();
export const hexStr=h=>'#'+h.toString(16).padStart(6,'0');
export const fmt=t=>{if(t===null||t===undefined||!isFinite(t))return '-:--.---';const m=Math.floor(t/60),s=t-m*60;return m+':'+(s<10?'0':'')+s.toFixed(3);};

/* quality: 0 low (phones, tablets), 1 medium, 2 high. Stored choice wins; otherwise touch devices start on low */
export const QUALITY=(()=>{let q=null;try{const v=localStorage.getItem('ring-quality');q=v==='low'?0:v==='medium'?1:v==='high'?2:null;}catch(e){}
  if(q===null){let touch=false;try{touch=window.matchMedia('(pointer: coarse)').matches;}catch(e){}q=touch?0:2;}return q;})();

/* ---------------- renderer ----------------
   Materials render linear HDR (no tone mapping); post.js does exposure, glare, bloom, ACES and sRGB. */
const canvas=document.getElementById('scene');
export const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));
renderer.outputEncoding=THREE.LinearEncoding;
renderer.toneMapping=THREE.NoToneMapping;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.physicallyCorrectLights=false;

export const scene=new THREE.Scene();
export const camera=new THREE.PerspectiveCamera(60,1,0.08,9000);
function resize(){const w=window.innerWidth,h=window.innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
window.addEventListener('resize',resize);resize();

/* ---------------- sun ----------------
   Late afternoon in the Eifel: the sun sits 6.5 deg above the horizon, almost straight up the
   Döttinger Höhe, so the long straight runs right into it. */
const dott=T.sections.find(s=>s.name==='Döttinger Höhe');
const di=T.idx(dott.s+700);
const az=Math.atan2(T.TZ[di],T.TX[di])+0.1,el=6.5*Math.PI/180;
export const sunDir=new THREE.Vector3(Math.cos(el)*Math.cos(az),Math.sin(el),Math.cos(el)*Math.sin(az)).normalize();
export const SUN_COL=lin(0xffc58a);

/* ---------------- sky ---------------- */
const skyUniforms={
  sunDir:{value:sunDir},
  zenith:{value:lin(0x2d5590)},horizon:{value:lin(0xd9c3ab)},sunHaze:{value:lin(0xffb070)},ground:{value:lin(0x5a5248)},
  sunCol:{value:new THREE.Color(1,0.86,0.66)},
  time:{value:0}
};
const SKY_VS='varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.0);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;gl_Position.z=gl_Position.w;}';
const SKY_FS=`uniform vec3 sunDir,zenith,horizon,sunHaze,ground,sunCol;uniform float time;varying vec3 vW;
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float a=0.5,s=0.0;for(int i=0;i<5;i++){s+=a*vn(p);p=p*2.03+vec2(17.1,9.2);a*=0.5;}return s;}
void main(){
  vec3 d=normalize(vW-cameraPosition);float h=d.y;
  float sd=max(dot(d,sunDir),0.0);
  float hz=pow(1.0-max(h,0.0),5.0);
  vec3 c=mix(zenith,horizon,pow(1.0-max(h,0.0),2.6));
  /* warm haze around the sun, strongest at the horizon */
  c=mix(c,sunHaze,pow(sd,6.0)*0.75*(0.35+0.65*hz));
  c+=sunCol*(pow(sd,28.0)*0.9+pow(sd,180.0)*2.5);
  /* thin high clouds, lit from behind near the sun */
  if(h>0.0){
    vec2 uv=d.xz/(h+0.06)*0.9+vec2(time*0.002,0.0);
    float cl=smoothstep(0.52,0.85,fbm(uv*1.3))*smoothstep(0.0,0.12,h);
    vec3 cc=mix(vec3(1.05,0.96,0.9),vec3(1.6,1.15,0.75),pow(sd,4.0))*(0.75+0.5*pow(sd,12.0));
    c=mix(c,cc*mix(horizon,vec3(1.0),0.5),cl*0.55);
  }
  /* sun disc: very bright so bloom and glare pick it up */
  c+=sunCol*smoothstep(0.99996,0.99999,sd)*90.0;
  c=mix(c,ground,smoothstep(0.0,-0.08,h));
  gl_FragColor=vec4(c,1.0);
}`;
export function makeSky(radius,env){
  /* the environment copy has no sun disc and no depth trick: a 90x HDR spike poisons the PMREM blur */
  const m=new THREE.Mesh(new THREE.SphereGeometry(radius,48,24),new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,fog:false,uniforms:skyUniforms,
    vertexShader:env?SKY_VS.replace('gl_Position.z=gl_Position.w;',''):SKY_VS,
    fragmentShader:env?SKY_FS.replace('*90.0;','*0.0;').replace('gl_FragColor=vec4(c,1.0);','gl_FragColor=vec4(min(c,vec3(8.0)),1.0);'):SKY_FS}));
  m.frustumCulled=false;m.renderOrder=-10;return m;
}
export const sky=makeSky(8000);scene.add(sky);
export {skyUniforms};

/* reflections for paint, glass and armco: a painted equirect of this sky (low sun, forest horizon).
   Built from an LDR canvas: rendering the HDR sky into PMREM produced NaNs on some GPUs. */
const pmrem=new THREE.PMREMGenerator(renderer);
{
  const c=document.createElement('canvas');c.width=1024;c.height=512;const g=c.getContext('2d');
  const sky=g.createLinearGradient(0,0,0,256);
  sky.addColorStop(0,'#3d6aa8');sky.addColorStop(0.6,'#9fb6cc');sky.addColorStop(1,'#e8d2b4');
  g.fillStyle=sky;g.fillRect(0,0,1024,256);
  /* warm glow where the sun is */
  const sa=((Math.atan2(sunDir.z,sunDir.x)/(2*Math.PI))+0.5)*1024;
  for(const ox of [-1024,0,1024]){const gr=g.createRadialGradient(sa+ox,236,2,sa+ox,236,260);gr.addColorStop(0,'rgba(255,240,210,1)');gr.addColorStop(0.15,'rgba(255,200,140,.8)');gr.addColorStop(1,'rgba(255,170,110,0)');g.fillStyle=gr;g.fillRect(0,0,1024,256);}
  g.fillStyle='#1e2a1b';for(let x=0;x<1024;x+=4){const h=10+Math.sin(x*0.05)*6+Math.sin(x*0.013)*8+Math.random()*6;g.fillRect(x,256-h,4,h);}
  const gnd=g.createLinearGradient(0,256,0,512);gnd.addColorStop(0,'#2e302e');gnd.addColorStop(1,'#1c1d1c');g.fillStyle=gnd;g.fillRect(0,256,1024,256);
  const t=new THREE.CanvasTexture(c);t.mapping=THREE.EquirectangularReflectionMapping;t.encoding=THREE.sRGBEncoding;
  scene.environment=pmrem.fromEquirectangular(t).texture;t.dispose();
}

/* ---------------- light ---------------- */
export const hemi=new THREE.HemisphereLight(lin(0x9db6d8),lin(0x3d4a2c),0.55);scene.add(hemi);
export const sun=new THREE.DirectionalLight(SUN_COL,3.4);
sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera,{left:-55,right:55,top:55,bottom:-55,near:1,far:1200});
sun.shadow.bias=-0.0003;sun.shadow.normalBias=0.035;
scene.add(sun);scene.add(sun.target);

/* ---------------- fog that glows toward the sun ----------------
   three's fog is one colour; this swaps in a colour that warms toward the sun, in view space. */
export const FOG_COL=lin(0xb9b7b0);
scene.fog=new THREE.FogExp2(FOG_COL.clone(),0.00042);
export const fogSun={sunView:{value:new THREE.Vector3()},sunFog:{value:lin(0xffc89a).multiplyScalar(1.6)}};
const patched=new WeakSet();
export function patchFog(mat){
  if(!mat||patched.has(mat)||!mat.fog||!(mat.isMeshStandardMaterial||mat.isMeshPhongMaterial||mat.isMeshLambertMaterial))return;
  patched.add(mat);
  const prev=mat.onBeforeCompile;
  mat.onBeforeCompile=(sh,r)=>{
    prev&&prev(sh,r);
    sh.uniforms.sunView=fogSun.sunView;sh.uniforms.sunFog=fogSun.sunFog;
    if(!/varying vec3 vViewPosition/.test(sh.vertexShader)){
      sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vFogView;').replace('#include <fog_vertex>','#include <fog_vertex>\nvFogView=-mvPosition.xyz;');
      sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vFogView;');
    }else sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\n#define vFogView vViewPosition');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nuniform vec3 sunView;uniform vec3 sunFog;').replace('#include <fog_fragment>',`#ifdef USE_FOG
      float fogF=1.0-exp(-fogDensity*fogDensity*fogDepth*fogDepth);
      float sdv=max(dot(normalize(-vFogView),sunView),0.0);
      vec3 fc=mix(fogColor,sunFog,pow(sdv,6.0)*0.85);
      gl_FragColor.rgb=mix(gl_FragColor.rgb,fc,fogF);
    #endif`);
  };
  mat.needsUpdate=true;
}
export function patchAll(root){root.traverse(o=>{if(o.material){(Array.isArray(o.material)?o.material:[o.material]).forEach(patchFog);}});}

/* ---------------- textures ---------------- */
export const maxAniso=renderer.capabilities.getMaxAnisotropy();
export function tex(w,h,draw,srgb){
  const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=maxAniso;
  if(srgb!==false)t.encoding=THREE.sRGBEncoding;return t;
}
export function speckle(g,w,h,cols,n,size){for(let i=0;i<n;i++){g.fillStyle=cols[(rnd()*cols.length)|0];const s=rnd()*size+0.5;g.fillRect(rnd()*w,rnd()*h,s,s);}}
export const std=(hex,rough,metal,extra)=>new THREE.MeshStandardMaterial(Object.assign({color:lin(hex),roughness:rough,metalness:metal||0},extra||{}));
