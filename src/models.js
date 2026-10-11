import * as THREE from 'three';
import {lin,hexStr,scene,tex,std} from './core.js';

/* ---------------- motorcycles ---------------- */
const UP=new THREE.Vector3(0,1,0);
const V3=(x,y,z)=>new THREE.Vector3(x,y,z);
const SPH=new THREE.SphereGeometry(1,28,20);
const _d=new THREE.Vector3();
function cr(a,b,c,d,t){const t2=t*t,t3=t2*t;return 0.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t2+(-a+3*b-3*c+d)*t3);}
/* smooth body panels lofted from cross-sections: [z, top, bottom, topHalfWidth, bottomHalfWidth] */
function loft(secs,steps,radial,E,colorFn){
  const pos=[],col=[],idx=[];
  for(let s=0;s<=steps;s++){
    const u=s/steps*(secs.length-1),i=Math.min(Math.floor(u),secs.length-2),t=u-i;
    const p0=secs[Math.max(i-1,0)],p1=secs[i],p2=secs[i+1],p3=secs[Math.min(i+2,secs.length-1)];
    const q=[0,1,2,3,4].map(k=>cr(p0[k],p1[k],p2[k],p3[k],t));
    const z=q[0],yc=(q[1]+q[2])/2,h=Math.max((q[1]-q[2])/2,0.002),wt=Math.max(q[3],0.002),wb=Math.max(q[4],0.002);
    for(let j=0;j<radial;j++){
      const a=j/radial*Math.PI*2,c=Math.cos(a),sn=Math.sin(a),w=wb+(wt-wb)*(sn+1)/2;
      const x=w*Math.sign(c)*Math.pow(Math.abs(c),E),y=yc+h*Math.sign(sn)*Math.pow(Math.abs(sn),E);
      pos.push(x,y,z);if(colorFn){const cc=colorFn(x,y,z);col.push(cc.r,cc.g,cc.b);}
    }
  }
  for(let s=0;s<steps;s++)for(let j=0;j<radial;j++){const a=s*radial+j,b=s*radial+(j+1)%radial,c=a+radial,d=b+radial;idx.push(a,c,b,b,c,d);}
  [0,steps].forEach((s,k)=>{
    const base=s*radial;let cx=0,cy=0,cz=0;
    for(let j=0;j<radial;j++){cx+=pos[(base+j)*3];cy+=pos[(base+j)*3+1];cz+=pos[(base+j)*3+2];}
    cx/=radial;cy/=radial;cz/=radial;const ci=pos.length/3;pos.push(cx,cy,cz);
    if(colorFn){const cc=colorFn(cx,cy,cz);col.push(cc.r,cc.g,cc.b);}
    for(let j=0;j<radial;j++){const a=base+j,b=base+(j+1)%radial;if(k===0)idx.push(ci,a,b);else idx.push(ci,b,a);}
  });
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  if(colorFn)g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  g.setIndex(idx);g.computeVertexNormals();return g;
}
function setRod(m,a,b){_d.subVectors(b,a);const len=_d.length();m.position.copy(a).addScaledVector(_d,0.5);m.quaternion.setFromUnitVectors(UP,_d.normalize());m.scale.y=Math.max(len,0.001);}
function rod(parent,a,b,r1,r2,mat,seg){const m=new THREE.Mesh(new THREE.CylinderGeometry(r2,r1,1,seg||14),mat);m.castShadow=true;setRod(m,a,b);parent.add(m);return m;}
function ball(parent,mat,p,sc,rot){const m=new THREE.Mesh(SPH,mat);m.position.copy(p);m.scale.set(sc[0],sc[1],sc[2]);if(rot)m.rotation.set(rot[0],rot[1],rot[2]);m.castShadow=true;parent.add(m);return m;}
function box(parent,mat,p,s,rot){const m=new THREE.Mesh(new THREE.BoxGeometry(s[0],s[1],s[2]),mat);m.position.copy(p);if(rot)m.rotation.set(rot[0],rot[1],rot[2]);m.castShadow=true;parent.add(m);return m;}

/* ---- surface detail textures (shared) ---- */
/* tyre: lathe u runs round the wheel, v across the profile: ribbed sidewalls, slick shoulders,
   a few sipes in the centre of the tread */
