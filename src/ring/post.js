import * as THREE from 'three';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {ShaderPass} from 'three/examples/jsm/postprocessing/ShaderPass.js';
import {renderer,scene,camera,sun,sunDir,tex,rnd,clamp} from './core.js';
import {setTreeQuality} from './scenery.js';

/* Linear HDR scene -> bloom -> one final pass that adds the sun's glare (halo, starburst, lens
   ghosts, veiling glare, lit-up windscreen dirt in the cockpit), then exposure, ACES and sRGB. */
const W=()=>window.innerWidth,H=()=>window.innerHeight;
const gl2=renderer.capabilities.isWebGL2;
let high=true;
try{high=localStorage.getItem('ring-quality')!=='low';}catch(e){}

const rtOpts={type:THREE.HalfFloatType,format:THREE.RGBAFormat};
function makeRT(){return gl2&&high?new THREE.WebGLMultisampleRenderTarget(W(),H(),rtOpts):new THREE.WebGLRenderTarget(W(),H(),rtOpts);}
let composer,bloom,final;

/* windscreen grime: wiper arcs, smudges, bug splats, fine scratches */
const dirtTex=tex(1024,512,(g,w,h)=>{
  g.fillStyle='#000';g.fillRect(0,0,w,h);
  for(let i=0;i<70;i++){const x=rnd()*w,y=rnd()*h,r=8+rnd()*60;const gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,'rgba(255,255,255,'+(0.05+rnd()*0.12)+')');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(x-r,y-r,2*r,2*r);}
  for(let i=0;i<40;i++){const x=rnd()*w,y=rnd()*h;g.fillStyle='rgba(255,255,255,'+(0.2+rnd()*0.3)+')';g.beginPath();g.arc(x,y,1+rnd()*2.5,0,7);g.fill();}
  g.lineWidth=1;
  for(const cxp of [0.3,0.72]){const cx=w*cxp,cy=h*1.25;
    for(let k=0;k<70;k++){const r=h*(0.55+rnd()*0.65),a0=-Math.PI*(0.15+rnd()*0.2),a1=-Math.PI*(0.85-rnd()*0.2);
      g.strokeStyle='rgba(255,255,255,'+(0.03+rnd()*0.07)+')';g.beginPath();g.arc(cx,cy,r,a1,a0);g.stroke();}}
  for(let i=0;i<160;i++){const x=rnd()*w,y=rnd()*h,a=rnd()*Math.PI,l=10+rnd()*90;g.strokeStyle='rgba(255,255,255,'+(0.04+rnd()*0.1)+')';g.beginPath();g.moveTo(x,y);g.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l);g.stroke();}
},false);
dirtTex.wrapS=dirtTex.wrapT=THREE.ClampToEdgeWrapping;

const FinalShader={
  uniforms:{tDiffuse:{value:null},tDirt:{value:dirtTex},sunUV:{value:new THREE.Vector2()},sunVis:{value:0},sunOn:{value:0},
    aspect:{value:1},exposure:{value:1},cockpit:{value:0},blur:{value:0},time:{value:0},veil:{value:0}},
  vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:`uniform sampler2D tDiffuse,tDirt;uniform vec2 sunUV;uniform float sunVis,sunOn,aspect,exposure,cockpit,blur,time,veil;varying vec2 vUv;
  vec3 aces(vec3 x){return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);}
  float ghost(vec2 uv,vec2 c,float rad,float soft){vec2 d=(uv-c)*vec2(aspect,1.0);
    /* hexagonal aperture */
    vec2 a=abs(d);float hx=max(a.x*0.866+a.y*0.5,a.y);return smoothstep(rad,rad*(1.0-soft),hx);}
  float h12(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
  void main(){
    vec2 uv=vUv,dc=uv-0.5;float r2=dot(dc,dc);
    vec3 col;
    if(blur>0.001){
      vec2 d=uv-vec2(0.5,0.55);float k=blur*smoothstep(0.08,0.6,length(d));col=vec3(0.0);
      for(int i=0;i<8;i++){col+=texture2D(tDiffuse,uv-d*k*float(i)/7.0).rgb;}col/=8.0;
    }else{
      vec2 ca=dc*r2*0.012;
      col=vec3(texture2D(tDiffuse,uv-ca).r,texture2D(tDiffuse,uv).g,texture2D(tDiffuse,uv+ca).b);
    }
    vec3 warm=vec3(1.0,0.8,0.56);
    float s=sunVis*sunOn;
    vec2 d=(uv-sunUV)*vec2(aspect,1.0);float r=length(d);
    vec3 g=warm*(exp(-r*14.0)*2.2+exp(-r*4.0)*0.42+exp(-r*1.5)*0.12);
    float an=atan(d.y,d.x);
    float star=pow(abs(cos(an*3.0+0.35)),90.0)+0.55*pow(abs(cos(an*4.0+1.2)),140.0)+0.4*pow(abs(cos(an*7.0+0.2)),200.0);
    g+=warm*star*exp(-r*3.2)*1.6*(0.85+0.15*sin(time*7.0));
    g+=vec3(0.85,0.75,0.65)*exp(-abs(d.y)*110.0)*exp(-abs(d.x)*1.8)*0.3;
    /* ghosts mirrored through the centre, coloured by the lens coatings */
    vec2 ax=vec2(0.5)-sunUV;
    vec3 gh=vec3(0.0);
    gh+=vec3(0.35,0.55,1.0)*ghost(uv,sunUV+ax*0.55,0.035,0.4)*0.30;
    gh+=vec3(1.0,0.55,0.25)*ghost(uv,sunUV+ax*0.9,0.06,0.25)*0.18;
    gh+=vec3(0.45,1.0,0.6)*ghost(uv,sunUV+ax*1.35,0.022,0.5)*0.35;
    gh+=vec3(0.9,0.6,1.0)*ghost(uv,sunUV+ax*1.7,0.11,0.15)*0.10;
    gh+=vec3(1.0,0.85,0.4)*ghost(uv,sunUV+ax*2.1,0.045,0.35)*0.22;
    gh+=vec3(0.5,0.7,1.0)*ghost(uv,sunUV-ax*0.35,0.018,0.5)*0.25;
    /* ghosts are strongest when the sun is near the centre of the frame */
    gh*=smoothstep(0.85,0.1,length(ax));
    col+=(g+gh)*s*1.3;
    /* windscreen grime catches the light */
    if(cockpit>0.5){
      float dirt=texture2D(tDirt,uv).r;
      col+=warm*dirt*s*(exp(-r*1.3)*4.0+0.35)*1.2;
      col+=warm*dirt*veil*0.2;
    }
    /* veiling glare: stray light lifts the blacks and washes out colour */
    float v=veil;
    float lum=dot(col,vec3(0.2126,0.7152,0.0722));
    col=mix(col,vec3(lum),v*0.3)+warm*v*0.22;
    col*=exposure;
    col=aces(col);
    /* vignette and a little grain */
    col*=1.0-0.38*smoothstep(0.18,0.75,r2*1.6);
    col+=(h12(uv*vec2(1733.0,977.0)+time)-0.5)*0.012;
    col=pow(max(col,0.0),vec3(1.0/2.2));
    gl_FragColor=vec4(col,1.0);
  }`
};

