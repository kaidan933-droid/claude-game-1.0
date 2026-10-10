/* The race world: track coupling, AI drivers, car-to-car and barrier contact, lap timing.
   Pure JS (no three.js) so a whole race can be simulated in Node. */
import {buildTrack,racingLine,HW,CURB_W} from './trackdata.js';
import {SPEC,G,RHO,makeCar,stepCar,placeCar,setSpeed,shift} from './car.js';

export const T=buildTrack();
export const RL=racingLine(T);
export const DT=1/240;
const {N,ds,LEN,mod}=T;
const CAR_LEN=4.57,CAR_W=1.95;

/* ---------------- speed profile along the racing line ---------------- */
/* Fastest speed the car can hold through each sample at a given share of its grip, then a
   backward pass so it can brake down to every corner in time. Downforce, crests and banking
   all change the grip available. */
export function speedProfile(gripUse,brakeUse){
  const V=new Float64Array(N),m=SPEC.mass,c=0.5*RHO*SPEC.clA/m,mu=SPEC.mu*gripUse;
  const vmax=86;
  for(let i=0;i<N;i++){
    const k=Math.abs(RL.LK[i]),vc=T.DDY[i],bank=T.BANK[i]*Math.sign(RL.LK[i]||1)*-1;   // >0 when banked into the turn
    /* v^2 k <= mu (g + v^2 (vc + c)) + g*bank + mu v^2 k bank, with mu falling as the load rises */
    let v=vmax;
    for(let it=0;it<4;it++){
      const nf=Math.max(1,1+v*v*(vc+c)/G+v*v*k*Math.max(0,bank)/G);
      const me=mu*Math.max(0.6,1-SPEC.loadSens*(nf-1));
      const den=k-me*(vc+c)-me*k*Math.max(0,bank);
      v=Math.min(vmax,den>1e-6?Math.sqrt((me*G+G*Math.max(0,bank))/den):vmax);
    }
    /* don't fly off crests: keep at least 40% of the car's weight on the road */
    if(vc<-1e-4)v=Math.min(v,Math.sqrt(0.6*G/-vc));
    V[i]=v;
  }
  for(let pass=0;pass<2;pass++)for(let j=2*N-1;j>=0;j--){
    const i=j%N,n=(i+1)%N,vn=V[n];
    const k=Math.abs(RL.LK[i]);
    const grip=mu*brakeUse*(G*(1+vn*vn*T.DDY[i]/G)+c*vn*vn);
    const lat=vn*vn*k;
    const along=Math.sqrt(Math.max(0,grip*grip-lat*lat))+0.5*RHO*SPEC.cdA*vn*vn/m+G*T.DY[i];
    V[i]=Math.min(V[i],Math.sqrt(vn*vn+2*Math.max(1,along)*RL.LDS[i]));
  }
  return V;
}

