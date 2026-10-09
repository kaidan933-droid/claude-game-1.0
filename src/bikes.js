import * as THREE from 'three';
import {clamp,lin,hexStr,scene,tex,std} from './core.js';
import {curve,LEN,V,K,G,W,EDGE,lerpArr,barrierAt} from './track.js';
import {controls} from './controls.js';

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

const BIKE_SHARED={
  tire:new THREE.MeshStandardMaterial({color:lin(0x18181a),roughness:0.72,side:THREE.DoubleSide}),
  disc:std(0xb9bdc2,0.32,1),carbon:new THREE.MeshPhysicalMaterial({color:lin(0x1e1f23),roughness:0.35,metalness:0.4,clearcoat:1,clearcoatRoughness:0.1}),
  alu:std(0xc3c6cb,0.3,1),black:std(0x141417,0.45,0.3),gold:std(0xc79a3a,0.28,1),ti:std(0x8e8780,0.3,1),
  spring:std(0xe5b81c,0.4,0.6),rubber:std(0x111113,0.85),
  glass:new THREE.MeshPhysicalMaterial({color:lin(0x3b4652),roughness:0.03,metalness:0,transparent:true,opacity:0.42,clearcoat:1,side:THREE.DoubleSide,depthWrite:false}),
  visor:new THREE.MeshPhysicalMaterial({color:lin(0x2b1f45),roughness:0.04,metalness:1,clearcoat:1,side:THREE.DoubleSide}),
  head:new THREE.MeshStandardMaterial({color:0xffffff,emissive:lin(0xfff3dc),emissiveIntensity:2.2}),
  white:std(0xeeebe4,0.5),
  glove:new THREE.MeshStandardMaterial({color:lin(0x202024),roughness:0.6})
};
function makeWheel(hw,r,front,M){
  const w=new THREE.Group();
  const prof=[];for(let k=0;k<=20;k++){const t=k/20*Math.PI;prof.push(new THREE.Vector2(0.214+(r-0.214)*Math.pow(Math.sin(t),0.5),-hw*Math.cos(t)*(1+0.12*Math.sin(t))));}
  const tg=new THREE.LatheGeometry(prof,56);tg.rotateZ(Math.PI/2);
  const tire=new THREE.Mesh(tg,M.tire);tire.castShadow=true;w.add(tire);
  const rimG=new THREE.CylinderGeometry(0.215,0.215,hw*1.7,48,1,true);rimG.rotateZ(Math.PI/2);
  const rim=new THREE.Mesh(rimG,M.rim);w.add(rim);
  [-1,1].forEach(sd=>{const lip=new THREE.Mesh(new THREE.TorusGeometry(0.213,0.008,6,48),M.rim);lip.rotation.y=Math.PI/2;lip.position.x=sd*hw*0.85;w.add(lip);});
  for(let k=0;k<10;k++){const a=Math.floor(k/2)/5*Math.PI*2+(k%2?0.12:-0.12),sp=new THREE.Mesh(new THREE.BoxGeometry(0.014,0.165,0.024),M.rim);
    sp.position.set(0,Math.cos(a)*0.128,Math.sin(a)*0.128);sp.rotation.x=a;w.add(sp);}
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(0.048,0.048,hw*1.6,20),M.rim);hub.rotation.z=Math.PI/2;w.add(hub);
  const discG=new THREE.CylinderGeometry(front?0.16:0.11,front?0.16:0.11,0.006,48);discG.rotateZ(Math.PI/2);
  const carrierG=new THREE.CylinderGeometry(front?0.105:0.07,front?0.105:0.07,0.012,24);carrierG.rotateZ(Math.PI/2);
  (front?[-1,1]:[1]).forEach(sd=>{const d=new THREE.Mesh(discG,M.disc);d.position.x=sd*(hw+0.016);w.add(d);
    const c=new THREE.Mesh(carrierG,M.gold);c.position.x=sd*(hw+0.016);w.add(c);});
  if(!front){const spr=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,0.012,30),M.black);spr.rotation.z=Math.PI/2;spr.position.x=-(hw+0.018);w.add(spr);}
  return w;
}

