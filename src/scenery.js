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
  return ty*(1-g)+AVGY*g-0.18+f*natural(x,z)*(0.3+0.7*sstep(250,900,n.d));   // flat around the circuit, rolling further out
}
let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
S.forEach(p=>{minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);});
const CX=(minX+maxX)/2,CZ=(minZ+maxZ)/2;
let groundMat=null,hills=null;
(function(){
  const TS=4600,SEG=380;
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
  groundMat=new THREE.MeshStandardMaterial({map:grassTex,vertexColors:true,roughness:0.97});
  const m=new THREE.Mesh(geo,groundMat);
  m.receiveShadow=true;scene.add(m);
})();

/* distant hills: a smooth ring of noise-shaped ridges, coloured from grass at the foot to hazy
   blue-grey at the crest so they read as far away (aerial perspective) */
(function(){
  const R0=1900,R1=3000,RS=320,RR=26;
  const ridge=a=>0.55+0.25*Math.sin(a*3+0.7)+0.15*Math.sin(a*7.3+2.1)+0.08*Math.sin(a*17.1)+0.05*Math.sin(a*31.7+1.3);
  const pos=[],col=[],idx=[],c=new THREE.Color();
  const foot=lin(0x6f7f4a),mid=lin(0x6e7266),haze=HORIZON.clone().multiplyScalar(0.92);
  for(let j=0;j<=RR;j++){
    const t=j/RR,r=R0+(R1-R0)*t;
    for(let i=0;i<RS;i++){
      const a=i/RS*Math.PI*2,hgt=ridge(a)*Math.sin(Math.PI*Math.min(1,t*1.25))*(220+180*Math.sin(a*2.1+0.4)**2);
      pos.push(CX+Math.cos(a)*r,AVGY-2+Math.max(0,hgt),CZ+Math.sin(a)*r);
      const k=Math.min(1,hgt/320);c.copy(foot).lerp(mid,k).lerp(haze,0.35+0.4*t);col.push(c.r,c.g,c.b);
    }
  }
  for(let j=0;j<RR;j++)for(let i=0;i<RS;i++){const a=j*RS+i,b=j*RS+(i+1)%RS,cc=a+RS,d=b+RS;idx.push(a,b,cc,b,d,cc);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setIndex(idx);g.computeVertexNormals();
  hills=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,fog:false}));scene.add(hills);
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
  /* lumpy but smooth canopies: subdivided spheres pushed in and out by a few sine lobes */
  const lumpy=(r,det,sy,seed)=>{const g=new THREE.IcosahedronGeometry(r,det),p=g.attributes.position,v=new THREE.Vector3();
    for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);const n=v.clone().normalize();
      const k=1+0.13*Math.sin(n.x*5+seed)*Math.sin(n.y*4+seed*2)+0.09*Math.sin(n.z*7+seed*3);
      p.setXYZ(i,v.x*k,v.y*k*sy,v.z*k);}
    g.computeVertexNormals();return g;};
  const pineLow=new THREE.ConeGeometry(2.7,5.2,16,3);pineLow.translate(0,4.0,0);
  const pineTop=new THREE.ConeGeometry(1.8,4.6,16,3);pineTop.translate(0,7.4,0);
  const blob=lumpy(2.9,3,0.85,1.3);blob.translate(0,4.6,0);
  const blob2=lumpy(1.9,2,0.85,4.1);blob2.translate(1.4,3.4,0.8);
  const cyp=lumpy(1.2,3,3.4,2.2);cyp.translate(0,4.6,0);                       // tall narrow cypress
  const trunkG=new THREE.CylinderGeometry(0.2,0.35,3.2,10);trunkG.translate(0,1.4,0);
  const bushG=lumpy(1.2,2,0.7,0.6);bushG.translate(0,0.6,0);
  const MAX=2400;
  const leafMat=new THREE.MeshStandardMaterial({roughness:0.86});
  const trunks=new THREE.InstancedMesh(trunkG,std(0x4f3726,0.95),MAX);
  const pl=new THREE.InstancedMesh(pineLow,leafMat,MAX),pt=new THREE.InstancedMesh(pineTop,leafMat,MAX);
  const b1=new THREE.InstancedMesh(blob,leafMat,MAX),b2=new THREE.InstancedMesh(blob2,leafMat,MAX),cy=new THREE.InstancedMesh(cyp,leafMat,MAX);
  const bush=new THREE.InstancedMesh(bushG,leafMat,600);
  const d=new THREE.Object3D();
  const pineCols=[0x2c5233,0x37633a,0x264a2d,0x40693a],leafCols=[0x5a8538,0x6f913b,0xa98336,0x67873f,0xb7693a,0x4f7a34];
  let nt=0,np=0,nb=0,nc=0,nbu=0,tries=0;
  const spanX=(maxX-minX)/2+320,spanZ=(maxZ-minZ)/2+320;
  const clearOf=(x,z)=>keepClear.every(k=>Math.hypot(x-k[0],z-k[1])>k[2]);
  while(nt<MAX&&tries<20000){tries++;
    // cluster trees into woods
    const cx=CX-spanX+rnd()*spanX*2,cz=CZ-spanZ+rnd()*spanZ*2;
    const wood=Math.sin(cx*0.011)*Math.cos(cz*0.009)+Math.sin((cx+cz)*0.006);
    if(wood<0.1&&rnd()<0.75)continue;
    const n=nearest(cx,cz);if(n.d<FLAT+4||!clearOf(cx,cz))continue;
    const y=groundH(cx,cz,n),s=0.8+rnd()*0.75;
    d.position.set(cx,y-0.2,cz);d.rotation.set(0,rnd()*6.28,0);d.scale.set(s,s*(0.85+rnd()*0.45),s);d.updateMatrix();
    trunks.setMatrixAt(nt++,d.matrix);
    const sp=rnd();
    if(sp<0.42){pl.setMatrixAt(np,d.matrix);pt.setMatrixAt(np,d.matrix);const c=lin(pineCols[(rnd()*4)|0]);pl.setColorAt(np,c);pt.setColorAt(np,c);np++;}
    else if(sp<0.58){cy.setMatrixAt(nc,d.matrix);cy.setColorAt(nc++,lin(pineCols[(rnd()*4)|0]).multiplyScalar(0.85));}
    else{b1.setMatrixAt(nb,d.matrix);b2.setMatrixAt(nb,d.matrix);const c=lin(leafCols[(rnd()*6)|0]);b1.setColorAt(nb,c);b2.setColorAt(nb,c.clone().multiplyScalar(0.9));nb++;}
  }
  tries=0;
  while(nbu<600&&tries<8000){tries++;const x=CX-spanX+rnd()*spanX*2,z=CZ-spanZ+rnd()*spanZ*2;const n=nearest(x,z);
    if(n.d<FLAT+1||n.d>FLAT+90||!clearOf(x,z))continue;const s=0.6+rnd()*1.1;
    d.position.set(x,groundH(x,z,n)-0.2,z);d.rotation.set(0,rnd()*6.28,0);d.scale.set(s,s*0.8,s);d.updateMatrix();
    bush.setMatrixAt(nbu,d.matrix);bush.setColorAt(nbu++,lin([0x3f6a2f,0x55773a,0x6a7d3a][(rnd()*3)|0]));}
  trunks.count=nt;pl.count=pt.count=np;b1.count=b2.count=nb;cy.count=nc;bush.count=nbu;
  [trunks,pl,pt,b1,b2,cy,bush].forEach(m=>{m.castShadow=true;m.receiveShadow=true;scene.add(m);});
})();
/* random clear spots between minD and maxD metres from the track (for HD tree models) */
function treeSpots(n,minD,maxD){
  const out=[];let tries=0;
  const spanX=(maxX-minX)/2+maxD,spanZ=(maxZ-minZ)/2+maxD;
  while(out.length<n&&tries<n*40){tries++;
    const x=CX-spanX+Math.random()*spanX*2,z=CZ-spanZ+Math.random()*spanZ*2,nr=nearest(x,z);
    if(nr.d<minD||nr.d>maxD||!keepClear.every(k=>Math.hypot(x-k[0],z-k[1])>k[2]))continue;
    out.push([x,groundH(x,z,nr)-0.15,z]);}
  return out;
}
export {nearest,groundH,FLAT,groundMat,hills,treeSpots};
