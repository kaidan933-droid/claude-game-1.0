import * as THREE from 'three';
import {rnd,sstep,lin,scene,tex,std,HORIZON} from './core.js';
import {grassTex,S,N,mod,EDGE,AVGY,keepClear} from './track.js';

/* ---------------- terrain ---------------- */
function nearest(x,z){
  let bi=0,bd=Infinity;
  for(let i=0;i<N;i+=4){const dx=S[i].x-x,dz=S[i].z-z,d=dx*dx+dz*dz;if(d<bd){bd=d;bi=i;}}
  for(let j=bi-4;j<=bi+4;j++){const i=mod(j),dx=S[i].x-x,dz=S[i].z-z,d=dx*dx+dz*dz;if(d<bd){bd=d;bi=i;}}
  return {i:bi,d:Math.sqrt(bd)};
}
const natural=(x,z)=>11*Math.sin(x*0.0058+1.3)*Math.cos(z*0.0049-0.4)+6*Math.sin(x*0.0121+z*0.0107)+2.4*Math.sin(x*0.029-z*0.026)+1.1*Math.sin(z*0.051+x*0.013)+3;
const FLAT=EDGE+36;
function groundH(x,z,n){
  n=n||nearest(x,z);const ty=S[n.i].y;
  const f=sstep(FLAT,FLAT+110,n.d),g=sstep(220,700,n.d);
  return ty*(1-g)+AVGY*g-0.18+f*natural(x,z);
}
let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
S.forEach(p=>{minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);});
const CX=(minX+maxX)/2,CZ=(minZ+maxZ)/2;
(function(){
  const TS=3400,SEG=340;
  const geo=new THREE.PlaneGeometry(TS,TS,SEG,SEG);geo.rotateX(-Math.PI/2);geo.translate(CX,0,CZ);
  const pos=geo.attributes.position,col=new Float32Array(pos.count*3),uv=geo.attributes.uv;
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),z=pos.getZ(i),n=nearest(x,z);
    pos.setY(i,groundH(x,z,n));
    const p1=Math.sin(x*0.021+z*0.013)*0.5+Math.sin(x*0.047-z*0.039)*0.3+Math.sin(z*0.009+1)*0.4;
    const dry=sstep(0.2,1.0,p1),mown=1-sstep(FLAT,FLAT+40,n.d);
    const stripe=(Math.floor((x+z*0.3)/9)%2===0)?1:0.93;
    const s=0.82+0.18*Math.sin(x*0.07)*Math.sin(z*0.06);
    col[i*3]=(s+dry*0.22)*(mown?stripe:1);col[i*3+1]=(s+dry*0.08)*(mown?stripe:1);col[i*3+2]=(s-dry*0.05)*(mown?stripe:1);
  }
  geo.setAttribute('color',new THREE.BufferAttribute(col,3));geo.computeVertexNormals();
  const m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({map:grassTex,vertexColors:true,roughness:0.97}));
  m.receiveShadow=true;scene.add(m);
})();

/* distant mountains with aerial haze baked in */
(function(){
  for(let i=0;i<26;i++){
    const a=i/26*Math.PI*2+rnd()*0.15,r=1500+rnd()*500;
    const c=lin(i%3?0x6d6888:0x5f6a62).lerp(HORIZON,0.45+rnd()*0.15);
    const m=new THREE.Mesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshStandardMaterial({color:c,flatShading:true,fog:false,roughness:1}));
    m.scale.set(260+rnd()*260,110+rnd()*230,260+rnd()*260);m.position.set(CX+Math.cos(a)*r,-30,CZ+Math.sin(a)*r);scene.add(m);
  }
})();