function makeBike(r){
  const M=Object.assign({},BIKE_SHARED);
  const PAINT=lin(r.color),ACC=lin(r.accent),PIN=lin(0xf3efe7),BELLY=lin(0x1c1c20);
  M.body=new THREE.MeshPhysicalMaterial({color:0xffffff,vertexColors:true,metalness:0.15,roughness:0.28,clearcoat:1,clearcoatRoughness:0.04,side:THREE.DoubleSide});
  M.paint=new THREE.MeshPhysicalMaterial({color:PAINT,metalness:0.15,roughness:0.28,clearcoat:1,clearcoatRoughness:0.04});
  M.acc=new THREE.MeshPhysicalMaterial({color:ACC,metalness:0.15,roughness:0.3,clearcoat:1,clearcoatRoughness:0.05});
  M.rim=r.rim==='gold'?M.gold:std(r.rimColor||0x16161a,0.35,0.6);
  M.suit=new THREE.MeshPhysicalMaterial({color:lin(r.suit),roughness:0.5,clearcoat:0.35,clearcoatRoughness:0.4});
  M.suit2=new THREE.MeshPhysicalMaterial({color:ACC,roughness:0.5,clearcoat:0.35,clearcoatRoughness:0.4});
  M.tail=new THREE.MeshStandardMaterial({color:0x200000,emissive:lin(0xff2414),emissiveIntensity:0.6});
  const g=new THREE.Group();g.rotation.order='YXZ';

  /* wheels */
  const fw=makeWheel(0.062,0.305,true,M);fw.position.set(0,0.305,0.71);g.add(fw);
  const rw=makeWheel(0.1,0.312,false,M);rw.position.set(0,0.312,-0.71);g.add(rw);

  /* livery painted per vertex */
  const livery=(x,y,z)=>{const line=0.5+(z-0.05)*0.42;if(y<line-0.012)return y<0.36?BELLY:ACC;if(y<line+0.018)return PIN;return PAINT;};
  const tailLiv=(x,y,z)=>{const line=0.985+(z+0.3)*-0.14;if(y<line-0.01)return ACC;if(y<line+0.012)return PIN;return PAINT;};
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
  const screen=new THREE.Mesh(loft([[0.625,0.955,0.93,0.08,0.09],[0.52,1.06,0.975,0.135,0.145],[0.42,1.118,1.0,0.13,0.14],[0.345,1.122,1.04,0.085,0.1]],30,30,0.75),M.glass);
  screen.renderOrder=2;g.add(screen);
  ball(g,M.black,V3(0,1.03,0.40),[0.07,0.03,0.05]);                         // dash
  ball(g,M.black,V3(0,0.79,0.705),[0.045,0.03,0.02]);                        // ram-air intake
  [-1,1].forEach(sd=>{
    box(g,M.head,V3(sd*0.088,0.86,0.672),[0.06,0.014,0.02],[0,sd*0.5,sd*0.15]);  // headlight slits
    box(g,M.carbon,V3(sd*0.215,0.86,0.48),[0.11,0.01,0.085],[0,0,sd*-0.18]);      // winglets
    box(g,M.carbon,V3(sd*0.255,0.88,0.48),[0.012,0.05,0.085],[0,0,0]);
  });
  box(g,M.tail,V3(0,1.09,-0.862),[0.07,0.025,0.012]);

  /* front end: forks, clamps, bars, fender, calipers */
  const fa=V3(0,0.305,0.71);
  [-1,1].forEach(sd=>{
    const top=V3(sd*0.1,1.0,0.405),mid=V3(sd*0.105,0.66,0.555),bot=V3(sd*0.112,0.305,0.71);
    rod(g,top,mid,0.026,0.026,M.gold,16);
    rod(g,mid,bot,0.032,0.03,M.black,16);
    box(g,M.alu,V3(sd*0.097,0.42,0.62),[0.026,0.09,0.06],[0.4,0,0]);            // caliper
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
    const arm=box(g,M.alu,V3(sd*0.13,0.42,-0.44),[0.035,0.085,0.6]);arm.rotation.x=-0.35;
    rod(g,V3(sd*0.19,0.53,-0.25),V3(sd*0.235,0.53,-0.25),0.012,0.012,M.alu,8);   // pegs
    box(g,M.alu,V3(sd*0.17,0.62,-0.27),[0.012,0.18,0.05],[0.4,0,0]);             // hanger
  });
  rod(g,V3(0,0.48,-0.28),V3(0,0.86,-0.18),0.026,0.026,M.spring,10);
  rod(g,V3(0,0.46,-0.28),V3(0,0.9,-0.17),0.012,0.012,M.alu,8);
  box(g,M.black,V3(0,0.5,0.0),[0.3,0.26,0.36]);                                // engine
  rod(g,V3(0.08,0.36,-0.08),V3(0.16,0.5,-0.36),0.04,0.04,M.ti,12);
  rod(g,V3(0.16,0.5,-0.36),V3(0.19,0.66,-0.66),0.052,0.06,M.ti,16);
  ball(g,M.black,V3(0.19,0.665,-0.665),[0.045,0.045,0.02],[0.45,0,0]);          // exhaust tip
  /* numbers on the tail */
  const nt=numberTex(r.num,r.color);
  [-1,1].forEach(sd=>{const p=new THREE.Mesh(new THREE.PlaneGeometry(0.17,0.11),new THREE.MeshStandardMaterial({map:nt,roughness:0.35,transparent:true}));
    p.position.set(sd*0.118,1.02,-0.5);p.rotation.y=Math.atan2(sd,-0.16);g.add(p);});
  const nose=new THREE.Mesh(new THREE.CircleGeometry(0.055,24),new THREE.MeshStandardMaterial({map:nt,roughness:0.35}));
  nose.position.set(0,0.89,0.683);nose.rotation.x=-0.75;g.add(nose);

  /* rider */
  const rig=makeRider(g,M);
  scene.add(g);
  return {g,helmet:rig.helmet,rig,wheels:[fw,rw],tailLight:M.tail};
}
function numberTex(n,hex){return tex(128,128,(c,w,h)=>{c.clearRect(0,0,w,h);c.fillStyle='#f6f2ea';c.beginPath();c.ellipse(64,64,62,60,0,0,Math.PI*2);c.fill();
  c.fillStyle=hexStr(hex);c.font='italic 700 72px "Chakra Petch", sans-serif';c.textAlign='center';c.textBaseline='middle';c.lineWidth=6;c.strokeStyle='#141218';c.strokeText(String(n),64,70);c.fillText(String(n),64,70);});}

