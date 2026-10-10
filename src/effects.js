import * as THREE from 'three';
import {scene,lin} from './core.js';

/* Tyre marks, dust and sparks. Everything is pooled: marks are a ring buffer of instanced
   quads, particles are two fixed-size point clouds. */
const MARKS=1600;
const markGeo=new THREE.PlaneGeometry(0.11,0.42);markGeo.rotateX(-Math.PI/2);
const marks=new THREE.InstancedMesh(markGeo,new THREE.MeshBasicMaterial({color:0x0b0b0d,transparent:true,opacity:0.42,depthWrite:false,
  polygonOffset:true,polygonOffsetFactor:-2}),MARKS);
marks.count=0;marks.frustumCulled=false;marks.renderOrder=1;scene.add(marks);
let markHead=0;
const _o=new THREE.Object3D();
function addMark(x,y,z,yaw){
  _o.position.set(x,y,z);_o.rotation.set(0,yaw,0);_o.updateMatrix();
  marks.setMatrixAt(markHead,_o.matrix);markHead=(markHead+1)%MARKS;
  marks.count=Math.min(MARKS,marks.count+1);marks.instanceMatrix.needsUpdate=true;
}

function cloud(n,size,additive){
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*3).fill(-9999),3));
  geo.setAttribute('color',new THREE.BufferAttribute(new Float32Array(n*3),3));
  const mat=new THREE.PointsMaterial({size,vertexColors:true,transparent:true,depthWrite:false,
    blending:additive?THREE.AdditiveBlending:THREE.NormalBlending,opacity:additive?1:0.55,toneMapped:!additive});
  const pts=new THREE.Points(geo,mat);pts.frustumCulled=false;scene.add(pts);
  return {pts,n,head:0,vel:new Float32Array(n*3),life:new Float32Array(n),max:new Float32Array(n),base:new Float32Array(n*3),grav:0};
}
const dust=cloud(900,0.35,false);dust.grav=-1.2;
const sparks=cloud(500,0.07,true);sparks.grav=-9.8;
function emit(c,x,y,z,vx,vy,vz,life,col){
  const i=c.head;c.head=(c.head+1)%c.n;
  const p=c.pts.geometry.attributes.position.array;p[i*3]=x;p[i*3+1]=y;p[i*3+2]=z;
  c.vel[i*3]=vx;c.vel[i*3+1]=vy;c.vel[i*3+2]=vz;c.life[i]=c.max[i]=life;
  c.base[i*3]=col.r;c.base[i*3+1]=col.g;c.base[i*3+2]=col.b;
}
function stepCloud(c,dt,drag){
  const p=c.pts.geometry.attributes.position.array,cl=c.pts.geometry.attributes.color.array;
  for(let i=0;i<c.n;i++){
    if(c.life[i]<=0)continue;
    c.life[i]-=dt;
    if(c.life[i]<=0){p[i*3+1]=-9999;continue;}
    const f=Math.exp(-drag*dt);c.vel[i*3]*=f;c.vel[i*3+2]*=f;c.vel[i*3+1]=c.vel[i*3+1]*f+c.grav*dt;
    p[i*3]+=c.vel[i*3]*dt;p[i*3+1]+=c.vel[i*3+1]*dt;p[i*3+2]+=c.vel[i*3+2]*dt;
    const k=c.life[i]/c.max[i];
    cl[i*3]=c.base[i*3]*k;cl[i*3+1]=c.base[i*3+1]*k;cl[i*3+2]=c.base[i*3+2]*k;
  }
  c.pts.geometry.attributes.position.needsUpdate=true;c.pts.geometry.attributes.color.needsUpdate=true;
}

const DUST=lin(0xb59a74),GRASS=lin(0x6d7f43),SPARK=new THREE.Color(4,2.2,0.7);
const fwd=new THREE.Vector3(),side=new THREE.Vector3(),tmp=new THREE.Vector3();
export function updateEffects(dt,riders){
  for(const r of riders){
    const g=r.g,yaw=g.rotation.y;
    fwd.set(Math.sin(yaw),0,Math.cos(yaw));side.set(Math.cos(yaw),0,-Math.sin(yaw));
    /* rear contact patch, nudged sideways by lean */
    tmp.copy(g.position).addScaledVector(fwd,-0.6).addScaledVector(side,-Math.sin(g.rotation.z)*0.06);
    r._mk=(r._mk||0)+r.v*dt;
    if((r.sliding||r.abs)&&r.v>3&&!r.rough&&r._mk>0.38){r._mk=0;addMark(tmp.x,tmp.y+0.012,tmp.z,yaw);}
    if(r.rough&&r.v>2){
      const n=Math.min(4,Math.ceil(r.v*dt*3)),col=r.surf==='grass'?GRASS:DUST;
      for(let k=0;k<n;k++)emit(dust,tmp.x+(Math.random()-0.5)*0.3,tmp.y+0.1,tmp.z+(Math.random()-0.5)*0.3,
        -fwd.x*r.v*0.15+(Math.random()-0.5)*1.5,0.8+Math.random()*1.6,-fwd.z*r.v*0.15+(Math.random()-0.5)*1.5,1+Math.random()*0.8,col);
    }
    if(r.knee&&Math.random()<0.6){
      /* knee slider on the inside of the lean */
      const sd=g.rotation.z>0?-1:1;
      tmp.copy(g.position).addScaledVector(fwd,0.05).addScaledVector(side,sd*0.5);
      for(let k=0;k<2;k++)emit(sparks,tmp.x,tmp.y+0.03,tmp.z,
        -fwd.x*r.v*0.6+(Math.random()-0.5)*1.5,0.4+Math.random()*1.2,-fwd.z*r.v*0.6+(Math.random()-0.5)*1.5,0.18+Math.random()*0.2,SPARK);
    }
    if(r.scrape){
      /* floorboard edge on the inside of the lean */
      const sd=g.rotation.z>0?-1:1;
      tmp.copy(g.position).addScaledVector(fwd,0.1).addScaledVector(side,sd*0.2);
      for(let k=0;k<3;k++)emit(sparks,tmp.x,tmp.y+0.03,tmp.z,
        -fwd.x*r.v*0.7+(Math.random()-0.5)*2+side.x*sd*1.5,0.6+Math.random()*1.8,-fwd.z*r.v*0.7+(Math.random()-0.5)*2+side.z*sd*1.5,0.25+Math.random()*0.25,SPARK);
    }
  }
  stepCloud(dust,dt,1.6);stepCloud(sparks,dt,0.8);
}
export function clearEffects(){marks.count=0;markHead=0;}
