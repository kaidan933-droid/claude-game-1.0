import * as THREE from 'three';
import {renderer,rnd,lin,tex} from './core.js';

/* Eifel forest, built the way racing games do it:
   - near: Norway spruce as a trunk plus drooping tiers of alpha-tested branch cards, beech as a
     trunk and limbs plus leaf-cluster cards; normals point out from the crown so the cards shade
     like a volume, and they sway a little in the wind;
   - far: crossed billboards ("impostors") rendered from those same 3D trees at load time;
   - undergrowth: ferns, bramble and grass tufts along the verges.
   Everything is instanced per ~200 m chunk; each chunk swaps between near and far. */

/* ---------------- textures (one atlas for both species) ---------------- */
function drawNeedles(g,x0,y0,x1,y1,len,dens,cols){
  const n=Math.hypot(x1-x0,y1-y0)*dens;
  for(let i=0;i<n;i++){const t=i/n,x=x0+(x1-x0)*t,y=y0+(y1-y0)*t,a=Math.atan2(y1-y0,x1-x0);
    for(const s of [-1,1]){const aa=a+s*(0.9+rnd()*0.5),l=len*(0.6+rnd()*0.6)*(1-t*0.35);
      g.strokeStyle=cols[(rnd()*cols.length)|0];g.lineWidth=1.6;g.beginPath();g.moveTo(x,y);g.lineTo(x+Math.cos(aa)*l,y+Math.sin(aa)*l);g.stroke();}}
}
const atlas=tex(1024,1024,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  /* spruce branch spray: top half (v 0.5..1). Points along +x from the trunk (left) to the tip */
  const dark=['#1b2c16','#22371b','#2a4320','#203319'],lite=['#3c5a2b','#476a31','#34502a'];
  for(let b=0;b<3;b++){
    const y=128+b*130+rnd()*20;
    g.strokeStyle='#3a2a1c';g.lineWidth=5;g.beginPath();g.moveTo(10,y);g.quadraticCurveTo(500,y+40,1000,y+70);g.stroke();
    drawNeedles(g,10,y,1000,y+70,26,0.9,dark);
    for(let k=0;k<14;k++){const t=0.08+k/14*0.85,x=10+990*t,yy=y+70*t*t;const s=k%2?1:-1,l=(1-t)*150+40;
      const ex=x+l*0.8,ey=yy+s*l*0.55;g.strokeStyle='#3a2a1c';g.lineWidth=2;g.beginPath();g.moveTo(x,yy);g.lineTo(ex,ey);g.stroke();
      drawNeedles(g,x,yy,ex,ey,18,1.3,rnd()<0.35?lite:dark);}
  }
  /* bark: bottom-left quarter */
  g.fillStyle='#4a3a2c';g.fillRect(0,512,512,512);
  for(let i=0;i<900;i++){g.fillStyle=['#3a2c20','#5a4634','#2e241a','#655141'][(rnd()*4)|0];g.fillRect(rnd()*512,512+rnd()*512,2+rnd()*5,10+rnd()*60);}
  /* beech leaf clusters: bottom-right quarter */
  const leaf=['#3d5a22','#4c6e29','#5b7f30','#6d8f3a','#33501d','#7e9c46'];
  for(let i=0;i<520;i++){
    const a=rnd()*Math.PI*2,r=Math.sqrt(rnd())*230,x=768+Math.cos(a)*r,y=768+Math.sin(a)*r*0.9;
    g.save();g.translate(x,y);g.rotate(rnd()*Math.PI*2);g.fillStyle=leaf[(rnd()*leaf.length)|0];
    g.beginPath();g.ellipse(0,0,13+rnd()*6,7+rnd()*3,0,0,Math.PI*2);g.fill();
    g.strokeStyle='rgba(20,30,10,.35)';g.lineWidth=1;g.beginPath();g.moveTo(-12,0);g.lineTo(12,0);g.stroke();g.restore();
  }
  g.strokeStyle='#4b3b2b';g.lineWidth=4;for(let i=0;i<6;i++){g.beginPath();g.moveTo(768,768);g.lineTo(768+Math.cos(i)*200,768+Math.sin(i)*180);g.stroke();}
},true);
atlas.wrapS=atlas.wrapT=THREE.ClampToEdgeWrapping;
/* regions (u0,v0,u1,v1) in texture space (v up) */
const R_BRANCH=[0,0.5,1,1],R_BARK=[0,0,0.5,0.5],R_LEAF=[0.5,0,1,0.5];