/* ---------------- cars ---------------- */
export const DRIVERS=[
  {name:'You',color:0x2f6fb8,human:true},
  {name:'L. Weber',color:0x6aa84f,skill:0.985},
  {name:'M. Rossi',color:0xc8202a,skill:0.975},
  {name:'K. Tanaka',color:0xf2c230,skill:0.97},
  {name:'S. Dubois',color:0xe8e6e1,skill:0.965},
  {name:'A. Novak',color:0xe0702a,skill:0.96},
  {name:'J. Hughes',color:0x1c1c20,skill:0.955},
  {name:'P. Lindqvist',color:0x7d3fb5,skill:0.95},
  {name:'R. Silva',color:0x5ad1c9,skill:0.945},
  {name:'T. Becker',color:0x9aa3ad,skill:0.94}
];
export const cars=[];
export function setupCars(opts){
  cars.length=0;
  const diff=opts&&opts.difficulty!==undefined?opts.difficulty:1;   // 0 amateur, 1 pro, 2 alien
  const scale=[0.8,0.91,1.0][diff];
  const order=opts&&opts.gridOrder?opts.gridOrder:DRIVERS.map((_,i)=>i);
  order.forEach((di,gi)=>{
    const D=DRIVERS[di];
    const car=makeCar();
    const e={...D,id:di,car,grid:gi,ai:!D.human,num:[7,11,23,3,44,16,91,5,63,18][di]};
    /* every car gets a profile: the player's is used if the AI takes over after the flag */
    const sk=e.ai?Math.min(1.0,D.skill*scale):0.95;
    e.skill=sk;
    e.prof=speedProfile(0.86*sk+0.04,0.92*sk);
    cars.push(e);
  });
  resetCars(opts);
}
function trackPose(s,d){
  const i=T.idx(s),f=((s%LEN)+LEN)%LEN/ds-Math.floor(((s%LEN)+LEN)%LEN/ds),j=mod(i+1);
  const x=T.X[i]+(T.X[j]-T.X[i])*f+T.NX[i]*d,z=T.Z[i]+(T.Z[j]-T.Z[i])*f+T.NZ[i]*d;
  return {x,z,y:T.heightAt(s,d),h:Math.atan2(T.TZ[i],T.TX[i]),i};
}
export function resetCars(){
  for(const e of cars){
    const row=Math.floor(e.grid/2),side=e.grid%2?1:-1;
    const s=-12-row*9-(e.grid%2)*4.5,d=side*2.3;
    const p=trackPose(s,d);
    placeCar(e.car,p.x,p.z,p.y,p.h);
    e.car.autoShift=e.ai?true:e.car.autoShift;
    Object.assign(e,{idx:p.i,s:((s%LEN)+LEN)%LEN,d,lap:-1,prog:s,lapStart:0,lapTimes:[],finish:null,
      offset:0,offT:0,stuck:0,mistake:0,resetT:0,contact:0,wall:0,lastLapS:0,steerS:0,
      sector:0,inp:{thr:0,brk:0,steer:0}});
  }
}

/* ---------------- environment for one car ---------------- */
const env={gradF:0,gradR:0,vcurv:0,surf:[0,0,0,0],roadY:0,roadVy:0};
function locate(e){
  const c=e.car,p=T.project(c.x,c.z,e.idx);
  /* lap counting on index wrap */
  if(e.idx>N*0.8&&p.i<N*0.2)e.lap++;
  else if(e.idx<N*0.2&&p.i>N*0.8)e.lap--;
  e.idx=p.i;e.s=p.i*ds+p.along;e.d=p.d;
  e.prog=e.lap*LEN+e.s;
}
function buildEnv(e){
  const c=e.car,i=e.idx;
  const tx=T.TX[i],tz=T.TZ[i],nx=T.NX[i],nz=T.NZ[i];
  const dy=T.DY[i],bk=T.BANK[i];
  const fx=Math.cos(c.h),fz=Math.sin(c.h);
  const gx=dy*tx+bk*nx,gz=dy*tz+bk*nz;            // surface gradient in world xz
  env.gradF=gx*fx+gz*fz;env.gradR=gx*-fz+gz*fx;
  const sp=Math.hypot(c.vx,c.vz)||1,along=(c.vx*tx+c.vz*tz)/sp;
  env.vcurv=T.DDY[i]*along*along;
  env.roadY=T.heightAt(e.s,e.d);
  env.roadVy=dy*(c.vx*tx+c.vz*tz)+bk*(c.vx*nx+c.vz*nz);
  for(let k=0;k<4;k++){
    const w=c.wheels[k];
    const wx=fx*w.x-fz*w.y,wz=fz*w.x+fx*w.y;
    const sw=e.s+wx*tx+wz*tz,dw=e.d+wx*nx+wz*nz;
    env.surf[k]=T.surfaceAt(sw,dw);
  }
  return env;
}

/* Keep the front tyres near their peak slip angle: steering past it only adds understeer.
   Drivers feel this through the wheel; the AI and the keyboard assist use it directly. */
export function limitSteer(c,steer,k){
  if(c.u<4)return Math.max(-SPEC.steerLock,Math.min(SPEC.steerLock,steer));
  const g=Math.atan2(c.v+SPEC.a*c.r,c.u),m=SPEC.alphaPeakF*k;
  return Math.max(-SPEC.steerLock,Math.min(SPEC.steerLock,Math.max(g-m,Math.min(g+m,steer))));
}

