import * as THREE from 'three';
import {rnd,clamp,sstep,lin,scene,tex,speckle,std} from './core.js';

const grassTex=tex(512,512,(g,w,h)=>{g.fillStyle='#5f7f3b';g.fillRect(0,0,w,h);
  speckle(g,w,h,['#557639','#6c8c44','#4b6931','#77964f','#5b7b37','#829a55'],60000,2.4);
  for(let i=0;i<900;i++){g.strokeStyle=rnd()<.5?'rgba(40,60,25,.35)':'rgba(140,160,80,.25)';g.lineWidth=1;const x=rnd()*w,y=rnd()*h;g.beginPath();g.moveTo(x,y);g.lineTo(x+rnd()*4-2,y-3-rnd()*5);g.stroke();}});
grassTex.repeat.set(380,380);
const roadTex=tex(512,512,(g,w,h)=>{g.fillStyle='#4b4a4f';g.fillRect(0,0,w,h);
  speckle(g,w,h,['#3f3e43','#55545a','#38373b','#626168','#45444a','#6d6b70'],90000,1.8);
  g.fillStyle='rgba(30,30,32,.18)';for(let i=0;i<14;i++){g.fillRect(rnd()*w,0,8+rnd()*30,h);}
  g.fillStyle='#ece8df';g.fillRect(4,0,8,h);g.fillRect(w-12,0,8,h);});
/* asphalt relief: fine aggregate plus larger undulations, turned into a tangent-space normal map */
const roadNormal=tex(512,512,(g,w,h)=>{
  const H=new Float32Array(w*h);for(let i=0;i<H.length;i++)H[i]=rnd();
  for(let k=0;k<2;k++){const B=H.slice();for(let y=0;y<h;y++)for(let x=0;x<w;x++){let a=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)a+=B[((y+dy+h)%h)*w+(x+dx+w)%w];H[y*w+x]=a/9*0.7+B[y*w+x]*0.3;}}
  const im=g.createImageData(w,h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const dx=(H[y*w+(x+1)%w]-H[y*w+(x-1+w)%w])*6,dy=(H[((y+1)%h)*w+x]-H[((y-1+h)%h)*w+x])*6,l=Math.hypot(dx,dy,1),o=(y*w+x)*4;
    im.data[o]=(-dx/l*0.5+0.5)*255;im.data[o+1]=(-dy/l*0.5+0.5)*255;im.data[o+2]=(1/l*0.5+0.5)*255;im.data[o+3]=255;}
  g.putImageData(im,0,0);},false);
/* run-off paint: alternating green and red blocks */
const runoffTex=tex(64,256,(g,w,h)=>{g.fillStyle='#2f7a45';g.fillRect(0,0,w,h);g.fillStyle='#b8352f';g.fillRect(0,h/2,w,h/2);
  speckle(g,w,h,['rgba(0,0,0,.12)','rgba(255,255,255,.08)'],1400,1.6);});
roadNormal.repeat.set(5,4);
const curbTex=tex(128,256,(g,w,h)=>{g.fillStyle='#c8262a';g.fillRect(0,0,w,h/2);g.fillStyle='#efebe3';g.fillRect(0,h/2,w,h/2);
  const gr=g.createLinearGradient(0,0,w,0);gr.addColorStop(0,'rgba(0,0,0,.28)');gr.addColorStop(.35,'rgba(0,0,0,0)');gr.addColorStop(1,'rgba(0,0,0,.12)');g.fillStyle=gr;g.fillRect(0,0,w,h);
  speckle(g,w,h,['rgba(0,0,0,.15)','rgba(255,255,255,.1)'],600,1.5);});
const turfTex=tex(128,128,(g,w,h)=>{g.fillStyle='#3d7346';g.fillRect(0,0,w,h);speckle(g,w,h,['#356a3e','#46804f','#2f5f37'],6000,1.6);});
const gravelTex=tex(256,256,(g,w,h)=>{g.fillStyle='#c4ad88';g.fillRect(0,0,w,h);
  speckle(g,w,h,['#b29b76','#d4bf9b','#a18a66','#dcc9a8','#8f7a5b','#e6d6b8'],26000,2.6);});
