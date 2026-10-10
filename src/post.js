import * as THREE from 'three';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {ShaderPass} from 'three/examples/jsm/postprocessing/ShaderPass.js';
import {GammaCorrectionShader} from 'three/examples/jsm/shaders/GammaCorrectionShader.js';
import {renderer,scene,camera,sun} from './core.js';

/* High quality: multisampled HDR render -> bloom on bright lights -> speed blur -> sRGB.
   Low quality: plain render straight to the screen, smaller shadow map. */
const W=()=>window.innerWidth,H=()=>window.innerHeight;
const gl2=renderer.capabilities.isWebGL2;
const rtOpts={type:THREE.HalfFloatType,format:THREE.RGBAFormat};
const rt=gl2?new THREE.WebGLMultisampleRenderTarget(W(),H(),rtOpts):new THREE.WebGLRenderTarget(W(),H(),rtOpts);
const composer=new EffectComposer(renderer,rt);
composer.addPass(new RenderPass(scene,camera));
const bloom=new UnrealBloomPass(new THREE.Vector2(W(),H()),0.5,0.45,0.86);
composer.addPass(bloom);
/* radial blur toward the vanishing point, only noticeable near top speed */
const speedBlur=new ShaderPass({
  uniforms:{tDiffuse:{value:null},amount:{value:0},center:{value:new THREE.Vector2(0.5,0.62)}},
  vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:`uniform sampler2D tDiffuse;uniform float amount;uniform vec2 center;varying vec2 vUv;
    void main(){vec2 d=vUv-center;float r=length(d);vec4 c=vec4(0.0);
      float k=amount*smoothstep(0.15,0.7,r);
      for(int i=0;i<8;i++){c+=texture2D(tDiffuse,vUv-d*k*float(i)/7.0);}
      gl_FragColor=c/8.0;}`
});
composer.addPass(speedBlur);
composer.addPass(new ShaderPass(GammaCorrectionShader));

let high=true;
try{high=localStorage.getItem('apex-quality')!=='low';}catch(e){}
function applyQuality(){
  const size=high?2048:1024;
  if(sun.shadow.mapSize.x!==size){sun.shadow.mapSize.set(size,size);if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null;}}
  const b=document.getElementById('quality');if(b)b.textContent='Quality: '+(high?'High':'Low');
}
export function toggleQuality(){high=!high;try{localStorage.setItem('apex-quality',high?'high':'low');}catch(e){}applyQuality();}
function resize(){composer.setPixelRatio(renderer.getPixelRatio());composer.setSize(W(),H());bloom.resolution.set(W(),H());}
window.addEventListener('resize',resize);resize();applyQuality();
document.getElementById('quality')?.addEventListener('click',toggleQuality);

/* blur: 0 below ~70% of top speed, up to `max` flat out */
export function render(speedFrac,blurOn){
  if(!high){renderer.render(scene,camera);return;}
  speedBlur.uniforms.amount.value=blurOn?Math.max(0,speedFrac-0.7)/0.3*0.035:0;
  speedBlur.enabled=speedBlur.uniforms.amount.value>0.001;
  composer.render();
}
