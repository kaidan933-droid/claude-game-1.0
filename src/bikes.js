import * as THREE from 'three';
import {clamp,sstep,lin,hexStr,scene,tex,std} from './core.js';
import {curve,LEN,N,ds,mod,corners,V,K,W,EDGE,lerpArr,barrierAt,surfaceAt} from './track.js';
import {controls} from './controls.js';
import {G,engineAccel,dragAccel,ENGINE_BRAKE,rpmTarget,BRAKE_RISE,BRAKE_FALL,brakeDecel,MU,SLIDE_RATIO,PHI_SCRAPE,PHI_MAX,R_MIN} from './physics.js';

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
/* small scooter wheel: balloon tyre on a solid split rim */
const WHEEL_R=0.25;
function makeWheel(r,hw,M,disc){
  const w=new THREE.Group(),ri=r*0.6;
  if(disc){                                                                 // petal disc + carrier on the fork side
    const dG=new THREE.CylinderGeometry(0.11,0.11,0.005,40);dG.rotateZ(Math.PI/2);
    const d=new THREE.Mesh(dG,M.disc);d.position.x=-(hw+0.02);w.add(d);
    const cG=new THREE.CylinderGeometry(0.06,0.06,0.012,20);cG.rotateZ(Math.PI/2);
    const cr=new THREE.Mesh(cG,M.black);cr.position.x=-(hw+0.021);w.add(cr);
    for(let k=0;k<6;k++){const t=k/6*Math.PI*2;ball(w,M.black,V3(-(hw+0.024),Math.cos(t)*0.085,Math.sin(t)*0.085),[0.004,0.012,0.012]);}
  }
  const prof=[];for(let k=0;k<=20;k++){const t=k/20*Math.PI;prof.push(new THREE.Vector2(ri+(r-ri)*Math.pow(Math.sin(t),0.6),-hw*Math.cos(t)*(1+0.1*Math.sin(t))));}
  const tg=new THREE.LatheGeometry(prof,48);tg.rotateZ(Math.PI/2);
  const tire=new THREE.Mesh(tg,M.tire);tire.castShadow=true;w.add(tire);
  const rimG=new THREE.CylinderGeometry(ri,ri,hw*1.7,36);rimG.rotateZ(Math.PI/2);
  w.add(new THREE.Mesh(rimG,M.rim));
  [-1,1].forEach(sd=>{
    const lip=new THREE.Mesh(new THREE.TorusGeometry(ri,0.007,6,40),M.chrome);lip.rotation.y=Math.PI/2;lip.position.x=sd*hw*0.86;w.add(lip);
    ball(w,M.chrome,V3(sd*hw*0.9,0,0),[0.025,0.055,0.055]);                 // hub cap
    for(let k=0;k<5;k++){const t=k/5*Math.PI*2;ball(w,M.black,V3(sd*hw*0.87,Math.cos(t)*0.085,Math.sin(t)*0.085),[0.008,0.011,0.011]);}  // rim bolts
  });
  return w;
}

