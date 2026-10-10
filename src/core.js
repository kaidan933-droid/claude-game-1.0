import * as THREE from 'three';

let seed=20261006;
function rnd(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const sstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const lin=h=>new THREE.Color(h).convertSRGBToLinear();
const hexStr=h=>'#'+h.toString(16).padStart(6,'0');
/* ---------------- renderer ---------------- */
const canvas=document.getElementById('scene');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,logarithmicDepthBuffer:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.0;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;

const scene=new THREE.Scene();
const HORIZON=lin(0xf4ab7c).multiplyScalar(1.15);
scene.fog=new THREE.Fog(HORIZON.clone(),220,1500);
const camera=new THREE.PerspectiveCamera(62,1,0.05,6000);
function resize(){const w=window.innerWidth,h=window.innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
window.addEventListener('resize',resize);resize();

/* ---------------- sky ---------------- */
const sunDir=new THREE.Vector3(-0.52,0.34,-0.78).normalize();
function makeSky(radius){
  const m=new THREE.Mesh(new THREE.SphereGeometry(radius,32,16),new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,depthTest:false,fog:false,
    uniforms:{top:{value:lin(0x34457f)},horizon:{value:HORIZON},low:{value:lin(0xa98270)},sunCol:{value:lin(0xfff0c8)},sunDir:{value:sunDir}},
    vertexShader:'varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.0);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader:'uniform vec3 top;uniform vec3 horizon;uniform vec3 low;uniform vec3 sunCol;uniform vec3 sunDir;varying vec3 vW;'+
      'void main(){vec3 d=normalize(vW-cameraPosition);float h=d.y;'+
      'vec3 c=mix(horizon,top,pow(smoothstep(0.0,0.7,h),0.6));'+
      'c=mix(c,low,1.0-smoothstep(-0.12,0.0,h));'+
      'float s=max(dot(d,normalize(sunDir)),0.0);'+
      'c+=sunCol*(pow(s,900.0)*14.0+pow(s,18.0)*0.55+pow(s,3.0)*0.14);'+
      'gl_FragColor=vec4(c,1.0);\n#include <tonemapping_fragment>\n#include <encodings_fragment>\n}'
  }));
  m.frustumCulled=false;m.renderOrder=-10;return m;
}
const sky=makeSky(3200);scene.add(sky);

/* image-based lighting from the sky */
const pmrem=new THREE.PMREMGenerator(renderer);
const envScene=new THREE.Scene();envScene.add(makeSky(40));
scene.environment=pmrem.fromScene(envScene,0.04).texture;

/* ---------------- lights ---------------- */
scene.add(new THREE.HemisphereLight(lin(0xffe2c8),lin(0x55623a),0.18));
const sun=new THREE.DirectionalLight(lin(0xffcc9a),2.1);
sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera,{left:-60,right:60,top:60,bottom:-60,near:1,far:800});
sun.shadow.bias=-0.0004;sun.shadow.normalBias=0.02;
scene.add(sun);scene.add(sun.target);

const maxAniso=renderer.capabilities.getMaxAnisotropy();
function tex(w,h,draw,srgb){
  const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=maxAniso;
  if(srgb!==false)t.encoding=THREE.sRGBEncoding;return t;
}
function speckle(g,w,h,cols,n,size){for(let i=0;i<n;i++){g.fillStyle=cols[(rnd()*cols.length)|0];const s=rnd()*size+0.5;g.fillRect(rnd()*w,rnd()*h,s,s);}}

const std=(hex,rough,metal,extra)=>new THREE.MeshStandardMaterial(Object.assign({color:lin(hex),roughness:rough,metalness:metal||0},extra||{}));
const fmt=t=>{const m=Math.floor(t/60),s=t-m*60;return m+':'+(s<10?'0':'')+s.toFixed(3);};
export {fmt,rnd,clamp,sstep,lin,hexStr,renderer,scene,camera,sky,sunDir,sun,HORIZON,tex,speckle,std};