const tyreTex=tex(512,64,(g,w,h)=>{
  g.fillStyle='#2a2a2d';g.fillRect(0,0,w,h);
  g.fillStyle='#1c1c1f';g.fillRect(0,h*0.24,w,h*0.52);                       // tread band
  g.strokeStyle='rgba(255,255,255,.07)';g.lineWidth=1;
  for(const v of [0.06,0.1,0.14,0.86,0.9,0.94]){g.beginPath();g.moveTo(0,v*h);g.lineTo(w,v*h);g.stroke();}
  g.strokeStyle='#0c0c0e';g.lineWidth=2;
  for(let x=0;x<w;x+=32){g.beginPath();g.moveTo(x,h*0.36);g.lineTo(x+14,h*0.46);g.stroke();g.beginPath();g.moveTo(x+16,h*0.64);g.lineTo(x+2,h*0.54);g.stroke();}
});
tyreTex.repeat.set(6,1);
/* drilled, wave-edged brake disc as an alpha map (cylinder caps map radially) */
const discAlpha=tex(256,256,(g,w,h)=>{
  g.fillStyle='#000';g.fillRect(0,0,w,h);g.fillStyle='#fff';g.beginPath();
  for(let k=0;k<=240;k++){const a=k/240*Math.PI*2,r=w*0.5*(0.965+0.035*Math.cos(a*12));k?g.lineTo(w/2+Math.cos(a)*r,h/2+Math.sin(a)*r):g.moveTo(w/2+Math.cos(a)*r,h/2+Math.sin(a)*r);}
  g.fill();g.fillStyle='#000';g.beginPath();g.arc(w/2,h/2,w*0.29,0,Math.PI*2);g.fill();
  for(let k=0;k<36;k++){const a=k/36*Math.PI*2,r=w*(k%2?0.36:0.42);g.beginPath();g.arc(w/2+Math.cos(a)*r,h/2+Math.sin(a)*r,w*0.013,0,Math.PI*2);g.fill();}
},false);
/* leathers: panel seams, double stitching and accordion stretch panels, multiplied by the suit colour */
const leatherTex=tex(256,256,(g,w,h)=>{
  g.fillStyle='#ececec';g.fillRect(0,0,w,h);
  for(let i=0;i<2600;i++){g.fillStyle='rgba(0,0,0,'+(0.02+Math.random()*0.04)+')';g.fillRect(Math.random()*w,Math.random()*h,1.5,1.5);}
  g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=2;
  [[0,64,w,80],[0,170,w,150],[90,0,70,h],[190,0,205,h]].forEach(([a,b,c,d])=>{g.beginPath();g.moveTo(a,b);g.lineTo(c,d);g.stroke();});
  g.setLineDash([3,3]);g.strokeStyle='rgba(0,0,0,.28)';g.lineWidth=1;
  [[0,70,w,86],[0,176,w,156],[96,0,76,h],[196,0,211,h]].forEach(([a,b,c,d])=>{g.beginPath();g.moveTo(a,b);g.lineTo(c,d);g.stroke();});
  g.setLineDash([]);g.strokeStyle='rgba(0,0,0,.22)';g.lineWidth=2;
  for(let y=100;y<140;y+=6){g.beginPath();g.moveTo(100,y);g.lineTo(180,y);g.stroke();}   // stretch panel
});
/* paint orange peel for the clearcoat: a fine noise normal map */
const peelTex=(()=>{const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d'),im=g.createImageData(128,128);
  for(let i=0;i<128*128;i++){const a=Math.random()*Math.PI*2,k=0.18*Math.random();im.data[i*4]=128+Math.cos(a)*k*127;im.data[i*4+1]=128+Math.sin(a)*k*127;im.data[i*4+2]=255;im.data[i*4+3]=255;}
  g.putImageData(im,0,0);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(6,6);return t;})();
/* unit-height limb with a muscle bulge (scaled along y to the bone length by setRod) */
function limbGeo(r1,r2,bulge){
  const pts=[];for(let k=0;k<=12;k++){const t=k/12,r=(r1+(r2-r1)*t)*(1+bulge*Math.sin(Math.PI*t));pts.push(new THREE.Vector2(Math.max(r,0.001),t-0.5));}
  return new THREE.LatheGeometry(pts,24);
}
/* full-face helmet shell: lathe profile, stretched front to back */
const HELMET_GEO=(()=>{const pr=[[0,0.158],[0.06,0.154],[0.105,0.135],[0.138,0.095],[0.153,0.04],[0.152,-0.02],[0.142,-0.075],[0.128,-0.115],[0.118,-0.13]];
  const g=new THREE.LatheGeometry(pr.map(([r,y])=>new THREE.Vector2(r,y)).reverse(),40);g.scale(1,1,1.12);return g;})();
/* HD material textures from assets.js (Poly Haven), applied to every rider and frame */
const suitMats=new Set();let bikeTex=null;
function applySuit(m){if(!bikeTex||!bikeTex.leather)return;const L=bikeTex.leather;
  if(L.normal){m.normalMap=L.normal;L.normal.repeat.set(3,3);m.normalScale=new THREE.Vector2(0.6,0.6);}
  if(L.rough){m.roughnessMap=L.rough;L.rough.repeat.set(3,3);}m.needsUpdate=true;}
