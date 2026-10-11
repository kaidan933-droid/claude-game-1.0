import * as THREE from 'three';
import {rnd,clamp,sstep,lin,scene,tex,speckle,std,sunDir,QUALITY} from './core.js';
import {asphaltSet,kerbSet,grassSet,gravelSet} from './textures.js';
import {T,RL,HW,CURB_W} from './sim/world.js';
import {buildForest,updateForest,setForestQuality} from './trees.js';

const {N,ds,LEN,X,Y,Z,NX,NZ,TX,TZ,BANK,CURB,BAR_L,BAR_R,GRAVEL_L,GRAVEL_R,mod}=T;

/* ================= textures ================= */
const concreteTex=tex(512,512,(g,w,h)=>{g.fillStyle='#8e8b84';g.fillRect(0,0,w,h);
  speckle(g,w,h,['#86837c','#97948d','#7b7871','#a19e97'],60000,1.8);
  g.fillStyle='rgba(40,38,34,.6)';for(let y=0;y<h;y+=64)g.fillRect(0,y,w,3);for(let x=0;x<w;x+=128)g.fillRect(x,0,3,h);
  g.fillStyle='rgba(30,30,30,.25)';for(let i=0;i<40;i++)g.fillRect(rnd()*w,rnd()*h,20+rnd()*60,4+rnd()*8);});
const armcoTex=tex(16,128,(g,w,h)=>{const gr=g.createLinearGradient(0,0,0,h);
  [[0,'#9aa0a6'],[.1,'#dfe3e7'],[.22,'#80868c'],[.34,'#d6dade'],[.46,'#868c92'],[.54,'#9aa0a6'],[.6,'#dfe3e7'],[.72,'#80868c'],[.84,'#d6dade'],[.96,'#868c92'],[1,'#9aa0a6']].forEach(s=>gr.addColorStop(s[0],s[1]));
  g.fillStyle=gr;g.fillRect(0,0,w,h);speckle(g,w,h,['rgba(90,70,50,.25)'],80,2);});
const hedgeTex=tex(256,128,(g,w,h)=>{g.fillStyle='#2c3f1e';g.fillRect(0,0,w,h);speckle(g,w,h,['#3a5228','#22331a','#4a6332','#1c2a14','#567038'],14000,3.2);});

/* ================= ribbon builder ================= */
/* A strip following the track from sample i0 to i1 (inclusive, wrapping), with vertices at the given
   lateral offsets. yOff(k) lifts each column; uv: u from the column, v along the track. */
