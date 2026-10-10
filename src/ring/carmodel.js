import * as THREE from 'three';
import {lin,tex,std} from './core.js';
import {SPEC} from './sim/car.js';
import {BufferGeometryUtils} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
const mergeBufferGeometries=g=>BufferGeometryUtils.mergeBufferGeometries(g);

/* Procedural 992 GT3 RS. Local frame: +z forward, +x left, +y up, origin on the ground under the
   centre of mass (front axle at +a, rear axle at -(wb-a)). */
const ZF=SPEC.a,ZR=-(SPEC.wb-SPEC.a);
const NOSE=ZF+0.99,TAIL=ZR-1.13;
const RWF=SPEC.rf,RWR=SPEC.rr;

const pl=(pts,z)=>{if(z<=pts[0][0])return pts[0][1];for(let i=1;i<pts.length;i++)if(z<=pts[i][0]){const a=pts[i-1],b=pts[i],t=(z-a[0])/(b[0]-a[0]),s=t*t*(3-2*t);return a[1]+(b[1]-a[1])*s;}return pts[pts.length-1][1];};
/* body plan, z from tail to nose */
const HALF_W=[[TAIL,0.82],[TAIL+0.12,0.92],[ZR-0.55,0.975],[ZR+0.3,0.97],[ZR+0.75,0.925],[0.3,0.91],[ZF-0.45,0.935],[ZF+0.35,0.935],[ZF+0.7,0.88],[NOSE-0.12,0.74],[NOSE,0.56]];
const TOP=[[TAIL,0.84],[TAIL+0.1,0.93],[ZR,0.95],[ZR+0.5,0.9],[ZR+1.0,0.82],[0.3,0.8],[ZF-0.6,0.81],[ZF,0.84],[ZF+0.55,0.78],[NOSE-0.15,0.62],[NOSE,0.5]];
const BOT=[[TAIL,0.32],[TAIL+0.25,0.16],[NOSE-0.3,0.13],[NOSE-0.05,0.17],[NOSE,0.26]];
/* hood dip between the front fenders (911 headlights sit on the fenders) */
const DIP=[[0.2,0],[0.65,0.06],[NOSE-0.25,0.08],[NOSE,0.02]];
export const bodyTop=z=>pl(TOP,z),bodyHalfW=z=>pl(HALF_W,z);