export function setBikeTextures(t){
  bikeTex=t;suitMats.forEach(applySuit);
  const Mt=t.metal;if(Mt){const a=BIKE_SHARED.alu;if(Mt.normal){a.normalMap=Mt.normal;Mt.normal.repeat.set(2,2);}if(Mt.rough){a.roughnessMap=Mt.rough;Mt.rough.repeat.set(2,2);a.roughness=0.8;}a.needsUpdate=true;}
}
const BIKE_SHARED={
  tire:new THREE.MeshStandardMaterial({color:0xffffff,map:tyreTex,bumpMap:tyreTex,bumpScale:0.004,roughness:0.78,side:THREE.DoubleSide}),
  disc:std(0xb9bdc2,0.32,1,{alphaMap:discAlpha,alphaTest:0.5,side:THREE.DoubleSide}),chain:std(0x2c2c30,0.45,0.85),carbon:new THREE.MeshPhysicalMaterial({color:lin(0x1e1f23),roughness:0.35,metalness:0.4,clearcoat:1,clearcoatRoughness:0.1}),
  alu:std(0xc3c6cb,0.3,1),black:std(0x141417,0.45,0.3),gold:std(0xc79a3a,0.28,1),ti:std(0x8e8780,0.3,1),
  spring:std(0xe5b81c,0.4,0.6),rubber:std(0x111113,0.85),
  glass:new THREE.MeshPhysicalMaterial({color:lin(0x3b4652),roughness:0.03,metalness:0,transparent:true,opacity:0.42,clearcoat:1,side:THREE.DoubleSide,depthWrite:false}),
  visor:new THREE.MeshPhysicalMaterial({color:lin(0x2b1f45),roughness:0.04,metalness:1,clearcoat:1,side:THREE.DoubleSide}),
  head:new THREE.MeshStandardMaterial({color:0xffffff,emissive:lin(0xfff3dc),emissiveIntensity:2.2}),
  white:std(0xeeebe4,0.5),
  glove:new THREE.MeshStandardMaterial({color:lin(0x202024),roughness:0.6})
};

/* "Prismatic Dark": dark matte paint whose colour shifts from charcoal through deep purple to a
   teal edge as the surface turns away from the viewer. r128 has no iridescence, so the shift is a
   fresnel tint applied only to the dark parts of the vertex-coloured livery. */