function makeRider(g,M){
  const R={parts:{},j:{}};const P=R.parts;
  const mk=(n,r1,r2,mat)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(r2,r1,1,16),mat);m.castShadow=true;g.add(m);P[n]=m;};
  const bl=(n,sc,mat)=>{const m=new THREE.Mesh(SPH,mat);m.scale.set(sc[0],sc[1],sc[2]);m.castShadow=true;g.add(m);P[n]=m;};
  [-1,1].forEach(sd=>{const s=sd<0?'L':'R';
    mk('thigh'+s,0.088,0.066,M.suit);mk('shin'+s,0.062,0.048,M.suit);mk('boot'+s,0.052,0.042,M.black);
    mk('upper'+s,0.062,0.05,M.suit);mk('fore'+s,0.05,0.04,M.suit2);
    bl('knee'+s,[0.07,0.07,0.07],M.suit2);bl('elbow'+s,[0.054,0.054,0.054],M.suit2);bl('shoulder'+s,[0.08,0.078,0.08],M.suit2);
    bl('hand'+s,[0.044,0.038,0.066],M.glove);bl('heel'+s,[0.05,0.05,0.06],M.black);
    const ks=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.05,0.08),M.white);ks.castShadow=true;g.add(ks);P['slider'+s]=ks;
  });
  bl('pelvis',[0.15,0.12,0.14],M.suit);
  const torso=new THREE.Mesh(SPH,M.suit);torso.castShadow=true;g.add(torso);P.torso=torso;
  const chest=new THREE.Mesh(SPH,M.suit2);chest.castShadow=true;g.add(chest);P.chest=chest;
  bl('hump',[0.11,0.085,0.17],M.paint);
  mk('neck',0.05,0.05,M.black);
  const helmet=new THREE.Group();g.add(helmet);
  ball(helmet,M.paint,V3(0,0,0),[0.145,0.15,0.168]);
  ball(helmet,M.white,V3(0,0.01,-0.005),[0.147,0.12,0.16]);
  ball(helmet,M.paint,V3(0,-0.075,0.075),[0.105,0.07,0.1]);
  const vis=new THREE.Mesh(new THREE.SphereGeometry(1,28,12,Math.PI/2-0.85,1.7,1.12,0.52),M.visor);vis.scale.set(0.152,0.157,0.174);helmet.add(vis);
  box(helmet,M.carbon,V3(0,0.07,-0.15),[0.11,0.025,0.07],[-0.35,0,0]);
  R.helmet=helmet;
  ['P','N','H'].forEach(k=>R.j[k]=new THREE.Vector3());
  ['hip','knee','ankle','toe','sh','el','hand','wr'].forEach(k=>{R.j[k+'L']=new THREE.Vector3();R.j[k+'R']=new THREE.Vector3();});
  R.tmp=new THREE.Vector3();R.tmp2=new THREE.Vector3();
  poseRider(R,0,1,0);
  return R;
}
function poseRider(R,a,inSide,lean){
  const J=R.j,P=R.parts,sh=inSide*0.16*a;
  J.P.set(sh,1.03-0.035*a,-0.3);
  J.N.set(sh*1.35,1.3-0.05*a,0.15);
  J.H.set(sh*1.6,1.355-0.075*a,0.29);
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
  R.helmet.position.copy(J.H);R.helmet.rotation.set(-0.08,inSide*0.12*a,-lean*0.55);
}