const under=tex(1024,256,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  /* fern (0..0.5) */
  for(let f=0;f<9;f++){const a=-Math.PI/2+(f-4)*0.3,l=150+rnd()*90,x0=256,y0=250;
    const ex=x0+Math.cos(a)*l,ey=y0+Math.sin(a)*l;g.strokeStyle='#2f4a1c';g.lineWidth=2.5;g.beginPath();g.moveTo(x0,y0);g.quadraticCurveTo((x0+ex)/2+(f-4)*8,(y0+ey)/2,ex,ey+20);g.stroke();
    for(let k=1;k<18;k++){const t=k/18,x=x0+(ex-x0)*t+(f-4)*8*Math.sin(t*3),y=y0+(ey+20-y0)*t,l2=(1-t)*36+6;
      g.fillStyle=['#3f6326','#4d752d','#365620','#5c8636'][(rnd()*4)|0];
      for(const s of [-1,1]){g.beginPath();g.ellipse(x+s*l2/2,y+3,l2/2,3.2,s*0.4,0,7);g.fill();}}}
  /* grass tuft (0.5..1) */
  for(let i=0;i<140;i++){const x=768+(rnd()-0.5)*300,l=60+rnd()*170,b=(rnd()-0.5)*90;
    g.strokeStyle=['#5f7a33','#6f8a3c','#4d6a2a','#8a9a52','#9aa865'][(rnd()*5)|0];g.lineWidth=2+rnd()*2;
    g.beginPath();g.moveTo(x,256);g.quadraticCurveTo(x+b*0.4,256-l*0.6,x+b,256-l);g.stroke();}
},true);
under.wrapS=under.wrapT=THREE.ClampToEdgeWrapping;

/* ---------------- template geometry ---------------- */
function builder(){
  const pos=[],nor=[],uv=[],idx=[];
  return {
    quad(a,b,c,d,n,reg,uvq=[[0,0],[1,0],[1,1],[0,1]]){
      const base=pos.length/3;
      for(const [p,t] of [[a,uvq[0]],[b,uvq[1]],[c,uvq[2]],[d,uvq[3]]]){pos.push(...p);nor.push(...n);uv.push(reg[0]+(reg[2]-reg[0])*t[0],reg[1]+(reg[3]-reg[1])*t[1]);}
      idx.push(base,base+1,base+2,base,base+2,base+3);
    },
    cyl(x0,y0,z0,x1,y1,z1,r0,r1,seg,reg){
      const ax=new THREE.Vector3(x1-x0,y1-y0,z1-z0).normalize(),u=new THREE.Vector3(1,0,0);if(Math.abs(ax.x)>0.9)u.set(0,0,1);
      const p=new THREE.Vector3().crossVectors(ax,u).normalize(),q=new THREE.Vector3().crossVectors(ax,p);
      for(let k=0;k<seg;k++){const a0=k/seg*Math.PI*2,a1=(k+1)/seg*Math.PI*2;
        const d0=p.clone().multiplyScalar(Math.cos(a0)).addScaledVector(q,Math.sin(a0)),d1=p.clone().multiplyScalar(Math.cos(a1)).addScaledVector(q,Math.sin(a1));
        const base=pos.length/3;
        for(const [d,r,yy,tu,tv] of [[d0,r0,0,k/seg,0],[d1,r0,0,(k+1)/seg,0],[d1,r1,1,(k+1)/seg,1],[d0,r1,1,k/seg,1]]){
          pos.push((yy?x1:x0)+d.x*r,(yy?y1:y0)+d.y*r,(yy?z1:z0)+d.z*r);nor.push(d.x,d.y,d.z);uv.push(reg[0]+(reg[2]-reg[0])*tu,reg[1]+(reg[3]-reg[1])*tv);}
        idx.push(base,base+1,base+2,base,base+2,base+3);}
    },
    geo(){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
      g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeBoundingSphere();return g;}
  };
}
/* template trees are 1 unit tall with a crown radius of 1; instances scale x/z by the crown radius
   and y by the height */
