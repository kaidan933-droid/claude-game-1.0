import * as THREE from 'three';
import {camera,clamp} from './core.js';
import {T} from './sim/world.js';
import {DRIVER_EYE} from './carmodel.js';
import {groundAt} from './scenery.js';

/* chase / close chase / bonnet / cockpit / TV / helicopter */
export const MODES=['chase','near','bonnet','cockpit','tv','heli'];
export const LABEL={chase:'Chase',near:'Close',bonnet:'Bonnet',cockpit:'Cockpit',tv:'TV',heli:'Heli'};
let mode='chase',init=false;
try{const m=localStorage.getItem('ring-cam');if(MODES.includes(m))mode=m;}catch(e){}
const pos=new THREE.Vector3(),look=new THREE.Vector3(),tmp=new THREE.Vector3(),fwd=new THREE.Vector3(),up=new THREE.Vector3(),WUP=new THREE.Vector3(0,1,0);
const eye=new THREE.Vector3();
let lookBack=false,headX=0,headY=0,headYaw=0,shake=0,fov=60;
/* trackside camera spots every ~180 m, outside the barrier, a few metres up */
const spots=[];
for(let s=60;s<T.LEN;s+=180+((s*7)%60)){
  const i=T.idx(s),side=T.K[T.idx(s+60)]>0?-1:1,bar=side>0?T.BAR_R[i]:T.BAR_L[i],o=side*(bar+3);
  const x=T.X[i]+T.NX[i]*o,z=T.Z[i]+T.NZ[i]*o;
  spots.push({s,p:new THREE.Vector3(x,Math.max(groundAt(x,z),T.Y[i])+3.5+(s%3),z)});
}
export function setMode(m){mode=m;init=false;try{localStorage.setItem('ring-cam',m);}catch(e){}
  document.querySelectorAll('[data-cam]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.cam===m)));
  const lbl=document.getElementById('camName');if(lbl)lbl.textContent=LABEL[m];}
export const camMode=()=>mode;
export function cycle(){setMode(MODES[(MODES.indexOf(mode)+1)%MODES.length]);}
export function setLookBack(b){lookBack=b;}
export function snap(){init=false;}

export function updateCamera(dt,e,vis){
  const c=e.car,root=vis.root,body=vis.body;
  const P=root.position;
  fwd.set(Math.cos(c.h),0,Math.sin(c.h));
  const sp=clamp(c.speed/80,0,1);
  const k=init?1-Math.exp(-dt*6):1;
  camera.up.set(0,1,0);
  let tf=60;
  shake+=dt;
  if(mode==='chase'||mode==='near'){
    const far=mode==='chase';
    const back=lookBack?-1:1;
    const dist=far?6.4:4.6,hgt=far?1.95:1.45;
    /* the camera trails the velocity a little so slides show */
    const vx=c.vx,vz=c.vz,vl=Math.hypot(vx,vz);
    if(vl>3){tmp.set(vx/vl,0,vz/vl);fwd.lerp(tmp,0.25).normalize();}
    tmp.copy(P).addScaledVector(fwd,-dist*back);tmp.y+=hgt;
    const gy=groundAt(tmp.x,tmp.z)+0.6;if(tmp.y<gy)tmp.y=gy;
    pos.lerp(tmp,init?1-Math.exp(-dt*(far?7:10)):1);
    /* keep the distance tight at speed */
    tmp.subVectors(pos,P);const L=tmp.length(),want=Math.hypot(dist,hgt);
    if(L>want*1.25)pos.copy(P).addScaledVector(tmp,want*1.25/L);
    look.copy(P).addScaledVector(fwd,(far?4:3.2)*back);look.y+=far?0.85:0.75;
    tf=(far?56:62)+10*sp;
    camera.position.copy(pos);
    camera.position.y+=Math.sin(shake*31)*0.012*sp*sp;
    camera.lookAt(look);
  }else if(mode==='bonnet'||mode==='cockpit'){
    root.updateMatrixWorld(true);
    if(mode==='bonnet')eye.set(0,1.02,0.55);else eye.copy(DRIVER_EYE);
    /* head pushed around by g-forces, a little ahead into corners */
    const hx=clamp(-c.ayF*0.004,-0.05,0.05),hy=clamp(c.axF*0.0025,-0.035,0.035);
    headX+=(hx-headX)*Math.min(1,dt*6);headY+=(hy-headY)*Math.min(1,dt*6);
    if(mode==='cockpit'){eye.x+=headX;eye.z+=-headY;}
    camera.position.copy(eye).applyMatrix4(body.matrixWorld);
    const vib=(0.0016+0.0022*sp*sp)*(mode==='cockpit'?1:0.6);
    camera.position.y+=Math.sin(shake*47)*vib+Math.sin(shake*13.3)*vib*0.5+(c.landing||0)*0.02*Math.sin(shake*60);
    const yawT=lookBack?Math.PI:clamp(T.lerp(T.K,e.s+18)*-14,-0.22,0.22)*(mode==='cockpit'?1:0.4);
    headYaw+=(yawT-headYaw)*Math.min(1,dt*(lookBack?12:3));
    tmp.set(Math.sin(headYaw),mode==="cockpit"?-0.015:-0.06,Math.cos(headYaw)).applyQuaternion(body.getWorldQuaternion(new THREE.Quaternion()));
    look.copy(camera.position).addScaledVector(tmp,10);
    up.set(0,1,0).applyQuaternion(body.getWorldQuaternion(new THREE.Quaternion()));
    camera.up.copy(WUP).lerp(up,0.85).normalize();
    tf=mode==='cockpit'?72:64;
    camera.lookAt(look);
  }else if(mode==='tv'){
    /* nearest spot ahead or just passed */
    let best=spots[0],bd=Infinity;
    for(const q of spots){let ds=q.s-e.s;if(ds<-T.LEN/2)ds+=T.LEN;if(ds>T.LEN/2)ds-=T.LEN;if(ds>-90&&ds<160){const d=Math.abs(ds-30);if(d<bd){bd=d;best=q;}}}
    camera.position.copy(best.p);
    look.copy(P);look.y+=0.7;
    const d=best.p.distanceTo(P);
    tf=clamp(2*Math.atan(7/d)*180/Math.PI,7,45);
    camera.lookAt(look);
  }else{
    tmp.copy(P).addScaledVector(fwd,-40);tmp.y+=46;
    pos.lerp(tmp,init?1-Math.exp(-dt*1.5):1);
    camera.position.copy(pos);camera.lookAt(P);tf=50;
  }
  init=true;
  fov+=(tf-fov)*(mode==='tv'?1:Math.min(1,dt*3));
  if(Math.abs(camera.fov-fov)>0.01){camera.fov=fov;camera.updateProjectionMatrix();}
  /* hide our own roof and cabin from inside */
  const inside=mode==='cockpit';
  vis.cab.visible=!inside;vis.shell.visible=true;
  vis.inner.visible=inside;if(vis.interior)vis.interior.visible=inside;
}
document.querySelectorAll('[data-cam]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.cam)));
setTimeout(()=>setMode(mode),0);