const armcoTex=tex(16,64,(g,w,h)=>{const gr=g.createLinearGradient(0,0,0,h);
  [[0,'#8d939a'],[.12,'#d7dbe0'],[.3,'#7b8188'],[.45,'#c8cdd2'],[.55,'#80868d'],[.7,'#d3d7dc'],[.88,'#7a8087'],[1,'#a7adb3']].forEach(s=>gr.addColorStop(s[0],s[1]));
  g.fillStyle=gr;g.fillRect(0,0,w,h);});
const fenceTex=tex(64,64,(g,w,h)=>{g.clearRect(0,0,w,h);g.strokeStyle='rgba(70,72,78,1)';g.lineWidth=2.4;
  g.beginPath();g.moveTo(0,0);g.lineTo(w,h);g.moveTo(w,0);g.lineTo(0,h);g.stroke();});
const adTex=tex(1024,64,(g,w,h)=>{const ads=[['#203f91','#f3efe7','APEX RUN'],['#f3efe7','#c8262a','HARBOR OIL'],['#14141a','#ffb43a','VOLTA TYRES'],['#c8262a','#f3efe7','RIDGE MOTO']];
  ads.forEach((a,i)=>{g.fillStyle=a[0];g.fillRect(i*256,0,256,h);g.fillStyle=a[1];g.font='italic 700 30px "Chakra Petch", sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(a[2],i*256+128,h/2+2);});});
const checkTex=tex(64,64,(g)=>{g.fillStyle='#f3efe7';g.fillRect(0,0,64,64);g.fillStyle='#17151b';g.fillRect(0,0,32,32);g.fillRect(32,32,32,32);});
const rubberTex=tex(64,256,(g,w,h)=>{g.clearRect(0,0,w,h);for(let i=0;i<40;i++){const x=rnd()*w,a=.05+rnd()*.22;g.fillStyle='rgba(12,12,14,'+a+')';g.fillRect(x,rnd()*h*.3,1+rnd()*3,h*.5+rnd()*h*.5);}});
const garageTex=tex(512,128,(g,w,h)=>{g.fillStyle='#c9c4bd';g.fillRect(0,0,w,h);
  for(let i=0;i<4;i++){g.fillStyle='#2b2a2f';g.fillRect(i*128+12,34,104,94);g.fillStyle='#3a3940';for(let y=38;y<128;y+=7)g.fillRect(i*128+14,y,100,3);
    g.fillStyle=['#c8262a','#203f91','#ffb43a','#17a3a5'][i];g.fillRect(i*128+12,12,104,14);}});

/* ---------------- track ---------------- */
/* fast, nearly flat circuit (~3.5 km): long main straight, big sweepers, a handful of medium
   corners for braking zones and no hairpins. [x, z, height] */
const ctrl=[
 [0,0,0],[320,0,0],[640,0,0.3],[850,60,0.6],[960,210,1],[980,360,1.3],[1030,500,1.6],[960,620,1.8],
 [800,650,2],[600,610,2],[420,580,1.6],[240,620,1.2],[90,610,1],[-30,530,0.8],[-110,410,0.5],
 [-200,300,0.3],[-320,240,0.2],[-380,120,0.1],[-280,10,0]];
const curve=new THREE.CatmullRomCurve3(ctrl.map(p=>new THREE.Vector3(p[0],p[2],p[1])),true,'centripetal');
const LEN=curve.getLength();
const N=1000,ds=LEN/N;
const S=[],T=[],SIDE=[];
for(let i=0;i<=N;i++){S.push(curve.getPointAt(i/N));const t=curve.getTangentAt(i/N);T.push(t);const l=Math.hypot(t.x,t.z);SIDE.push([t.z/l,-t.x/l]);}
const W=6.5,CURB=1.4,EDGE=W+CURB;
const mod=(i)=>((i%N)+N)%N;
let AVGY=0;for(let i=0;i<N;i++)AVGY+=S[i].y;AVGY/=N;

/* curvature + speed profile */
const K=new Float32Array(N),V=new Float32Array(N);
/* racing-line speed profile for 400-class sport bikes: about 1.08 g in corners, 1 g on the brakes */
const ALAT=10.6,VMAX=51,BRAKE=9.8,ACC=4.5,G=9.81;
for(let i=0;i<N;i++){
  const a=T[mod(i-5)],b=T[mod(i+5)];
  const cy=a.z*b.x-a.x*b.z,dot=a.x*b.x+a.z*b.z;
  K[i]=Math.atan2(cy,dot)/(10*ds);
  V[i]=Math.min(VMAX,Math.sqrt(ALAT/Math.max(Math.abs(K[i]),1e-4)));
}
for(let pass=0;pass<3;pass++){
  for(let i=N-1;i>=0;i--){const nx=V[mod(i+1)];V[i]=Math.min(V[i],Math.sqrt(nx*nx+2*BRAKE*ds));}
  for(let i=0;i<N;i++){const pv=V[mod(i-1)];V[i]=Math.min(V[i],Math.sqrt(pv*pv+2*ACC*ds));}
}
function lerpArr(arr,s){const f=(((s%LEN)+LEN)%LEN)/ds,i=Math.floor(f)%N,j=(i+1)%N,t=f-Math.floor(f);return arr[i]*(1-t)+arr[j]*t;}

/* corners */
const corners=[];
(function(){
  let cur=null;
  for(let i=0;i<N;i++){const k=K[i];
    if(Math.abs(k)>1/230){const sg=Math.sign(k);
      if(cur&&cur.sg===sg&&i-cur.i1<=10){cur.i1=i;if(Math.abs(k)>cur.kmax){cur.kmax=Math.abs(k);cur.ip=i;}}
      else{cur={sg,i0:i,i1:i,kmax:Math.abs(k),ip:i};corners.push(cur);}
    }}
  if(corners.length>1){const f=corners[0],l=corners[corners.length-1];
    if(f.i0<3&&l.i1>N-4&&f.sg===l.sg){l.i1=f.i1+N;if(f.kmax>l.kmax){l.kmax=f.kmax;l.ip=f.ip;}corners.shift();}}
  for(let i=corners.length-1;i>=0;i--){const c=corners[i];if(1/c.kmax>170&&c.i1-c.i0<8)corners.splice(i,1);}
  corners.forEach((c,n)=>{c.r=1/c.kmax;c.num=n+1;
    c.kind=c.r<32?'hairpin':c.r<65?'tight':c.r<130?'medium':'fast';
    c.label=c.kind.charAt(0).toUpperCase()+c.kind.slice(1)+' '+(c.sg<0?'right':'left');
    c.kmh=V[mod(c.ip)]*3.6;});
})();

/* ---------------- builders ---------------- */
function strip(a,b,dy,mat,vLen,i0,i1,shade){
  if(i0===undefined){i0=0;i1=N;}
  const reps=Math.max(1,Math.round(LEN/vLen)),vs=LEN/reps;
  const pos=[],uv=[],idx=[],col=[];
  for(let i=i0;i<=i1;i++){
    const ii=mod(i),p=S[ii],sd=SIDE[ii],v=i*ds/vs,y=p.y+dy;
    pos.push(p.x+sd[0]*a,y,p.z+sd[1]*a,p.x+sd[0]*b,y,p.z+sd[1]*b);
    uv.push(0,v,1,v);
    if(shade){const c=shade(i);col.push(c,c,c,c,c,c);}
    if(i<i1){const k=2*(i-i0);idx.push(k,k+2,k+1,k+1,k+2,k+3);}
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  if(shade)g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  g.setIndex(idx);g.computeVertexNormals();
  const m=new THREE.Mesh(g,mat);m.receiveShadow=true;scene.add(m);return m;
}
function wall(off,y0,y1,mat,uLen,vRep,i0,i1,cast){
  if(i0===undefined){i0=0;i1=N;}
  const reps=Math.max(1,Math.round(LEN/uLen)),us=LEN/reps;
  const pos=[],uv=[],idx=[];
  for(let i=i0;i<=i1;i++){
    const ii=mod(i),p=S[ii],sd=SIDE[ii],u=i*ds/us,x=p.x+sd[0]*off,z=p.z+sd[1]*off;
    pos.push(x,p.y+y0,z,x,p.y+y1,z);uv.push(u,0,u,vRep);
    if(i<i1){const k=2*(i-i0);idx.push(k,k+2,k+1,k+1,k+2,k+3);}
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx);g.computeVertexNormals();
  const m=new THREE.Mesh(g,mat);m.castShadow=cast!==false;m.receiveShadow=true;scene.add(m);return m;
}
function frameAt(s,off){
  const u=(((s%LEN)+LEN)%LEN)/LEN,p=curve.getPointAt(u),t=curve.getTangentAt(u),l=Math.hypot(t.x,t.z),tx=t.x/l,tz=t.z/l;
  const g=new THREE.Group();g.position.set(p.x+tz*off,p.y,p.z-tx*off);g.rotation.y=Math.atan2(-tz,tx);scene.add(g);return g;
}

/* road surface with patchy repairs and rubber */
const roadMat=new THREE.MeshStandardMaterial({map:roadTex,normalMap:roadNormal,normalScale:new THREE.Vector2(0.16,0.16),roughness:0.86,vertexColors:true});
const patch=i=>0.9+0.08*Math.sin(i*0.031)+0.05*Math.sin(i*0.173+1.2)+(Math.sin(i*0.011)>0.85?-0.08:0);
strip(-W,W,0.05,roadMat,16,0,N,patch);
const curbMat=new THREE.MeshStandardMaterial({map:curbTex,roughness:0.6});
strip(-EDGE,-W,0.07,curbMat,2);strip(W,EDGE,0.07,curbMat,2);
const turfMat=new THREE.MeshStandardMaterial({map:turfTex,roughness:0.95});
strip(-EDGE-2.5,-EDGE,0.03,turfMat,4);strip(EDGE,EDGE+2.5,0.03,turfMat,4);
wall(-EDGE-2.5,-0.6,0.03,turfMat,4,0.2,0,N,false);wall(EDGE+2.5,-0.6,0.03,turfMat,4,0.2,0,N,false);

/* start/finish line: main straight occupies roughly -40..230 m */
const PIT0=-Math.round(36/ds),PIT1=Math.round(210/ds);
const BAR=EDGE+16.3;
const gravelMat=new THREE.MeshStandardMaterial({map:gravelTex,roughness:1});
const rubberMat=new THREE.MeshStandardMaterial({map:rubberTex,transparent:true,depthWrite:false,roughness:0.7});
const tirePos=[],tireZones=[],gravelZones=[];
corners.forEach(c=>{
  const out=-c.sg;
  if(c.r<140){const a=EDGE+2.5,b=EDGE+15.5;gravelZones.push({side:out,i0:c.i0-12,len:38+c.i1-c.i0});strip(out>0?a:-b,out>0?b:-a,0.02,gravelMat,6,c.i0-12,c.i1+26);
    wall(out*b,-0.6,0.02,gravelMat,6,0.15,c.i0-12,c.i1+26,false);}
  if(c.r<70){
    tireZones.push({side:out,i0:c.i0-6,len:c.i1+18-(c.i0-6)});
    for(let i=c.i0-6;i<=c.i1+18;i++){const ii=mod(i),p=S[ii],sd=SIDE[ii];
      for(let k=0;k<Math.max(1,Math.round(ds/0.68));k++){const f=k*0.68/ds;const jj=mod(i+1),q=S[jj];
        const x=p.x+(q.x-p.x)*f,z=p.z+(q.z-p.z)*f,y=p.y+(q.y-p.y)*f;
        [15.2,15.85].forEach((o,row)=>tirePos.push([x+sd[0]*out*(EDGE+o),y,z+sd[1]*out*(EDGE+o),row]));}}
    const lineIn=out*2.6,lineOut=out*5.2;
    strip(Math.min(lineIn,lineOut),Math.max(lineIn,lineOut),0.06,rubberMat,24,c.i0-30,c.i0+4);
  }
});
/* tire walls */
(function(){
  const geo=new THREE.CylinderGeometry(0.33,0.33,0.82,14);geo.translate(0,0.41,0);
  const m=new THREE.InstancedMesh(geo,new THREE.MeshStandardMaterial({roughness:0.85}),tirePos.length);
  const d=new THREE.Object3D(),c=new THREE.Color();
  tirePos.forEach((t,i)=>{
    // tire offset was stored relative to the track edge
    d.position.set(t[0],t[1],t[2]);d.updateMatrix();m.setMatrixAt(i,d.matrix);
    const band=(i>>1)%6;m.setColorAt(i,band<3?lin(0x1a1a1d):lin(i%4<2?0xc8262a:0xefebe3));});
  m.castShadow=true;m.receiveShadow=true;scene.add(m);
})();

/* barriers: armco + catch fence, ad boards and pit wall on the straight */
const armcoMat=new THREE.MeshStandardMaterial({map:armcoTex,metalness:0.75,roughness:0.35,side:THREE.DoubleSide});
const fenceMat=new THREE.MeshStandardMaterial({map:fenceTex,alphaTest:0.35,transparent:false,side:THREE.DoubleSide,metalness:0.5,roughness:0.5});
fenceTex.colorSpace=THREE.NoColorSpace;
const adMat=new THREE.MeshStandardMaterial({map:adTex,roughness:0.55,side:THREE.DoubleSide});
const concreteMat=std(0xbdb6ad,0.92);
wall(BAR,-0.6,0.8,armcoMat,8,1);
wall(BAR+0.3,0.8,4.0,fenceMat,0.7,4.6,0,N,false);
wall(-BAR,-0.6,0.8,armcoMat,8,1,PIT1,N+PIT0);
wall(-BAR-0.3,0.8,4.0,fenceMat,0.7,4.6,PIT1,N+PIT0,false);
wall(BAR-0.15,-0.4,1.1,adMat,24,1,PIT0+8,PIT1-8);
wall(-BAR,-0.6,1.2,concreteMat,6,1,PIT0,PIT1);
wall(-BAR-0.2,1.2,3.6,fenceMat,0.7,3.4,PIT0,PIT1,false);
(function(){/* fence posts */
  const pts=[];for(let i=0;i<N;i+=2){const p=S[i],sd=SIDE[i];pts.push([p.x+sd[0]*(BAR+0.3),p.y,p.z+sd[1]*(BAR+0.3)]);
    const o=(i>=PIT0+N||i<=PIT1)?-(BAR+0.2):-(BAR+0.3);pts.push([p.x+sd[0]*o,p.y,p.z+sd[1]*o]);}
  const geo=new THREE.CylinderGeometry(0.05,0.05,4.2,6);geo.translate(0,2.1,0);
  const m=new THREE.InstancedMesh(geo,std(0x6e7278,0.4,0.8),pts.length);const d=new THREE.Object3D();
  pts.forEach((p,i)=>{d.position.set(p[0],p[1],p[2]);d.updateMatrix();m.setMatrixAt(i,d.matrix);});scene.add(m);
})();
/* pit lane */
strip(-EDGE-28,-EDGE-16.6,0.04,roadMat,16,PIT0,PIT1,()=>0.95);

/* start / finish gantry */
const startLights=[];
(function(){
  const g=frameAt(0,0);
  const line=new THREE.Mesh(new THREE.PlaneGeometry(1.6,2*W),new THREE.MeshStandardMaterial({map:checkTex,roughness:0.7}));
  checkTex.repeat.set(2,16);line.rotation.x=-Math.PI/2;line.position.y=0.075;line.receiveShadow=true;g.add(line);
  const steel=std(0x2b2830,0.45,0.6),span=EDGE+2;
  [-span,span].forEach(z=>{const p=new THREE.Mesh(new THREE.BoxGeometry(0.6,8.5,0.6),steel);p.position.set(0,4.25,z);p.castShadow=true;g.add(p);});
  const beam=new THREE.Mesh(new THREE.BoxGeometry(0.9,1.7,2*span+0.6),steel);beam.position.set(0,8.4,0);beam.castShadow=true;g.add(beam);
  const bTex=tex(1024,128,(c,w,h)=>{c.fillStyle='#1d1a24';c.fillRect(0,0,w,h);
    for(let x=0;x<8;x++)for(let y=0;y<4;y++){c.fillStyle=(x+y)%2?'#f3efe7':'#1d1a24';c.fillRect(x*16,y*32,16,32);c.fillRect(w-128+x*16,y*32,16,32);}
    c.fillStyle='#ffb43a';c.font='italic 700 70px "Chakra Petch", sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('APEX RUN',w/2,h/2+4);});
  bTex.wrapS=bTex.wrapT=THREE.ClampToEdgeWrapping;
  const bMat=new THREE.MeshStandardMaterial({map:bTex,roughness:0.6,emissive:0xffffff,emissiveMap:bTex,emissiveIntensity:0.25});
  [-1,1].forEach(sd=>{const pl=new THREE.Mesh(new THREE.PlaneGeometry(2*span-1,2),bMat);pl.rotation.y=sd*Math.PI/2;pl.position.set(sd*0.47,8.4,0);g.add(pl);});
  for(let i=-2;i<=2;i++){const pod=new THREE.MeshStandardMaterial({color:0x120a0b,roughness:0.3,emissive:lin(0xff3020),emissiveIntensity:0});startLights.push(pod);
    const l=new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.28,0.2,14),pod);l.rotation.z=Math.PI/2;l.position.set(-0.55,7.2,i*1.2);g.add(l);}
})();

/* grandstands, pit garages */
const keepClear=[];
function grandstand(s,side,len,rows){
  const g=frameAt(s,side*(EDGE+19));if(side<0)g.rotation.y+=Math.PI;
  keepClear.push([g.position.x,g.position.z,len*0.65]);
  const conc=std(0xb9b0a8,0.95);
  for(let r=0;r<rows;r++){const b=new THREE.Mesh(new THREE.BoxGeometry(len,(r+1)*0.9+1,1.6),conc);
    b.position.set(0,(r+1)*0.45-0.5,-(r*1.6+0.8));b.castShadow=true;b.receiveShadow=true;g.add(b);}
  const roof=new THREE.Mesh(new THREE.BoxGeometry(len+2,0.35,rows*1.6+3),std(0xeeeae2,0.5,0.2));
  roof.position.set(0,rows*0.9+5.2,-(rows*1.6)/2+0.6);roof.rotation.x=-0.06;roof.castShadow=true;g.add(roof);
  const post=std(0x3a3640,0.5,0.6);
  for(let x=-len/2+2;x<=len/2;x+=12){const p=new THREE.Mesh(new THREE.BoxGeometry(0.4,rows*0.9+6,0.4),post);p.position.set(x,(rows*0.9+5)/2,-rows*1.6+0.2);g.add(p);}
  const cols=[0xff5236,0xffb43a,0x203f91,0xf3efe7,0x2f9e8f,0xd94f8a,0x1a1a1f,0xe8d34a,0x6fb0e8,0x8a5a3c];
  const per=Math.floor(len/0.93),count=rows*per;
  const crowd=new THREE.InstancedMesh(new THREE.BoxGeometry(0.48,0.82,0.4),new THREE.MeshStandardMaterial({roughness:0.9}),count);
  const heads=new THREE.InstancedMesh(new THREE.SphereGeometry(0.13,8,6),std(0xd9a988,0.8),count);
  const d=new THREE.Object3D();let n=0;
  for(let r=0;r<rows;r++)for(let i=0;i<per;i++){if(rnd()<0.14)continue;
    const x=-len/2+0.6+i*0.93+(rnd()-0.5)*0.2,y=(r+1)*0.9+0.4+rnd()*0.06,z=-(r*1.6+0.65);
    d.position.set(x,y,z);d.rotation.y=(rnd()-0.5)*0.4;d.updateMatrix();crowd.setMatrixAt(n,d.matrix);crowd.setColorAt(n,lin(cols[(rnd()*cols.length)|0]));
    d.position.set(x,y+0.55,z);d.updateMatrix();heads.setMatrixAt(n,d.matrix);
    heads.setColorAt(n,lin([0xe6b896,0xc48a64,0x8d5a3b,0xf0caa8,0x5c3a26][(rnd()*5)|0]));n++;}
  crowd.count=heads.count=n;crowd.castShadow=true;g.add(crowd);g.add(heads);
}
grandstand(70,1,92,10);
[...corners].sort((a,b)=>a.r-b.r).slice(0,2).forEach(c=>grandstand(mod(c.ip)*ds,-c.sg,64,9));   // stands at the slowest corners
(function(){
  const g=frameAt(85,-(EDGE+30));g.rotation.y+=Math.PI;keepClear.push([g.position.x,g.position.z,100]);
  const body=new THREE.Mesh(new THREE.BoxGeometry(150,9,16),std(0xd2ccc4,0.85));body.position.set(0,2.5,-8);body.castShadow=true;body.receiveShadow=true;g.add(body);
  garageTex.repeat.set(150/16,1);
  const front=new THREE.Mesh(new THREE.PlaneGeometry(150,6),new THREE.MeshStandardMaterial({map:garageTex,roughness:0.8}));
  front.position.set(0,3,0.02);g.add(front);
  const roof=new THREE.Mesh(new THREE.BoxGeometry(152,0.5,20),std(0x2d2b33,0.5,0.4));roof.position.set(0,7.2,-6.5);roof.castShadow=true;g.add(roof);
  const glass=new THREE.Mesh(new THREE.BoxGeometry(150,2.4,0.2),new THREE.MeshStandardMaterial({color:lin(0x334455),roughness:0.08,metalness:0.9}));glass.position.set(0,8.9,-2);g.add(glass);
  const top=new THREE.Mesh(new THREE.BoxGeometry(150,3,10),std(0xd2ccc4,0.85));top.position.set(0,9,-7.2);top.castShadow=true;g.add(top);
})();
/* distance from the centre line to the first solid barrier on one side (+1 left, -1 right) */
/* ---------------- trackside detail ---------------- */
/* a strip whose centre follows a varying offset (used for the rubbered racing line) */
function lineStrip(offFn,width,dy,mat,vLen){
  const reps=Math.max(1,Math.round(LEN/vLen)),vs=LEN/reps,pos=[],uv=[],idx=[];
  for(let i=0;i<=N;i++){const ii=mod(i),p=S[ii],sd=SIDE[ii],o=offFn(ii),v=i*ds/vs,y=p.y+dy;
    pos.push(p.x+sd[0]*(o-width/2),y,p.z+sd[1]*(o-width/2),p.x+sd[0]*(o+width/2),y,p.z+sd[1]*(o+width/2));uv.push(0,v,1,v);
    if(i<N){const k=2*i;idx.push(k,k+2,k+1,k+1,k+2,k+3);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
  const m=new THREE.Mesh(g,mat);m.receiveShadow=true;scene.add(m);return m;
}
/* rubber laid down along the racing line the bikes actually use */
(function(){
  const line=i=>{const kA=K[mod(i+Math.round(16/ds))];return Math.sign(kA)*Math.min(1,Math.abs(kA)*36)*(W-1.6);};
  const mat=new THREE.MeshStandardMaterial({map:rubberTex,transparent:true,opacity:0.85,depthWrite:false,roughness:0.6,polygonOffset:true,polygonOffsetFactor:-1});
  rubberTex.repeat.set(3,1);
  lineStrip(line,2.2,0.056,mat,30);
})();
/* painted run-off on the outside of every real corner, and more ad boards there */
const runoffMat=new THREE.MeshStandardMaterial({map:runoffTex,roughness:0.75});
corners.forEach(c=>{
  if(c.r>260)return;const out=-c.sg;
  strip(out>0?EDGE:-EDGE-3.4,out>0?EDGE+3.4:-EDGE,0.035,runoffMat,3,c.i0-14,c.i1+20);
  wall(out*(BAR-0.15),-0.4,1.1,adMat,24,1,c.i0-10,c.i1+10);
});
/* braking boards 300/200/100 m before corners that need real braking, on the outside */
(function(){
  const boardTex=[3,2,1].map(n=>tex(128,96,(g,w,h)=>{g.fillStyle='#f3efe7';g.fillRect(0,0,w,h);g.strokeStyle='#14141a';g.lineWidth=8;g.strokeRect(4,4,w-8,h-8);
    g.fillStyle='#14141a';for(let k=0;k<n;k++){g.save();g.translate(w/2+(k-(n-1)/2)*26,h/2);g.transform(1,0,-0.45,1,0,0);g.fillRect(-7,-30,14,60);g.restore();}}));
  const mats=boardTex.map(t=>new THREE.MeshStandardMaterial({map:t,roughness:0.6}));
  const post=std(0x3a3640,0.5,0.6);
  corners.forEach(c=>{
    const vIn=V[mod(c.i0-Math.round(120/ds))],vMin=V[mod(c.ip)];
    if(vIn-vMin<9)return;                            // flat-out bend, no boards
    const out=-c.sg;
    [300,200,100].forEach((d,k)=>{
      const g=frameAt(mod(c.i0)*ds-d,out*(EDGE+4.2));
      const pl=new THREE.Mesh(new THREE.PlaneGeometry(1.3,0.95),mats[k]);pl.rotation.y=-Math.PI/2;pl.position.y=1.35;pl.castShadow=true;g.add(pl);
      const pp=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,1.3,6),post);pp.position.set(0.04,0.65,0);g.add(pp);
    });
  });
})();
/* marshal posts behind the barriers every ~250 m, alternating sides */
(function(){
  const white=std(0xf0ece4,0.8),roof=std(0xe8621c,0.6),pole=std(0x8a8d92,0.4,0.7),flag=new THREE.MeshStandardMaterial({color:lin(0xf2d21b),side:THREE.DoubleSide,roughness:0.8});
  let side=1;
  for(let sx=180;sx<LEN-60;sx+=250){
    side=-side;const i=mod(Math.round(sx/ds));
    if(side<0&&(i<=PIT1||i>=N+PIT0))continue;        // not in the pit lane
    const g=frameAt(sx,side*(BAR+3.2));
    if(!keepClear.every(k=>Math.hypot(g.position.x-k[0],g.position.z-k[1])>k[2])){scene.remove(g);continue;}
    if(side>0)g.rotation.y+=Math.PI;
    const hut=new THREE.Mesh(new THREE.BoxGeometry(1.8,2.2,1.6),white);hut.position.y=1.1;hut.castShadow=true;hut.receiveShadow=true;g.add(hut);
    const rf=new THREE.Mesh(new THREE.BoxGeometry(2.1,0.18,1.9),roof);rf.position.y=2.3;rf.castShadow=true;g.add(rf);
    const pl=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.035,3.6,6),pole);pl.position.set(0.7,1.8,1.0);g.add(pl);
    const fl=new THREE.Mesh(new THREE.PlaneGeometry(0.7,0.45),flag);fl.position.set(1.05,3.3,1.0);g.add(fl);
  }
})();
function barrierAt(s,side){
  const i=mod(Math.floor(s/ds));
  for(const z of tireZones)if(z.side===side&&mod(i-z.i0)<=z.len)return EDGE+14.6;
  return BAR-0.3;
}
/* what the tyres are on at a given offset from the centre line */
function surfaceAt(s,off){
  const d=Math.abs(off);
  if(d<=W)return 'asphalt';
  if(d<=EDGE)return 'curb';
  if(d>EDGE+2.5){const i=mod(Math.floor(s/ds)),side=Math.sign(off);
    for(const z of gravelZones)if(z.side===side&&mod(i-z.i0)<=z.len)return 'gravel';}
  return 'grass';
}
export {roadMat,gravelMat,concreteMat,surfaceAt,startLights,barrierAt,grassTex,curve,LEN,N,ds,S,T,SIDE,W,CURB,EDGE,mod,AVGY,K,V,VMAX,G,corners,lerpArr,keepClear};
