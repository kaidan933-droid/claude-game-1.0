import * as THREE from 'three';
import {lin,tex,std} from './core.js';
import {SPEC} from './sim/car.js';
import {BufferGeometryUtils} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
const merge=g=>BufferGeometryUtils.mergeBufferGeometries(g);

/* Procedural 992 GT3 RS, Weissach package (carbon hood and roof, black wing and mirrors).
   The side profile is traced from a reference photo (roofline, beltline, fender and haunch heights
   measured against the wheels) and scaled to the real car: 4.57 m long, 1.90 m wide, 2.457 m
   wheelbase. Local frame: +z forward, +x left, +y up, origin on the ground under the centre of
   mass (front axle at +a, rear axle at -(wb-a)). */
const ZF=SPEC.a,ZR=-(SPEC.wb-SPEC.a);
const NOSE=ZF+0.98,TAIL=ZR-1.13;
const RWF=SPEC.rf,RWR=SPEC.rr;

/* smooth interpolation through (z, value) points, clamped at the ends */
const pl=(pts,z)=>{if(z<=pts[0][0])return pts[0][1];for(let i=1;i<pts.length;i++)if(z<=pts[i][0]){const a=pts[i-1],b=pts[i],t=(z-a[0])/(b[0]-a[0]),s=t*t*(3-2*t);return a[1]+(b[1]-a[1])*s;}return pts[pts.length-1][1];};

/* ---- body plan (z from tail to nose) ---- */
const HALF_W=[[TAIL,0.80],[TAIL+0.1,0.88],[ZR-0.63,0.935],[ZR,0.958],[ZR+0.57,0.935],[0.1,0.905],[0.6,0.915],[ZF-0.4,0.945],[ZF,0.952],[ZF+0.4,0.93],[ZF+0.7,0.87],[NOSE-0.07,0.77],[NOSE,0.66]];
const BOTTOM=[[TAIL,0.36],[TAIL+0.15,0.24],[ZR-0.63,0.17],[ZF+0.7,0.15],[NOSE-0.07,0.13],[NOSE,0.2]];
/* shoulder crease: front fender peak over the wheel, flat door line, high rear haunch */
const SHOULDER=[[TAIL,0.70],[TAIL+0.1,0.84],[ZR-0.63,0.92],[ZR,0.955],[ZR+0.52,0.92],[0,0.9],[0.5,0.89],[ZF-0.55,0.86],[ZF,0.845],[ZF+0.4,0.8],[ZF+0.7,0.7],[NOSE-0.07,0.56],[NOSE,0.44]];
/* centre line of the lower body: rear deck, then (under the cabin) belt height, then the hood */
const CENTRE=[[TAIL,0.66],[TAIL+0.1,0.84],[TAIL+0.25,0.9],[0.93,0.83],[1.2,0.8],[ZF,0.78],[ZF+0.4,0.73],[ZF+0.7,0.64],[NOSE-0.07,0.52],[NOSE,0.42]];
/* greenhouse: windscreen base at the hood, roof peak above the seats, fastback to the deck */
const CAB_Z0=0.93,CAB_Z1=TAIL+0.24;
const BELT=[[CAB_Z1,0.9],[ZR,0.93],[-0.4,0.9],[0.3,0.87],[CAB_Z0,0.835]];
const CAB_TOP=[[CAB_Z1,0.905],[TAIL+0.6,0.98],[ZR,1.08],[-0.41,1.22],[-0.02,1.27],[0.26,1.215],[0.6,1.04],[CAB_Z0,0.845]];
const CAB_WB=[[CAB_Z1,0.62],[TAIL+0.8,0.76],[-0.6,0.8],[0.2,0.8],[CAB_Z0,0.78]];
const CAB_WT=[[CAB_Z1,0.4],[TAIL+0.9,0.52],[-0.5,0.56],[0.2,0.56],[CAB_Z0,0.62]];
export const bodyTop=z=>Math.max(pl(SHOULDER,z),pl(CENTRE,z)),bodyHalfW=z=>pl(HALF_W,z),roofY=z=>pl(CAB_TOP,z);
const ARCHES=[[ZF,RWF,RWF+0.075],[ZR,RWR,RWR+0.08]];