function build(){
  if(composer){composer.renderTarget1.dispose();composer.renderTarget2.dispose();}
  composer=new EffectComposer(renderer,makeRT());
  composer.addPass(new RenderPass(scene,camera));
  bloom=new UnrealBloomPass(new THREE.Vector2(W(),H()),0.55,0.6,1.2);
  bloom.enabled=high;
  composer.addPass(bloom);
  final=final||new ShaderPass(FinalShader);
  composer.addPass(final);
  resize();
}
function resize(){composer.setPixelRatio(renderer.getPixelRatio());composer.setSize(W(),H());bloom.resolution.set(W(),H());final.uniforms.aspect.value=W()/H();}
window.addEventListener('resize',resize);
function applyQuality(){
  renderer.setPixelRatio(high?Math.min(window.devicePixelRatio||1,1.75):Math.min(window.devicePixelRatio||1,1)*0.85);
  const size=high?4096:1536;
  if(sun.shadow.mapSize.x!==size){sun.shadow.mapSize.set(size,size);if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null;}}
  setTreeQuality(high);
  build();
  const b=document.getElementById('quality');if(b)b.textContent='Quality: '+(high?'High':'Low');
}
export function toggleQuality(){high=!high;try{localStorage.setItem('ring-quality',high?'high':'low');}catch(e){}applyQuality();}
applyQuality();
document.getElementById('quality')?.addEventListener('click',toggleQuality);

/* ---------------- per frame ---------------- */
const tmp=new THREE.Vector3(),fwd=new THREE.Vector3();
let expo=1.0,visS=0,veilS=0;
export function render(dt,o){
  const U=final.uniforms;
  camera.updateMatrixWorld();
  camera.getWorldDirection(fwd);
  tmp.copy(camera.position).addScaledVector(sunDir,5000).project(camera);
  const facing=fwd.dot(sunDir);
  /* on screen (with a margin so the glow fades as the sun leaves the frame) */
  const off=Math.max(Math.abs(tmp.x),Math.abs(tmp.y));
  const on=facing>0?clamp((1.35-off)/0.35,0,1):0;
  visS+=(o.sunVis-visS)*Math.min(1,dt*18);
  U.sunUV.value.set(tmp.x*0.5+0.5,tmp.y*0.5+0.5);
  U.sunVis.value=visS;U.sunOn.value=on;
  /* stray light even with the sun a little out of frame */
  const vTarget=visS*Math.pow(Math.max(0,facing),10)*0.9;
  veilS+=(vTarget-veilS)*Math.min(1,dt*4);
  U.veil.value=veilS;
  /* eye / camera adapts: stops down when looking into the sun */
  const target=1.05*(1-0.32*veilS*1.4)-(o.cockpit?0.05:0);
  expo+=(target-expo)*Math.min(1,dt*1.6);
  U.exposure.value=expo;
  U.cockpit.value=o.cockpit?1:0;
  U.time.value+=dt;
  U.blur.value=high&&o.blur?o.blur:0;
  composer.render(dt);
}