const CHUNK=250;
function ribbon(offs,yOff,mat,opt={}){
  const a0=opt.i0??0,a1=opt.i1??N;
  /* split long strips so each piece can be frustum-culled */
  if(a1-a0>CHUNK*1.5){let last;for(let a=a0;a<a1;a+=CHUNK)last=ribbon(offs,yOff,mat,Object.assign({},opt,{i0:a,i1:Math.min(a1,a+CHUNK)}));return last;}
  const i0=a0,i1=a1,vLen=opt.vLen||20,us=opt.u||offs.map((_,k)=>k/(offs.length-1));
  const n=offs.length,pos=[],uv=[],idx=[],col=opt.color?[]:null;
  const reps=Math.max(1,Math.round(LEN/vLen)),vs=LEN/reps;
  for(let j=i0;j<=i1;j++){
    const i=mod(j),bank=BANK[i];
    for(let k=0;k<n;k++){
      const o=typeof offs[k]==='function'?offs[k](i):offs[k];
      pos.push(X[i]+NX[i]*o,Y[i]+o*bank+(typeof yOff==='function'?yOff(k,i,o):yOff),Z[i]+NZ[i]*o);
      uv.push(us[k],j*ds/vs);
      if(col){const c=opt.color(i,o,k);col.push(c[0],c[1],c[2]);}
      if(j<i1&&k<n-1){const a=(j-i0)*n+k;idx.push(a,a+1,a+n,a+1,a+n+1,a+n);}   // upward-facing
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  if(col)g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  g.setIndex(idx);g.computeVertexNormals();
  const m=new THREE.Mesh(g,mat);m.receiveShadow=opt.receive!==false;m.castShadow=!!opt.cast;scene.add(m);return m;
}
/* contiguous index ranges where pred(i) holds */
function ranges(pred,pad=0){
  const out=[];let s=-1;
  for(let i=0;i<N;i++){const p=pred(i);if(p&&s<0)s=i;if(!p&&s>=0){out.push([s-pad,i-1+pad]);s=-1;}}
  if(s>=0){if(out.length&&out[0][0]-pad===0){out[0][0]=s-pad-N;}else out.push([s-pad,N-1+pad]);}
  return out;
}

/* ================= road ================= */
const roadOffs=[-HW,-HW+0.3,-3.6,-2.2,-1,0,1,2.2,3.6,HW-0.3,HW];
const lineD=i=>RL.D[i];
const rubber=(i,o)=>{const t=(o-lineD(i))/1.4;const r=Math.exp(-t*t);const p=0.93+0.07*Math.sin(i*0.021)+0.04*Math.sin(i*0.13+1.7);return [p*(1-0.2*r),p*(1-0.2*r),p*(1-0.18*r)];};
const concrete=i=>Math.abs(BANK[i])>0.2;
const TS=QUALITY>=1?1024:512;
const asp=asphaltSet(TS);
const roadMat=new THREE.MeshStandardMaterial({...asp,normalScale:new THREE.Vector2(0.12,0.12),vertexColors:true,envMapIntensity:0.45});
const concMat=new THREE.MeshStandardMaterial({map:concreteTex,normalMap:asp.normalMap,normalScale:new THREE.Vector2(0.4,0.4),roughness:0.9,vertexColors:true,envMapIntensity:0.3});
const roadU=roadOffs.map(o=>(o+HW)/(2*HW));
for(const [a,b] of ranges(i=>!concrete(i)))ribbon(roadOffs,0.0,roadMat,{i0:a,i1:b+1,vLen:10.4,u:roadU,color:rubber});
for(const [a,b] of ranges(concrete))ribbon(roadOffs,0.0,concMat,{i0:a,i1:b+1,vLen:10,u:roadOffs.map(o=>(o+HW)/(2*HW)*2.5),color:rubber});

/* kerbs: red/white on quick corners, yellow/black where the corner is slow; raised on the outside */
const kerbRW=kerbSet(),kerbYB=kerbSet([226,182,30],[30,30,32]);
const curbMat=new THREE.MeshStandardMaterial({...kerbRW,normalScale:new THREE.Vector2(0.3,0.3),envMapIntensity:0.4});
const curbMatY=new THREE.MeshStandardMaterial({...kerbYB,normalScale:new THREE.Vector2(0.3,0.3),envMapIntensity:0.4});
for(const [a,b] of ranges(i=>CURB[i]===1,3)){
  let kmax=0;for(let i=a;i<=b;i++)kmax=Math.max(kmax,Math.abs(T.K[mod(i)]));
  const m=kmax>1/70?curbMatY:curbMat;
  ribbon([HW-0.02,HW+CURB_W*0.5,HW+CURB_W],(k)=>[0.006,0.035,0.05][k],m,{i0:a,i1:b,vLen:2});
  ribbon([-HW-CURB_W,-HW-CURB_W*0.5,-HW+0.02],(k)=>[0.05,0.035,0.006][k],m,{i0:a,i1:b,vLen:2});
}
/* grass verges out to the barriers, dropping to the terrain at the edge; mown in stripes */
const gs=grassSet(TS/2);
const grassMat=new THREE.MeshStandardMaterial({...gs,normalScale:new THREE.Vector2(0.12,0.12),roughness:0.95,envMapIntensity:0.2,vertexColors:true});
for(const t of [gs.map,gs.normalMap])t.repeat.set(3,1);
const mow=i=>{const f=((i*ds/7)|0)%2?1.07:0.93;return [f,f,f];};
const vergeR=[HW-0.05,HW+1.5,i=>BAR_R[i]-1,i=>BAR_R[i]+1.4,i=>BAR_R[i]+4];
const vergeL=[i=>-BAR_L[i]-4,i=>-BAR_L[i]-1.4,i=>-BAR_L[i]+1,-HW-1.5,-HW+0.05];
ribbon(vergeR,(k)=>[-0.02,-0.06,-0.12,-0.2,-0.5][k],grassMat,{vLen:12,color:(i,o,k)=>k>=3?[0.8,0.8,0.75]:mow(i)});
ribbon(vergeL,(k)=>[-0.5,-0.2,-0.12,-0.06,-0.02][k],grassMat,{vLen:12,color:(i,o,k)=>k<=1?[0.8,0.8,0.75]:mow(i)});
/* gravel traps */
const gv=gravelSet(TS/2);
for(const t of Object.values(gv))t.repeat.set(3,1);
const gravelMat=new THREE.MeshStandardMaterial({...gv,normalScale:new THREE.Vector2(0.3,0.3),polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
for(const [a,b] of ranges(i=>GRAVEL_R[i]===1,2))ribbon([HW+2.5,HW+3.2,i=>BAR_R[i]-0.6],(k)=>[-0.04,-0.05,-0.12][k],gravelMat,{i0:a,i1:b,vLen:6});
for(const [a,b] of ranges(i=>GRAVEL_L[i]===1,2))ribbon([i=>-BAR_L[i]+0.6,-HW-3.2,-HW-2.5],(k)=>[-0.12,-0.05,-0.04][k],gravelMat,{i0:a,i1:b,vLen:6});

/* ================= barriers ================= */
/* double armco: two W-beams on posts; on the start/finish straight a concrete pit wall */
const pitWall=i=>BAR_R[i]<HW+3;
const armcoMat=new THREE.MeshStandardMaterial({map:armcoTex,metalness:0.8,roughness:0.38,side:THREE.DoubleSide,envMapIntensity:1.0});
function wallStrip(side,prof,mat,pred,uLen,cast=true){
  /* prof: [[outward offset, height, v]] cross-section, side +1 right, -1 left */
  const rs=[];for(const [a,b] of ranges(pred)){for(let q=a;q<=b;q+=CHUNK)rs.push([q,Math.min(b,q+CHUNK-1)]);}
  for(const [a,b] of rs){
    const pos=[],uv=[],idx=[],n=prof.length;
    for(let j=a;j<=b+1;j++){
      const i=mod(j),bar=side>0?BAR_R[i]:BAR_L[i];
      for(let k=0;k<n;k++){
        const o=side*(bar+prof[k][0]);
        pos.push(X[i]+NX[i]*o,Y[i]+o*BANK[i]+prof[k][1],Z[i]+NZ[i]*o);uv.push(j*ds/uLen,prof[k][2]);
        if(j<=b&&k<n-1){const q=(j-a)*n+k;if(side>0)idx.push(q,q+1,q+n,q+1,q+n+1,q+n);else idx.push(q,q+n,q+1,q+1,q+n,q+n+1);}
      }
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    g.setIndex(idx);g.computeVertexNormals();const m=new THREE.Mesh(g,mat);m.castShadow=cast;m.receiveShadow=true;scene.add(m);
  }
}
const W_BEAM=[[0.05,0.28,0],[0,0.36,0.17],[0.06,0.44,0.34],[0,0.52,0.5],[0.06,0.6,0.66],[0,0.68,0.83],[0.05,0.76,1]];
wallStrip(1,W_BEAM,armcoMat,i=>!pitWall(i),6);
wallStrip(-1,W_BEAM,armcoMat,()=>true,6);
const pitMat=new THREE.MeshStandardMaterial({map:concreteTex,roughness:0.9});
wallStrip(1,[[0,-0.3,0],[0,1.05,0.4],[0.35,1.1,0.45],[0.35,-0.3,0.8]],pitMat,pitWall,8);
/* posts */
(function(){
  const geo=new THREE.BoxGeometry(0.1,0.85,0.14);geo.translate(0,0.25,0);
  const pts=[];
  for(let i=0;i<N;i+=2){
    for(const side of [-1,1]){if(side>0&&pitWall(i))continue;const bar=(side>0?BAR_R[i]:BAR_L[i])+0.12,o=side*bar;
      pts.push([X[i]+NX[i]*o,Y[i]+o*BANK[i],Z[i]+NZ[i]*o,Math.atan2(TX[i],TZ[i])]);}
  }
  const m=new THREE.InstancedMesh(geo,std(0x5d6268,0.5,0.7),pts.length),d=new THREE.Object3D();
  pts.forEach((p,k)=>{d.position.set(p[0],p[1],p[2]);d.rotation.set(0,p[3],0);d.updateMatrix();m.setMatrixAt(k,d.matrix);});
  m.receiveShadow=true;scene.add(m);
})();
/* hedges behind the armco on long stretches */
const hedgeMat=new THREE.MeshStandardMaterial({map:hedgeTex,roughness:1});
const hedgeOn=i=>((i*ds/260)|0)%3!==0&&!pitWall(i);
for(const side of [-1,1]){
  const h=i=>1.6+0.6*Math.sin(i*0.05+side)+0.4*Math.sin(i*0.17);
  wallStrip(side,[[2.2,-0.4,0],[2.3,1.2,0.6],[3.4,1.9,1],[4.4,1.2,0.6],[4.6,-0.4,0]],hedgeMat,i=>hedgeOn(i)&&!(side<0&&i>N-170)&&!(side<0&&i<140),5);
}

/* ================= terrain ================= */
let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
for(let i=0;i<N;i++){minX=Math.min(minX,X[i]);maxX=Math.max(maxX,X[i]);minZ=Math.min(minZ,Z[i]);maxZ=Math.max(maxZ,Z[i]);}
const PAD=750,CELL=20;
const gx0=minX-PAD,gz0=minZ-PAD,GW=Math.ceil((maxX-minX+2*PAD)/CELL)+1,GH=Math.ceil((maxZ-minZ+2*PAD)/CELL)+1;
const near=new Int32Array(GW*GH).fill(-1),nd2=new Float32Array(GW*GH).fill(1e12);
const cx=c=>gx0+(c%GW)*CELL,cz=c=>gz0+Math.floor(c/GW)*CELL;
for(let i=0;i<N;i++){
  const ci=Math.round((X[i]-gx0)/CELL),cj=Math.round((Z[i]-gz0)/CELL);
  for(let a=-2;a<=2;a++)for(let b=-2;b<=2;b++){const x=ci+a,z=cj+b;if(x<0||z<0||x>=GW||z>=GH)continue;const c=z*GW+x,dx=cx(c)-X[i],dz=cz(c)-Z[i],d=dx*dx+dz*dz;if(d<nd2[c]){nd2[c]=d;near[c]=i;}}
}
function relax(c,n){if(n<0||near[n]<0)return;const i=near[n],dx=cx(c)-X[i],dz=cz(c)-Z[i],d=dx*dx+dz*dz;if(d<nd2[c]){nd2[c]=d;near[c]=i;}}
for(let pass=0;pass<2;pass++){
  for(let z=0;z<GH;z++)for(let x=0;x<GW;x++){const c=z*GW+x;if(x>0)relax(c,c-1);if(z>0){relax(c,c-GW);if(x>0)relax(c,c-GW-1);if(x<GW-1)relax(c,c-GW+1);}}
  for(let z=GH-1;z>=0;z--)for(let x=GW-1;x>=0;x--){const c=z*GW+x;if(x<GW-1)relax(c,c+1);if(z<GH-1){relax(c,c+GW);if(x<GW-1)relax(c,c+GW+1);if(x>0)relax(c,c+GW-1);}}
}
/* value noise */
const PERM=new Uint8Array(512);{const p=[...Array(256).keys()];for(let i=255;i>0;i--){const j=(rnd()*(i+1))|0;[p[i],p[j]]=[p[j],p[i]];}for(let i=0;i<512;i++)PERM[i]=p[i&255];}
const hsh=(x,z)=>PERM[(PERM[x&255]+z)&511]/255;
function vnoise(x,z){const xi=Math.floor(x),zi=Math.floor(z),xf=x-xi,zf=z-zi,u=xf*xf*(3-2*xf),v=zf*zf*(3-2*zf);
  return (hsh(xi,zi)*(1-u)+hsh(xi+1,zi)*u)*(1-v)+(hsh(xi,zi+1)*(1-u)+hsh(xi+1,zi+1)*u)*v;}
function fbm(x,z,o=5){let a=1,s=0,n=0;for(let i=0;i<o;i++){s+=a*vnoise(x,z);n+=a;x*=2.03;z*=2.03;a*=0.5;}return s/n;}
/* broad base: the track's own height, blurred over a few hundred metres */
const base=new Float32Array(GW*GH);
for(let c=0;c<GW*GH;c++)base[c]=Y[near[c]];
function blur(a,r){const o=new Float32Array(a.length);
  for(let z=0;z<GH;z++){let acc=0,cnt=0;for(let x=-r;x<=r;x++){if(x>=0&&x<GW){acc+=a[z*GW+x];cnt++;}}
    for(let x=0;x<GW;x++){o[z*GW+x]=acc/cnt;const ad=x+r+1,rm=x-r;if(ad<GW){acc+=a[z*GW+ad];cnt++;}if(rm>=0){acc-=a[z*GW+rm];cnt--;}}}
  const o2=new Float32Array(a.length);
  for(let x=0;x<GW;x++){let acc=0,cnt=0;for(let z=-r;z<=r;z++){if(z>=0&&z<GH){acc+=o[z*GW+x];cnt++;}}
    for(let z=0;z<GH;z++){o2[z*GW+x]=acc/cnt;const ad=z+r+1,rm=z-r;if(ad<GH){acc+=o[ad*GW+x];cnt++;}if(rm>=0){acc-=o[rm*GW+x];cnt--;}}}
  return o2;}
const base2=blur(blur(base,10),10);
/* a few big wooded hills (the Hohe Acht is the tallest in the Eifel) */
const hills=[];for(let k=0;k<9;k++)hills.push([minX+rnd()*(maxX-minX),minZ+rnd()*(maxZ-minZ),120+rnd()*260,25+rnd()*55]);
const H=new Float32Array(GW*GH),DIST=new Float32Array(GW*GH),FOREST=new Float32Array(GW*GH);
const bil=(A,x,z)=>{const fx=(x-gx0)/CELL,fz=(z-gz0)/CELL,xi=clamp(Math.floor(fx),0,GW-2),zi=clamp(Math.floor(fz),0,GH-2),u=clamp(fx-xi,0,1),v=clamp(fz-zi,0,1);
  return (A[zi*GW+xi]*(1-u)+A[zi*GW+xi+1]*u)*(1-v)+(A[(zi+1)*GW+xi]*(1-u)+A[(zi+1)*GW+xi+1]*u)*v;};
/* the one terrain formula: road height near the track blending into rolling hills */
function terrainH(x,z,i){
  const dx=x-X[i],dz=z-Z[i],dist=Math.hypot(dx,dz),lat=dx*NX[i]+dz*NZ[i];
  const bar=lat>0?BAR_R[i]:BAR_L[i];
  const road=Y[i]+clamp(lat,-bar,bar)*BANK[i]-0.5;
  let nat=bil(base2,x,z)+(fbm(x/420,z/420)-0.5)*70*sstep(30,500,dist)+(fbm(x/90+7,z/90)-0.5)*9;
  for(const h of hills){const ex=x-h[0],ez=z-h[1],r2=(ex*ex+ez*ez)/(h[2]*h[2]);nat+=h[3]*Math.exp(-r2)*sstep(80,350,dist);}
  const w=sstep(bar+4,bar+75,dist);
  return road*(1-w)+nat*w;
}
/* nearest track sample to a point (grid lookup, then a short local search) */
function nearestSample(x,z){
  const fx=clamp(Math.round((x-gx0)/CELL),0,GW-1),fz=clamp(Math.round((z-gz0)/CELL),0,GH-1),i0=near[fz*GW+fx];
  let best=Infinity,bi=i0;for(let k=-10;k<=10;k++){const j=mod(i0+k),ex=x-X[j],ez=z-Z[j],d=ex*ex+ez*ez;if(d<best){best=d;bi=j;}}
  return bi;
}
const BAND=60;          // a track-following terrain band covers this far past the barriers
for(let c=0;c<GW*GH;c++){
  const x=cx(c),z=cz(c),i=near[c],dist=Math.sqrt(nd2[c]);
  const lat=(x-X[i])*NX[i]+(z-Z[i])*NZ[i],bar=lat>0?BAR_R[i]:BAR_L[i];
  H[c]=terrainH(x,z,i);DIST[c]=dist-bar;
  FOREST[c]=fbm(x/260+3,z/260-5,4);
}
export function groundAt(x,z){const i=nearestSample(x,z);return terrainH(x,z,i);}
/* distance outside the nearest barrier (negative = inside the track corridor) */
export function clearanceAt(x,z){
  const bi=nearestSample(x,z),best=(x-X[bi])**2+(z-Z[bi])**2;
  const l2=(x-X[bi])*NX[bi]+(z-Z[bi])*NZ[bi];
  return Math.sqrt(best)-(l2>0?BAR_R[bi]:BAR_L[bi]);
}
const meadow=lin(0x5d7637),forestC=lin(0x24331c),field=lin(0x8e8c4a),dirt=lin(0x6b5f45),needles=lin(0x3d3324);
function groundColour(f,d,out){
  const fo=sstep(0.42,0.55,f)*sstep(4,30,d);
  out.copy(meadow).lerp(field,sstep(0.25,0.18,f)*0.8*sstep(20,60,d)).lerp(forestC,fo);
  /* forest floor (needles, shade) where the trees stand close to the track */
  if(d>3&&d<45)out.lerp(needles,0.35*sstep(3,8,d)*(1-sstep(30,45,d)));
  if(d<3)out.lerp(dirt,0.15);
  return out;
}
const gt=gs.map.clone();gt.needsUpdate=true;gt.repeat.set(1,1);const gn=gs.normalMap.clone();gn.needsUpdate=true;gn.repeat.set(1,1);
const groundMat=new THREE.MeshStandardMaterial({map:gt,normalMap:gn,normalScale:new THREE.Vector2(0.1,0.1),vertexColors:true,roughness:0.97,envMapIntensity:0.25});
(function terrainMesh(){
  /* coarse grid; inside the band it is pushed well down so it can never poke through the road */
  const pos=new Float32Array(GW*GH*3),col=new Float32Array(GW*GH*3),uv=new Float32Array(GW*GH*2);
  const c3=new THREE.Color();
  for(let c=0;c<GW*GH;c++){
    const i=near[c],sink=DIST[c]<BAND-8?Math.min(H[c],Y[i]-4):H[c];
    pos[c*3]=cx(c);pos[c*3+1]=sink;pos[c*3+2]=cz(c);uv[c*2]=cx(c)/9;uv[c*2+1]=cz(c)/9;
    groundColour(FOREST[c],DIST[c],c3);col[c*3]=c3.r;col[c*3+1]=c3.g;col[c*3+2]=c3.b;
  }
  const idx=[];
  for(let z=0;z<GH-1;z++)for(let x=0;x<GW-1;x++){const a=z*GW+x;
    if(DIST[a]<-2&&DIST[a+1]<-2&&DIST[a+GW]<-2&&DIST[a+GW+1]<-2)continue;
    idx.push(a,a+GW,a+1,a+1,a+GW,a+GW+1);}
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('color',new THREE.BufferAttribute(col,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  g.setIndex(idx);g.computeVertexNormals();
  const m=new THREE.Mesh(g,groundMat);m.receiveShadow=true;scene.add(m);
})();
(function terrainBand(){
  /* fine terrain following the track on both sides, from the verge out past the band edge;
     columns stop early where another part of the track comes close */
  const COLS=[0,3,7,12,19,28,40,54,BAND+6];
  const c3=new THREE.Color();
  for(const side of [-1,1]){
    for(let a=0;a<N;a+=CHUNK){
      const b=Math.min(N,a+CHUNK),pos=[],col=[],uv=[],idx=[],n=COLS.length;
      for(let j=a;j<=b;j+=2){
        const i=mod(j),bar=side>0?BAR_R[i]:BAR_L[i];let lastO=bar+3.9;
        for(let k=0;k<n;k++){
          let o=bar+3.9+COLS[k];
          let x=X[i]+NX[i]*side*o,z=Z[i]+NZ[i]*side*o;
          const ns=nearestSample(x,z);let dI=Math.abs(ns-i);dI=Math.min(dI,N-dI);
          if(dI>30){o=lastO;x=X[i]+NX[i]*side*o;z=Z[i]+NZ[i]*side*o;}else lastO=o;
          const y=k===0?Y[i]+side*o*BANK[i]-0.5:terrainH(x,z,i);
          pos.push(x,y,z);uv.push(x/9,z/9);
          const fx=clamp(Math.round((x-gx0)/CELL),0,GW-1),fz=clamp(Math.round((z-gz0)/CELL),0,GH-1);
          groundColour(bil(FOREST,x,z),o-bar,c3);col.push(c3.r,c3.g,c3.b);
          const r=(j-a)/2;
          if(j+2<=b&&k<n-1){const q=r*n+k;if(side<0)idx.push(q,q+n,q+1,q+1,q+n,q+n+1);else idx.push(q,q+1,q+n,q+1,q+n+1,q+n);}
        }
      }
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
      g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
      const m=new THREE.Mesh(g,groundMat);m.receiveShadow=true;scene.add(m);
    }
  }
})();
/* far hills ringing the valley */
(function(){
  const cxm=(minX+maxX)/2,czm=(minZ+maxZ)/2,R0=Math.max(maxX-minX,maxZ-minZ)/2+PAD*0.95;
  const seg=160,pos=[],idx=[],col=[];const c1=lin(0x2b3a26),c2=lin(0x46553a);
  for(let k=0;k<=seg;k++){const a=k/seg*Math.PI*2;
    const hgt=60+120*fbm(Math.cos(a)*3+9,Math.sin(a)*3+2,4)+80*Math.max(0,Math.sin(a*3+1));
    for(const [r,y] of [[R0*0.97,-40],[R0*1.6,hgt],[R0*2.6,hgt*1.6+40]]){pos.push(cxm+Math.cos(a)*r,y+20,czm+Math.sin(a)*r);const c=y>0?c2:c1;col.push(c.r,c.g,c.b);}
    if(k<seg)for(let j=0;j<2;j++){const q=k*3+j;idx.push(q,q+3,q+1,q+1,q+3,q+4);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  g.setIndex(idx);g.computeVertexNormals();
  scene.add(new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide})));
})();

/* ================= structures ================= */
export const occluders=[];          // boxes for the sun-visibility test: [minx,miny,minz,maxx,maxy,maxz]
export const keepClear=[];
function frameAt(s,off){
  const i=T.idx(s),o=off;
  const g=new THREE.Group();g.position.set(X[i]+NX[i]*o,Y[i]+o*BANK[i],Z[i]+NZ[i]*o);
  g.rotation.y=Math.atan2(TX[i],TZ[i]);scene.add(g);return g;   // local +z along the track, +x to the left
}
function box(w,h,d,mat,x,y,z,parent,cast=true){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=cast;m.receiveShadow=true;parent.add(m);return m;}
function addOcc(obj){obj.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(obj);occluders.push([b.min.x,b.min.y,b.min.z,b.max.x,b.max.y,b.max.z]);}
const crowdCols=[0xd8342c,0xf2c230,0x2f6fb8,0xf3efe7,0x2f9e8f,0xd94f8a,0x1a1a1f,0xe8d34a,0x6fb0e8,0x8a5a3c,0x3e7d3a,0xe07a2a];
function crowd(parent,n,place){
  const body=new THREE.InstancedMesh(new THREE.BoxGeometry(0.46,0.8,0.32),new THREE.MeshStandardMaterial({roughness:0.9}),n);
  const head=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.12,0),std(0xd9a988,0.8),n);
  const d=new THREE.Object3D();let k=0;
  for(let j=0;j<n;j++){const p=place(j);if(!p)continue;
    d.position.set(p[0],p[1]+0.4,p[2]);d.rotation.set(0,(p[3]||0)+(rnd()-.5)*0.6,0);d.updateMatrix();body.setMatrixAt(k,d.matrix);body.setColorAt(k,lin(crowdCols[(rnd()*crowdCols.length)|0]));
    d.position.y+=0.52;d.updateMatrix();head.setMatrixAt(k,d.matrix);head.setColorAt(k,lin([0xe6b896,0xc48a64,0x8d5a3b,0xf0caa8,0x5c3a26][(rnd()*5)|0]));k++;}
  body.count=head.count=k;body.castShadow=true;parent.add(body);parent.add(head);
}
function grandstand(s,side,len,rows,roof=true){
  const bar=side>0?T.lerp(BAR_L,s):T.lerp(BAR_R,s);
  const g=frameAt(s,(side>0?-1:1)*(bar+5));
  if(side<0)g.rotation.y+=Math.PI;
  keepClear.push([g.position.x,g.position.z,len*0.6+10]);
  const conc=std(0xb8b1a8,0.92);
  for(let r=0;r<rows;r++)box(1.6,(r+1)*0.85+0.6,len,conc,r*1.55+0.8,(r+1)*0.42-0.2,0,g);
  if(roof){const rf=box(rows*1.55+3,0.35,len+2,std(0xe9e5dd,0.5,0.2),rows*1.55/2+0.4,rows*0.85+5.4,0,g);rf.rotation.z=0.07;
    const post=std(0x3a3640,0.5,0.6);for(let x=-len/2+2;x<=len/2;x+=12)box(0.4,rows*0.85+6,0.4,post,rows*1.55-0.2,(rows*0.85+5.5)/2,x,g);}
  const per=Math.floor(len/0.9);
  crowd(g,rows*per,j=>{const r=Math.floor(j/per),i=j%per;if(rnd()<0.18)return null;return [r*1.55+0.75,(r+1)*0.85+0.18,-len/2+0.5+i*0.9+(rnd()-.5)*0.15,-Math.PI/2];});
  addOcc(g);
  return g;
}
/* start / finish: main grandstand left, pit building right */
grandstand(-60,1,150,12);
grandstand(160,1,90,9);
(function pits(){
  const g=frameAt(-40,HW+3.2+8);g.rotation.y+=Math.PI;keepClear.push([g.position.x,g.position.z,140]);
  const gTex=tex(512,128,(c,w,h)=>{c.fillStyle='#cfcac2';c.fillRect(0,0,w,h);
    for(let i=0;i<4;i++){c.fillStyle='#2b2a2f';c.fillRect(i*128+10,30,108,98);c.fillStyle='#3a3940';for(let y=34;y<128;y+=7)c.fillRect(i*128+12,y,104,3);
      c.fillStyle=['#c8202a','#2f6fb8','#f2c230','#5ad1c9'][i];c.fillRect(i*128+10,10,108,14);}});
  gTex.repeat.set(170/16,1);
  const body=box(14,9,170,std(0xd2ccc4,0.85),7.5,3.5,0,g);
  const front=new THREE.Mesh(new THREE.PlaneGeometry(170,6),new THREE.MeshStandardMaterial({map:gTex,roughness:0.8}));
  front.rotation.y=-Math.PI/2;front.position.set(0.45,2.9,0);g.add(front);
  box(17,0.5,172,std(0x2d2b33,0.5,0.4),7.5,8.2,0,g);
  const glass=box(0.3,2.6,170,new THREE.MeshStandardMaterial({color:lin(0x2a3644),roughness:0.05,metalness:0.9}),1,9.9,0,g);glass.castShadow=false;
  box(10,3.2,170,std(0xd2ccc4,0.85),7,10,0,g);
  /* pit lane */
  const lane=new THREE.Mesh(new THREE.PlaneGeometry(7,190),new THREE.MeshStandardMaterial({map:asp.map,roughness:0.9}));lane.rotation.x=-Math.PI/2;lane.rotation.z=0;lane.position.set(-4,0.02,0);lane.receiveShadow=true;g.add(lane);
  addOcc(g);
})();
/* spectator banks at Brünnchen and the Karussell, with campers and tents like a 24h weekend */
function bank(name,off,side,count){
  const sec=T.sections.find(q=>q.name===name);
  const s=sec.s+off,bar=side>0?T.lerp(BAR_L,s):T.lerp(BAR_R,s);
  const g=frameAt(s,(side>0?-1:1)*(bar+4));if(side<0)g.rotation.y+=Math.PI;
  keepClear.push([g.position.x,g.position.z,45]);
  const fence=new THREE.Mesh(new THREE.PlaneGeometry(60,1.8),new THREE.MeshStandardMaterial({color:lin(0x6c7076),metalness:0.6,roughness:0.5,transparent:true,opacity:0.55,side:THREE.DoubleSide}));
  fence.rotation.y=Math.PI/2;fence.position.set(-0.5,0.9,0);g.add(fence);
  crowd(g,count,j=>[1+rnd()*9,rnd()*0.6+(rnd()*9)*0.12,-28+rnd()*56,-Math.PI/2]);
  const tentCols=[0xe8e6e1,0xd8342c,0x2f6fb8,0xf2c230,0x3e7d3a];
  for(let k=0;k<7;k++){const c=new THREE.Mesh(new THREE.ConeGeometry(2+rnd()*1.2,2.2+rnd(),4),std(tentCols[k%tentCols.length],0.8));c.position.set(12+rnd()*10,1.1,-25+k*8+rnd()*3);c.rotation.y=Math.PI/4;c.castShadow=true;g.add(c);}
  for(let k=0;k<3;k++){const v=box(2.3,2.6,6,std([0xf3efe7,0xd7d2c4,0x9db6d8][k],0.6,0.1),18+rnd()*8,1.4,-18+k*14,g);v.rotation.y=rnd()*0.4;}
  return g;
}
bank('Brünnchen',140,-1,180);bank('Brünnchen',300,1,90);
bank('Karussell',30,1,160);
bank('Pflanzgarten',60,-1,80);
bank('Hatzenbach',120,1,60);

/* bridges: a road bridge over the Döttinger Höhe, an advert bridge on the main straight, a footbridge */
const adTex=tex(1024,128,(g,w,h)=>{const ads=[['#1b3f8f','#f3efe7','EIFEL TYRES'],['#f3efe7','#c8202a','RING OIL'],['#14141a','#f2c230','GRÜNE HÖLLE'],['#c8202a','#f3efe7','24H']];
  ads.forEach((a,i)=>{g.fillStyle=a[0];g.fillRect(i*256,0,256,h);g.fillStyle=a[1];g.font='italic 700 46px "Chakra Petch", sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(a[2],i*256+128,h/2+3);});});
const adMat=new THREE.MeshStandardMaterial({map:adTex,roughness:0.6});
function bridge(s,deck,ad,tall){
  const i=T.idx(s),span=Math.max(BAR_L[i],BAR_R[i])+6;
  const g=frameAt(s,0);
  const conc=std(0xa9a49b,0.9);
  [-1,1].forEach(sd=>{box(2.2,tall,3,conc,sd*span,tall/2-1,0,g);});
  const d=box(2*span+2.5,deck,ad?5:3.2,conc,0,tall+deck/2-1,0,g);
  if(ad){const b=new THREE.Mesh(new THREE.PlaneGeometry(2*span,deck*0.9),adMat);adTex.repeat.set(1,1);
    [-1,1].forEach(sd=>{const p=b.clone();p.position.set(0,tall+deck/2-1,sd*2.53);if(sd<0)p.rotation.y=Math.PI;g.add(p);});}
  box(2*span+2.5,1.1,0.15,std(0x707478,0.5,0.6),0,tall+deck+0.5-1,1.4,g);box(2*span+2.5,1.1,0.15,std(0x707478,0.5,0.6),0,tall+deck+0.5-1,-1.4,g);
  addOcc(g);
}
bridge(T.LEN-420,1.6,true,7.5);
bridge(T.sections.find(q=>q.name==='Döttinger Höhe').s+900,1.4,false,8);
bridge(T.sections.find(q=>q.name==='Antoniusbuche').s+60,0.6,true,6.2);
bridge(T.sections.find(q=>q.name==='Quiddelbacher Höhe').s+40,1.4,false,7.5);

/* start / finish gantry with the five red lights */
export const startLights=[];
(function(){
  const g=frameAt(0,0);
  const check=tex(64,64,(c)=>{c.fillStyle='#f3efe7';c.fillRect(0,0,64,64);c.fillStyle='#17151b';c.fillRect(0,0,32,32);c.fillRect(32,32,32,32);});
  check.repeat.set(16,2);
  const line=new THREE.Mesh(new THREE.PlaneGeometry(2*HW,1.4),new THREE.MeshStandardMaterial({map:check,roughness:0.7,polygonOffset:true,polygonOffsetFactor:-2}));
  line.rotation.x=-Math.PI/2;line.position.y=0.01;line.receiveShadow=true;g.add(line);
  const steel=std(0x2b2830,0.45,0.6),span=HW+3.5;
  [-span,span].forEach(x=>box(0.6,9,0.6,steel,x,4.5,0,g));
  box(2*span+0.6,1.8,1,steel,0,8.6,0,g);
  const bTex=tex(1024,128,(c,w,h)=>{c.fillStyle='#16141c';c.fillRect(0,0,w,h);
    for(let x=0;x<8;x++)for(let y=0;y<4;y++){c.fillStyle=(x+y)%2?'#f3efe7':'#16141c';c.fillRect(x*16,y*32,16,32);c.fillRect(w-128+x*16,y*32,16,32);}
    c.fillStyle='#f2c230';c.font='italic 700 66px "Chakra Petch", sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('NORDSCHLEIFE',w/2,h/2+4);});
  bTex.wrapS=bTex.wrapT=THREE.ClampToEdgeWrapping;
  const bMat=new THREE.MeshStandardMaterial({map:bTex,roughness:0.6,emissive:0xffffff,emissiveMap:bTex,emissiveIntensity:0.15});
  [-1,1].forEach(sd=>{const p=new THREE.Mesh(new THREE.PlaneGeometry(2*span-1,1.7),bMat);p.position.set(0,8.6,sd*0.52);if(sd<0)p.rotation.y=Math.PI;g.add(p);});
  for(let k=-2;k<=2;k++){
    const pod=new THREE.MeshStandardMaterial({color:0x120a0b,roughness:0.3,emissive:new THREE.Color(1,0.12,0.06),emissiveIntensity:0});startLights.push(pod);
    const l=new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.3,0.2,16),pod);l.rotation.x=Math.PI/2;l.position.set(k*1.25,7.2,-0.55);g.add(l);
  }
  addOcc(g);
})();

/* section boards and kilometre markers */
(function(){
  const post=std(0x6a6e73,0.5,0.6);
  T.sections.forEach((sec,k)=>{
    if(k===0)return;
    const t=tex(512,128,(c,w,h)=>{c.fillStyle='#1f5e3a';c.fillRect(0,0,w,h);c.strokeStyle='#f3efe7';c.lineWidth=6;c.strokeRect(6,6,w-12,h-12);
      c.fillStyle='#f3efe7';c.font='600 54px "Chakra Petch", sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(sec.name,w/2,h/2+3);});
    t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;
    const s=sec.s-30,i=T.idx(s),side=T.lerp(T.K,s+60)>0?-1:1;           // on the outside of the coming turn
    const bar=side>0?BAR_R[i]:BAR_L[i];
    const g=frameAt(s,side*(bar+1.2));
    const b=new THREE.Mesh(new THREE.PlaneGeometry(3.2,0.8),new THREE.MeshStandardMaterial({map:t,roughness:0.6}));
    b.position.set(0,1.9,0);b.rotation.y=Math.PI;g.add(b);
    box(0.08,1.6,0.08,post,-1.2,0.8,0.02,g);box(0.08,1.6,0.08,post,1.2,0.8,0.02,g);
  });
  for(let km=1;km<LEN/1000;km++){
    const t=tex(128,128,(c,w,h)=>{c.fillStyle='#f3efe7';c.fillRect(0,0,w,h);c.fillStyle='#1b1b1f';c.font='700 80px "Chakra Petch", sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(String(km),w/2,h/2+4);});
    const i=T.idx(km*1000),g=frameAt(km*1000,BAR_R[i]+0.6);
    const b=new THREE.Mesh(new THREE.PlaneGeometry(0.7,0.7),new THREE.MeshStandardMaterial({map:t,roughness:0.6}));b.position.set(0,1.3,0);b.rotation.y=Math.PI;g.add(b);
    box(0.06,1,0.06,post,0,0.5,0.02,g);
  }
})();
/* braking boards before slow corners, marshal posts, tyre walls at the hairpins */
(function(){
  const post=std(0x6a6e73,0.5,0.6);
  const boardTex=n=>tex(128,160,(c,w,h)=>{c.fillStyle='#f3f1ec';c.fillRect(0,0,w,h);c.strokeStyle='#1b1b1f';c.lineWidth=8;c.strokeRect(4,4,w-8,h-8);
    c.fillStyle='#1b1b1f';c.font='800 70px "Chakra Petch", sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(String(n),w/2,h/2+4);});
  const bt={};[100,200,300].forEach(n=>bt[n]=new THREE.MeshStandardMaterial({map:boardTex(n),roughness:0.6}));
  for(const c of T.corners){
    if(c.kind!=='hairpin'&&c.kind!=='tight')continue;
    const side=c.sg>0?-1:1;                     // outside of the corner
    for(const n of [100,200,300]){
      const s=c.i0*ds-n,i=T.idx(s);
      if(Math.abs(T.K[i])>1/250)continue;     // only on the approach straight
      const bar=side>0?BAR_R[i]:BAR_L[i];
      const g=frameAt(s,side*(bar+0.5));
      const b=new THREE.Mesh(new THREE.PlaneGeometry(0.8,1.0),bt[n]);b.position.set(0,1.3,0);b.rotation.y=Math.PI;g.add(b);
      box(0.08,1.0,0.08,post,0,0.5,0.03,g);
    }
  }
  /* marshal posts: little white huts with an orange band, every ~450 m */
  const hut=std(0xe9e6df,0.8),band=std(0xe0702a,0.6),roof=std(0x3a3d40,0.7);
  for(let s=300,k=0;s<LEN-200;s+=430+((s*13)%120),k++){
    const i=T.idx(s),side=k%2?1:-1,bar=side>0?BAR_R[i]:BAR_L[i];
    if(side>0&&pitWall(i))continue;
    const g=frameAt(s,side*(bar+2.6));if(side<0)g.rotation.y+=Math.PI;
    box(1.6,2.2,1.8,hut,0.8,1.1,0,g);box(1.62,0.3,1.82,band,0.8,1.9,0,g);box(1.9,0.12,2.1,roof,0.8,2.28,0,g);
    const fl=new THREE.Mesh(new THREE.PlaneGeometry(0.6,0.4),std(0xf2c230,0.7,0,{side:THREE.DoubleSide}));fl.position.set(-0.1,2.5,0.7);g.add(fl);
    box(0.04,1.4,0.04,post,-0.1,2.0,0.4,g);
  }
  /* tyre walls in front of the armco on the outside of the hairpins */
  const pts=[];
  for(const c of T.corners){if(c.kind!=='hairpin')continue;const side=c.sg>0?-1:1;
    for(let i=c.i0-10;i<=c.i1+25;i++){const ii=mod(i),bar=(side>0?BAR_R[ii]:BAR_L[ii])-0.32;
      for(let q=0;q<3;q++){const o=side*bar,a=q*0.66;const x=X[ii]+NX[ii]*o+TX[ii]*a,z=Z[ii]+NZ[ii]*o+TZ[ii]*a;for(let lvl=0;lvl<3;lvl++)pts.push([x,Y[ii]+o*BANK[ii]+lvl*0.27,z]);}}}
  if(pts.length){
    const geo=new THREE.TorusGeometry(0.24,0.1,6,10);geo.rotateX(Math.PI/2);geo.translate(0,0.12,0);
    const m=new THREE.InstancedMesh(geo,std(0x18181a,0.9),pts.length),d=new THREE.Object3D(),cc=new THREE.Color();
    pts.forEach((p,k)=>{d.position.set(p[0],p[1],p[2]);d.updateMatrix();m.setMatrixAt(k,d.matrix);cc.set(((k/3|0)%8)<2?0xe8e6e1:0x18181a);m.setColorAt(k,cc);});
    m.receiveShadow=true;m.castShadow=true;scene.add(m);
  }
})();
/* painted graffiti on the asphalt, Nordschleife-style */
(function(){
  const words=['GRÜNE HÖLLE','VOLLGAS','24H','GO GO GO','RING ♥','FLAT OUT','EIFEL','#7','NO LIFT','KEEP LEFT'];
  const atlas=tex(1024,1024,(c,w,h)=>{c.clearRect(0,0,w,h);
    words.forEach((t,k)=>{const x=(k%2)*512,y=Math.floor(k/2)*204;c.save();c.translate(x+256,y+102);
      c.fillStyle=['rgba(245,242,235,.85)','rgba(250,215,60,.85)','rgba(240,90,70,.8)','rgba(120,200,250,.8)'][k%4];
      c.font='italic 800 '+(t.length>8?70:96)+'px "Chakra Petch", sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(t,0,0);c.restore();});
    /* worn paint */
    c.globalCompositeOperation='destination-out';for(let i=0;i<9000;i++){c.fillStyle='rgba(0,0,0,'+(0.3+rnd()*0.7)+')';c.fillRect(rnd()*w,rnd()*h,1+rnd()*3,1+rnd()*3);}});
  const mat=new THREE.MeshStandardMaterial({map:atlas,transparent:true,depthWrite:false,roughness:0.7,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4});
  for(let k=0;k<46;k++){
    const s=200+rnd()*(LEN-400),i=T.idx(s);if(Math.abs(T.K[i])>1/300)continue;
    const w=words.length,wi=(rnd()*w)|0;
    const g=new THREE.PlaneGeometry(7,2.8);
    const u0=(wi%2)*0.5,v1=1-Math.floor(wi/2)*0.2;
    const uv=g.attributes.uv;uv.setXY(0,u0,v1);uv.setXY(1,u0+0.5,v1);uv.setXY(2,u0,v1-0.2);uv.setXY(3,u0+0.5,v1-0.2);
    const m=new THREE.Mesh(g,mat);
    const o=(rnd()-0.5)*4;m.position.set(X[i]+NX[i]*o,Y[i]+o*BANK[i]+0.015,Z[i]+NZ[i]*o);
    m.rotation.set(-Math.PI/2,0,-Math.atan2(TZ[i],TX[i])+(rnd()<0.5?0:Math.PI));
    m.receiveShadow=true;scene.add(m);
  }
})();

/* ================= trees =================
   Eifel forest: spruce and beech right up to the hedges (meshes in trees.js), recorded in a
   grid for the sun-through-the-trees test. */
export const treeGrid=new Map();const TG=24;
const tkey=(x,z)=>(Math.floor(x/TG)+4096)*65536+(Math.floor(z/TG)+4096);
function gridAdd(t){const k=tkey(t.x,t.z);let a=treeGrid.get(k);if(!a)treeGrid.set(k,a=[]);a.push(t);}
export function treesNear(x,z){return treeGrid.get(tkey(x,z));}
(function(){
  const CH=100,nCh=Math.ceil(N/CH);
  const lists=[...Array(nCh)].map(()=>({sp:[],be:[],ug:[]}));
  const clearOk=(x,z)=>{for(const k of keepClear){const dx=x-k[0],dz=z-k[1];if(dx*dx+dz*dz<k[2]*k[2])return false;}return true;};
  const addTree=(i,x,z,isSpruce,far)=>{
    const h=isSpruce?(far?17:15)+rnd()*15:13+rnd()*9,r=isSpruce?h*(0.14+rnd()*0.03):h*(0.24+rnd()*0.06);
    const t={x,z,y:groundAt(x,z)-0.3,h,r,sp:isSpruce,i};
    lists[Math.floor(i/CH)][isSpruce?'sp':'be'].push(t);gridAdd(t);
  };
  for(let i=0;i<N;i+=3){
    for(const side of [-1,1]){
      const bar=side>0?BAR_R[i]:BAR_L[i];
      const rows=4+((rnd()*4)|0);
      for(let r=0;r<rows;r++){
        if(rnd()<0.22)continue;
        const o=side*(bar+5.2+r*6+rnd()*4.5),a=(rnd()-0.5)*6;
        const x=X[i]+NX[i]*o+TX[i]*a,z=Z[i]+NZ[i]*o+TZ[i]*a;
        if(clearanceAt(x,z)<4.5||!clearOk(x,z))continue;
        addTree(i,x,z,rnd()<0.64,false);
      }
    }
    /* undergrowth: ferns and tufts at the foot of the armco and between armco and hedge */
    for(const side of [-1,1]){
      const bar=side>0?BAR_R[i]:BAR_L[i];
      for(let k=0;k<2;k++){
        const fern=rnd()<0.45,o=side*(fern?bar+0.6+rnd()*1.5:(rnd()<0.5?bar-0.5-rnd()*0.4:bar+0.4+rnd()*1.8)),a=(rnd()-0.5)*6;
        const x=X[i]+NX[i]*o+TX[i]*a,z=Z[i]+NZ[i]*o+TZ[i]*a;
        if(!clearOk(x,z)||(side>0&&BAR_R[i]<HW+3))continue;
        lists[Math.floor(i/CH)].ug.push({x,z,y:Y[i]+o*BANK[i]-(Math.abs(o)>bar?0.25:0.1),s:fern?0.9+rnd()*0.8:0.6+rnd()*0.6,rot:rnd()*6.28,fern});
      }
    }
  }
  /* forest further back */
  for(let k=0;k<12000;k++){
    const i=(rnd()*N)|0,side=rnd()<0.5?-1:1,o=side*(55+rnd()*280);
    const x=X[i]+NX[i]*o,z=Z[i]+NZ[i]*o;
    if(clearanceAt(x,z)<8||!clearOk(x,z))continue;
    const f=FOREST[Math.round((z-gz0)/CELL)*GW+Math.round((x-gx0)/CELL)];if(f<0.42)continue;
    addTree(i,x,z,rnd()<0.7,true);
  }
  buildForest(scene,lists);
})();
export function setTreeQuality(high){setForestQuality(high===true?2:high===false?0:high);}
export function updateScenery(cam,dt){updateForest(cam,dt);}

/* ================= sun visibility =================
   March from the camera toward the sun; tree crowns, terrain and structures block it. A few rays
   spread over a small aperture give a soft, flickering result through the trees. */
const sunPerp=new THREE.Vector3().crossVectors(sunDir,new THREE.Vector3(0,1,0)).normalize();
export function sunVisibility(p){
  let vis=0;const rays=[[0,0],[0.7,0.2],[-0.7,-0.2],[0.2,0.6],[-0.2,-0.6]];
  for(const [a,b] of rays){
    let tr=1;
    const ox=p.x+sunPerp.x*a,oy=p.y+b,oz=p.z+sunPerp.z*a;
    for(let t=1.5;t<420;t+=t<40?1.5:3.5){
      const x=ox+sunDir.x*t,y=oy+sunDir.y*t,z=oz+sunDir.z*t;
      const gy=groundAt(x,z);
      if(y<gy){tr=0;break;}
      if(y>gy+40)break;
      const L=treesNear(x,z);
      if(L)for(const q of L){
        const dx=x-q.x,dz=z-q.z,r2=dx*dx+dz*dz;if(r2>q.r*q.r*1.1)continue;
        const hy=(y-q.y)/q.h;
        let inside=false;
        if(q.sp){if(hy>0.1&&hy<1){const rr=q.r*Math.pow(1-(hy-0.1)/0.9,0.85)*0.9;inside=r2<rr*rr;}}
        else{const cyy=q.y+q.h*0.64;const dy=(y-cyy)/(q.h*0.34);inside=r2/(q.r*q.r)+dy*dy<1;}
        if(inside){
          /* leaves let light through in specks */
          const n=Math.sin(x*1.7+z*2.3+y*3.1)*Math.sin(x*0.9-z*1.3+y*0.7);
          tr*=n>0.35?0.75:0.18;
          if(tr<0.02)break;
        }
      }
      for(const o of occluders)if(x>o[0]&&x<o[3]&&y>o[1]&&y<o[4]&&z>o[2]&&z<o[5]){tr=0;break;}
      if(tr<0.02)break;
    }
    vis+=tr;
  }
  return vis/rays.length;
}