/* half cross-section control points, bottom centre round to top centre */
function lowerCtrl(z){
  const W=pl(HALF_W,z),hb=pl(BOTTOM,z),hs=pl(SHOULDER,z),hc=Math.min(pl(CENTRE,z),hs-0.005);
  return [[0,hb],[W*0.8,hb],[W*0.965,hb+0.06],[W,hb+0.42*(hs-hb)],[W*0.985,hb+0.8*(hs-hb)],[W*0.945,hs-0.012],[W*0.87,hs],[W*0.64,(hs+hc)/2+0.008],[W*0.32,hc+0.004],[0,hc]];
}
function cabCtrl(z){
  const b=pl(BELT,z),t=pl(CAB_TOP,z),wb=pl(CAB_WB,z),wt=pl(CAB_WT,z),h=Math.max(0.002,t-b);
  return [[wb,b-0.03],[wb*0.99,b+0.22*h],[wb*0.94,b+0.6*h],[wt,t-0.05*Math.min(1,h/0.3)],[wt*0.55,t-0.008],[0,t]];
}
/* z of the nose surface at (x, y), for parts that sit flush on the front */
function noseZ(x,y){for(let z=NOSE;z>NOSE-0.6;z-=0.01){if(sideX(z,y)>=Math.abs(x))return z;}return NOSE-0.6;}
const spline=(pts,n)=>new THREE.SplineCurve(pts.map(p=>new THREE.Vector2(p[0],p[1]))).getPoints(n);
/* outer x of the body side at height y (for decals that follow the surface) */
function sideX(z,y){
  const c=lowerCtrl(z),p=spline(c,40);let best=p[0].x,bd=Infinity;
  for(const q of p)if(q.x>0.3){const d=Math.abs(q.y-y);if(d<bd){bd=d;best=q.x;}}return best;
}

