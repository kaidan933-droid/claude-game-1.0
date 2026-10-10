import * as THREE from 'three';
import {clamp} from './core.js';
import {curve,LEN,N,ds,mod,corners,V,K,W,EDGE,lerpArr,barrierAt,surfaceAt} from './track.js';
import {controls} from './controls.js';
import {G,dragAccel,drivetrain,IDLE,BRAKE_RISE,BRAKE_FALL,brakeDecel,MU,SLIDE_RATIO,PHI_SCRAPE,PHI_MAX,PHI_RIDER,R_MIN} from './physics.js';
import {makeBike,disposeBike,poseRider,WHEEL_F,WHEEL_R} from './models.js';

/* ---------------- the field: 10 slots ----------------
   Each slot keeps an AI identity. A slot is driven by this machine's rider ('local'), by another
   player or the host over the network ('remote'), or by the AI on this machine ('ai').
   Humans ride the RS 457; AI riders ride generic 400 sport bikes. */
const ROSTER=[
  {name:'R. Ferro',  color:0xd7263d,accent:0xf3efe7,suit:0xf1ece4,num:21,rimColor:0x16161a,skill:0.985,level:'Pro',   aggr:0.9, react:16,err:0.03,lineQ:1.0},
  {name:'K. Osei',   color:0x17a3a5,accent:0xffd23a,suit:0x1c2b33,num:44,rim:'gold',       skill:0.98, level:'Pro',   aggr:0.85,react:16,err:0.04,lineQ:0.98},
  {name:'L. Moreau', color:0xf2f0ea,accent:0x1f4fd1,suit:0x1a2138,num:12,rimColor:0x16161a,skill:0.97, level:'Strong',aggr:0.75,react:14,err:0.07,lineQ:0.94},
  {name:'J. Tanaka', color:0xe8501c,accent:0x14141a,suit:0x14141a,num:73,rim:'gold',       skill:0.965,level:'Strong',aggr:0.7, react:14,err:0.08,lineQ:0.92},
  {name:'M. Lund',   color:0x3157d6,accent:0xf3efe7,suit:0xf1ece4,num:9, rimColor:0x16161a,skill:0.955,level:'Strong',aggr:0.6, react:13,err:0.1, lineQ:0.9},
  {name:'S. Novak',  color:0x2f9e52,accent:0xf3efe7,suit:0x173322,num:27,rimColor:0x16161a,skill:0.95, level:'Club',  aggr:0.55,react:12,err:0.13,lineQ:0.87},
  {name:'A. Brennan',color:0x8a3fd1,accent:0xffb43a,suit:0x231735,num:5, rim:'gold',       skill:0.942,level:'Club',  aggr:0.5, react:12,err:0.15,lineQ:0.85},
  {name:'T. Varga',  color:0xc6e24a,accent:0x1d1b22,suit:0x1f2a14,num:63,rimColor:0x16161a,skill:0.935,level:'Club',  aggr:0.4, react:10,err:0.18,lineQ:0.82},
  {name:'D. Kowalski',color:0xffd23a,accent:0x14141a,suit:0x2a2614,num:88,rimColor:0x16161a,skill:0.925,level:'Rookie',aggr:0.35,react:9,err:0.22,lineQ:0.78},
  {name:'P. Silva',  color:0x25b4e8,accent:0xf3efe7,suit:0x14283a,num:31,rimColor:0x16161a,skill:0.918,level:'Rookie',aggr:0.3, react:9, err:0.25,lineQ:0.75}
];
const HUMAN_SUITS=[0x1c1b22,0x2a1a1c,0x1a2230,0x22261a,0x2b2230,0x1d2a2a,0x30261c,0x1c1c1c,0x262a33,0x331c24];
const SLOTS=ROSTER.length;
/* staggered two-wide grid behind the start line, pole first */
const gridOf=i=>({s:-6-i*4.6,lane:i%2?2.1:-2.1});
const riders=ROSTER.map((ai,i)=>({slot:i,ai,grid:gridOf(i),ctrl:'ai',pitch:0,buf:[]}));
let player=null;           // the bike the HUD and cameras follow: ours, or the leader while spectating
let localSlot=null;
/* give a slot to the AI, to this machine's rider or to a remote player and (re)build its bike */
function setSlot(r,ctrl,name){
  const human=ctrl!=='ai'&&!(ctrl==='remote'&&!name);
  const look=human?{name,color:0x16151b,accent:0x0e0d12,suit:HUMAN_SUITS[r.slot],num:r.ai.num,rs457:true,level:'Rider'}
                  :{...r.ai,rs457:false};
  const rebuild=!r.g||r.rs457!==look.rs457||(ctrl==='local')!==!!r.local||r.num!==look.num;
  Object.assign(r,r.ai,look,{ctrl,human,local:ctrl==='local'});
  if(rebuild){
    if(r.g)disposeBike(r.g);
    Object.assign(r,makeBike(r));
  }
}
riders.forEach(r=>setSlot(r,'ai'));
function setLocalSlot(i,name){
  localSlot=i;
  if(i!==null)setSlot(riders[i],'local',name);
  player=i===null?riders[0]:riders[i];
}
const setPlayer=r=>{player=r;};
/* put a rider back on the grid, stopped, ready for a new race */
function resetRider(r){
  Object.assign(r,{mistake:null,cKey:'',pass:null,s:r.grid.s,v:0,off:r.grid.lane,lane:r.grid.lane,lean:0,psi:0,steer:0,thr:0,brk:0,sliding:false,crash:null,gripUse:0,
    auto:false,phi:0,slip:0,dive:0,rpm:IDLE,gear:1,shiftT:0,blip:0,abs:false,scrape:false,rough:false,surf:'asphalt',
    lapCount:0,lapTimes:[],lapStart:0,finishTime:null,buf:[]});
  if(r.ctrl==='remote')r.buf.push({t:performance.now(),st:packState(r)});
  stepRider(r,0);
}