function archBottom(z){
  let b=pl(BOT,z);
  for(const [az,r] of [[ZF,RWF],[ZR,RWR]]){const R=r+0.075,dz=z-az;if(Math.abs(dz)<R)b=Math.max(b,r+Math.sqrt(R*R-dz*dz)*0.98);}
  return b;
}
function loft(stations,section,ring,caps){
  const pos=[],idx=[],n=ring;
  stations.forEach((z,si)=>{section(z).forEach(p=>pos.push(p[0],p[1],z));
    if(si<stations.length-1)for(let k=0;k<n-1;k++){const a=si*n+k;idx.push(a,a+1,a+n,a+1,a+n+1,a+n);}});
  if(caps){
    /* close both ends with a fan around the section's centre */
    [[0,1],[stations.length-1,-1]].forEach(([si,dir])=>{
      const base=si*n;let cx=0,cy=0;for(let k=0;k<n;k++){cx+=pos[(base+k)*3];cy+=pos[(base+k)*3+1];}
      const c=pos.length/3;pos.push(cx/n,cy/n,stations[si]);
      for(let k=0;k<n-1;k++){if(dir>0)idx.push(c,base+k+1,base+k);else idx.push(c,base+k,base+k+1);}
    });
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return g;
}
/* superellipse half-section, mirrored, from bottom-left round to bottom-right */
function section(W,y0,y1,nExp,dip,ring){
  const pts=[],yc=(y0+y1)/2,hh=(y1-y0)/2,e=2/nExp;
  for(let k=0;k<ring;k++){
    const t=-Math.PI/2+k/(ring-1)*2*Math.PI;            // -90 .. 270 deg
    const c=Math.cos(t),s=Math.sin(t);
    let x=W*Math.sign(c)*Math.pow(Math.abs(c),e),y=yc+hh*Math.sign(s)*Math.pow(Math.abs(s),e);
    if(s>0&&dip){const q=1-(x/W)*(x/W);y-=dip*q*q;}
    pts.push([x,y]);
  }
  return pts;
}
function bodyGeometry(){
  const st=[];for(let z=TAIL;z<=NOSE+1e-6;z+=0.05)st.push(Math.min(z,NOSE));
  const ring=44;
  return loft(st,z=>section(bodyHalfW(z),archBottom(z),bodyTop(z),z>ZF+0.6?3.2:4.2,pl(DIP,z),ring),ring,true);
}
/* greenhouse: windscreen to engine lid */
const CAB0=ZF-0.92,CAB1=TAIL+0.06;
const ROOF=[[CAB1,0.92],[TAIL+0.35,1.0],[ZR-0.35,1.13],[ZR+0.35,1.24],[-0.25,1.3],[0.1,1.3],[CAB0-0.45,1.16],[CAB0,0.84]];
const CAB_W=[[CAB1,0.7],[ZR,0.74],[-0.2,0.78],[CAB0-0.3,0.8],[CAB0,0.82]];
const BELT=[[CAB1,0.92],[ZR,0.92],[ZR+0.8,0.83],[CAB0,0.8]];
export const roofY=z=>pl(ROOF,z);
function cabinGeometry(shrink=0){
  const st=[];for(let z=CAB1;z<=CAB0+1e-6;z+=0.04)st.push(Math.min(z,CAB0));
  const ring=30;
  return loft(st,z=>{
    const b=pl(BELT,z)-0.05,r=pl(ROOF,z),wb=pl(CAB_W,z)-shrink,wt=wb*0.74;
    const out=[];
    for(let k=0;k<ring;k++){
      const t=k/(ring-1);                                   // 0 left belt .. 1 right belt, over the roof
      const a=Math.PI*t;
      const sx=Math.cos(a),sy=Math.sin(a);
      const yy=b+(r-b-shrink)*Math.pow(sy,0.55);
      const w=wb+(wt-wb)*Math.pow(sy,2.2);
      out.push([w*Math.sign(sx)*Math.pow(Math.abs(sx),0.6),yy]);
    }
    return out;
  },ring);
}
/* split a geometry into paint / glass groups by a predicate on each face's centre */
function splitGroups(g,isGlass){
  const idx=g.index.array,pos=g.attributes.position.array,paint=[],glass=[];
  for(let f=0;f<idx.length;f+=3){
    let x=0,y=0,z=0;for(let k=0;k<3;k++){const v=idx[f+k]*3;x+=pos[v];y+=pos[v+1];z+=pos[v+2];}
    (isGlass(x/3,y/3,z/3)?glass:paint).push(idx[f],idx[f+1],idx[f+2]);
  }
  g.setIndex([...paint,...glass]);g.clearGroups();g.addGroup(0,paint.length,0);g.addGroup(paint.length,glass.length,1);return g;
}
const glassAt=(x,y,z)=>{
  const belt=pl(BELT,z),roof=pl(ROOF,z);
  if(z>CAB0-0.42&&y>belt+0.02)return true;                                         // windscreen
  if(z<CAB0-0.48&&z>ZR+0.1&&y>belt+0.06&&y<roof-0.15&&Math.abs(x)>0.5)return true; // side windows
  if(z<ZR-0.15&&z>TAIL+0.4&&Math.abs(x)<0.5&&y>belt+0.04)return true;              // rear window
  return false;
};

/* ---------------- wheels ---------------- */
function tyreGeo(r,w){
  const pts=[],sw=0.11;
  const rim=r-sw;
  for(let k=0;k<=12;k++){const a=-Math.PI/2+k/12*Math.PI,cr=0.05;
    pts.push(new THREE.Vector2(r-cr+Math.cos(a)*cr,(w/2-cr)*Math.sin(a)+Math.sin(a)*cr));}
  pts.unshift(new THREE.Vector2(rim,-w/2+0.01));pts.push(new THREE.Vector2(rim,w/2-0.01));
  const g=new THREE.LatheGeometry(pts,40);g.rotateZ(Math.PI/2);return g;
}
const tyreTex=tex(256,64,(g,w,h)=>{g.fillStyle='#1a1a1c';g.fillRect(0,0,w,h);g.fillStyle='#232326';for(let x=0;x<w;x+=6)g.fillRect(x,0,2,h);},true);
const rimTex=tex(256,256,(g,w,h)=>{g.fillStyle='#2a2b2e';g.fillRect(0,0,w,h);
  g.translate(w/2,h/2);g.fillStyle='#b8bcc2';
  for(let k=0;k<10;k++){g.save();g.rotate(k/10*Math.PI*2);g.beginPath();g.moveTo(-9,22);g.lineTo(9,22);g.lineTo(15,122);g.lineTo(-15,122);g.closePath();g.fill();g.restore();}
  g.beginPath();g.arc(0,0,30,0,7);g.fill();
  g.strokeStyle='#d2d6db';g.lineWidth=10;g.beginPath();g.arc(0,0,122,0,7);g.stroke();
  g.fillStyle='#d8342c';g.beginPath();g.arc(0,0,13,0,7);g.fill();},true);
rimTex.wrapS=rimTex.wrapT=THREE.ClampToEdgeWrapping;
const rimMat=new THREE.MeshStandardMaterial({map:rimTex,metalness:0.85,roughness:0.32,alphaTest:0.5});
const tyreMat=new THREE.MeshStandardMaterial({side:THREE.DoubleSide,map:tyreTex,color:0x5a5a5a,roughness:0.92,metalness:0,envMapIntensity:0.35});
const discMat=new THREE.MeshStandardMaterial({color:lin(0x4a4846),metalness:0.7,roughness:0.45,emissive:new THREE.Color(1,0.25,0.02),emissiveIntensity:0});
function makeWheel(r,w,front,caliperCol){
  const g=new THREE.Group();   // steer pivot
  const spin=new THREE.Group();g.add(spin);
  /* tyre and the dish behind the spokes share one mesh; spokes are a textured disc slightly inset */
  const dishG=new THREE.CylinderGeometry(r-0.11,r-0.13,w*0.8,28,1,true);dishG.rotateZ(Math.PI/2);
  const tg=tyreGeo(r,w);
  const t=new THREE.Mesh(mergeBufferGeometries([tg.index?tg.toNonIndexed():tg,dishG.toNonIndexed()]),tyreMat);t.castShadow=true;spin.add(t);
  const face=new THREE.Mesh(new THREE.CircleGeometry(r-0.105,40),rimMat);face.rotation.y=Math.PI/2;face.position.x=w/2-0.035;spin.add(face);
  /* disc and caliper don't spin */
  const disc=new THREE.Mesh(new THREE.CylinderGeometry(r-0.15,r-0.15,0.035,32),discMat.clone());disc.rotation.z=Math.PI/2;disc.position.x=w/2-0.17;g.add(disc);
  const cal=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.2,0.13),std(caliperCol,0.45,0.2));cal.position.set(w/2-0.14,0.06,front?-0.13:0.13);g.add(cal);
  return {g,spin,disc,face,cal,isOuterLeft:true};
}