/* vespa-style scooter: step-through floor, leg shield, bulbous rear cowl over the engine */
function makeBike(r){
  const M=Object.assign({},BIKE_SHARED);
  const PAINT=lin(r.color),ACC=lin(r.accent),PIN=lin(0xf3efe7);
  M.body=new THREE.MeshPhysicalMaterial({color:0xffffff,vertexColors:true,metalness:0.1,roughness:0.25,clearcoat:1,clearcoatRoughness:0.04,side:THREE.DoubleSide});
  M.paint=new THREE.MeshPhysicalMaterial({color:PAINT,metalness:0.1,roughness:0.25,clearcoat:1,clearcoatRoughness:0.04,side:THREE.DoubleSide});
  M.acc=new THREE.MeshPhysicalMaterial({color:ACC,metalness:0.1,roughness:0.3,clearcoat:1,clearcoatRoughness:0.05});
  M.rim=std(0xc9ccd1,0.3,0.9);M.chrome=std(0xe9ebef,0.12,1);
  M.seat=new THREE.MeshStandardMaterial({color:lin(0x3a2a22),roughness:0.55});
  M.suit=new THREE.MeshPhysicalMaterial({color:lin(r.suit),roughness:0.5,clearcoat:0.35,clearcoatRoughness:0.4});
  M.suit2=new THREE.MeshPhysicalMaterial({color:ACC,roughness:0.5,clearcoat:0.35,clearcoatRoughness:0.4});
  M.tail=new THREE.MeshStandardMaterial({color:0x200000,emissive:lin(0xff2414),emissiveIntensity:0.6});
  M.amber=new THREE.MeshStandardMaterial({color:lin(0xffa21f),roughness:0.2,emissive:lin(0xff8a00),emissiveIntensity:0.15});
  M.plate=new THREE.MeshStandardMaterial({color:lin(0xf2efe6),roughness:0.4});
  const g=new THREE.Group();g.rotation.order='YXZ';

  const fw=makeWheel(WHEEL_R,0.06,M,true);fw.position.set(0,WHEEL_R,0.6);g.add(fw);
  const rw=makeWheel(WHEEL_R,0.065,M);rw.position.set(0,WHEEL_R,-0.6);g.add(rw);

  /* rear cowl, painted per vertex with a pinstripe and darker skirt */
  const livery=(x,y,z)=>y<0.4?ACC:(y>0.55&&y<0.575)?PIN:PAINT;
  const cowl=new THREE.Mesh(loft([
    [-0.02,0.60,0.34,0.09,0.11],[-0.14,0.74,0.31,0.17,0.2],[-0.32,0.80,0.33,0.22,0.25],[-0.52,0.80,0.38,0.22,0.24],
    [-0.70,0.76,0.44,0.17,0.17],[-0.82,0.70,0.52,0.09,0.08],[-0.88,0.65,0.58,0.02,0.02]],60,40,0.9,livery),M.body);
  cowl.castShadow=true;g.add(cowl);
  const seat=new THREE.Mesh(loft([[-0.06,0.86,0.79,0.1,0.11],[-0.25,0.875,0.79,0.135,0.14],[-0.5,0.89,0.79,0.13,0.13],[-0.68,0.88,0.78,0.08,0.08]],24,24,0.7),M.seat);
  seat.castShadow=true;g.add(seat);

  /* floorboard with rubber runners, engine block and swingarm under the cowl */
  box(g,M.paint,V3(0,0.22,0.19),[0.36,0.05,0.52]);
  for(let k=-2;k<=2;k++)box(g,M.rubber,V3(k*0.06,0.248,0.2),[0.025,0.008,0.42]);
  box(g,M.black,V3(0.06,0.3,-0.42),[0.14,0.14,0.38]);
  ball(g,M.black,V3(0.2,0.3,-0.52),[0.05,0.06,0.16]);                         // muffler
  [-1,1].forEach(sd=>{
    rod(g,V3(sd*0.12,0.44,-0.5),V3(sd*0.12,WHEEL_R+0.03,-0.6),0.024,0.024,M.spring,10);   // rear shocks
    rod(g,V3(sd*0.12,0.46,-0.5),V3(sd*0.12,WHEEL_R+0.02,-0.605),0.009,0.009,M.chrome,6);
    box(g,M.alu,V3(sd*0.176,0.251,0.19),[0.014,0.02,0.52]);                            // floor rails
    ball(g,M.amber,V3(sd*0.22,0.9,0.43),[0.035,0.022,0.02]);                           // front indicators
    ball(g,M.amber,V3(sd*0.075,0.69,-0.865),[0.025,0.018,0.016]);                      // rear indicators
  });
  box(g,M.plate,V3(0,0.55,-0.835),[0.16,0.1,0.006],[0.25,0,0]);                       // number plate
  rod(g,V3(0.2,0.31,-0.66),V3(0.21,0.34,-0.74),0.015,0.015,M.chrome,8);

  /* leg shield, curved toward the rider, with the horn grille "tie" */
  const shield=new THREE.Mesh(new THREE.CylinderGeometry(0.34,0.40,0.72,28,1,true,-0.75,1.5),M.paint);
  shield.position.set(0,0.60,0.10);shield.castShadow=true;g.add(shield);
  box(g,M.chrome,V3(0,0.8,0.452),[0.05,0.2,0.012],[-0.08,0,0]);
  box(g,M.black,V3(0,0.8,0.458),[0.03,0.16,0.006],[-0.08,0,0]);

  /* front end: steering column, single-sided link, fender */
  rod(g,V3(0,0.97,0.41),V3(0,0.52,0.5),0.032,0.032,M.paint,12);
  rod(g,V3(-0.1,0.55,0.5),V3(-0.1,WHEEL_R+0.02,0.58),0.026,0.022,M.black,10);      // single-sided fork leg
  rod(g,V3(-0.1,WHEEL_R+0.02,0.58),V3(-0.1,WHEEL_R,0.66),0.022,0.02,M.black,8);    // trailing link
  rod(g,V3(-0.1,0.55,0.5),V3(0,0.55,0.5),0.02,0.02,M.black,8);
  rod(g,V3(-0.125,0.5,0.53),V3(-0.125,WHEEL_R+0.03,0.64),0.024,0.024,M.spring,10); // front shock spring
  rod(g,V3(-0.125,0.52,0.53),V3(-0.125,WHEEL_R+0.02,0.645),0.01,0.01,M.chrome,6);
  box(g,M.gold,V3(-0.088,WHEEL_R+0.09,0.53),[0.025,0.07,0.05],[0.5,0,0]);           // brake caliper
  ball(g,M.paint,V3(0,0.45,0.6),[0.09,0.12,0.25]);                            // fender
  ball(g,M.chrome,V3(0,0.565,0.6),[0.012,0.012,0.08]);                        // fender crest

  /* headset: bars, round headlight, speedo, mirrors */
  ball(g,M.paint,V3(0,0.99,0.42),[0.11,0.07,0.1]);
  rod(g,V3(-0.27,0.99,0.4),V3(0.27,0.99,0.4),0.022,0.022,M.paint,10);
  [-1,1].forEach(sd=>{
    rod(g,V3(sd*0.25,0.99,0.4),V3(sd*0.35,0.99,0.4),0.021,0.021,M.rubber,12);     // grips
    rod(g,V3(sd*0.2,1.0,0.42),V3(sd*0.31,1.0,0.47),0.005,0.004,M.chrome,6);       // levers
    rod(g,V3(sd*0.22,1.01,0.4),V3(sd*0.3,1.2,0.38),0.006,0.006,M.chrome,6);       // mirror stalks
    ball(g,M.chrome,V3(sd*0.31,1.22,0.38),[0.05,0.035,0.012]);
  });
  const hlG=new THREE.CylinderGeometry(0.065,0.06,0.05,28);hlG.rotateX(Math.PI/2);
  const hl=new THREE.Mesh(hlG,M.chrome);hl.position.set(0,1.0,0.5);g.add(hl);
  const lens=new THREE.Mesh(new THREE.CircleGeometry(0.055,28),M.head);lens.position.set(0,1.0,0.526);g.add(lens);
  const speedo=new THREE.Mesh(new THREE.CircleGeometry(0.04,24),M.white);speedo.position.set(0,1.065,0.4);speedo.rotation.x=-1.1;g.add(speedo);

  /* rear rack and tail light */
  [-1,1].forEach(sd=>rod(g,V3(sd*0.09,0.86,-0.66),V3(sd*0.09,0.85,-0.84),0.008,0.008,M.chrome,6));
  rod(g,V3(-0.09,0.85,-0.84),V3(0.09,0.85,-0.84),0.008,0.008,M.chrome,6);
  box(g,M.tail,V3(0,0.66,-0.885),[0.1,0.045,0.02]);

  /* race numbers on the side panels and leg shield */
  const nt=numberTex(r.num,r.color);
  [-1,1].forEach(sd=>{const p=new THREE.Mesh(new THREE.PlaneGeometry(0.17,0.12),new THREE.MeshStandardMaterial({map:nt,roughness:0.35,transparent:true}));
    p.position.set(sd*0.247,0.6,-0.42);p.rotation.y=sd*Math.PI/2;g.add(p);});
  const nose=new THREE.Mesh(new THREE.CircleGeometry(0.07,24),new THREE.MeshStandardMaterial({map:nt,roughness:0.35}));
  nose.position.set(0,0.62,0.478);nose.rotation.x=-0.08;g.add(nose);

  if(r.human){
    const spot=new THREE.SpotLight(lin(0xfff1d6),2.2,45,0.42,0.6,1.2);spot.position.set(0,1.0,0.55);
    spot.target.position.set(0,0,9);g.add(spot);g.add(spot.target);
  }
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
  bl('hump',[0.11,0.085,0.17],M.paint);P.hump.visible=false;   // no aero hump on a scooter rider
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
  J.P.set(sh,0.96,-0.25);
  J.N.set(sh*1.25,1.45-0.03*a,-0.05);
  J.H.set(sh*1.35,1.6-0.03*a,0.02);
  [-1,1].forEach(sd=>{const s=sd<0?'L':'R',inside=sd===inSide;
    J['hip'+s].set(sh+sd*0.105,0.93,-0.23);
    if(inside)J['knee'+s].set(sd*(0.19+0.12*a),0.86-0.04*a,0.14);
    else J['knee'+s].set(sd*0.18+sh*0.3,0.86,0.14);
    J['ankle'+s].set(sd*0.14,0.35,0.2);
    J['toe'+s].set(sd*0.14,0.27,0.33);
    J['sh'+s].set(J.N.x+sd*0.18,J.N.y-0.035,J.N.z-0.03);
    J['hand'+s].set(sd*0.3,0.99,0.4);
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
  {name:'You',     color:0xff8a1f,accent:0x1d1b22,suit:0x23202a,num:7, rim:'gold',            s:-42,lane:-2,   skill:0.95,level:'You',aggr:0.5,react:12,err:0,lineQ:0.9,human:true},
  {name:'R. Ferro',color:0xd7263d,accent:0xf3efe7,suit:0xf1ece4,num:21,rimColor:0x16161a,     s:-6, lane:-2,   skill:0.985,level:'Pro',aggr:0.9,react:16,err:0.03,lineQ:1.0},
  {name:'K. Osei', color:0x17a3a5,accent:0xffd23a,suit:0x1c2b33,num:44,rim:'gold',            s:-15,lane:2,    skill:0.97, level:'Strong',aggr:0.7,react:14,err:0.08,lineQ:0.92},
  {name:'M. Lund', color:0x3157d6,accent:0xf3efe7,suit:0xf1ece4,num:9, rimColor:0x16161a,     s:-24,lane:-2,   skill:0.95, level:'Club',aggr:0.5,react:12,err:0.15,lineQ:0.85},
  {name:'T. Varga',color:0xc6e24a,accent:0x1d1b22,suit:0x1f2a14,num:63,rimColor:0x16161a,     s:-33,lane:2,    skill:0.925,level:'Rookie',aggr:0.3,react:9,err:0.25,lineQ:0.75}
];
riders.forEach(r=>{Object.assign(r,makeBike(r));r.grid={s:r.s,lane:r.lane};r.pitch=0;});
/* put a rider back on the grid, stopped, ready for a new race */
function resetRider(r){
  Object.assign(r,{mistake:null,cKey:'',pass:null,s:r.grid.s,v:0,off:r.grid.lane,lean:0,psi:0,steer:0,thr:0,brk:0,sliding:false,crash:null,gripUse:0,
    auto:false,phi:0,slip:0,dive:0,rpm:1800,abs:false,scrape:false,rough:false,lapCount:0,lapTimes:[],lapStart:0,finishTime:null});
  stepRider(r,0);
}
const player=riders[0];

/* player scooter: speed, lean and line come from the rider's inputs */
const STEER_RATE=1.3,STEER_RETURN=2.5;     // holding a key leans further; letting go stands the scooter up
const ROLL_RATE=1.6;                       // rad/s, how fast the scooter can be flicked into a lean
const CRASH_TIME=2.2,CRASH_SPEED=4;
function integrate(r,dt,sdot){
  r.off+=r.v*Math.sin(r.psi)*dt;
  r.s+=sdot*dt;
}
function placePlayer(r,dt,leanT,leanK){
  const u=((r.s%LEN)+LEN)%LEN/LEN,p=curve.getPointAt(u),t=curve.getTangentAt(u),l=Math.hypot(t.x,t.z);
  r.g.position.set(p.x+(t.z/l)*r.off,p.y+0.05,p.z-(t.x/l)*r.off);
  r.g.rotation.y=Math.atan2(t.x,t.z)+r.psi;
  r.pitch+=(-Math.asin(clamp(t.y,-1,1))-r.pitch)*(1-Math.exp(-dt*8));
  r.g.rotation.x=r.pitch+r.dive;
  r.lean+=(leanT-r.lean)*(1-Math.exp(-dt*leanK));
  r.g.rotation.z=r.lean;
  const amt=clamp((Math.abs(r.lean)-0.2)/0.5,0,1),inSide=r.lean>0?-1:1;
  poseRider(r.rig,amt,inSide,Math.max(-1,Math.min(1,r.lean)));
  r.wheels[0].rotation.x+=r.v*dt/WHEEL_R;r.wheels[1].rotation.x+=r.v*dt/WHEEL_R;
}
function stepCrash(r,dt){
  const k=r.crash;k.t+=dt;
  r.thr=r.brk=r.steer=0;r.gripUse=0;r.abs=r.scrape=false;r.dive*=Math.exp(-dt*4);
  r.rpm+=(1800-r.rpm)*(1-Math.exp(-dt*3));r.rough=r.v>1;
  r.v*=Math.exp(-dt*2.2);
  const kap=lerpArr(K,r.s);
  integrate(r,dt,r.v*Math.cos(r.psi)/Math.max(0.3,1-kap*r.off));
  const bd=barrierAt(r.s,Math.sign(r.off)||1);
  if(Math.abs(r.off)>bd){r.off=Math.sign(r.off)*bd;r.v*=Math.exp(-dt*8);}
  r.tailLight.emissiveIntensity=0.6;
  placePlayer(r,dt,k.dir*1.45,9);
  if(k.t>=CRASH_TIME){                       // respawn on the racing line, stopped
    r.crash=null;r.off=0;r.psi=0;r.v=0;r.steer=0;r.lean=0;r.phi=0;r.slip=0;r.sliding=false;
  }
}
function stepPlayer(r,dt){
  if(r.crash)return stepCrash(r,dt);
  const c=controls;
  if(c.takeReset()){r.off=0;r.psi=0;r.v=0;r.steer=0;r.phi=0;r.slip=0;r.sliding=false;}
  /* inputs: throttle opens over ~0.35 s, brake pressure builds over ~0.6 s */
  r.thr=clamp(r.thr+(c.throttle?dt/0.35:-dt/0.2),0,1);
  r.brk=clamp(r.brk+(c.brake?BRAKE_RISE:-BRAKE_FALL)*dt,0,1);
  const sIn=c.left-c.right;                        // +1 = left
  if(sIn)r.steer=clamp(r.steer+sIn*STEER_RATE*dt*(r.steer*sIn<0?2.5:1),-1,1);
  else r.steer-=Math.sign(r.steer)*Math.min(Math.abs(r.steer),STEER_RETURN*dt);
  const surf=surfaceAt(r.s,r.off);
  let mu=MU[surf];
  /* lean (left positive): steering asks for an angle, the scooter rolls toward it at a limited rate;
     at walking pace the lean the steering lock allows is small */
  const phiT=r.steer*Math.min(PHI_MAX,Math.atan(r.v*r.v/(R_MIN*G)));
  r.phi+=clamp((phiT-r.phi)*6,-ROLL_RATE,ROLL_RATE)*dt;
  r.phi=clamp(r.phi,-PHI_MAX,PHI_MAX);
  r.scrape=Math.abs(r.phi)>PHI_SCRAPE&&r.v>3;
  if(r.scrape)mu*=0.85;                            // hard parts on the ground lever the tyres off
  /* turn rate from lean (steady-state g*tan(lean)/v), capped by the steering lock */
  let w=r.v>0.3?G*Math.tan(r.phi)/r.v:0;
  w=clamp(w,-r.v/R_MIN,r.v/R_MIN);
  let aLat=r.v*w;
  /* longitudinal tyre force: engine, engine braking, ABS-limited brakes */
  const aBrkCmd=brakeDecel(r.brk),aBrk=Math.min(aBrkCmd,mu*G*0.97);
  r.abs=aBrkCmd>mu*G*0.97&&r.v>1.5;
  let aTyre=engineAccel(r.v,r.thr)-aBrk-(r.thr<0.05&&r.v>1?ENGINE_BRAKE:0);
  /* friction ellipse: past the limit the tyres slide, give 80% and the slide builds toward a lowside */
  const muG=mu*G,u=Math.hypot(aLat/muG,aTyre/muG);
  r.gripUse=u;
  let scrub=0;
  if(u>1){
    const k=SLIDE_RATIO/u;aLat*=k;aTyre*=k;
    r.slip+=(u-0.85)*dt*3;scrub=1+2*(u-1);
  }else r.slip=Math.max(0,r.slip-dt*1.2);
  r.sliding=r.slip>0.05;
  if(r.slip>0.6&&Math.abs(r.phi)>0.3){            // lowside
    r.crash={t:0,dir:-Math.sign(r.phi)||1};r.slip=0;r.sliding=false;return stepCrash(r,dt);
  }
  r.surf=surf;r.rough=surf==='grass'||surf==='gravel';
  let a=aTyre-dragAccel(r.v,1-0.6*draftOf(r))-scrub;
  if(r.rough)a-=2.5+0.08*r.v+(surf==='gravel'?2:0);
  r.v=Math.max(0,r.v+a*dt);
  w=r.v>0.3?aLat/r.v:0;
  const kap=lerpArr(K,r.s);
  const sdot=r.v*Math.cos(r.psi)/Math.max(0.3,1-kap*r.off);
  r.psi+=(w-kap*sdot)*dt;
  if(r.psi>Math.PI)r.psi-=2*Math.PI;else if(r.psi<-Math.PI)r.psi+=2*Math.PI;
  integrate(r,dt,sdot);
  /* solid barriers: wall or tyre stack */
  const bd=barrierAt(r.s,Math.sign(r.off)||1);
  if(Math.abs(r.off)>=bd){
    r.off=Math.sign(r.off)*bd;
    if(r.v>=CRASH_SPEED){r.crash={t:0,dir:-Math.sign(r.phi)||(r.off>0?-1:1)};r.sliding=false;}
    else{r.v*=Math.exp(-dt*6);r.psi*=Math.exp(-dt*6);}
  }
  /* weight transfer: the nose dives under braking and lifts on the throttle */
  r.dive+=(-0.035*aTyre/G-r.dive)*(1-Math.exp(-dt*6));
  r.rpm+=(rpmTarget(r.v,r.thr)-r.rpm)*(1-Math.exp(-dt*6));
  r.tailLight.emissiveIntensity=0.6+6*r.brk;
  placePlayer(r,dt,-r.phi,40);
}

const AI_BRAKE=7.5;                                  // m/s2, firm but ABS-safe
const wrapD=d=>((d+LEN/2)%LEN+LEN)%LEN-LEN/2;        // signed distance along the track, shortest way round
/* slipstream: 0..1 when tucked in close behind another bike */
function draftOf(r){
  let best=0;
  for(const o of riders){if(o===r)continue;
    const d=wrapD(o.s-r.s),dl=Math.abs(o.off-r.off);
    if(d>1&&d<18&&dl<1.3)best=Math.max(best,(1-d/18)*(1-dl/1.3));}
  return best;
}
/* nearest bike ahead that is in our way */
function aheadOf(r,range){
  let best=null;
  for(const o of riders){if(o===r)continue;
    const d=wrapD(o.s-r.s);
    if(d>0.5&&d<range&&Math.abs(o.off-r.off)<2.2&&(!best||d<best.d))best={o,d};}
  return best;
}
const dApexOf=(i,c)=>((i-c.ip+N/2)%N+N)%N-N/2;
function stepRider(r,dt){
  if(r.human&&!r.auto)return stepPlayer(r,dt);
  const i=mod(Math.floor(((r.s%LEN)+LEN)%LEN/ds));
  const k=lerpArr(K,r.s),kA=lerpArr(K,r.s+16);
  /* corner in view: roll for a mistake once per corner (weaker riders carry too much speed and run wide) */
  let cur=null;
  for(const c of corners)if(mod(i-(c.i0-14))<=c.i1-c.i0+24){cur=c;break;}
  if(cur){
    const key=cur.num+':'+Math.floor(r.s/LEN);
    if(r.cKey!==key){r.cKey=key;
      r.mistake=r.err>0&&r.s>0&&Math.random()<r.err*(cur.r<70?1.5:0.7)?{c:cur,sev:0.5+Math.random()*0.8}:null;}
  }else r.mistake=null;
  let sf=1,wide=0;
  if(r.mistake&&r.mistake.c===cur){
    const m=r.mistake,da=dApexOf(i,cur);
    sf=da<0?1+0.05*m.sev:0.88;
    wide=-cur.sg*m.sev*6*(da<0?clamp(1+da/14,0,1):1-clamp((da-8)/22,0,1));
  }
  /* traffic: slipstream, pass or hold station */
  const ahead=aheadOf(r,r.react+14);
  const draft=draftOf(r);
  let target=lerpArr(V,r.s)*r.skill*sf*(1+0.03*draft);
  let offLine=Math.sign(kA)*Math.min(1,Math.abs(kA)*36)*(W-1.6)*r.lineQ;
  let offT=r.lane*0.55+offLine,rate=1.6;
  if(ahead){
    const {o,d}=ahead;
    if(d<r.react*(0.6+0.4*r.aggr)){
      if(!r.pass||r.pass.o!==o){
        const roomL=(W-1.1)-o.off,roomR=o.off+(W-1.1);
        const bias=Math.sign(kA)*r.aggr*0.8*(Math.abs(kA)>0.002?1:0);
        r.pass={o,side:(roomL-roomR)*0.2+bias>=0?1:-1};
      }
      const want=clamp(o.off+r.pass.side*1.9,-W+1.1,W-1.1);
      if(Math.abs(want-o.off)>=1.5){offT=want;rate=2.6;}
    }
    if(Math.abs(o.off-r.off)<1.5&&d<12)target=Math.min(target,Math.max(0,o.v+(d-3.5)*0.8));  // don't ride up the back
  }else r.pass=null;
  if(r.pass&&wrapD(r.pass.o.s-r.s)<-4)r.pass=null;
  offT=clamp(offT+wide,-W-(wide?3:-1.1),W+(wide?3:-1.1));
  const braking=target<r.v-0.6;
  const aUp=Math.max(0,engineAccel(r.v,1)-dragAccel(r.v,1-0.6*draft));
  const dv=clamp((target-r.v)*(1-Math.exp(-dt*(braking?3.2:2.2))),-AI_BRAKE*dt,aUp*dt);
  r.v+=dv;
  r.rpm+=(rpmTarget(r.v,dv>0.2*aUp*dt?1:0.15)-r.rpm)*(1-Math.exp(-dt*6));
  r.brk=braking?clamp((r.v-target)/4,0.3,1):0;
  r.rough=Math.abs(r.off)>EDGE;r.surf=r.rough?'grass':'asphalt';r.sliding=false;
  r.s+=r.v*dt;
  const u=((r.s%LEN)+LEN)%LEN/LEN,p=curve.getPointAt(u),t=curve.getTangentAt(u),l=Math.hypot(t.x,t.z);
  r.off+=(offT-r.off)*(1-Math.exp(-dt*rate));
  r.g.position.set(p.x+(t.z/l)*r.off,p.y+0.05,p.z-(t.x/l)*r.off);
  r.psi*=Math.exp(-dt*3);                           // heading left over when the autopilot takes over
  r.g.rotation.y=Math.atan2(t.x,t.z)+r.psi;
  r.pitch+=(-Math.asin(clamp(t.y,-1,1))-r.pitch)*(1-Math.exp(-dt*8));
  r.g.rotation.x=r.pitch+(braking?0.025*r.brk:-0.004);
  const leanT=-Math.sign(k)*Math.min(PHI_MAX,Math.atan(r.v*r.v*Math.abs(k)/G));
  r.lean+=(leanT-r.lean)*(1-Math.exp(-dt*4.5));
  r.g.rotation.z=r.lean;
  const amt=clamp((Math.abs(r.lean)-0.2)/0.5,0,1),inSide=r.lean>0?-1:1;
  poseRider(r.rig,amt,inSide,r.lean);
  r.wheels[0].rotation.x+=r.v*dt/WHEEL_R;r.wheels[1].rotation.x+=r.v*dt/WHEEL_R;
  r.tailLight.emissiveIntensity=0.6+6*r.brk;
}
/* bike-to-bike contact: push apart, the rider behind loses speed, a hard rear-end shunt crashes the player */
function interact(){
  for(let a=0;a<riders.length;a++)for(let b=a+1;b<riders.length;b++){
    const x=riders[a],y=riders[b],d=wrapD(y.s-x.s),dl=y.off-x.off;
    if(Math.abs(d)>1.8||Math.abs(dl)>0.75)continue;
    const push=(0.75-Math.abs(dl))/2,sg=dl>=0?(dl===0&&b%2?-1:1):-1;
    y.off+=sg*push;x.off-=sg*push;
    const rear=d>0?x:y,front=d>0?y:x,rel=rear.v-front.v;
    if(rel>0.5){rear.v=front.v+rel*0.3;front.v+=rel*0.1;}
    if(rel>6){
      if(rear.human&&!rear.auto&&!rear.crash)rear.crash={t:0,dir:sg*(rear===x?-1:1)||1};
      else if(!rear.human)rear.v*=0.5;
    }
  }
}
export {riders,player,stepRider,resetRider,interact};