/* ---------------- AI ---------------- */
function lineD(s){return T.lerp(RL.D,s);}
function aiDrive(e,dt,raceOn){
  const c=e.car,inp=e.inp;
  if(!raceOn){inp.thr=0;inp.brk=1;inp.steer=0;return;}
  const u=Math.max(c.u,0),ch=Math.cos(c.h),sh=Math.sin(c.h);
  /* traffic: pick a lateral offset around the line and a speed cap */
  let cap=Infinity,want=0,alongside=null;
  for(const o of cars){
    if(o===e)continue;
    let gap=o.prog-e.prog;
    if(gap<-LEN/2)gap+=LEN;else if(gap>LEN/2)gap-=LEN;
    const dd=o.d-(lineD(e.s)+e.offset);
    if(gap>-CAR_LEN-1&&gap<CAR_LEN+1){alongside=o;continue;}
    if(gap>0&&gap<45){
      const closing=u-o.car.u;
      if(Math.abs(o.d-e.d)<CAR_W+0.6||Math.abs(dd)<CAR_W+0.4){
        /* choose the side with more room around the car ahead */
        const roomL=o.d+HW-0.9,roomR=HW-0.9-o.d;
        const side=roomL>roomR?-1:1;
        const room=Math.max(roomL,roomR);
        if(room>CAR_W+0.8&&(closing>0.5||gap<14)){
          want=(o.d+side*(CAR_W+0.9))-lineD(e.s);
        }else if(gap<25){
          /* no room: follow */
          cap=Math.min(cap,o.car.u+gap*0.35-4);
        }
      }
    }
  }
  if(alongside){
    /* hold a car's width from someone next to us */
    const sep=e.d-alongside.d,need=CAR_W+0.5;
    if(Math.abs(sep)<need){const push=(sep>=0?1:-1)*(need-Math.abs(sep));want=(e.d+push)-lineD(e.s);}
  }
  const lim=HW-1.05;
  e.offT=want;
  e.offset+=(e.offT-e.offset)*Math.min(1,dt*1.6);
  /* steering: pure pursuit on the (offset) racing line */
  const look=7+u*0.42;
  const st=e.s+look,j=T.idx(st);
  let dT=Math.max(-lim,Math.min(lim,lineD(st)+e.offset));
  const tx=T.lerp(T.X,st)+T.NX[j]*dT-c.x,tz=T.lerp(T.Z,st)+T.NZ[j]*dT-c.z;
  const xb=tx*ch+tz*sh,yb=-tx*sh+tz*ch;
  const kpp=2*yb/(xb*xb+yb*yb+1e-6);
  /* feed-forward: geometry plus the car's understeer (about 0.1 deg of extra lock per m/s^2),
     then yaw-rate feedback, which also counter-steers when the rear steps out */
  const alat=Math.max(-16,Math.min(16,u*u*kpp));
  let steer=Math.atan(SPEC.wb*kpp)+0.0019*alat+0.12*(u*kpp-c.r);
  const beta=Math.atan2(c.v,Math.max(c.u,3));
  steer=limitSteer(c,steer,1.15);
  inp.steer+=(steer-inp.steer)*Math.min(1,dt*14);
  /* speed */
  const pi=T.idx(e.s+u*0.18+2);
  let vt=Math.min(e.prof[pi],cap);
  if(Math.abs(e.offset)>1.2)vt*=0.985;
  /* running wide of the line in a corner: ease off like a driver would */
  const kHere=T.lerp(RL.LK,e.s);
  if(Math.abs(kHere)>1/400){
    const wide=(e.d-(lineD(e.s)+e.offset))*-Math.sign(kHere);    // >0 toward the outside
    if(wide>0.8)vt*=Math.max(0.8,1-0.035*(wide-0.8));
  }
  if(e.mistake>0){e.mistake-=dt;vt*=1.03;}
  else if(Math.random()<dt*(1-e.skill)*0.02)e.mistake=0.6+Math.random();
  const err=vt-u;
  if(err>0){inp.thr=Math.min(1,0.25+err*0.5);inp.brk=0;}
  else{inp.thr=Math.max(0,0.25+err*0.6);inp.brk=Math.min(1,Math.max(0,-err*0.22-0.05));}
  /* front sliding: lift */
  const fs=(c.wheels[0].slip+c.wheels[1].slip)/2;
  if(fs>1.15)inp.thr*=0.5;
  if(Math.abs(beta)>0.12)inp.thr*=0.4;
  /* reverse out when stuck facing a wall */
  if(c.gear<0&&u>-0.5)inp.steer=-inp.steer;
}