const riders=[
  {name:'You',     color:0xff8a1f,accent:0x1d1b22,suit:0x23202a,num:7, rim:'gold',            s:0,  lane:0,    skill:1.012,human:true},
  {name:'R. Ferro',color:0xd7263d,accent:0xf3efe7,suit:0xf1ece4,num:21,rimColor:0x16161a,     s:18, lane:-2.2, skill:0.998},
  {name:'K. Osei', color:0x17a3a5,accent:0xffd23a,suit:0x1c2b33,num:44,rim:'gold',            s:34, lane:2.2,  skill:0.995},
  {name:'M. Lund', color:0x3157d6,accent:0xf3efe7,suit:0xf1ece4,num:9, rimColor:0x16161a,     s:51, lane:-3.6, skill:0.992},
  {name:'T. Varga',color:0xc6e24a,accent:0x1d1b22,suit:0x1f2a14,num:63,rimColor:0x16161a,     s:67, lane:3.6,  skill:0.989}
];
riders.forEach(r=>{Object.assign(r,makeBike(r));r.v=r.human?0:lerpArr(V,r.s)*0.9;r.off=r.lane;r.lean=0;r.pitch=0;r.psi=0;r.steer=0;r.thr=0;r.brk=0;r.sliding=false;r.crash=null;r.gripUse=0;});
const player=riders[0];