function spruceGeo(detail){
  const b=builder();
  b.cyl(0,0,0,0,0.99,0,0.09,0.01,5,R_BARK);
  const tiers=Math.round(26*detail);
  for(let t=0;t<tiers;t++){
    const y=0.1+t/tiers*0.86,f=1-(y-0.1)/0.9,L=Math.pow(f,0.85)*1.0+0.06;
    const per=t<tiers*0.2?3:4+(t%2);
    for(let k=0;k<per;k++){
      const a=(k/per+t*0.37+rnd()*0.15)*Math.PI*2,ca=Math.cos(a),sa=Math.sin(a);
      const droop=0.035+0.04*rnd(),w=L*(0.38+rnd()*0.12),tilt=(rnd()-0.5)*0.9;
      /* card from the trunk out to the tip, width across, rolled by tilt */
      const px=-sa,pz=ca,ux=Math.cos(tilt),uy=Math.sin(tilt)*0.25;
      const a0=[ca*0.03-px*w*0.1*ux,y+uy*w*0.1,sa*0.03-pz*w*0.1*ux],a1=[ca*0.03+px*w*0.1*ux,y-uy*w*0.1,sa*0.03+pz*w*0.1*ux];
      const tipY=y-droop*L*1.6;
      const b1=[ca*L+px*w*0.5*ux,tipY-uy*w,sa*L+pz*w*0.5*ux],b0=[ca*L-px*w*0.5*ux,tipY+uy*w,sa*L-pz*w*0.5*ux];
      const n=new THREE.Vector3(ca,0.75,sa).normalize();
      b.quad(a0,b0,b1,a1,[n.x,n.y,n.z],R_BRANCH,[[0,0.15+0.25*(k%3)],[1,0.15+0.25*(k%3)],[1,0.35+0.25*(k%3)],[0,0.35+0.25*(k%3)]].map(q=>[q[0],q[1]]));
    }
  }
  /* leader at the top */
  b.quad([-0.08,0.92,0],[0.08,0.92,0],[0.02,1.04,0],[-0.02,1.04,0],[0,1,0],R_BRANCH,[[0,0.4],[0.3,0.4],[0.3,0.6],[0,0.6]]);
  return b.geo();
}
function beechGeo(detail){
  const b=builder();
  b.cyl(0,0,0,0.02,0.5,0,0.08,0.05,6,R_BARK);
  for(let k=0;k<4;k++){const a=k/4*Math.PI*2+0.4;b.cyl(0.02,0.45,0,Math.cos(a)*0.4,0.72,Math.sin(a)*0.4,0.04,0.012,4,R_BARK);}
  const n=Math.round(54*detail);
  for(let k=0;k<n;k++){
    /* points on an ellipsoid shell: horizontal radius 1, vertical 0.27, centre at 0.72 */
    const u=rnd()*2-1,a=rnd()*Math.PI*2,r=0.65+rnd()*0.35,s=Math.sqrt(1-u*u);
    const dx=Math.cos(a)*s,dy=u,dz=Math.sin(a)*s;
    const cx=dx*r,cy=0.64+dy*r*0.34,cz=dz*r,sz=0.4+rnd()*0.2;
    const nrm=new THREE.Vector3(dx,dy*2+0.3,dz).normalize();
    /* card facing out, rolled randomly */
    const t1=new THREE.Vector3().crossVectors(nrm,new THREE.Vector3(0,1,0));if(t1.lengthSq()<1e-4)t1.set(1,0,0);t1.normalize();
    const t2=new THREE.Vector3().crossVectors(nrm,t1).normalize(),rl=rnd()*Math.PI;
    const e1=t1.clone().multiplyScalar(Math.cos(rl)).addScaledVector(t2,Math.sin(rl)).multiplyScalar(sz),e2=t1.clone().multiplyScalar(-Math.sin(rl)).addScaledVector(t2,Math.cos(rl)).multiplyScalar(sz);
    const yS=0.42;   // flatten the card's vertical extent like the crown
    const P=(i,j)=>[cx+e1.x*i+e2.x*j,cy+(e1.y*i+e2.y*j)*yS,cz+e1.z*i+e2.z*j];
    b.quad(P(-1,-1),P(1,-1),P(1,1),P(-1,1),[nrm.x,nrm.y,nrm.z],R_LEAF);
  }
  return b.geo();
}
/* crossed impostor quads, unit tall, half-width 1 */
function crossGeo(u0,u1){
  const b=builder(),reg=[u0,0,u1,1];
  b.quad([-1,0,0],[1,0,0],[1,1,0],[-1,1,0],[0,0,1],reg);
  b.quad([0,0,-1],[0,0,1],[0,1,1],[0,1,-1],[1,0,0],reg);
  return b.geo();
}
function underGeo(u0,u1,h=1){
  const b=builder(),reg=[u0,0,u1,1];
  b.quad([-0.5,0,0],[0.5,0,0],[0.5,h,0],[-0.5,h,0],[0,1,0.3],reg);
  b.quad([0,0,-0.5],[0,0,0.5],[0,h,0.5],[0,h,-0.5],[0.3,1,0],reg);
  return b.geo();
}