/* ---------------- livery ---------------- */
function liveryTex(num,col){
  return tex(1024,256,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    g.fillStyle='rgba(245,243,238,0.92)';g.font='italic 800 92px "Chakra Petch", sans-serif';g.textBaseline='middle';
    g.fillText('GT3 RS',40,h/2);
    g.beginPath();g.arc(w-150,h/2,92,0,7);g.fill();
    g.fillStyle='#16151a';g.font='800 110px "Chakra Petch", sans-serif';g.textAlign='center';g.fillText(String(num),w-150,h/2+6);
  });
}

/* ---------------- whole car ---------------- */
const bodyGeo=bodyGeometry(),cabGeo=splitGroups(cabinGeometry(),glassAt),innerGeo=(()=>{const g=cabinGeometry(0.04);
  /* interior shell: leave the glass out so you can see through */
  const idx=g.index.array,pos=g.attributes.position.array,keep=[];
  for(let f=0;f<idx.length;f+=3){let x=0,y=0,z=0;for(let k=0;k<3;k++){const v=idx[f+k]*3;x+=pos[v];y+=pos[v+1];z+=pos[v+2];}if(!glassAt(x/3,y/3+0.02,z/3))keep.push(idx[f],idx[f+1],idx[f+2]);}
  g.setIndex(keep);return g;})();