/* ---------------- network state ----------------
   [s, off, psi, v, lean, dive, thr, brk, rpm, gear, flags, lapCount, finishTime] */
const F_CRASH=1,F_ABS=2,F_SCRAPE=4,F_SLIDE=8,F_ROUGH=16,F_BLIP=32;
const r3=x=>Math.round(x*1000)/1000;
function packState(r){
  return [r3(r.s),r3(r.off),r3(r.psi),r3(r.v),r3(r.lean),r3(r.dive),r3(r.thr),r3(r.brk),Math.round(r.rpm),r.gear,
    (r.crash?F_CRASH:0)|(r.abs?F_ABS:0)|(r.scrape?F_SCRAPE:0)|(r.sliding?F_SLIDE:0)|(r.rough?F_ROUGH:0)|(r.blip>0?F_BLIP:0),
    r.lapCount,r.finishTime];
}
function pushRemoteState(r,st){
  r.buf.push({t:performance.now(),st});
  if(r.buf.length>30)r.buf.shift();
  if(st[12]!==null&&st[12]!==undefined)r.finishTime=st[12];
}
const DELAY=100;            // ms of interpolation buffer for remote bikes
/* remote bike: draw it where it was DELAY ms ago, blending between the two snapshots around then */
function stepRemote(r,dt){
  const b=r.buf;if(!b.length)return;
  const t=performance.now()-DELAY;
  while(b.length>2&&b[1].t<=t)b.shift();
  let A=b[0].st,B=b.length>1?b[1].st:A,f=0;
  if(b.length>1&&b[1].t>b[0].t)f=clamp((t-b[0].t)/(b[1].t-b[0].t),0,1.2);
  const L=(i)=>A[i]+(B[i]-A[i])*f;
  r.s=L(0);r.off=L(1);r.psi=L(2);r.v=Math.max(0,L(3));r.dive=L(5);r.thr=L(6);r.brk=L(7);r.rpm=L(8);r.gear=B[9];
  const fl=B[10];r.crash=fl&F_CRASH?{t:0,dir:1}:null;r.abs=!!(fl&F_ABS);r.scrape=!!(fl&F_SCRAPE);r.sliding=!!(fl&F_SLIDE);
  r.rough=!!(fl&F_ROUGH);r.blip=fl&F_BLIP?0.1:0;r.surf=r.rough?'grass':'asphalt';
  r.tailLight.emissiveIntensity=0.6+6*r.brk;
  placePlayer(r,dt,L(4),1e6);
}