/* ---------------- materials ---------------- */
export const windTime={value:0};
function foliageMat(map,extra){
  const m=new THREE.MeshStandardMaterial(Object.assign({map,alphaTest:0.42,side:THREE.DoubleSide,roughness:0.92,envMapIntensity:0.35},extra||{}));
  m.onBeforeCompile=sh=>{sh.uniforms.windT=windTime;
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nuniform float windT;').replace('#include <begin_vertex>',`#include <begin_vertex>
      #ifdef USE_INSTANCING
      float ph=instanceMatrix[3].x*0.13+instanceMatrix[3].z*0.11;
      float sw=sin(windT*1.1+ph)*0.6+sin(windT*2.7+ph*1.7)*0.25;
      transformed.x+=sw*0.012*transformed.y*transformed.y;transformed.z+=sw*0.008*transformed.y*transformed.y;
      #endif`);};
  return m;
}
const mNear=foliageMat(atlas);
const depthNear=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map:atlas,alphaTest:0.42,side:THREE.DoubleSide});
const mUnder=foliageMat(under,{alphaTest:0.38});

/* ---------------- impostors: render the 3D trees into a texture ---------------- */
const SPRUCE=spruceGeo(1),BEECH=beechGeo(1),SPRUCE_LO=spruceGeo(0.6),BEECH_LO=beechGeo(0.6);
function bakeImpostors(){
  const W=512,H=512,rt=new THREE.WebGLRenderTarget(W,H,{format:THREE.RGBAFormat});
  const sc=new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xdfe8f0,0x4a5a3a,0.9));
  const dl=new THREE.DirectionalLight(0xfff0dd,1.4);dl.position.set(0.6,0.8,1);sc.add(dl);
  const mat=new THREE.MeshLambertMaterial({map:atlas,alphaTest:0.42,side:THREE.DoubleSide});
  const cam=new THREE.OrthographicCamera(-1,1,1,0,-5,5);cam.position.set(0,0,2);cam.lookAt(0,0,0);
  const prev=renderer.getRenderTarget(),pc=new THREE.Color();renderer.getClearColor(pc);const pa=renderer.getClearAlpha();
  renderer.setRenderTarget(rt);renderer.setClearColor(0x2a3a22,0);renderer.clear();
  /* each species gets its own half of the texture */
  [[SPRUCE,0],[BEECH,1]].forEach(([g,k])=>{
    const m=new THREE.Mesh(g,mat);
    m.scale.set(1,g===SPRUCE?1:1,1);sc.add(m);
    rt.viewport.set(k*W/2,0,W/2,H);rt.scissor.set(k*W/2,0,W/2,H);rt.scissorTest=true;
    renderer.setRenderTarget(rt);renderer.render(sc,cam);sc.remove(m);
  });
  rt.scissorTest=false;rt.viewport.set(0,0,W,H);
  renderer.setRenderTarget(prev);renderer.setClearColor(pc,pa);
  return rt.texture;
}
let impTex=null;
function impostorMat(){
  if(!impTex)impTex=bakeImpostors();
  return new THREE.MeshLambertMaterial({map:impTex,alphaTest:0.4,side:THREE.DoubleSide});
}