/* ---------------- contact ---------------- */
function corners(c){
  const ch=Math.cos(c.h),sh=Math.sin(c.h),hl=CAR_LEN/2,hw=CAR_W/2,out=[];
  for(const [a,b] of [[hl,-hw],[hl,hw],[-hl,-hw],[-hl,hw]])out.push([c.x+a*ch-b*sh,c.z+a*sh+b*ch,a,b]);
  return out;
}
function impulse(c,px,pz,nx,nz,j,mu){
  /* apply impulse j along n plus friction mu*j against the sliding direction at the point */
  const rx=px-c.x,rz=pz-c.z;
  const vpx=c.vx-c.r*rz,vpz=c.vz+c.r*rx;
  const vn=vpx*nx+vpz*nz,tx=vpx-vn*nx,tz=vpz-vn*nz,tl=Math.hypot(tx,tz);
  let ix=nx*j,iz=nz*j;
  if(tl>1e-3){const f=Math.min(mu*j,tl*SPEC.mass*0.5);ix-=tx/tl*f;iz-=tz/tl*f;}
  c.vx+=ix/SPEC.mass;c.vz+=iz/SPEC.mass;
  c.r+=(rx*iz-rz*ix)/SPEC.izz;
}
function walls(e){
  const c=e.car;let hit=0;
  for(const [px,pz] of corners(c)){
    const p=T.project(px,pz,e.idx),i=p.i;
    const barR=T.BAR_R[i]-0.25,barL=T.BAR_L[i]-0.25;
    let pen=0,nx=0,nz=0;
    if(p.d>barR){pen=p.d-barR;nx=-T.NX[i];nz=-T.NZ[i];}
    else if(p.d<-barL){pen=-barL-p.d;nx=T.NX[i];nz=T.NZ[i];}
    if(pen<=0)continue;
    c.x+=nx*pen;c.z+=nz*pen;
    const rx=px-c.x,rz=pz-c.z,vpx=c.vx-c.r*rz,vpz=c.vz+c.r*rx,vn=vpx*nx+vpz*nz;
    if(vn<0){
      const rn=rx*nz-rz*nx,k=1/SPEC.mass+rn*rn/SPEC.izz;
      const j=-(1+0.25)*vn/k;
      impulse(c,px,pz,nx,nz,j,0.35);
      hit=Math.max(hit,-vn);
    }
  }
  e.wall=hit;return hit;
}
function carContact(a,b){
  const A=a.car,B=b.car;
  const dx=B.x-A.x,dz=B.z-A.z;if(dx*dx+dz*dz>30)return 0;
  /* SAT on two oriented boxes */
  const axes=[[Math.cos(A.h),Math.sin(A.h)],[-Math.sin(A.h),Math.cos(A.h)],[Math.cos(B.h),Math.sin(B.h)],[-Math.sin(B.h),Math.cos(B.h)]];
  const ca=corners(A),cb=corners(B);
  let best=Infinity,bn=null;
  for(const [ax,az] of axes){
    let a0=Infinity,a1=-Infinity,b0=Infinity,b1=-Infinity;
    for(const p of ca){const t=p[0]*ax+p[1]*az;a0=Math.min(a0,t);a1=Math.max(a1,t);}
    for(const p of cb){const t=p[0]*ax+p[1]*az;b0=Math.min(b0,t);b1=Math.max(b1,t);}
    const o=Math.min(a1,b1)-Math.max(a0,b0);
    if(o<=0)return 0;
    if(o<best){best=o;bn=[ax,az];}
  }
  let [nx,nz]=bn;if(nx*dx+nz*dz<0){nx=-nx;nz=-nz;}       // n points from A to B
  /* contact point: deepest corner of B into A, or of A into B */
  let cp=null,dmin=Infinity;
  for(const p of cb){const t=(p[0]-A.x)*nx+(p[1]-A.z)*nz;if(t<dmin){dmin=t;cp=p;}}
  const px=cp[0],pz=cp[1];
  A.x-=nx*best/2;A.z-=nz*best/2;B.x+=nx*best/2;B.z+=nz*best/2;
  const ra=[px-A.x,pz-A.z],rb=[px-B.x,pz-B.z];
  const va=[A.vx-A.r*ra[1],A.vz+A.r*ra[0]],vb=[B.vx-B.r*rb[1],B.vz+B.r*rb[0]];
  const vn=(vb[0]-va[0])*nx+(vb[1]-va[1])*nz;
  if(vn>=0)return best;
  const rna=ra[0]*nz-ra[1]*nx,rnb=rb[0]*nz-rb[1]*nx;
  const k=2/SPEC.mass+rna*rna/SPEC.izz+rnb*rnb/SPEC.izz;
  const j=-(1+0.2)*vn/k;
  impulse(B,px,pz,nx,nz,j,0.25);impulse(A,px,pz,-nx,-nz,j,0.25);
  a.contact=b.contact=Math.max(a.contact,-vn);
  return best;
}