/* loft rings along z; classify(z, s, centroid, normal) picks a material index for each face */
function loft(stations,ringFn,classify,{caps=false,arches=false}={}){
  const rings=stations.map(ringFn),n=rings[0].length,pos=[];
  rings.forEach((r,si)=>r.forEach(p=>pos.push(p[0],p[1],stations[si])));
  const moved=new Uint8Array(pos.length/3);
  if(arches)for(let v=0;v<pos.length/3;v++){
    const y=pos[v*3+1],z=pos[v*3+2];
    for(const [zc,yc,R] of ARCHES){const dz=z-zc,dy=y-yc;if(Math.abs(dz)<R&&Math.hypot(dz,dy)<R){pos[v*3+1]=yc+Math.sqrt(R*R-dz*dz);moved[v]=1;}}   // lift onto the arch
  }
  const quads=[];
  for(let si=0;si<stations.length-1;si++)for(let k=0;k<n-1;k++){const a=si*n+k;quads.push([a,a+1,a+n+1,a+n,(stations[si]+stations[si+1])/2,(k+0.5)/(n-1)]);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  const groups=[];
  const va=new THREE.Vector3(),vb=new THREE.Vector3(),vc=new THREE.Vector3(),nn=new THREE.Vector3(),cen=new THREE.Vector3();
  for(const [a,b,c,d,z,s] of quads){
    va.fromArray(pos,a*3);vb.fromArray(pos,b*3);vc.fromArray(pos,c*3);
    nn.subVectors(vc,vb).cross(vb.clone().sub(va)).normalize();
    cen.set(0,0,0).add(va).add(vb).add(vc).add(new THREE.Vector3().fromArray(pos,d*3)).multiplyScalar(0.25);
    const allMoved=moved[a]&&moved[b]&&moved[c]&&moved[d];
    const m=allMoved?'well':classify(z,s,cen,nn);
    (groups[m]=groups[m]||[]).push(a,b,c,a,c,d);
  }
  if(caps)[[0,1],[stations.length-1,-1]].forEach(([si,dir])=>{
    const base=si*n;let cx=0,cy=0;for(let k=0;k<n;k++){cx+=pos[(base+k)*3];cy+=pos[(base+k)*3+1];}
    const c=pos.length/3;pos.push(cx/n,cy/n,stations[si]);
    const arr=groups[dir>0?'tailcap':'nosecap']=groups[dir>0?'tailcap':'nosecap']||[];
    for(let k=0;k<n-1;k++){if(dir>0)arr.push(c,base+k,base+k+1);else arr.push(c,base+k+1,base+k);}
  });
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  return {g,groups};
}
function finish(g,groups,order){
  const idx=[];g.clearGroups();
  order.forEach((names,mi)=>{const start=idx.length;for(const nme of names)if(groups[nme])idx.push(...groups[nme]);if(idx.length>start)g.addGroup(start,idx.length-start,mi);});
  g.setIndex(idx);g.computeVertexNormals();return g;
}
function lowerRing(z){
  const h=spline(lowerCtrl(z),16).map(v=>[v.x,v.y]);
  return h.concat(h.slice(0,-1).reverse().map(p=>[-p[0],p[1]]));
}
function cabRing(z,shrink=0){
  const h=spline(cabCtrl(z),14).map(v=>[Math.max(0,v.x-shrink),v.y-(v.x<0.01?shrink:0)]);
  return h.slice().reverse().map(p=>[-p[0],p[1]]).concat(h.slice(1));
}
const range=(a,b,step)=>{const o=[];for(let z=a;z<b-1e-6;z+=step)o.push(z);o.push(b);return o;};

function bodyGeometry(){
  const {g,groups}=loft(range(TAIL,NOSE,0.035),lowerRing,(z,s,c,n)=>{
    if(c.y<0.235||(z>NOSE-0.3&&c.y<0.3)||(z<TAIL+0.25&&c.y<0.42))return 'trim';
    if(z>1.0&&z<NOSE-0.2&&Math.abs(c.x)<pl(HALF_W,z)*0.5&&Math.abs(n.y)>0.6&&c.y>0.6)return 'carbon';
    return 'paint';
  },{caps:true,arches:true});
  return finish(g,groups,[['paint','tailcap','nosecap'],['carbon'],['trim'],['well']]);
}
function cabinGeometry(){
  const {g,groups}=loft(range(CAB_Z1,CAB_Z0,0.03),z=>cabRing(z),(z,s)=>{
    if(z>0.3&&z<0.88&&s>0.1&&s<0.9)return 'glass';
    if(z>-0.86&&z<0.25&&((s>0.05&&s<0.27)||(s>0.73&&s<0.95)))return 'glass';
    if(z>-1.02&&z<-0.88&&((s>0.08&&s<0.24)||(s>0.76&&s<0.92)))return 'glass';
    if(z>TAIL+0.48&&z<ZR-0.06&&s>0.33&&s<0.67)return 'glass';
    if(z>-0.92&&z<0.29&&((s>0.035&&s<=0.05)||(s>=0.95&&s<0.965)))return 'trim';
    return 'paint';
  });
  return finish(g,groups,[['paint'],['carbon'],['glass'],['trim']]);
}
function innerGeometry(){
  /* inside of the cabin seen from the cockpit, with the glass left open */
  const {g,groups}=loft(range(CAB_Z1,CAB_Z0,0.04),z=>cabRing(z,0.035),(z,s)=>{
    if(z>0.3&&z<0.88&&s>0.1&&s<0.9)return 'no';
    if(z>-0.86&&z<0.25&&((s>0.05&&s<0.27)||(s>0.73&&s<0.95)))return 'no';
    if(z>TAIL+0.48&&z<ZR-0.06&&s>0.33&&s<0.67)return 'no';
    return 'in';
  });
  return finish(g,groups,[['in']]);
}

/* ---------------- wheels: forged 10-spoke, centre lock, Cup 2 R tyres ---------------- */
function tyreGeo(r,w){
  const pts=[],rim=r-0.105;
  pts.push(new THREE.Vector2(rim,-w/2+0.012));
  for(let k=0;k<=14;k++){const a=-Math.PI/2+k/14*Math.PI,cr=0.045;pts.push(new THREE.Vector2(r-cr+Math.cos(a)*cr*(0.6+0.4*Math.cos(a)),(w/2-cr)*Math.sin(a)+Math.sin(a)*cr));}
  pts.push(new THREE.Vector2(rim,w/2-0.012));
  const g=new THREE.LatheGeometry(pts,48);g.rotateZ(Math.PI/2);return g;
}
const tyreTex=tex(512,64,(g,w,h)=>{g.fillStyle='#202022';g.fillRect(0,0,w,h);
  g.fillStyle='#29292c';for(let x=0;x<w;x+=16)g.fillRect(x,0,3,h);
  g.fillStyle='rgba(255,255,255,0.05)';for(let i=0;i<600;i++)g.fillRect(Math.random()*w,Math.random()*h,1,1);},true);
/* spokes with see-through gaps so the yellow calipers and drilled discs show */
const rimTex=tex(512,512,(g,w,h)=>{g.clearRect(0,0,w,h);g.translate(w/2,h/2);
  const R=250;
  g.fillStyle='#6a6e74';g.beginPath();g.arc(0,0,R,0,7);g.arc(0,0,R-26,0,7,true);g.fill();
  g.strokeStyle='#73777d';g.lineWidth=4;g.beginPath();g.arc(0,0,R-3,0,7);g.stroke();
  for(let k=0;k<10;k++){g.save();g.rotate(k/10*Math.PI*2);
    const gr=g.createLinearGradient(-18,0,18,0);gr.addColorStop(0,'#7c8188');gr.addColorStop(0.5,'#c2c7cd');gr.addColorStop(1,'#73787e');g.fillStyle=gr;
    /* Y-shaped spoke: one stem splitting into two near the rim */
    g.beginPath();g.moveTo(-15,55);g.lineTo(15,55);g.lineTo(12,150);g.lineTo(34,R-20);g.lineTo(16,R-20);g.lineTo(0,175);g.lineTo(-16,R-20);g.lineTo(-34,R-20);g.lineTo(-12,150);g.closePath();g.fill();g.restore();}
  g.fillStyle='#70747a';g.beginPath();g.arc(0,0,64,0,7);g.fill();
  g.fillStyle='#2a2c30';for(let k=0;k<10;k++){const a=k/10*Math.PI*2+Math.PI/10;g.beginPath();g.arc(Math.cos(a)*48,Math.sin(a)*48,5,0,7);g.fill();}
  /* centre-lock nut */
  g.fillStyle='#8a8e94';g.beginPath();for(let k=0;k<6;k++){const a=k/6*Math.PI*2;g.lineTo(Math.cos(a)*30,Math.sin(a)*30);}g.closePath();g.fill();
  g.fillStyle='#c8202a';g.beginPath();g.arc(0,0,11,0,7);g.fill();},true);
rimTex.wrapS=rimTex.wrapT=THREE.ClampToEdgeWrapping;
const discTex=tex(256,256,(g,w,h)=>{g.fillStyle='#3a3836';g.fillRect(0,0,w,h);g.translate(w/2,h/2);
  g.strokeStyle='#6d6a65';for(let r=40;r<126;r+=3){g.globalAlpha=0.3+Math.random()*0.4;g.beginPath();g.arc(0,0,r,0,7);g.stroke();}g.globalAlpha=1;
  g.fillStyle='#1d1c1b';for(let k=0;k<48;k++){const a=k/48*Math.PI*2,r=70+(k%3)*18;g.beginPath();g.arc(Math.cos(a)*r,Math.sin(a)*r,3.5,0,7);g.fill();}
  g.fillStyle='#3a3836';g.beginPath();g.arc(0,0,38,0,7);g.fill();},true);
const rimMat=new THREE.MeshStandardMaterial({map:rimTex,metalness:0.3,roughness:0.32,envMapIntensity:1.0,alphaTest:0.5,side:THREE.DoubleSide});
const tyreMat=new THREE.MeshStandardMaterial({map:tyreTex,color:0x707070,roughness:0.88,metalness:0,envMapIntensity:0.2,side:THREE.DoubleSide});
const discMat=new THREE.MeshStandardMaterial({map:discTex,metalness:0.6,roughness:0.5,emissive:new THREE.Color(1,0.25,0.02),emissiveIntensity:0});
const barrelMat=std(0x1a1b1d,0.6,0.3,{side:THREE.DoubleSide,envMapIntensity:0.3});
function makeWheel(r,w,front,caliperCol){
  const g=new THREE.Group();   // steer pivot
  const spin=new THREE.Group();g.add(spin);
  const t=new THREE.Mesh(tyreGeo(r,w),tyreMat);t.castShadow=true;spin.add(t);
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(r-0.105,r-0.105,w*0.9,32,1,true),barrelMat);barrel.rotation.z=Math.PI/2;spin.add(barrel);
  const face=new THREE.Mesh(new THREE.CircleGeometry(r-0.1,48),rimMat);face.rotation.y=Math.PI/2;face.position.x=w/2-0.04;spin.add(face);
  /* disc and caliper don't spin */
  const disc=new THREE.Mesh(new THREE.CylinderGeometry(r-0.135,r-0.135,0.034,36),discMat.clone());disc.rotation.z=Math.PI/2;disc.position.x=w/2-0.15;g.add(disc);
  const cal=new THREE.Mesh(new THREE.BoxGeometry(0.075,0.24,0.12),std(caliperCol,0.4,0.15));cal.position.set(w/2-0.105,0.07,front?-0.1:0.1);cal.rotation.x=front?-0.5:0.5;g.add(cal);
  return {g,spin,disc,face,cal};
}