function prismatic(mat){
  mat.onBeforeCompile=sh=>{
    sh.fragmentShader=sh.fragmentShader.replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
      {float lum=dot(diffuseColor.rgb,vec3(0.299,0.587,0.114));
       float mask=1.0-smoothstep(0.02,0.07,lum);
       float fr=1.0-abs(dot(normalize(normal),normalize(vViewPosition)));
       vec3 prism=mix(vec3(0.075,0.045,0.13),vec3(0.03,0.13,0.14),smoothstep(0.55,0.95,fr));
       diffuseColor.rgb=mix(diffuseColor.rgb,prism,mask*smoothstep(0.1,0.85,fr));}`);
  };
  mat.customProgramCacheKey=()=>'prismatic';
  return mat;
}

/* 17-inch sport wheel: tyre lathe, split 5-spoke rim, discs */
const WHEEL_F=0.305,WHEEL_R=0.312;
function makeWheel(hw,r,front,M){
  const w=new THREE.Group();
  const prof=[];for(let k=0;k<=20;k++){const t=k/20*Math.PI;prof.push(new THREE.Vector2(0.214+(r-0.214)*Math.pow(Math.sin(t),0.5),-hw*Math.cos(t)*(1+0.12*Math.sin(t))));}
  const tg=new THREE.LatheGeometry(prof,56);tg.rotateZ(Math.PI/2);
  const tire=new THREE.Mesh(tg,M.tire);tire.castShadow=true;w.add(tire);
  const rimG=new THREE.CylinderGeometry(0.215,0.215,hw*1.7,48,1,true);rimG.rotateZ(Math.PI/2);
  w.add(new THREE.Mesh(rimG,M.rim));
  [-1,1].forEach(sd=>{const lip=new THREE.Mesh(new THREE.TorusGeometry(0.213,0.008,6,48),M.rim);lip.rotation.y=Math.PI/2;lip.position.x=sd*hw*0.85;w.add(lip);});
  for(let k=0;k<10;k++){const a=Math.floor(k/2)/5*Math.PI*2+(k%2?0.12:-0.12),sp=new THREE.Mesh(new THREE.BoxGeometry(0.014,0.165,0.024),M.rim);
    sp.position.set(0,Math.cos(a)*0.128,Math.sin(a)*0.128);sp.rotation.x=a;w.add(sp);}
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(0.048,0.048,hw*1.6,20),M.rim);hub.rotation.z=Math.PI/2;w.add(hub);
  const discG=new THREE.CylinderGeometry(front?0.16:0.11,front?0.16:0.11,0.006,48);discG.rotateZ(Math.PI/2);
  const carrierG=new THREE.CylinderGeometry(front?0.105:0.07,front?0.105:0.07,0.012,24);carrierG.rotateZ(Math.PI/2);
  (front?[-1,1]:[1]).forEach(sd=>{const d=new THREE.Mesh(discG,M.disc);d.position.x=sd*(hw+0.016);w.add(d);
    const c=new THREE.Mesh(carrierG,M.carrier);c.position.x=sd*(hw+0.016);w.add(c);});
  if(!front){const spr=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,0.012,30),M.chain);spr.rotation.z=Math.PI/2;spr.position.x=-(hw+0.018);w.add(spr);
    for(let k=0;k<40;k++){const a=k/40*Math.PI*2,t=new THREE.Mesh(new THREE.BoxGeometry(0.012,0.016,0.01),M.chain);t.position.set(-(hw+0.018),Math.cos(a)*0.103,Math.sin(a)*0.103);t.rotation.x=a;w.add(t);}}   // sprocket teeth
  return w;
}

/* 400-class sport bike. r.rs457 builds the player's Aprilia RS 457 in Prismatic Dark
   (red wheels, silver-grey flank, red tail, twin LED headlights with a U-shaped running light,
   tall smoked screen, mirrors on the fairing, slip-on silencer); otherwise a generic team bike. */
function makeBike(r){
  const rs=!!r.rs457;
  const M=Object.assign({},BIKE_SHARED);
  const PAINT=lin(rs?0x16151b:r.color),ACC=lin(rs?0x0e0d12:r.accent),PIN=lin(rs?0xd8202a:0xf3efe7),BELLY=lin(0x1c1c20);
  const SILVER=lin(0x8e9096),RED=lin(0xc81e27);
  M.body=new THREE.MeshPhysicalMaterial({color:0xffffff,vertexColors:true,metalness:rs?0.35:0.15,roughness:rs?0.48:0.28,
    clearcoat:rs?0.25:1,clearcoatRoughness:rs?0.5:0.04,clearcoatNormalMap:peelTex,clearcoatNormalScale:new THREE.Vector2(0.15,0.15),side:THREE.DoubleSide});
  if(rs)prismatic(M.body);
  M.paint=new THREE.MeshPhysicalMaterial({color:PAINT,metalness:0.15,roughness:rs?0.5:0.28,clearcoat:rs?0.3:1,clearcoatRoughness:rs?0.45:0.04});
  M.acc=new THREE.MeshPhysicalMaterial({color:ACC,metalness:0.15,roughness:0.3,clearcoat:1,clearcoatRoughness:0.05});
  M.rim=rs?std(0xc8202a,0.38,0.35):r.rim==='gold'?M.gold:std(r.rimColor||0x16161a,0.35,0.6);
  M.carrier=rs?std(0x1a1a1d,0.4,0.6):M.gold;
  M.suit=new THREE.MeshPhysicalMaterial({color:lin(r.suit),map:leatherTex,bumpMap:leatherTex,bumpScale:0.002,roughness:0.5,clearcoat:0.35,clearcoatRoughness:0.4});
  M.suit2=new THREE.MeshPhysicalMaterial({color:rs?RED:ACC,map:leatherTex,bumpMap:leatherTex,bumpScale:0.002,roughness:0.5,clearcoat:0.35,clearcoatRoughness:0.4});
  M.tail=new THREE.MeshStandardMaterial({color:0x200000,emissive:lin(0xff2414),emissiveIntensity:0.6});
  if(rs){M.helmet=new THREE.MeshPhysicalMaterial({color:lin(0x121116),roughness:0.35,metalness:0.4,clearcoat:1,clearcoatRoughness:0.1});prismatic(M.helmet);
    M.glass=new THREE.MeshPhysicalMaterial({color:lin(0x1c1f26),roughness:0.03,transparent:true,opacity:0.7,clearcoat:1,side:THREE.DoubleSide,depthWrite:false});}
  else{                                                   // painted helmet with livery stripes
    const ht=tex(128,64,(g,w,h)=>{g.fillStyle=hexStr(r.color);g.fillRect(0,0,w,h);g.fillStyle=hexStr(r.accent);g.fillRect(0,h*0.42,w,h*0.16);
      g.fillStyle='#f3efe7';g.fillRect(0,h*0.38,w,h*0.04);g.fillRect(0,h*0.58,w,h*0.04);});
    M.helmet=new THREE.MeshPhysicalMaterial({map:ht,roughness:0.3,clearcoat:1,clearcoatRoughness:0.08});
  }
  const g=new THREE.Group();g.rotation.order='YXZ';

  /* wheels */
  const fw=makeWheel(0.06,WHEEL_F,true,M);fw.position.set(0,WHEEL_F,0.68);g.add(fw);
  const rw=makeWheel(0.075,WHEEL_R,false,M);rw.position.set(0,WHEEL_R,-0.67);g.add(rw);

  /* livery painted per vertex */
  const livery=rs
    ?(x,y,z)=>{const line=0.5+(z-0.05)*0.42;                       // the flank line, rising toward the nose
        if(y>line+0.04&&y<line+0.2&&z<0.36&&z>-0.16)return SILVER;    // silver-grey mid panel
        if(Math.abs(y-(line+0.02))<0.012&&z>0.05&&z<0.52)return PIN;  // red outline stripe
        if(y<0.36)return BELLY;return PAINT;}
    :(x,y,z)=>{const line=0.5+(z-0.05)*0.42;if(y<line-0.012)return y<0.36?BELLY:ACC;if(y<line+0.018)return PIN;return PAINT;};
  const tailLiv=rs
    ?(x,y,z)=>z<-0.6?RED:(z<-0.5&&y<0.99?RED:PAINT)                  // split red tail section
    :(x,y,z)=>{const line=0.985+(z+0.3)*-0.14;if(y<line-0.01)return ACC;if(y<line+0.012)return PIN;return PAINT;};
  const body=new THREE.Mesh(loft([
    [0.715,0.84,0.77,0.025,0.025],[0.685,0.925,0.665,0.09,0.1],[0.6,0.985,0.565,0.14,0.17],[0.48,1.005,0.565,0.16,0.21],
    [0.36,1.02,0.37,0.17,0.22],[0.22,1.06,0.29,0.168,0.205],[0.06,1.10,0.285,0.155,0.18],[-0.06,1.09,0.32,0.145,0.16],
    [-0.15,1.03,0.42,0.13,0.13],[-0.2,0.96,0.58,0.07,0.07]],70,40,0.72,livery),M.body);
  body.castShadow=true;g.add(body);
  const tail=new THREE.Mesh(loft([
    [-0.1,0.99,0.86,0.12,0.11],[-0.28,0.985,0.88,0.125,0.12],[-0.46,1.02,0.9,0.115,0.11],
    [-0.62,1.09,0.96,0.09,0.085],[-0.76,1.125,1.02,0.058,0.055],[-0.865,1.12,1.07,0.02,0.02]],50,32,0.72,tailLiv),M.body);
  tail.castShadow=true;g.add(tail);
  const seat=new THREE.Mesh(loft([[-0.1,1.0,0.965,0.105,0.105],[-0.25,0.997,0.955,0.118,0.118],[-0.42,1.025,0.975,0.1,0.1],[-0.5,1.045,1.0,0.05,0.05]],24,24,0.6),M.black);
  g.add(seat);
  const screen=new THREE.Mesh(loft(rs
    ?[[0.625,0.955,0.93,0.08,0.09],[0.52,1.08,0.975,0.14,0.15],[0.42,1.16,1.0,0.13,0.14],[0.34,1.17,1.05,0.08,0.1]]
    :[[0.625,0.955,0.93,0.08,0.09],[0.52,1.06,0.975,0.135,0.145],[0.42,1.118,1.0,0.13,0.14],[0.345,1.122,1.04,0.085,0.1]],30,30,0.75),M.glass);
  screen.renderOrder=2;g.add(screen);
  ball(g,M.black,V3(0,1.03,0.40),[0.07,0.03,0.05]);                         // dash
  if(rs){
    /* twin LED headlights wrapped by a U-shaped running light */
    [-1,1].forEach(sd=>{
      box(g,M.head,V3(sd*0.062,0.875,0.676),[0.07,0.03,0.018],[0.25,sd*0.42,sd*0.1]);
      box(g,M.head,V3(sd*0.11,0.85,0.655),[0.012,0.08,0.016],[0.2,sd*0.5,sd*-0.25]);   // DRL sides
      box(g,M.black,V3(sd*0.19,1.03,0.47),[0.012,0.012,0.08],[0,sd*0.3,0]);               // mirror stalks
      ball(g,M.black,V3(sd*0.235,1.04,0.45),[0.06,0.03,0.035],[0,sd*0.2,0]);
      box(g,M.carbon,V3(sd*0.2,0.78,0.45),[0.012,0.07,0.1]);                              // side vents
    });
    box(g,M.head,V3(0,0.82,0.69),[0.15,0.012,0.016],[0.25,0,0]);                          // DRL bottom bar
  }else{
    ball(g,M.black,V3(0,0.79,0.705),[0.045,0.03,0.02]);                        // ram-air intake
    [-1,1].forEach(sd=>{
      box(g,M.head,V3(sd*0.088,0.86,0.672),[0.06,0.014,0.02],[0,sd*0.5,sd*0.15]);  // headlight slits
      box(g,M.carbon,V3(sd*0.215,0.86,0.48),[0.11,0.01,0.085],[0,0,sd*-0.18]);      // winglets
      box(g,M.carbon,V3(sd*0.255,0.88,0.48),[0.012,0.05,0.085],[0,0,0]);
    });
  }
  box(g,M.tail,V3(0,1.09,-0.862),[0.07,0.025,0.012]);

  /* front end: forks, clamps, bars, fender, calipers */
  const fa=V3(0,WHEEL_F,0.68);
  [-1,1].forEach(sd=>{
    const top=V3(sd*0.1,1.0,0.405),mid=V3(sd*0.105,0.66,0.545),bot=V3(sd*0.112,WHEEL_F,0.68);
    rod(g,top,mid,0.026,0.026,rs?M.black:M.gold,16);
    rod(g,mid,bot,0.032,0.03,rs?M.alu:M.black,16);
    box(g,rs?M.black:M.alu,V3(sd*0.097,0.42,0.59),[0.026,0.09,0.06],[0.4,0,0]);            // caliper
    rod(g,V3(sd*0.09,0.985,0.40),V3(sd*0.27,0.955,0.375),0.012,0.012,M.black,10);  // clip-on
    rod(g,V3(sd*0.2,0.955,0.375),V3(sd*0.28,0.952,0.372),0.018,0.018,M.rubber,12); // grip
    rod(g,V3(sd*0.17,0.965,0.39),V3(sd*0.28,0.96,0.45),0.005,0.004,M.alu,6);       // lever
  });
  box(g,M.alu,V3(0,1.0,0.405),[0.24,0.03,0.07],[-0.42,0,0]);
  box(g,M.alu,V3(0,0.88,0.46),[0.22,0.03,0.06],[-0.42,0,0]);
  const fenG=new THREE.TorusGeometry(0.345,0.045,8,22,1.55);fenG.scale(1,1,1.5);
  const fender=new THREE.Mesh(fenG,M.paint);fender.rotation.set(0.95,Math.PI/2,0);fender.position.copy(fa);fender.castShadow=true;g.add(fender);

  /* chassis: frame spars, swingarm, shock, exhaust, pegs */
  [-1,1].forEach(sd=>{
    rod(g,V3(sd*0.12,0.93,0.36),V3(sd*0.155,0.62,-0.13),0.03,0.03,M.alu,10);
    box(g,M.alu,V3(sd*0.15,0.55,-0.16),[0.03,0.16,0.12]);
    const arm=box(g,M.alu,V3(sd*0.13,0.42,-0.42),[0.035,0.085,0.56]);arm.rotation.x=-0.35;
    rod(g,V3(sd*0.19,0.53,-0.25),V3(sd*0.235,0.53,-0.25),0.012,0.012,M.alu,8);   // pegs
    box(g,M.alu,V3(sd*0.17,0.62,-0.27),[0.012,0.18,0.05],[0.4,0,0]);             // hanger
  });
  rod(g,V3(0,0.48,-0.28),V3(0,0.86,-0.18),0.026,0.026,rs?M.rim:M.spring,10);
  rod(g,V3(0,0.46,-0.28),V3(0,0.9,-0.17),0.012,0.012,M.alu,8);
  box(g,M.black,V3(0,0.5,0.0),[0.28,0.26,0.34]);                               // parallel-twin engine
  {const x=-0.093,fz=-0.02,fy=0.42,rz=-0.67,ry=WHEEL_R;                          // chain and front sprocket
    const fs=new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.045,0.014,18),M.chain);fs.rotation.z=Math.PI/2;fs.position.set(x,fy,fz);g.add(fs);
    rod(g,V3(x,fy+0.045,fz),V3(x,ry+0.1,rz),0.008,0.008,M.chain,6);
    rod(g,V3(x,fy-0.045,fz),V3(x,ry-0.1,rz),0.008,0.008,M.chain,6);}
  if(rs){
    rod(g,V3(0.08,0.36,-0.04),V3(0.17,0.42,-0.36),0.035,0.035,M.ti,12);        // header
    rod(g,V3(0.17,0.42,-0.36),V3(0.21,0.56,-0.68),0.07,0.075,M.ti,20);         // slip-on silencer
    ball(g,M.carbon,V3(0.21,0.565,-0.685),[0.07,0.07,0.025],[0.42,0,0]);
  }else{
    rod(g,V3(0.08,0.36,-0.08),V3(0.16,0.5,-0.36),0.04,0.04,M.ti,12);
    rod(g,V3(0.16,0.5,-0.36),V3(0.19,0.66,-0.66),0.052,0.06,M.ti,16);
    ball(g,M.black,V3(0.19,0.665,-0.665),[0.045,0.045,0.02],[0.45,0,0]);          // exhaust tip
  }
  /* race numbers */
  const nt=numberTex(r.num,rs?0xd8202a:r.color);
  [-1,1].forEach(sd=>{const p=new THREE.Mesh(new THREE.PlaneGeometry(0.17,0.11),new THREE.MeshStandardMaterial({map:nt,roughness:0.35,transparent:true}));
    p.position.set(sd*0.118,1.02,-0.5);p.rotation.y=Math.atan2(sd,-0.16);g.add(p);});
  const nose=new THREE.Mesh(new THREE.CircleGeometry(0.055,24),new THREE.MeshStandardMaterial({map:nt,roughness:0.35}));
  nose.position.set(0,rs?0.8:0.89,rs?0.7:0.683);nose.rotation.x=-0.75;g.add(nose);
  if(r.local){
    const spot=new THREE.SpotLight(lin(0xf4f7ff),2.4*Math.PI*6,60,0.38,0.6,1.2);spot.position.set(0,0.88,0.72);
    spot.target.position.set(0,0,10);g.add(spot);g.add(spot.target);
  }

  suitMats.add(M.suit);suitMats.add(M.suit2);applySuit(M.suit);applySuit(M.suit2);
  const rig=makeRider(g,M);
  scene.add(g);
  return {g,helmet:rig.helmet,rig,wheels:[fw,rw],tailLight:M.tail};
}
function numberTex(n,hex){return tex(128,128,(c,w,h)=>{c.clearRect(0,0,w,h);c.fillStyle='#f6f2ea';c.beginPath();c.ellipse(64,64,62,60,0,0,Math.PI*2);c.fill();
  c.fillStyle=hexStr(hex);c.font='italic 700 '+(String(n).length>2?54:72)+'px "Chakra Petch", sans-serif';c.textAlign='center';c.textBaseline='middle';c.lineWidth=6;c.strokeStyle='#141218';c.strokeText(String(n),64,70);c.fillText(String(n),64,70);});}
/* remove a bike from the scene and free what it owns (shared geometry/materials stay) */
const SHARED_MATS=new Set(Object.values(BIKE_SHARED));
function disposeBike(g){
  scene.remove(g);
  g.traverse(o=>{
    if(o.geometry&&o.geometry!==SPH)o.geometry.dispose();
    if(o.material&&!SHARED_MATS.has(o.material)){if(o.material.map)o.material.map.dispose();o.material.dispose();}
  });
}

function makeRider(g,M){
  const R={parts:{},j:{}};const P=R.parts;
  const mk=(n,r1,r2,mat,bulge=0.1)=>{const m=new THREE.Mesh(limbGeo(r1,r2,bulge),mat);m.castShadow=true;g.add(m);P[n]=m;};
  const bl=(n,sc,mat)=>{const m=new THREE.Mesh(SPH,mat);m.scale.set(sc[0],sc[1],sc[2]);m.castShadow=true;g.add(m);P[n]=m;};
  [-1,1].forEach(sd=>{const s=sd<0?'L':'R';
    mk('thigh'+s,0.085,0.062,M.suit,0.14);mk('shin'+s,0.06,0.046,M.suit,0.12);mk('boot'+s,0.054,0.046,M.black,0.05);
    mk('upper'+s,0.06,0.048,M.suit,0.12);mk('fore'+s,0.05,0.038,M.suit2,0.1);
    bl('knee'+s,[0.07,0.07,0.07],M.suit2);bl('elbow'+s,[0.054,0.054,0.054],M.suit2);bl('shoulder'+s,[0.08,0.078,0.08],M.suit2);
    bl('hand'+s,[0.044,0.038,0.066],M.glove);bl('heel'+s,[0.05,0.05,0.06],M.black);
    const ks=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.05,0.08),M.white);ks.castShadow=true;g.add(ks);P['slider'+s]=ks;
  });
  bl('pelvis',[0.15,0.12,0.14],M.suit);
  const torso=new THREE.Mesh(SPH,M.suit);torso.castShadow=true;g.add(torso);P.torso=torso;
  const chest=new THREE.Mesh(SPH,M.suit2);chest.castShadow=true;g.add(chest);P.chest=chest;
  bl('hump',[0.11,0.085,0.17],M.paint);
  mk('neck',0.05,0.05,M.black,0);
  const helmet=new THREE.Group();g.add(helmet);
  const shell=new THREE.Mesh(HELMET_GEO,M.helmet);shell.castShadow=true;helmet.add(shell);
  ball(helmet,M.helmet,V3(0,-0.085,0.085),[0.11,0.065,0.095]);                  // chin bar
  ball(helmet,M.black,V3(0,-0.125,0.0),[0.11,0.03,0.13]);                       // neck roll
  const vis=new THREE.Mesh(new THREE.SphereGeometry(1,28,12,Math.PI/2-0.85,1.7,1.12,0.52),M.visor);vis.scale.set(0.152,0.157,0.174);helmet.add(vis);
  box(helmet,M.carbon,V3(0,0.07,-0.15),[0.11,0.025,0.07],[-0.35,0,0]);
  R.helmet=helmet;
  ['P','N','H'].forEach(k=>R.j[k]=new THREE.Vector3());
  ['hip','knee','ankle','toe','sh','el','hand','wr'].forEach(k=>{R.j[k+'L']=new THREE.Vector3();R.j[k+'R']=new THREE.Vector3();});
  R.tmp=new THREE.Vector3();R.tmp2=new THREE.Vector3();
  poseRider(R,0,1,0);
  return R;
}
/* a: hang-off amount, inSide: which side, lean: bike roll; opt.tuck 0..1 (chin on the tank on
   straights), opt.up 0..1 (sits up and slides back under braking), opt.look: head yaw into the turn */
function poseRider(R,a,inSide,lean,opt){
  const J=R.j,P=R.parts,sh=inSide*0.16*a,tk=opt?opt.tuck*(1-a):0,up=opt?opt.up:0;
  J.P.set(sh,1.03-0.035*a+0.01*up,-0.3-0.05*up);
  J.N.set(sh*1.35,1.3-0.05*a-0.06*tk+0.13*up,0.15+0.03*tk-0.07*up);
  J.H.set(sh*1.6,1.355-0.075*a-0.075*tk+0.15*up,0.29+0.03*tk-0.07*up);
  [-1,1].forEach(sd=>{const s=sd<0?'L':'R',inside=sd===inSide;
    J['hip'+s].set(sh+sd*0.105,0.99-0.035*a,-0.28);
    if(inside)J['knee'+s].set(sd*(0.215+0.27*a),0.88-0.17*a,0.1-0.03*a);
    else J['knee'+s].set(sd*0.21+sh*0.35,0.88,0.1);
    J['ankle'+s].set(sd*0.205,0.585,-0.2);
    J['toe'+s].set(sd*(0.215+(inside?0.04*a:0)),0.53,-0.05);
    J['sh'+s].set(J.N.x+sd*0.18,J.N.y-0.035,J.N.z-0.03);
    J['hand'+s].set(sd*0.255,0.957,0.37);
    const el=J['el'+s].copy(J['sh'+s]).lerp(J['hand'+s],0.5);el.x+=sd*(0.06+(inside?0.03*a:0));el.y-=0.075;el.z-=0.03;
    J['wr'+s].copy(J['hand'+s]).sub(el).normalize().multiplyScalar(-0.05).add(J['hand'+s]);
    setRod(P['thigh'+s],J['hip'+s],J['knee'+s]);setRod(P['shin'+s],J['knee'+s],J['ankle'+s]);setRod(P['boot'+s],J['ankle'+s],J['toe'+s]);
    setRod(P['upper'+s],J['sh'+s],el);setRod(P['fore'+s],el,J['wr'+s]);
    P['knee'+s].position.copy(J['knee'+s]);P['elbow'+s].position.copy(el);P['shoulder'+s].position.copy(J['sh'+s]);
    P['hand'+s].position.copy(J['hand'+s]);P['heel'+s].position.copy(J['ankle'+s]);
    P['slider'+s].position.copy(J['knee'+s]).add(R.tmp.set(sd*0.066,-0.03,0.02));
  });
  P.pelvis.position.copy(J.P);
  const base=R.tmp.copy(J.P).add(R.tmp2.set(0,0.05,0.02));
  _d.subVectors(J.N,base);const len=_d.length(),dir=_d.normalize();
  P.torso.position.copy(base).addScaledVector(dir,len*0.5);P.torso.quaternion.setFromUnitVectors(UP,dir);P.torso.scale.set(0.185,len*0.58,0.135);
  P.chest.position.copy(P.torso.position).addScaledVector(dir,len*0.12).add(R.tmp2.set(0,-dir.z*0.025,dir.y*0.025));
  P.chest.quaternion.copy(P.torso.quaternion);P.chest.scale.set(0.17,len*0.32,0.12);
  P.hump.position.copy(J.N).addScaledVector(dir,-0.1).add(R.tmp2.set(0,dir.z*0.1,-dir.y*0.1));P.hump.quaternion.copy(P.torso.quaternion);
  setRod(P.neck,J.N,R.tmp2.copy(J.H).add(R.tmp.set(0,-0.08,-0.06)));
  R.helmet.position.copy(J.H);R.helmet.rotation.set(-0.08-0.1*tk+0.12*up,inSide*0.12*a+(opt?opt.look:0),-lean*0.55);
}

export {makeBike,disposeBike,poseRider,WHEEL_F,WHEEL_R};