/* ---------------- reset to track ---------------- */
export function resetToTrack(e,back=0){
  const s=e.s-back,d=Math.max(-HW+1.5,Math.min(HW-1.5,lineD(s)));
  const p=trackPose(s,d);
  placeCar(e.car,p.x,p.z,p.y,p.h);
  e.idx=p.i;locate(e);
  setSpeed(e.car,e.ai?14:0);
  e.offset=0;e.stuck=0;e.resetT=1.5;
}

/* ---------------- step ---------------- */
export const race={state:'grid',time:0,laps:2,onFinish:null,finishOrder:[]};
export function step(dt,playerInput){
  const raceOn=race.state==='racing'||race.state==='finished';
  for(const e of cars){
    if(e.human&&!e.auto){
      Object.assign(e.inp,playerInput);
      if(!raceOn){e.inp.thr=Math.min(e.inp.thr,1);e.inp.brk=1;}    // engine revs on the grid, car held
    }else aiDrive(e,dt,raceOn);
    const c=e.car;
    /* DRS opens flat out on a straight and snaps shut on the brakes or in a corner */
    const drsOk=c.thr>0.95&&c.brk<0.02&&Math.abs(c.steer)<0.014&&c.speed>33&&Math.abs(c.ayF)<3.5&&c.gear>0;
    c.drsT=drsOk?c.drsT+dt:0;c.drs=c.drsT>0.6;
    stepCar(c,e.inp,buildEnv(e),dt);
    locate(e);
    if(e.resetT>0)e.resetT-=dt;
  }
  for(const e of cars){e.contact*=0.9;walls(e);}
  for(let i=0;i<cars.length;i++)for(let j=i+1;j<cars.length;j++){
    const a=cars[i],b=cars[j];if(Math.abs(a.s-b.s)>8&&Math.abs(Math.abs(a.s-b.s)-LEN)>8)continue;
    if(a.resetT>0||b.resetT>0)continue;
    carContact(a,b);
  }
  if(raceOn){
    race.time+=dt;
    for(const e of cars){
      /* stuck AI: reset after a while */
      if(e.ai||e.auto){
        const hd=Math.atan2(Math.sin(e.car.h-Math.atan2(T.TZ[e.idx],T.TX[e.idx])),Math.cos(e.car.h-Math.atan2(T.TZ[e.idx],T.TX[e.idx])));
        if(e.car.speed<3||Math.abs(hd)>1.6)e.stuck+=dt;else e.stuck=Math.max(0,e.stuck-dt*2);
        if(e.stuck>3)resetToTrack(e,5);
      }
      /* laps */
      const done=e.lapTimes.length;
      if(e.lap>done&&e.finish===null){
        const over=e.s/Math.max(e.car.speed,1);
        const t=race.time-over;
        if(e.lap>=1){e.lapTimes.push(t-e.lapStart);}
        e.lapStart=t;
        if(e.lap>=race.laps){
          e.finish=t;race.finishOrder.push(e);
          if(e.human){e.auto=true;race.state='finished';race.onFinish&&race.onFinish();}
        }
      }
    }
  }
}
export function standings(){
  return [...cars].sort((a,b)=>{
    const fa=a.finish!==null,fb=b.finish!==null;
    if(fa&&fb)return a.finish-b.finish;
    if(fa!==fb)return fa?-1:1;
    return b.prog-a.prog;
  });
}
export {HW,CURB_W,CAR_LEN,CAR_W,trackPose,shift};