/* player bike: speed, lean and line come from the rider's inputs */
const VTOP=88,ACCEL=13,BRAKE_DEC=24,WB_MAX=1.25;
const A_CMD=13.5,A_LAT=15;                 // lateral accel a full steer asks for / the tyres can give (m/s2)
const MU_ROUGH=0.45,SLIDE_MU=0.8;          // gravel and turf grip, grip left once sliding
const CRASH_TIME=2.2,CRASH_SPEED=4;
function integrate(r,dt,sdot){
  r.off+=r.v*Math.sin(r.psi)*dt;
  r.s+=sdot*dt;
}
function placePlayer(r,dt,leanT,leanK,amtLean){
  const u=((r.s%LEN)+LEN)%LEN/LEN,p=curve.getPointAt(u),t=curve.getTangentAt(u),l=Math.hypot(t.x,t.z);
  r.g.position.set(p.x+(t.z/l)*r.off,p.y+0.05,p.z-(t.x/l)*r.off);
  r.g.rotation.y=Math.atan2(t.x,t.z)+r.psi;
  r.pitch+=(-Math.asin(clamp(t.y,-1,1))-r.pitch)*(1-Math.exp(-dt*8));
  r.g.rotation.x=r.pitch+0.015*r.brk-0.005*r.thr;
  r.lean+=(leanT-r.lean)*(1-Math.exp(-dt*leanK));
  r.g.rotation.z=r.lean;
  const amt=clamp((Math.abs(r.lean)-0.2)/0.5,0,1),inSide=r.lean>0?-1:1;
  poseRider(r.rig,amt,inSide,Math.max(-1,Math.min(1,r.lean)));
  r.wheels[0].rotation.x+=r.v*dt/0.305;r.wheels[1].rotation.x+=r.v*dt/0.312;
}
function stepCrash(r,dt){
  const k=r.crash;k.t+=dt;
  r.thr=r.brk=r.steer=0;r.gripUse=0;
  r.v*=Math.exp(-dt*2.2);
  const kap=lerpArr(K,r.s);
  integrate(r,dt,r.v*Math.cos(r.psi)/Math.max(0.3,1-kap*r.off));
  const bd=barrierAt(r.s,Math.sign(r.off)||1);
  if(Math.abs(r.off)>bd){r.off=Math.sign(r.off)*bd;r.v*=Math.exp(-dt*8);}
  r.tailLight.emissiveIntensity=0.6;
  placePlayer(r,dt,k.dir*1.45,9);
  if(k.t>=CRASH_TIME){                       // respawn on the racing line, stopped
    r.crash=null;r.off=0;r.psi=0;r.v=0;r.steer=0;r.lean=0;r.sliding=false;
  }
}
function stepPlayer(r,dt){
  if(r.crash)return stepCrash(r,dt);
  const c=controls;
  if(c.takeReset()){r.off=0;r.psi=0;r.v=0;r.steer=0;r.sliding=false;}
  const ease=(a,b,k)=>a+(b-a)*(1-Math.exp(-dt*k));
  r.thr=ease(r.thr,c.throttle,9);r.brk=ease(r.brk,c.brake,14);
  const steerIn=c.left-c.right;                    // +1 = left
  r.steer=ease(r.steer,steerIn,steerIn?6:10);
  const rough=Math.abs(r.off)>EDGE;                // past the curb: gravel and turf
  const aThr=ACCEL*r.thr*Math.max(0,1-r.v/VTOP),aBrk=BRAKE_DEC*r.brk;
  let a=aThr-aBrk-(0.6+0.00035*r.v*r.v);
  if(rough)a-=12;
  /* tyre grip: what the steering asks for against what is left after braking or accelerating */
  const frac=Math.min(1,Math.max(aThr,aBrk)/BRAKE_DEC)*0.8;
  const gripBase=A_LAT*(rough?MU_ROUGH:1)*Math.sqrt(1-frac*frac);
  const wbCmd=r.steer*Math.min(WB_MAX,A_CMD/Math.max(r.v,1))*clamp(r.v/3,0,1);   // wanted yaw rate, left positive
  const aReq=Math.abs(r.v*wbCmd);
  if(!r.sliding&&aReq>gripBase)r.sliding=true;
  else if(r.sliding&&aReq<gripBase*0.7)r.sliding=false;
  const grip=r.sliding?gripBase*SLIDE_MU:gripBase;
  r.gripUse=grip>0.01?aReq/grip:(aReq>0.01?2:0);
  let wb=wbCmd;
  if(aReq>grip){                                    // front tyre pushes: turns less than asked, scrubs speed
    wb=Math.sign(wbCmd)*grip/Math.max(r.v,1);
    a-=3+6*Math.min(1,(aReq-grip)/A_LAT);
  }else if(r.sliding)a-=3;
  r.v=Math.max(0,r.v+a*dt);
  const kap=lerpArr(K,r.s);
  const sdot=r.v*Math.cos(r.psi)/Math.max(0.3,1-kap*r.off);
  r.psi+=(wb-kap*sdot)*dt;
  if(r.psi>Math.PI)r.psi-=2*Math.PI;else if(r.psi<-Math.PI)r.psi+=2*Math.PI;
  integrate(r,dt,sdot);
  /* solid barriers: wall or tyre stack */
  const bd=barrierAt(r.s,Math.sign(r.off)||1);
  if(Math.abs(r.off)>=bd){
    r.off=Math.sign(r.off)*bd;
    if(r.v>=CRASH_SPEED){r.crash={t:0,dir:Math.sign(r.lean)||(r.off>0?-1:1)};r.sliding=false;}
    else{r.v*=Math.exp(-dt*6);r.psi*=Math.exp(-dt*6);}
  }
  r.tailLight.emissiveIntensity=r.brk>0.3?5:0.6;
  placePlayer(r,dt,clamp(-Math.atan(r.v*wb/G),-0.97,0.97),7);
}

