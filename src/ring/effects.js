import * as THREE from 'three';
import {scene,lin,tex} from './core.js';

/* ---------------- skid marks: ring buffer of quads laid on the road ---------------- */
const MAXQ=6000;
const skPos=new Float32Array(MAXQ*4*3),skCol=new Float32Array(MAXQ*4*4);
const skGeo=new THREE.BufferGeometry();
skGeo.setAttribute('position',new THREE.BufferAttribute(skPos,3).setUsage(THREE.DynamicDrawUsage));
skGeo.setAttribute('color',new THREE.BufferAttribute(skCol,4).setUsage(THREE.DynamicDrawUsage));
{const idx=new Uint32Array(MAXQ*6);for(let q=0;q<MAXQ;q++){const a=q*4;idx.set([a,a+1,a+2,a+2,a+1,a+3],q*6);}skGeo.setIndex(new THREE.BufferAttribute(idx,1));}
const skMesh=new THREE.Mesh(skGeo,new THREE.ShaderMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-6,polygonOffsetUnits:-6,
  vertexShader:'attribute vec4 color;varying vec4 vC;void main(){vC=color;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:'varying vec4 vC;void main(){gl_FragColor=vC;}'}));
skMesh.frustumCulled=false;scene.add(skMesh);
let skHead=0;
const last=new Map();
function addSkid(key,x,y,z,nx,nz,alpha,w,col){
  const prev=last.get(key);last.set(key,{x,y,z,t:performance.now()});
  if(!prev||performance.now()-prev.t>120)return;
  const dx=x-prev.x,dz=z-prev.z,l=Math.hypot(dx,dz);if(l<0.15||l>3)return;
  const px=-dz/l*w/2,pz=dx/l*w/2;
  const q=skHead;skHead=(skHead+1)%MAXQ;
  skPos.set([prev.x+px,prev.y+0.02,prev.z+pz,prev.x-px,prev.y+0.02,prev.z-pz,x+px,y+0.02,z+pz,x-px,y+0.02,z-pz],q*12);
  for(let k=0;k<4;k++)skCol.set([col[0],col[1],col[2],alpha],q*16+k*4);
  skGeo.attributes.position.needsUpdate=true;skGeo.attributes.color.needsUpdate=true;
}
function breakSkid(key){last.delete(key);}

/* ---------------- particles: tyre smoke, dust, sparks ---------------- */
const MAXP=900;
const pPos=new Float32Array(MAXP*3),pCol=new Float32Array(MAXP*4),pSize=new Float32Array(MAXP);
const parts=[];for(let i=0;i<MAXP;i++)parts.push({life:0});
const pGeo=new THREE.BufferGeometry();
pGeo.setAttribute('position',new THREE.BufferAttribute(pPos,3).setUsage(THREE.DynamicDrawUsage));
pGeo.setAttribute('color',new THREE.BufferAttribute(pCol,4).setUsage(THREE.DynamicDrawUsage));
pGeo.setAttribute('size',new THREE.BufferAttribute(pSize,1).setUsage(THREE.DynamicDrawUsage));
const puff=tex(64,64,(g,w,h)=>{const gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(0.5,'rgba(255,255,255,.45)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);},false);
const pMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{map:{value:puff},scale:{value:600}},
  vertexShader:'attribute vec4 color;attribute float size;uniform float scale;varying vec4 vC;void main(){vC=color;vec4 mv=modelViewMatrix*vec4(position,1.0);gl_PointSize=size*scale/max(-mv.z,0.5);gl_Position=projectionMatrix*mv;}',
  fragmentShader:'uniform sampler2D map;varying vec4 vC;void main(){vec4 t=texture2D(map,gl_PointCoord);gl_FragColor=vec4(vC.rgb,vC.a*t.a);}'});
const pts=new THREE.Points(pGeo,pMat);pts.frustumCulled=false;pts.renderOrder=5;scene.add(pts);
let pHead=0;
function spawn(x,y,z,vx,vy,vz,size,grow,life,col,alpha,drag=1.2,grav=0){
  const p=parts[pHead];pHead=(pHead+1)%MAXP;
  Object.assign(p,{x,y,z,vx,vy,vz,size,grow,life,max:life,col,alpha,drag,grav});
}
export function spark(x,y,z,vx,vz,n){for(let k=0;k<n;k++)spawn(x,y,z,vx*0.6+(Math.random()-.5)*6,1+Math.random()*3,vz*0.6+(Math.random()-.5)*6,0.06,0,0.35+Math.random()*0.3,[6,3.2,1.2],1,0.6,9.8);}

const SMOKE=[0.85,0.84,0.82],DUST=[0.55,0.47,0.36],GRASS=[0.35,0.4,0.25];
export function updateEffects(dt,cars,visList,camPos){
  /* emit */
  cars.forEach((e,ci)=>{
    const c=e.car,v=visList[ci];if(!v)return;
    const dx=c.x-camPos.x,dz=c.z-camPos.z;const near=dx*dx+dz*dz<250*250;
    c.wheels.forEach((w,k)=>{
      const key=ci*4+k;
      const ch=Math.cos(c.h),sh=Math.sin(c.h);
      const x=c.x+ch*w.x-sh*w.y,z=c.z+sh*w.x+ch*w.y,y=c.y;
      const slipV=Math.hypot(w.w*w.r-(c.u-c.r*w.y),0)+Math.abs(Math.sin(w.sa))*c.speed;
      const sliding=w.slip>1.25&&w.load>500&&c.speed>2;
      if(w.surf===0||w.surf===1){
        if(sliding&&near){addSkid(key,x,y,z,0,0,Math.min(0.55,(w.slip-1.1)*0.35),w.front?0.26:0.31,[0.04,0.04,0.045]);}
        else breakSkid(key);
        if(sliding&&near&&slipV>4&&Math.random()<dt*60*Math.min(1,(w.slip-1.2)*0.6)){
          spawn(x,y+0.25,z,c.vx*0.25+(Math.random()-.5),0.4+Math.random()*0.6,c.vz*0.25+(Math.random()-.5),0.7,2.2,1.6+Math.random()*1.2,SMOKE,Math.min(0.5,0.12+(w.slip-1.2)*0.1),1.6);
        }
      }else{
        breakSkid(key);
        if(near&&c.speed>4&&Math.random()<dt*40){
          const col=w.surf===3?DUST:GRASS;
          spawn(x,y+0.2,z,c.vx*0.2+(Math.random()-.5)*2,0.6+Math.random()*1.5,c.vz*0.2+(Math.random()-.5)*2,0.6,2.6,1.4+Math.random(),col,w.surf===3?0.5:0.3,1.4);
        }
      }
    });
    if(e.wall>2&&near){spark(c.x,c.y+0.35,c.z,c.vx,c.vz,Math.min(14,e.wall*2));}
    if(e.contact>1.5&&near&&Math.random()<0.5){spark(c.x,c.y+0.4,c.z,c.vx,c.vz,4);}
  });
  /* simulate */
  for(let i=0;i<MAXP;i++){
    const p=parts[i];
    if(p.life>0){
      p.life-=dt;const f=Math.exp(-p.drag*dt);p.vx*=f;p.vz*=f;p.vy=p.vy*f-p.grav*dt+(p.grav?0:0.25*dt);
      p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.size+=p.grow*dt;
      const a=p.alpha*Math.min(1,p.life/p.max*2)*(p.grav?1:Math.min(1,(p.max-p.life)*6));
      pPos[i*3]=p.x;pPos[i*3+1]=p.y;pPos[i*3+2]=p.z;
      pCol[i*4]=p.col[0];pCol[i*4+1]=p.col[1];pCol[i*4+2]=p.col[2];pCol[i*4+3]=Math.max(0,a);pSize[i]=p.size;
    }else{pCol[i*4+3]=0;pSize[i]=0;}
  }
  pGeo.attributes.position.needsUpdate=pGeo.attributes.color.needsUpdate=pGeo.attributes.size.needsUpdate=true;
  pMat.uniforms.scale.value=window.innerHeight*0.9;
}
export function clearEffects(){skCol.fill(0);skGeo.attributes.color.needsUpdate=true;parts.forEach(p=>p.life=0);last.clear();}