const carbon=new THREE.MeshStandardMaterial({color:lin(0x18181b),roughness:0.35,metalness:0.3});
const black=std(0x0d0d0f,0.6,0.1,{envMapIntensity:0.4});
const glassMat=new THREE.MeshPhysicalMaterial({color:lin(0x0c1117),roughness:0.04,metalness:0.1,transparent:true,opacity:0.55,envMapIntensity:1.6,clearcoat:1,clearcoatRoughness:0.02});
const interiorMat=new THREE.MeshStandardMaterial({color:lin(0x151517),roughness:0.85,side:THREE.BackSide});

export function buildCar(color,num,opts={}){
  const root=new THREE.Group();          // follows the physics pose (ground, heading)
  const body=new THREE.Group();root.add(body);      // rolls and pitches on the springs
  const paint=new THREE.MeshPhysicalMaterial({color:lin(color),metalness:0.25,roughness:0.32,clearcoat:1,clearcoatRoughness:0.06,envMapIntensity:1.15});
  const shell=new THREE.Mesh(bodyGeo,paint);shell.castShadow=true;shell.receiveShadow=true;body.add(shell);
  const cab=new THREE.Mesh(cabGeo,[paint,glassMat]);cab.castShadow=true;body.add(cab);
  const inner=new THREE.Mesh(innerGeo,interiorMat);body.add(inner);
  const add=(geo,mat,x,y,z,rx=0,ry=0,rz=0,cast=true)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.rotation.set(rx,ry,rz);m.castShadow=cast;body.add(m);return m;};
  const B=(w,h,d)=>new THREE.BoxGeometry(w,h,d);
  /* front: splitter, intakes, hood outlet, fender louvres */
  add(B(1.78,0.03,0.3),carbon,0,0.11,NOSE-0.3);
  [-1,1].forEach(s=>add(B(0.42,0.17,0.25),black,s*0.5,0.3,NOSE-0.16,0,s*0.25,0));
  add(B(0.62,0.12,0.2),black,0,0.27,NOSE-0.09);
  add(B(0.72,0.02,0.52),black,0,bodyTop(ZF+0.45)-0.075,ZF+0.45,-0.06,0,0);
  [-1,1].forEach(s=>{for(let k=0;k<7;k++)add(B(0.32,0.012,0.035),black,s*0.66,bodyTop(ZF)+0.012-k*0.004,ZF-0.12+k*0.06,0.12,0,0,false);});
  /* headlights: oval LED units on the fenders */
  const lensMat=new THREE.MeshPhysicalMaterial({color:lin(0x9aa4ad),metalness:0.6,roughness:0.08,clearcoat:1,transparent:true,opacity:0.92});
  const drlMat=new THREE.MeshStandardMaterial({color:0xffffff,emissive:new THREE.Color(0.85,0.92,1),emissiveIntensity:2.2});
  [-1,1].forEach(s=>{
    const z=NOSE-0.42,y=bodyTop(z)-0.02;
    const l=new THREE.Mesh(new THREE.SphereGeometry(0.125,24,12),lensMat);l.scale.set(1,0.6,1.3);l.position.set(s*0.63,y-0.045,z);l.rotation.x=0.42;body.add(l);
    for(let k=0;k<4;k++){const a=k/4*Math.PI*2+Math.PI/4;add(B(0.035,0.012,0.02),drlMat,s*0.63+Math.cos(a)*0.065,y-0.01+Math.sin(a)*0.035,z+0.15,0.4,0,0,false);}
  });
  /* mirrors */
  [-1,1].forEach(s=>{add(B(0.05,0.03,0.12),carbon,s*0.88,0.86,CAB0-0.18);const m=add(B(0.2,0.1,0.13),paint,s*1.0,0.92,CAB0-0.22);m.rotation.y=s*0.15;});
  /* side intakes ahead of the rear wheels, door decals */
  [-1,1].forEach(s=>add(B(0.03,0.16,0.42),black,s*(bodyHalfW(ZR+0.7)+0.002),0.6,ZR+0.72,0,0,0,false));
  const lt=liveryTex(num,color),livMat=new THREE.MeshStandardMaterial({map:lt,transparent:true,roughness:0.4,polygonOffset:true,polygonOffsetFactor:-2});
  [-1,1].forEach(s=>{const p=new THREE.Mesh(new THREE.PlaneGeometry(1.5,0.37),livMat);p.position.set(s*(bodyHalfW(-0.2)+0.012),0.5,-0.25);p.rotation.y=s*Math.PI/2;if(s<0)p.scale.x=1;body.add(p);});
  /* rear: swan-neck wing, light bar, diffuser, exhausts, roof fin */
  const wy=1.33,wz=TAIL+0.3;
  const wingMain=add(B(1.84,0.035,0.4),carbon,0,wy,wz,0.12,0,0);
  const flap=add(B(1.84,0.028,0.22),carbon,0,wy+0.09,wz-0.16,0.42,0,0);
  [-1,1].forEach(s=>{add(B(0.02,0.3,0.68),carbon,s*0.93,wy+0.02,wz-0.04);
    add(B(0.035,0.42,0.06),carbon,s*0.3,wy-0.12,wz+0.15,-0.5,0,0);add(B(0.035,0.06,0.25),carbon,s*0.3,wy+0.06,wz+0.02,0,0,0);});
  add(B(0.012,0.22,1.0),paint,0,roofY(ZR)-0.05,ZR-0.1,-0.22,0,0);
  const tail=new THREE.MeshStandardMaterial({color:lin(0x400404),emissive:new THREE.Color(1,0.04,0.02),emissiveIntensity:0.6,roughness:0.3});
  add(B(1.66,0.04,0.03),tail,0,0.9,TAIL+0.075,0,0,0,false);
  [-1,1].forEach(s=>add(B(0.12,0.05,0.03),tail,s*0.83,0.88,TAIL+0.1,0,s*-0.4,0,false));
  add(B(1.5,0.14,0.32),carbon,0,0.2,TAIL+0.18);
  const ti=std(0x8d8577,0.25,0.9);
  ti.side=THREE.DoubleSide;
  [-1,1].forEach(s=>add(new THREE.CylinderGeometry(0.055,0.055,0.12,16,1,true),ti,s*0.11,0.36,TAIL+0.03,Math.PI/2,0,0));
  /* interior: dash, wheel, seats, cage (seen from the cockpit) */
  const dash=std(0x1a1a1c,0.8);
  add(B(1.5,0.14,0.42),dash,0,0.83,CAB0-0.3,0.15,0,0,false);
  add(B(0.36,0.09,0.16),dash,0.36,0.93,CAB0-0.42,0.35,0,0,false);
  const gauge=new THREE.MeshStandardMaterial({color:0x000000,emissive:new THREE.Color(0.9,0.75,0.45),emissiveIntensity:0.25,roughness:0.4});
  add(B(0.3,0.08,0.01),gauge,0.36,0.91,CAB0-0.505,-0.35,0,0,false);
  const wheel=new THREE.Group();wheel.position.set(0.36,0.88,CAB0-0.62);wheel.rotation.x=-0.3;body.add(wheel);
  const rimW=new THREE.Mesh(new THREE.TorusGeometry(0.175,0.018,8,28),std(0x1c1c1e,0.7));wheel.add(rimW);
  const hub=new THREE.Mesh(new THREE.BoxGeometry(0.32,0.05,0.03),std(0x2a2a2d,0.6));wheel.add(hub);
  const mark=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.025,0.025),std(0xf2c230,0.5));mark.position.y=0.175;wheel.add(mark);
  [-1,1].forEach(s=>{add(B(0.5,0.08,0.55),dash,s*0.36,0.36,-0.6,0,0,0,false);add(B(0.5,0.7,0.1),dash,s*0.36,0.68,-0.88,-0.15,0,0,false);});
  const cage=std(0x2a2a2d,0.5,0.6);
  [-1,1].forEach(s=>{add(B(0.03,0.03,1.0),cage,s*0.56,1.09,-0.7,0.1,0,0,false);add(B(0.035,0.5,0.035),cage,s*0.6,0.95,-1.05,0,0,0,false);});
  add(B(1.1,0.03,0.03),cage,0,1.08,-1.05,0,0,0,false);
  /* wheels */
  const calCol=opts.caliper||0xf2c230;
  const wheels=[];
  for(const [front,left] of [[1,1],[1,0],[0,1],[0,0]]){
    const r=front?RWF:RWR,w=front?0.275:0.335,tw=(front?SPEC.tf:SPEC.tr)/2;
    const W=makeWheel(r,w,front,calCol);
    W.g.position.set(left?tw:-tw,r,front?ZF:ZR);
    if(!left)W.g.rotation.y=Math.PI;        // outer face out on both sides
    root.add(W.g);W.left=left;W.front=front;W.r=r;
    wheels.push(W);
  }
  /* shadow blob for ambient occlusion under the car */
  const ao=new THREE.Mesh(new THREE.PlaneGeometry(2.3,5.0),new THREE.MeshBasicMaterial({map:aoTex,transparent:true,depthWrite:false,opacity:0.85}));
  ao.rotation.x=-Math.PI/2;ao.position.y=0.02;ao.position.z=(NOSE+TAIL)/2;root.add(ao);
  /* merge every static body part per material: ~50 draw calls per car down to ~10 */
  const keep=new Set([shell,cab,inner,flap,wheel]);
  const byMat=new Map();
  for(const m of [...body.children]){
    if(keep.has(m)||!m.isMesh||Array.isArray(m.material))continue;
    m.updateMatrix();const g=m.geometry.clone().applyMatrix4(m.matrix);
    if(g.index===null)continue;
    for(const k of Object.keys(g.attributes))if(!['position','normal','uv'].includes(k))g.deleteAttribute(k);
    if(!byMat.has(m.material))byMat.set(m.material,[]);
    byMat.get(m.material).push(g);body.remove(m);
  }
  for(const [mat,gs] of byMat){const mm=new THREE.Mesh(mergeBufferGeometries(gs),mat);mm.castShadow=true;body.add(mm);}
  return {root,body,wheels,paint,tail,steeringWheel:wheel,wingFlap:flap,wingMain,cab,inner,shell,discs:wheels.map(w=>w.disc)};
}
const aoTex=tex(64,128,(g,w,h)=>{const gr=g.createRadialGradient(w/2,h/2,4,w/2,h/2,w*0.7);gr.addColorStop(0,'rgba(0,0,0,0.85)');gr.addColorStop(0.6,'rgba(0,0,0,0.45)');gr.addColorStop(1,'rgba(0,0,0,0)');
  g.save();g.scale(1,2);g.fillStyle=gr;g.fillRect(0,0,w,h/2);g.restore();},false);
export const DRIVER_EYE=new THREE.Vector3(0.36,1.1,-0.42);
export {NOSE,TAIL,CAB0};