/* local rider: speed, lean and line come from the rider's inputs */
const STEER_RATE=1.3,STEER_RETURN=2.5;     // holding a key leans further; letting go stands the bike up
const ROLL_RATE=2.2;                       // rad/s, how fast the bike can be flicked into a lean
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
  r.wheels[0].rotation.x+=r.v*dt/WHEEL_F;r.wheels[1].rotation.x+=r.v*dt/WHEEL_R;
}
function stepCrash(r,dt){
  const k=r.crash;k.t+=dt;
  r.thr=r.brk=r.steer=0;r.gripUse=0;r.abs=r.scrape=false;r.dive*=Math.exp(-dt*4);
  r.rpm+=(IDLE-r.rpm)*(1-Math.exp(-dt*3));r.gear=1;r.rough=r.v>1;
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
  /* lean (left positive): steering asks for an angle, the bike rolls toward it at a limited rate;
     at walking pace the lean the steering lock allows is small */
  const phiT=r.steer*Math.min(PHI_RIDER,Math.atan(r.v*r.v/(R_MIN*G)));
  r.phi+=clamp((phiT-r.phi)*6,-ROLL_RATE,ROLL_RATE)*dt;
  r.phi=clamp(r.phi,-PHI_MAX,PHI_MAX);
  r.scrape=Math.abs(r.phi)>PHI_SCRAPE&&r.v>3;
  if(r.scrape)mu*=0.9;                             // peg feelers on the ground lever the tyres off
  /* turn rate from lean (steady-state g*tan(lean)/v), capped by the steering lock */
  let w=r.v>0.3?G*Math.tan(r.phi)/r.v:0;
  w=clamp(w,-r.v/R_MIN,r.v/R_MIN);
  let aLat=r.v*w;
  /* longitudinal tyre force: engine, engine braking, ABS-limited brakes */
  const aBrkCmd=brakeDecel(r.brk),aBrk=Math.min(aBrkCmd,mu*G*0.97);
  r.abs=aBrkCmd>mu*G*0.97&&r.v>1.5;
  let aTyre=drivetrain(r,r.v,r.brk>0.2?0:r.thr,dt)-aBrk;
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
  r.tailLight.emissiveIntensity=0.6+6*r.brk;
  placePlayer(r,dt,-r.phi,40);
}

const AI_BRAKE=9.8;                                  // m/s2, firm but ABS-safe
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
  if(r.ctrl==='remote')return stepRemote(r,dt);
  if(r.ctrl==='local'&&!r.auto)return stepPlayer(r,dt);
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
  const want=(target-r.v)*(1-Math.exp(-dt*(braking?3.2:2.2)));
  r.thr=want>0.002?1:0;
  const aUp=Math.max(0,drivetrain(r,r.v,r.thr,dt)-dragAccel(r.v,1-0.6*draft));
  r.v+=clamp(want,-AI_BRAKE*dt,aUp*dt);
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
  r.wheels[0].rotation.x+=r.v*dt/WHEEL_F;r.wheels[1].rotation.x+=r.v*dt/WHEEL_R;
  r.tailLight.emissiveIntensity=0.6+6*r.brk;
}
/* bike-to-bike contact: push apart, the rider behind loses speed, a hard rear-end shunt crashes the player */
function interact(){
  for(let a=0;a<riders.length;a++)for(let b=a+1;b<riders.length;b++){
    const x=riders[a],y=riders[b],d=wrapD(y.s-x.s),dl=y.off-x.off;
    if(Math.abs(d)>1.8||Math.abs(dl)>0.75)continue;
    const lx=x.ctrl!=='remote',ly=y.ctrl!=='remote';
    if(!lx&&!ly)continue;
    const push=(0.75-Math.abs(dl))/2*(lx&&ly?1:2),sg=dl>=0?(dl===0&&b%2?-1:1):-1;
    if(ly)y.off+=sg*push;if(lx)x.off-=sg*push;
    const rear=d>0?x:y,front=d>0?y:x,rel=rear.v-front.v;
    if(rel>0.5){if(rear.ctrl!=='remote')rear.v=front.v+rel*0.3;if(front.ctrl!=='remote')front.v+=rel*0.1;}
    if(rel>6&&rear.ctrl!=='remote'){
      if(rear.ctrl==='local'&&!rear.auto&&!rear.crash)rear.crash={t:0,dir:sg*(rear===x?-1:1)||1};
      else if(rear.ctrl==='ai'||rear.auto)rear.v*=0.5;
    }
  }
}


export {riders,SLOTS,player,localSlot,setSlot,setLocalSlot,setPlayer,stepRider,resetRider,interact,packState,pushRemoteState};
setLocalSlot(SLOTS-1,'You');