/* ---------------- livery ---------------- */
const decalTex=tex(1024,128,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  g.font='italic 800 118px "Chakra Petch", sans-serif';g.textBaseline='middle';g.textAlign='center';
  g.lineJoin='round';g.lineWidth=10;g.strokeStyle='rgba(20,20,22,0.95)';g.strokeText('GT3 RS',w/2,h/2+6);
  g.fillStyle='rgba(222,226,228,0.97)';g.fillText('GT3 RS',w/2,h/2+6);
  /* the photo's decal sits on a light stripe running along the sill */
  g.globalCompositeOperation='destination-over';g.fillStyle='rgba(205,210,212,0.95)';g.fillRect(0,h*0.52,w,h*0.38);
});
function numTex(num){return tex(128,128,(g,w,h)=>{g.clearRect(0,0,w,h);g.fillStyle='rgba(240,240,236,0.95)';g.beginPath();g.arc(64,64,60,0,7);g.fill();
  g.fillStyle='#141416';g.font='800 72px "Chakra Petch", sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(String(num),64,70);});}
/* a patch that follows the body side between z0..z1, y0..y1 */
function sidePatch(side,z0,z1,y0,y1,mat,nz=24,ny=4,lift=0.006){
  const pos=[],uv=[],idx=[];
  for(let i=0;i<=nz;i++)for(let j=0;j<=ny;j++){
    const z=z0+(z1-z0)*i/nz,y=y0+(y1-y0)*j/ny;
    pos.push(side*(sideX(z,y)+lift),y,z);uv.push(side>0?1-i/nz:i/nz,j/ny);
    if(i<nz&&j<ny){const a=i*(ny+1)+j;if(side>0)idx.push(a,a+ny+1,a+1,a+1,a+ny+1,a+ny+2);else idx.push(a,a+1,a+ny+1,a+1,a+ny+2,a+ny+1);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
  return new THREE.Mesh(g,mat);
}

/* ---------------- shared geometry and materials ---------------- */
const bodyGeo=bodyGeometry(),cabGeo=cabinGeometry(),innerGeo=innerGeometry();
const carbonTex=tex(128,128,(g,w,h)=>{g.fillStyle='#141416';g.fillRect(0,0,w,h);
  for(let y=0;y<h;y+=8)for(let x=0;x<w;x+=8){g.fillStyle=((x+y)/8)%2?'#1c1c1f':'#101012';g.fillRect(x,y,8,8);}},true);
carbonTex.repeat.set(20,20);
const carbon=new THREE.MeshPhysicalMaterial({color:lin(0x1a1a1d),roughness:0.28,metalness:0.2,clearcoat:1,clearcoatRoughness:0.05,envMapIntensity:0.9});
const trimMat=std(0x111113,0.55,0.15,{envMapIntensity:0.4});
const wellMat=std(0x070708,0.9,0,{side:THREE.DoubleSide});
const glassMat=new THREE.MeshPhysicalMaterial({color:lin(0x0a0f14),roughness:0.03,metalness:0.1,transparent:true,opacity:0.6,envMapIntensity:1.8,clearcoat:1,clearcoatRoughness:0.02});
const interiorMat=new THREE.MeshStandardMaterial({color:lin(0x151517),roughness:0.85,side:THREE.BackSide});
const decalMat=new THREE.MeshStandardMaterial({side:THREE.DoubleSide,map:decalTex,transparent:true,roughness:0.35,polygonOffset:true,polygonOffsetFactor:-2,depthWrite:false});
const amberMat=new THREE.MeshStandardMaterial({color:lin(0xff9a2a),emissive:new THREE.Color(1,0.45,0.05),emissiveIntensity:0.5,roughness:0.2});

export function buildCar(color,num,opts={}){
  const root=new THREE.Group();          // follows the physics pose (ground, heading)
  const body=new THREE.Group();root.add(body);      // rolls and pitches on the springs
  const paint=new THREE.MeshPhysicalMaterial({color:lin(color),metalness:0.35,roughness:0.34,clearcoat:1,clearcoatRoughness:0.04,envMapIntensity:1.2});
  const shell=new THREE.Mesh(bodyGeo,[paint,carbon,trimMat,wellMat]);shell.castShadow=true;shell.receiveShadow=true;body.add(shell);
  const cab=new THREE.Mesh(cabGeo,[paint,carbon,glassMat,trimMat]);cab.castShadow=true;body.add(cab);
  const inner=new THREE.Mesh(innerGeo,interiorMat);inner.visible=false;body.add(inner);
  const add=(geo,mat,x,y,z,rx=0,ry=0,rz=0,cast=true)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.rotation.set(rx,ry,rz);m.castShadow=cast;body.add(m);return m;};
  const B=(w,h,d)=>new THREE.BoxGeometry(w,h,d);
  const tube=(pts,r,mat)=>{const c=new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(...p)));const m=new THREE.Mesh(new THREE.TubeGeometry(c,20,r,8,false),mat);m.castShadow=true;body.add(m);return m;};
  /* wheel wells: dark tubes so you never see into the body */
  for(const [zc,yc,R] of ARCHES)[-1,1].forEach(s=>{const w=new THREE.Mesh(new THREE.CylinderGeometry(R-0.01,R-0.01,0.42,24,1,true,-Math.PI*0.15,Math.PI*1.3),wellMat);w.rotation.z=Math.PI/2;w.rotation.x=0;w.position.set(s*0.72,yc,zc);body.add(w);});
  /* front: two-section bumper intakes, splitter, hood nostrils, fender louvres, amber side markers */
  add(B(1.46,0.022,0.22),carbon,0,0.12,NOSE-0.16);
  /* intakes: dark boxes sunk into the bumper so only their faces show, flush with the surface */
  const flush=(x,y,w,h,ry=0)=>{const z=noseZ(x,y);add(B(w,h,0.2),trimMat,x,y,z-0.095,0,ry,0,false);};
  [-1,1].forEach(s=>{flush(s*0.5,0.27,0.36,0.14,s*0.35);
    add(B(0.012,0.05,0.09),amberMat,s*(sideX(NOSE-0.3,0.42)+0.004),0.42,NOSE-0.3,0,0,0,false);});
  flush(0,0.25,0.52,0.1);
  [-1,1].forEach(s=>{const z=NOSE-0.38,y=pl(CENTRE,z)+0.006;const v=add(B(0.16,0.02,0.36),trimMat,s*0.24,y,z,-0.26,0,0,false);});
  [-1,1].forEach(s=>{for(let k=0;k<8;k++){const z=ZF-0.05+k*0.055;add(B(0.3,0.012,0.028),trimMat,s*0.7,pl(SHOULDER,z)+0.004,z,0.15,0,0,false);}});
  /* headlights: oval LED units set into the fender tops */
  const lensMat=new THREE.MeshPhysicalMaterial({color:lin(0xb0b8c0),metalness:0.5,roughness:0.06,clearcoat:1,transparent:true,opacity:0.9});
  const drlMat=new THREE.MeshStandardMaterial({color:0xffffff,emissive:new THREE.Color(0.85,0.92,1),emissiveIntensity:2.4});
  [-1,1].forEach(s=>{
    const z=NOSE-0.33,y=pl(SHOULDER,z)-0.035,x=s*0.6;
    const l=new THREE.Mesh(new THREE.SphereGeometry(0.12,24,12),lensMat);l.scale.set(1.05,0.55,1.45);l.position.set(x,y,z);l.rotation.x=0.5;body.add(l);
    for(let k=0;k<4;k++){const a=k/4*Math.PI*2+Math.PI/4;add(B(0.03,0.01,0.018),drlMat,x+Math.cos(a)*0.06,y+0.035+Math.sin(a)*0.02,z+0.1+Math.sin(a)*0.04,0.5,0,0,false);}
  });
  /* mirrors (black, Weissach) on short stalks, flush door handles */
  [-1,1].forEach(s=>{const z=CAB_Z0-0.22,xb=sideX(z,0.92);
    add(B(0.07,0.025,0.1),trimMat,s*(xb+0.02),0.93,z);
    const m=add(B(0.22,0.11,0.12),carbon,s*(xb+0.12),0.98,z-0.02,0,s*0.12,0);
    add(B(0.008,0.025,0.2),trimMat,s*(sideX(-0.35,0.82)+0.003),0.82,-0.35,0,0,0,false);});
  /* rear-fender intake ahead of the rear wheel, door decal and number */
  [-1,1].forEach(s=>body.add(sidePatch(s,ZR+0.42,ZR+0.62,0.52,0.78,trimMat,6,4,0.004)));
  [-1,1].forEach(s=>body.add(sidePatch(s,ZR+0.62,ZF-0.42,0.2,0.36,decalMat,30,3)));
  const nm=new THREE.MeshStandardMaterial({side:THREE.DoubleSide,map:numTex(num),transparent:true,roughness:0.35,polygonOffset:true,polygonOffsetFactor:-2,depthWrite:false});
  [-1,1].forEach(s=>body.add(sidePatch(s,-0.15,0.17,0.48,0.8,nm,6,4)));
  /* rear: swan-neck wing with black uprights and endplates, DRS flap, light bar, diffuser */
  const wy=1.3,wz=TAIL+0.22;
  const wingMain=add(B(1.86,0.035,0.44),carbon,0,wy,wz,0.1,0,0);
  const flap=add(B(1.84,0.028,0.22),carbon,0,wy+0.085,wz-0.2,0.42,0,0);
  [-1,1].forEach(s=>{add(B(0.018,0.3,0.74),carbon,s*0.94,wy+0.01,wz-0.06);
    tube([[s*0.3,pl(CENTRE,wz+0.55)+0.01,wz+0.55],[s*0.3,wy-0.05,wz+0.42],[s*0.3,wy+0.12,wz+0.22],[s*0.3,wy+0.06,wz+0.02]],0.022,carbon);});
  add(B(0.012,0.2,0.85),paint,0,pl(CAB_TOP,TAIL+0.75)+0.07,TAIL+0.75,-0.25,0,0);
  const tail=new THREE.MeshStandardMaterial({color:lin(0x3a0404),emissive:new THREE.Color(1,0.04,0.02),emissiveIntensity:0.6,roughness:0.25});
  add(B(1.64,0.035,0.03),tail,0,0.86,TAIL+0.08,0,0,0,false);
  [-1,1].forEach(s=>add(B(0.14,0.05,0.03),tail,s*0.8,0.84,TAIL+0.1,0,s*-0.45,0,false));
  for(let k=-3;k<=3;k++)add(B(0.16,0.012,0.04),trimMat,k*0.2,0.74,TAIL+0.06,0,0,0,false);
  add(B(1.36,0.1,0.3),trimMat,0,0.24,TAIL+0.24);
  for(let k=-3;k<=3;k++)add(B(0.012,0.12,0.28),carbon,k*0.18,0.2,TAIL+0.22,0,0,0,false);
  const ti=std(0x8d8577,0.25,0.9,{side:THREE.DoubleSide});
  [-1,1].forEach(s=>add(new THREE.CylinderGeometry(0.058,0.058,0.12,18,1,true),ti,s*0.11,0.33,TAIL+0.05,Math.PI/2,0,0));
  /* interior: dash, wheel, bucket seats, cage */
  const dash=std(0x1a1a1c,0.8);
  add(B(1.5,0.14,0.42),dash,0,0.8,CAB_Z0-0.32,0.15,0,0,false);
  add(B(0.36,0.09,0.16),dash,0.36,0.9,CAB_Z0-0.44,0.35,0,0,false);
  const gauge=new THREE.MeshStandardMaterial({color:0x000000,emissive:new THREE.Color(0.9,0.75,0.45),emissiveIntensity:0.25,roughness:0.4});
  add(B(0.3,0.08,0.01),gauge,0.36,0.88,CAB_Z0-0.525,-0.35,0,0,false);
  const wheel=new THREE.Group();wheel.position.set(0.36,0.84,CAB_Z0-0.62);wheel.rotation.x=-0.35;body.add(wheel);
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.16,0.017,8,28),std(0x1c1c1e,0.7)));
  wheel.add(new THREE.Mesh(new THREE.BoxGeometry(0.32,0.05,0.03),std(0x2a2a2d,0.6)));
  const mark=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.025,0.025),std(0xf2c230,0.5));mark.position.y=0.16;wheel.add(mark);
  [-1,1].forEach(s=>{add(B(0.5,0.08,0.55),dash,s*0.36,0.34,-0.6,0,0,0,false);add(B(0.5,0.7,0.1),dash,s*0.36,0.66,-0.88,-0.15,0,0,false);});
  const cage=std(0x2a2a2d,0.5,0.6);
  [-1,1].forEach(s=>{add(B(0.03,0.03,1.0),cage,s*0.54,1.07,-0.6,0.1,0,0,false);add(B(0.035,0.5,0.035),cage,s*0.58,0.92,-1.0,0,0,0,false);});
  add(B(1.06,0.03,0.03),cage,0,1.06,-1.0,0,0,0,false);
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
  /* soft contact shadow under the car */
  const ao=new THREE.Mesh(new THREE.PlaneGeometry(2.3,5.0),new THREE.MeshBasicMaterial({map:aoTex,transparent:true,depthWrite:false,opacity:0.85}));
  ao.rotation.x=-Math.PI/2;ao.position.y=0.02;ao.position.z=(NOSE+TAIL)/2;root.add(ao);
  /* merge every static body part per material to keep draw calls down */
  const keep=new Set([shell,cab,inner,flap,wheel]);
  const byMat=new Map();
  for(const m of [...body.children]){
    if(keep.has(m)||!m.isMesh||Array.isArray(m.material))continue;
    m.updateMatrix();let g=m.geometry.clone().applyMatrix4(m.matrix);
    if(g.index===null)continue;
    for(const k of Object.keys(g.attributes))if(!['position','normal','uv'].includes(k))g.deleteAttribute(k);
    if(!g.attributes.uv){g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));}
    if(!byMat.has(m.material))byMat.set(m.material,[]);
    byMat.get(m.material).push(g);body.remove(m);
  }
  for(const [mat,gs] of byMat){const mm=new THREE.Mesh(merge(gs),mat);mm.castShadow=!mat.transparent;body.add(mm);}
  return {root,body,wheels,paint,tail,steeringWheel:wheel,wingFlap:flap,wingMain,cab,inner,shell,discs:wheels.map(w=>w.disc)};
}
const aoTex=tex(64,128,(g,w,h)=>{const gr=g.createRadialGradient(w/2,h/2,4,w/2,h/2,w*0.7);gr.addColorStop(0,'rgba(0,0,0,0.85)');gr.addColorStop(0.6,'rgba(0,0,0,0.45)');gr.addColorStop(1,'rgba(0,0,0,0)');
  g.save();g.scale(1,2);g.fillStyle=gr;g.fillRect(0,0,w,h/2);g.restore();},false);
export const DRIVER_EYE=new THREE.Vector3(0.36,1.05,-0.3);
export const CAB0=CAB_Z0;
export {NOSE,TAIL};