/* ---------------- chunks ---------------- */
const chunks=[];
let detailNear=1,nearDist=260,farDist=1600;
const tmpO=new THREE.Object3D(),col=new THREE.Color();
function inst(geo,mat,list,place,shadow){
  const m=new THREE.InstancedMesh(geo,mat,Math.max(1,list.length));
  list.forEach((t,k)=>{place(t,tmpO);tmpO.updateMatrix();m.setMatrixAt(k,tmpO.matrix);
    col.setHSL(t.hue,t.sat,t.lit);m.setColorAt(k,col);});
  m.count=list.length;
  if(shadow){m.castShadow=true;m.customDepthMaterial=depthNear;}
  m.receiveShadow=true;return m;
}
/* chunkLists: [{sp:[trees], be:[trees], ug:[undergrowth]}], tree = {x,y,z,h,r,sp} */
export function buildForest(scene,chunkLists){
  const farMat=impostorMat();
  const crossS=crossGeo(0,0.5),crossB=crossGeo(0.5,1);
  const fern=underGeo(0,0.5,0.7),tuft=underGeo(0.5,1,0.5);
  const sphereOf=pts=>{const c=new THREE.Vector3();pts.forEach(t=>c.add(new THREE.Vector3(t.x,t.y,t.z)));c.divideScalar(Math.max(1,pts.length));
    let rad=10;pts.forEach(t=>{rad=Math.max(rad,Math.hypot(t.x-c.x,t.z-c.z)+(t.h||2));});return new THREE.Sphere(c,rad);};
  for(const L of chunkLists){
    const all=L.sp.concat(L.be);if(!all.length&&!L.ug.length)continue;
    all.forEach(t=>{t.rot=rnd()*6.28;t.hue=t.sp?0.27+rnd()*0.05:0.19+rnd()*0.07;t.sat=0.12+rnd()*0.15;t.lit=t.sp?0.48+rnd()*0.12:0.58+rnd()*0.14;t.lean=(rnd()-0.5)*0.05;});
    /* trees by the track get full LOD; the forest further back is only ever drawn as impostors */
    const eSp=L.sp.filter(t=>!t.deep),eBe=L.be.filter(t=>!t.deep),dSp=L.sp.filter(t=>t.deep),dBe=L.be.filter(t=>t.deep);
    const placeTree=(t,o)=>{o.position.set(t.x,t.y,t.z);o.rotation.set(t.lean,t.rot,t.lean*0.7);o.scale.set(t.r,t.h,t.r);};
    const placeFar=(t,o)=>{o.position.set(t.x,t.y,t.z);o.rotation.set(0,t.rot,0);o.scale.set(t.r*1.05,t.h*1.02,t.r*1.05);};
    const near=new THREE.Group(),mid=new THREE.Group(),far=new THREE.Group(),deep=new THREE.Group(),ug=new THREE.Group();
    near.add(inst(SPRUCE,mNear,eSp,placeTree,true));near.add(inst(BEECH,mNear,eBe,placeTree,true));
    mid.add(inst(SPRUCE_LO,mNear,eSp,placeTree,true));mid.add(inst(BEECH_LO,mNear,eBe,placeTree,true));
    far.add(inst(crossS,farMat,eSp,placeFar,false));far.add(inst(crossB,farMat,eBe,placeFar,false));
    deep.add(inst(crossS,farMat,dSp,placeFar,false));deep.add(inst(crossB,farMat,dBe,placeFar,false));
    L.ug.forEach(u=>{u.hue=0.22+rnd()*0.06;u.sat=0.25+rnd()*0.2;u.lit=0.45+rnd()*0.2;});
    const ferns=L.ug.filter(u=>u.fern),tufts=L.ug.filter(u=>!u.fern);
    const placeU=(u,o)=>{o.position.set(u.x,u.y,u.z);o.rotation.set(0,u.rot,0);o.scale.set(u.s,u.s,u.s);};
    ug.add(inst(fern,mUnder,ferns,placeU,false));ug.add(inst(tuft,mUnder,tufts,placeU,false));
    const edge=eSp.concat(eBe);
    const sphere=sphereOf(edge.length?edge:L.ug),dsphere=sphereOf(dSp.concat(dBe));
    const g={near,mid,far,deep,ug,c:sphere.center,sphere,dsphere,hasDeep:dSp.length+dBe.length>0};
    [near,mid,far,deep,ug].forEach(x=>{x.visible=false;scene.add(x);});
    chunks.push(g);
  }
}
/* quality: 2 high, 1 medium, 0 low */
export function setForestQuality(q){
  nearDist=[70,150,230][q];farDist=[1000,1300,1600][q];detailNear=q;
}
const frustum=new THREE.Frustum(),pm=new THREE.Matrix4();
export function updateForest(cam,dt){
  windTime.value+=dt||0.016;
  cam.updateMatrixWorld();pm.multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse);frustum.setFromProjectionMatrix(pm);
  for(const g of chunks){
    const d=Math.max(0,g.c.distanceTo(cam.position)-g.sphere.radius*0.7);
    const inView=frustum.intersectsSphere(g.sphere);
    const nearShadow=d<60;                      // keep casting shadows just behind the camera too
    /* low quality skips the full-detail band and starts at the lighter trees */
    g.near.visible=detailNear>0&&(inView||nearShadow)&&d<nearDist*0.5;
    g.mid.visible=!g.near.visible&&(inView||(detailNear===0&&nearShadow))&&d<nearDist;
    g.far.visible=inView&&d<farDist&&!g.mid.visible&&!g.near.visible;
    g.ug.visible=inView&&d<(detailNear?140:60);
    g.deep.visible=g.hasDeep&&frustum.intersectsSphere(g.dsphere)&&g.dsphere.center.distanceTo(cam.position)-g.dsphere.radius<farDist;
    const sh=d<70;g.near.children.forEach(m=>m.castShadow=sh);g.mid.children.forEach(m=>m.castShadow=sh&&detailNear===0);
  }
}