function stepRider(r,dt){
  if(r.human)return stepPlayer(r,dt);
  const target=lerpArr(V,r.s)*r.skill;
  const braking=target<r.v-0.6;
  r.v+=(target-r.v)*(1-Math.exp(-dt*(braking?3.2:2.2)));
  r.s+=r.v*dt;
  const u=((r.s%LEN)+LEN)%LEN/LEN,p=curve.getPointAt(u),t=curve.getTangentAt(u),l=Math.hypot(t.x,t.z);
  const k=lerpArr(K,r.s),kA=lerpArr(K,r.s+16);
  const line=Math.sign(kA)*Math.min(1,Math.abs(kA)*36)*(W-1.6);
  const offT=clamp(r.lane*0.55+line,-W+1.1,W-1.1);
  r.off+=(offT-r.off)*(1-Math.exp(-dt*1.6));
  r.g.position.set(p.x+(t.z/l)*r.off,p.y+0.05,p.z-(t.x/l)*r.off);
  r.g.rotation.y=Math.atan2(t.x,t.z);
  r.pitch+=(-Math.asin(clamp(t.y,-1,1))-r.pitch)*(1-Math.exp(-dt*8));
  r.g.rotation.x=r.pitch+(braking?0.015:-0.005);
  const leanT=-Math.sign(k)*Math.min(0.97,Math.atan(r.v*r.v*Math.abs(k)/G));
  r.lean+=(leanT-r.lean)*(1-Math.exp(-dt*4.5));
  r.g.rotation.z=r.lean;
  const amt=clamp((Math.abs(r.lean)-0.2)/0.5,0,1),inSide=r.lean>0?-1:1;
  poseRider(r.rig,amt,inSide,r.lean);
  r.wheels[0].rotation.x+=r.v*dt/0.305;r.wheels[1].rotation.x+=r.v*dt/0.312;
  r.tailLight.emissiveIntensity=braking?5:0.6;
}
export {riders,player,stepRider};