/* clouds */
(function(){
  const ct=tex(256,128,(g,w,h)=>{g.clearRect(0,0,w,h);for(let i=0;i<26;i++){const x=40+rnd()*176,y=50+rnd()*40,r=18+rnd()*34;
    const gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,'rgba(255,255,255,.55)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,w,h);}});
  ct.wrapS=ct.wrapT=THREE.ClampToEdgeWrapping;
  for(let i=0;i<22;i++){
    const a=rnd()*Math.PI*2,r=1800+rnd()*900;
    const mat=new THREE.SpriteMaterial({map:ct,color:lin(0xffe0c4).lerp(lin(0xd59a9a),rnd()*0.6),fog:false,depthWrite:false,transparent:true,opacity:0.55+rnd()*0.35});
    const sp=new THREE.Sprite(mat);sp.scale.set(700+rnd()*700,220+rnd()*160,1);sp.position.set(CX+Math.cos(a)*r,260+rnd()*420,CZ+Math.sin(a)*r);sp.renderOrder=-5;scene.add(sp);
  }
})();

/* trees and bushes */
(function(){
  const pineLow=new THREE.ConeGeometry(2.7,5.2,9);pineLow.translate(0,4.0,0);
  const pineTop=new THREE.ConeGeometry(1.8,4.4,9);pineTop.translate(0,7.4,0);
  const blob=new THREE.IcosahedronGeometry(2.9,1);
  {const p=blob.attributes.position;for(let i=0;i<p.count;i++){const k=0.82+rnd()*0.3;p.setXYZ(i,p.getX(i)*k,p.getY(i)*k*0.85,p.getZ(i)*k);}blob.computeVertexNormals();}
  blob.translate(0,4.6,0);
  const blob2=blob.clone();blob2.scale(0.65,0.65,0.65);blob2.translate(1.4,2.4,0.8);
  const trunkG=new THREE.CylinderGeometry(0.2,0.35,3.2,7);trunkG.translate(0,1.4,0);
  const bushG=new THREE.IcosahedronGeometry(1.2,1);bushG.translate(0,0.6,0);
  const MAX=1400;
  const leafMat=new THREE.MeshStandardMaterial({flatShading:true,roughness:0.9});
  const trunks=new THREE.InstancedMesh(trunkG,std(0x4f3726,0.95),MAX);
  const pl=new THREE.InstancedMesh(pineLow,leafMat,MAX),pt=new THREE.InstancedMesh(pineTop,leafMat,MAX);
  const b1=new THREE.InstancedMesh(blob,leafMat,MAX),b2=new THREE.InstancedMesh(blob2,leafMat,MAX);
  const bush=new THREE.InstancedMesh(bushG,leafMat,600);
  const d=new THREE.Object3D();
  const pineCols=[0x2c5233,0x37633a,0x264a2d,0x40693a],leafCols=[0x5a8538,0x6f913b,0xa98336,0x67873f,0xb7693a,0x4f7a34];
  let nt=0,np=0,nb=0,nbu=0,tries=0;
  const clearOf=(x,z)=>keepClear.every(k=>Math.hypot(x-k[0],z-k[1])>k[2]);
  while(nt<MAX&&tries<12000){tries++;
    // cluster trees into woods
    const cx=CX-650+rnd()*1300,cz=CZ-560+rnd()*1120;
    const wood=Math.sin(cx*0.011)*Math.cos(cz*0.009)+Math.sin((cx+cz)*0.006);
    if(wood<0.1&&rnd()<0.75)continue;
    const n=nearest(cx,cz);if(n.d<FLAT+4||!clearOf(cx,cz))continue;
    const y=groundH(cx,cz,n),s=0.8+rnd()*0.75;
    d.position.set(cx,y-0.2,cz);d.rotation.set(0,rnd()*6.28,0);d.scale.set(s,s*(0.85+rnd()*0.45),s);d.updateMatrix();
    trunks.setMatrixAt(nt++,d.matrix);
    if(rnd()<0.55){pl.setMatrixAt(np,d.matrix);pt.setMatrixAt(np,d.matrix);const c=lin(pineCols[(rnd()*4)|0]);pl.setColorAt(np,c);pt.setColorAt(np,c);np++;}
    else{b1.setMatrixAt(nb,d.matrix);b2.setMatrixAt(nb,d.matrix);const c=lin(leafCols[(rnd()*6)|0]);b1.setColorAt(nb,c);b2.setColorAt(nb,c.clone().multiplyScalar(0.9));nb++;}
  }
  tries=0;
  while(nbu<600&&tries<6000){tries++;const x=CX-500+rnd()*1000,z=CZ-450+rnd()*900;const n=nearest(x,z);
    if(n.d<FLAT+1||n.d>FLAT+90||!clearOf(x,z))continue;const s=0.6+rnd()*1.1;
    d.position.set(x,groundH(x,z,n)-0.2,z);d.rotation.set(0,rnd()*6.28,0);d.scale.set(s,s*0.8,s);d.updateMatrix();
    bush.setMatrixAt(nbu,d.matrix);bush.setColorAt(nbu++,lin([0x3f6a2f,0x55773a,0x6a7d3a][(rnd()*3)|0]));}
  trunks.count=nt;pl.count=pt.count=np;b1.count=b2.count=nb;bush.count=nbu;
  [trunks,pl,pt,b1,b2,bush].forEach(m=>{m.castShadow=true;m.receiveShadow=true;scene.add(m);});
})();
export {nearest,groundH,FLAT};
