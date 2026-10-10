import * as THREE from 'three';
import {clamp,camera} from './core.js';
import {S,SIDE,ds,mod,EDGE,corners,VMAX,K,lerpArr} from './track.js';
import {player} from './bikes.js';

/* ---------------- cameras ---------------- */
let camMode='chase',camInit=false;
const camPos=new THREE.Vector3(),camLook=new THREE.Vector3();
const tmp=new THREE.Vector3(),fwd=new THREE.Vector3(),look=new THREE.Vector3(),up=new THREE.Vector3();
const bFwd=new THREE.Vector3(),bUp=new THREE.Vector3(),WUP=new THREE.Vector3(0,1,0);
let headYaw=0,riderHidden=false;
/* hide the player's own head in first person so the helmet shell doesn't fill the view */
function hideHead(h){if(h===riderHidden)return;riderHidden=h;player.helmet.visible=!h;player.rig.parts.neck.visible=!h;}
const spots=[];
corners.forEach(c=>{const i=mod(c.ip),p=S[i],sd=SIDE[i],o=-c.sg*(EDGE+21);
  spots.push(new THREE.Vector3(p.x+sd[0]*o,p.y+4.5,p.z+sd[1]*o));});
[mod(Math.round(120/ds))].forEach(i=>{const p=S[i],sd=SIDE[i],o=EDGE+20;spots.push(new THREE.Vector3(p.x+sd[0]*o,p.y+6,p.z+sd[1]*o));});
function setCam(m){
  camMode=m;camInit=false;
  document.querySelectorAll('.cams button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.cam===m)));
}
let shakeT=0;
function updateCamera(dt){
  const P=player.g.position,sp=clamp(player.v/VMAX,0,1);
  fwd.set(Math.sin(player.g.rotation.y),0,Math.cos(player.g.rotation.y));
  const a=camInit?1-Math.exp(-dt*5):1;
  camera.up.set(0,1,0);
  let fov=62;
  if(camMode==='chase'){
    tmp.copy(P).addScaledVector(fwd,-6.2);tmp.y+=2.2;
    look.copy(P).addScaledVector(fwd,6);look.y+=1.0;
    camPos.lerp(tmp,a);camLook.lerp(look,camInit?1-Math.exp(-dt*9):1);
    fov=58+12*sp;
    bUp.set(0,1,0).applyQuaternion(player.g.quaternion);camera.up.copy(WUP).lerp(bUp,0.25).normalize();
  }else if(camMode==='onboard'){
    /* rider's eyes: just behind the visor, looking ~24 deg down so the bars, mirrors and speedo are in view; the head counter-leans
       a little, nods with brake dive and turns toward the corner ahead */
    bFwd.set(0,0,1).applyQuaternion(player.g.quaternion);bUp.set(0,1,0).applyQuaternion(player.g.quaternion);
    player.helmet.getWorldPosition(tmp);tmp.addScaledVector(bFwd,0.06).addScaledVector(bUp,0.03);
    const vib=0.0025*sp*sp+0.0008*sp;shakeT+=dt;
    tmp.addScaledVector(bUp,Math.sin(shakeT*37)*vib+Math.sin(shakeT*11.3)*vib*0.6);
    camPos.copy(tmp);
    const yawT=clamp(lerpArr(K,player.s+22)*22,-0.14,0.14);
    headYaw+=(yawT-headYaw)*(1-Math.exp(-dt*3));
    look.copy(bFwd).applyAxisAngle(WUP,headYaw).multiplyScalar(Math.cos(0.42)).addScaledVector(bUp,-Math.sin(0.42));
    camLook.copy(camPos).addScaledVector(look,10);
    camera.up.copy(WUP).lerp(bUp,0.7).normalize();fov=90;
  }else if(camMode==='trackside'){
    let best=spots[0],bd=Infinity;spots.forEach(s=>{const d=s.distanceToSquared(P);if(d<bd){bd=d;best=s;}});
    camPos.copy(best);look.copy(P);look.y+=0.8;
    camLook.lerp(look,camInit?1-Math.exp(-dt*10):1);
    fov=clamp(2*Math.atan(6/Math.sqrt(bd))*180/Math.PI,9,40);
  }else{
    tmp.copy(P).addScaledVector(fwd,-36);tmp.y+=52;
    camPos.lerp(tmp,camInit?1-Math.exp(-dt*2):1);camLook.lerp(P,a);fov=48;
  }
  camInit=true;
  hideHead(camMode==='onboard');
  if(Math.abs(camera.fov-fov)>0.05){camera.fov+=(fov-camera.fov)*(camMode==='trackside'?1:1-Math.exp(-dt*3));camera.updateProjectionMatrix();}
  camera.position.copy(camPos);
  if(camMode==='chase'){shakeT+=dt;const s=0.015*sp*sp;camera.position.x+=Math.sin(shakeT*41)*s;camera.position.y+=Math.sin(shakeT*53+1)*s;}
  camera.lookAt(camLook);
}

document.querySelectorAll('.cams button').forEach(b=>b.addEventListener('click',()=>setCam(b.dataset.cam)));
const modes=['chase','onboard','trackside','aerial'];
window.addEventListener('keydown',e=>{if(e.key==='c'||e.key==='C')setCam(modes[(modes.indexOf(camMode)+1)%modes.length]);});
const snapCamera=()=>{camInit=false;};
const camModeNow=()=>camMode;
export {updateCamera,setCam,snapCamera,camModeNow};
