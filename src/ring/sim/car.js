/* Vehicle dynamics for a Porsche 911 GT3 RS (992) class car. Pure JS, no three.js.

   Model: planar rigid body (x, z, yaw) on the track surface plus a vertical state for crests,
   four wheels each with its own spin, load and temperature.
   - Loads: static split, aero downforce (front/rear), longitudinal and lateral load transfer from the
     measured accelerations (low-passed, as the suspension would), road curvature over crests and
     dips, banking.
   - Tyres: combined-slip friction with a Pacejka-style curve on the normalised slip vector, so
     braking or throttle while cornering eats into lateral grip. Load sensitivity (each kilo of extra
     load adds less grip), temperature window, grip per surface.
   - Wheel spin is integrated semi-implicitly against the tyre's slip stiffness, which keeps it stable
     at a 240 Hz step while still producing wheelspin and lock-ups.
   - Drivetrain: 4.0 flat-six torque curve, 7-speed PDK ratios, LSD, clutch slip at launch.
   - Brakes with front bias; ABS and traction control are per-wheel and can be switched off.
   Units are SI, angles in radians. Forward is x in the body frame, right is y. */

export const G=9.81,RHO=1.2;
export const SPEC={
  mass:1520,              // kg, 1450 kg DIN + driver
  izz:2350,               // kg m^2 yaw inertia
  wb:2.457,a:1.493,       // wheelbase, CG to front axle (39/61 split)
  hcg:0.46,               // CG height
  tf:1.63,tr:1.60,        // track widths
  rf:0.341,rr:0.357,      // rolling radius: 275/35 R20, 335/30 R21
  iwf:1.3,iwr:1.7,        // wheel + tyre + brake disc inertia
  ieng:0.17,              // engine + flywheel + clutch
  gears:[3.75,2.38,1.72,1.34,1.11,0.96,0.84],final:4.47,eff:0.92,reverse:3.4,
  idle:1100,redline:9000,limiter:9150,
  /* full-load torque curve (rpm, Nm): 525 PS at 8500, 465 Nm at 6300 */
  torque:[[0,240],[1000,250],[2000,330],[3000,385],[4000,415],[5000,440],[6000,460],[6300,465],[7000,461],[7500,455],[8000,446],[8500,434],[9000,405],[9300,350]],
  cdA:0.98,clA:2.25,aeroFront:0.43,     // 860 kg downforce at 285 km/h
  brakeF:3500,brakeR:1950,              // Nm per wheel at full pedal
  roll:0.67,              // share of lateral load transfer taken by the front axle (more = safer understeer)
  steerLock:0.52,         // rad at the road wheels
  /* tyres: Michelin Cup 2 R class */
  mu:1.62,fz0:3800,loadSens:0.1,
  slipPeak:0.11,
  alphaPeakF:0.12,alphaPeakR:0.088,     // peak slip angle: 6.9 deg on the 275 fronts, 5.4 deg on the stiffer 335 rears
  muRear:1.34,                          // the wider rear tyre keeps more grip per kilo of load, so the rear lets go last
  mfC:1.3,                              // gentle fall-off past the peak: slides build progressively
  crr:0.012,
  lsdPre:60,lsdRamp:0.35,lsdK:220
};
const S=SPEC,L=S.wb,B=S.wb-S.a;
const MF_B=Math.tan(Math.PI/(2*S.mfC));
const TAN_AF=Math.tan(S.alphaPeakF),TAN_AR=Math.tan(S.alphaPeakR);
/* normalised force for normalised slip s (peak 1 at s=1, ~0.76 when sliding) */
export function mf(s){return Math.sin(S.mfC*Math.atan(MF_B*s));}

export function engineTorque(rpm){
  const t=S.torque;if(rpm<=t[0][0])return t[0][1];
  for(let i=1;i<t.length;i++)if(rpm<=t[i][0]){const a=t[i-1],b=t[i],f=(rpm-a[0])/(b[0]-a[0]);return a[1]+(b[1]-a[1])*f;}
  return 0;
}
/* friction when coasting: pumping, friction, PDK drag */
const engineDrag=rpm=>rpm<S.idle*1.2?0:28+rpm*0.0105;

/* surface: 0 asphalt, 1 curb, 2 grass, 3 gravel */
export const SURF=[{mu:1,drag:0},{mu:0.93,drag:0.0},{mu:0.55,drag:0.07},{mu:0.42,drag:0.35}];

/* tyre temperature: grip window centred on 90 C */
export const tempGrip=T=>Math.max(0.78,1-0.13*((T-90)/45)**2);

export function makeCar(){
  const wheels=[0,1,2,3].map(i=>({
    front:i<2,left:i%2===0,
    x:i<2?S.a:-B,y:(i%2===0?-1:1)*(i<2?S.tf:S.tr)/2,
    r:i<2?S.rf:S.rr,iw:i<2?S.iwf:S.iwr,
    w:0,fz:0,fx:0,fy:0,slip:0,sr:0,sa:0,temp:65,abs:1,surf:0,load:0,spinAngle:0,steer:0,hot:0,brakeTemp:120
  }));
  return {
    x:0,z:0,y:0,h:0,                  // position, heading (direction cos h, sin h)
    vx:0,vz:0,r:0,                    // world velocity, yaw rate (+ turning right)
    vy:0,yv:0,grounded:true,air:0,    // vertical speed when airborne
    u:0,v:0,                          // body-frame forward / right speed
    ax:0,ay:0,axF:0,ayF:0,            // body accelerations, raw and filtered
    steer:0,thr:0,brk:0,
    gear:1,rpm:S.idle,clutch:1,shiftT:0,shiftTo:0,autoShift:true,
    tc:true,abs:true,tcCut:1,tcActive:0,absActive:0,drs:false,drsT:0,
    wheels,
    lf:1,                             // vertical load factor
    surfGrip:1,
    bump:0,landing:0,
    speed:0
  };
}

/* road info sampled by the caller once per step:
   env.gradF / gradR: road slope along the body forward / right axis (dy/dx)
   env.vcurv: vertical curvature of the road along the direction of travel (1/m)
   env.surf[i]: surface under each wheel; env.bump: curb rumble amplitude */
export function stepCar(c,inp,env,dt){
  const W=c.wheels;
  const ch=Math.cos(c.h),sh=Math.sin(c.h);
  /* body velocities */
  c.u=c.vx*ch+c.vz*sh;c.v=-c.vx*sh+c.vz*ch;
  const u=c.u,v=c.v,spd=Math.hypot(u,v);c.speed=spd;
  c.thr=inp.thr;c.brk=inp.brk;c.steer=inp.steer;

  /* ---- vertical: crests can unload the car or throw it into the air ---- */
  const aero=0.5*RHO*u*u;
  /* DRS: the upper wing flap opens on straights, trading downforce for less drag */
  const down=aero*S.clA*(c.drs?0.74:1);
  let lf=1+spd*spd*env.vcurv/G;
  if(c.grounded){
    if(lf<0){c.grounded=false;c.yv=env.roadVy;c.air=0;}
  }
  if(!c.grounded){
    c.air+=dt;c.yv-=G*dt;c.y+=c.yv*dt;
    if(c.y<=env.roadY){c.landing=Math.min(2.5,Math.max(0,env.roadVy-c.yv)/3);c.y=env.roadY;c.grounded=true;lf=1+c.landing;}
    else lf=0;
  }else c.y=env.roadY;
  c.lf=lf;
  const cosB=1/Math.sqrt(1+env.gradR*env.gradR);
  /* banking: centripetal acceleration presses into a banked surface */
  const bankLoad=Math.max(-0.5,-c.ayF*env.gradR/G);
  const mg=S.mass*G*Math.max(0,lf*cosB+(c.grounded?bankLoad:0));
  const dz=c.grounded?down:0;

  /* ---- static + aero loads, load transfer from filtered accelerations ---- */
  const fzF=mg*B/L/2+dz*S.aeroFront/2,fzR=mg*S.a/L/2+dz*(1-S.aeroFront)/2;
  const dLong=S.mass*c.axF*S.hcg/L/2*(c.grounded?1:0);
  const dLatF=S.mass*c.ayF*S.hcg/S.tf*S.roll*(c.grounded?1:0),dLatR=S.mass*c.ayF*S.hcg/S.tr*(1-S.roll)*(c.grounded?1:0);
  /* ay > 0 is acceleration to the right, which loads the left wheels */
  W[0].fz=Math.max(0,fzF-dLong+dLatF);W[1].fz=Math.max(0,fzF-dLong-dLatF);
  W[2].fz=Math.max(0,fzR+dLong+dLatR);W[3].fz=Math.max(0,fzR+dLong-dLatR);

  /* ---- steering with Ackermann ---- */
  const d=c.steer;
  if(Math.abs(d)>1e-4){
    const R=L/Math.tan(Math.abs(d)),sg=Math.sign(d);
    const inner=Math.atan(L/(R-S.tf/2)),outer=Math.atan(L/(R+S.tf/2));
    /* turning right: right wheel is inside */
    W[0].steer=sg*(sg>0?outer:inner);W[1].steer=sg*(sg>0?inner:outer);
  }else{W[0].steer=W[1].steer=0;}
  W[2].steer=W[3].steer=0;

  /* ---- drivetrain ---- */
  const ratio=(c.gear<0?-S.reverse:S.gears[c.gear-1])*S.final;
  const wRear=(W[2].w+W[3].w)/2;
  let rpmW=Math.abs(wRear*ratio)*60/(2*Math.PI);
  if(c.shiftT>0){c.shiftT-=dt;if(c.shiftT<=0){c.gear=c.shiftTo;}}
  let engT=0,coupled=true;
  const thr=c.thr*c.tcCut;
  if(rpmW<1500&&(c.gear===1||c.gear<0)){
    /* clutch slipping: engine held at launch revs, clutch passes engine torque */
    coupled=false;
    const tgt=S.idle+c.thr*3600;
    c.rpm+=(tgt-c.rpm)*Math.min(1,dt*8);
    engT=c.thr>0.02?engineTorque(c.rpm)*thr*Math.min(1,0.35+c.thr):0;
  }else if(rpmW<S.idle*0.9&&c.thr<0.05){
    coupled=false;c.rpm+=(S.idle-c.rpm)*Math.min(1,dt*6);engT=0;
  }else{
    c.rpm=Math.max(S.idle,rpmW);
    engT=c.rpm>S.redline+80?-engineDrag(c.rpm):thr*engineTorque(c.rpm)-(1-thr)*engineDrag(c.rpm);
  }
  if(c.shiftT>0)engT=Math.min(engT,0)*0.3;       // PDK: torque handed over during the shift
  const axleT=engT*ratio*S.eff;
  const ie=coupled?S.ieng*ratio*ratio/2:0;        // engine inertia seen by each rear wheel

  /* LSD: lock torque grows with input torque */
  const lockLim=S.lsdPre+S.lsdRamp*Math.abs(axleT);
  const lock=Math.max(-lockLim,Math.min(lockLim,S.lsdK*(W[2].w-W[3].w)));
  const driveT=[0,0,axleT/2-lock,axleT/2+lock];

  /* ---- tyres ---- */
  let fxB=0,fyB=0,mz=0,heat=0;
  let tcSlip=0,absAny=0;
  for(let i=0;i<4;i++){
    const w=W[i];
    const vwx=u-c.r*w.y,vwy=v+c.r*w.x;            // contact patch velocity, body frame
    const cs=Math.cos(w.steer),sn=Math.sin(w.steer);
    const vl=vwx*cs+vwy*sn,vt=-vwx*sn+vwy*cs;     // along / across the wheel
    const vref=Math.max(Math.abs(vl),3);
    const sr=(w.w*w.r-vl)/vref;
    const ta=vt/vref;
    w.surf=env.surf[i];
    const sf=SURF[w.surf];
    const fz=w.fz;
    const mu=S.mu*(w.front?1:S.muRear)*sf.mu*tempGrip(w.temp)*Math.max(0.6,1-S.loadSens*(fz/S.fz0-1));
    const sx=sr/S.slipPeak,sy=ta/(w.front?TAN_AF:TAN_AR);
    const s=Math.hypot(sx,sy);
    let fx=0,fy=0,k=0;
    if(s>1e-6&&fz>0){
      const F=mu*fz*mf(s);
      fx=F*sx/s;fy=-F*sy/s;
      k=F/s/S.slipPeak;                           // secant stiffness dFx/dslip
    }
    /* wheel spin, semi-implicit in the tyre force */
    const I=w.iw+(w.front?0:ie);
    const kk=k*w.r*w.r/vref;
    let dw=(driveT[i]-fx*w.r)/(I/dt+kk);
    let wn=w.w+dw;
    /* brakes (with ABS modulating each wheel) */
    let bt=(w.front?S.brakeF:S.brakeR)*c.brk;
    if(c.abs&&c.brk>0.05&&spd>2){
      if(sr<-S.slipPeak*1.15)w.abs=Math.max(0.15,w.abs-dt*28);else w.abs=Math.min(1,w.abs+dt*9);
      if(w.abs<0.97)absAny=1;
      bt*=w.abs;
    }else w.abs=1;
    const ieff=I+kk*dt;
    const imp=bt*dt/ieff;
    if(wn>0)wn=Math.max(0,wn-imp);else wn=Math.min(0,wn+imp);
    /* rolling resistance on the wheel */
    const rr=(S.crr+sf.drag*0.15)*fz*w.r*dt/ieff;
    if(wn>0)wn=Math.max(0,wn-rr);else wn=Math.min(0,wn+rr);
    /* force consistent with the new spin */
    let fxN=fx+k*((wn-w.w)*w.r)/vref;
    const cap=mu*fz;
    const mag=Math.hypot(fxN,fy);
    if(mag>cap&&mag>0){fxN*=cap/mag;fy*=cap/mag;}
    w.w=wn;w.spinAngle+=wn*dt;
    w.fx=fxN;w.fy=fy;w.sr=sr;w.sa=Math.atan(ta);w.slip=s;w.load=fz;
    if(!w.front&&sr>S.slipPeak*1.25&&vl>-1)tcSlip=Math.max(tcSlip,sr/S.slipPeak);
    /* to body frame */
    const bx=fxN*cs-fy*sn,by=fxN*sn+fy*cs;
    fxB+=bx;fyB+=by;mz+=w.x*by-w.y*bx;
    /* tyre temperature: sliding power heats, airflow and the track cool */
    const slipV=Math.hypot(w.w*w.r-vl,vt);
    const p=Math.hypot(fxN,fy)*slipV+fz*spd*0.025;
    w.temp+=dt*(p*0.00012-(0.005+0.0004*spd)*(w.temp-20));
    heat+=p;
    /* brake disc temperature, for the glow */
    w.brakeTemp+=dt*(bt*Math.abs(wn)*0.0009-(0.004+0.0009*spd)*(w.brakeTemp-30));
  }
  c.absActive=absAny;
  /* stability control (with TC on): back off the power when the car starts to slide sideways */
  const beta=spd>8?Math.abs(Math.atan2(v,Math.max(u,1))):0;
  if(c.tc&&beta>0.09)tcSlip=Math.max(tcSlip,1+beta*10);
  /* traction control: cut torque while the rears spin up */
  if(c.tc&&tcSlip>0){c.tcCut=Math.max(0.05,c.tcCut-dt*14);c.tcActive=1;}
  else{c.tcCut=Math.min(1,c.tcCut+dt*(c.tc?4:20));c.tcActive=c.tcCut<0.98&&c.tc?1:0;}

  /* ---- chassis ---- */
  /* aero drag and off-road drag */
  const surfDrag=(SURF[env.surf[0]].drag+SURF[env.surf[1]].drag+SURF[env.surf[2]].drag+SURF[env.surf[3]].drag)/4;
  const drag=aero*S.cdA*(c.drs?0.93:1);
  if(spd>0.01){fxB-=drag*u/spd+surfDrag*S.mass*G*0.1*u/Math.max(spd,1);fyB-=drag*v/spd*0.5;}
  /* gravity on slopes */
  if(c.grounded){fxB-=S.mass*G*env.gradF/Math.sqrt(1+env.gradF*env.gradF);fyB-=S.mass*G*env.gradR*cosB;}
  const axB=fxB/S.mass,ayB=fyB/S.mass;
  /* to world */
  c.vx+=(axB*ch-ayB*sh)*dt;c.vz+=(axB*sh+ayB*ch)*dt;
  c.r+=mz/S.izz*dt;
  if(!c.grounded)c.r*=1-dt*0.3;
  /* standstill: let static friction hold the car */
  if(spd<0.4&&c.thr<0.05&&(c.brk>0.1||spd<0.15)){c.vx*=0.8;c.vz*=0.8;c.r*=0.8;}
  c.x+=c.vx*dt;c.z+=c.vz*dt;c.h+=c.r*dt;
  /* accelerations as felt (for load transfer, the HUD and the camera) */
  c.ax=axB;c.ay=ayB;
  const kf=Math.min(1,dt/0.045);
  c.axF+=(axB-c.axF)*kf;c.ayF+=(ayB-c.ayF)*kf;
  c.heat=heat;
  c.rpmW=rpmW;

  /* ---- automatic PDK ---- */
  if(c.autoShift&&c.shiftT<=0&&c.gear>0){
    const up=S.redline-250;
    if(c.gear<7&&c.rpm>up&&coupled&&c.thr>0.1)shift(c,c.gear+1);
    else if(c.gear>1){
      const lower=S.gears[c.gear-2]*S.final*Math.abs(wRear)*60/(2*Math.PI);
      if(c.brk>0.1?lower<7700:c.thr>0.6?lower<6900&&c.rpm<5400:c.rpm<3000&&lower<8000)shift(c,c.gear-1);
    }
  }
}
export function shift(c,g){
  if(g<1||g>7||c.shiftT>0||g===c.gear||c.gear<0)return;
  /* refuse a downshift that would over-rev */
  const wRear=(c.wheels[2].w+c.wheels[3].w)/2;
  if(g<c.gear&&S.gears[g-1]*S.final*Math.abs(wRear)*60/(2*Math.PI)>S.redline+200)return;
  c.shiftTo=g;c.shiftT=g>c.gear?0.09:0.12;c.lastShift=g>c.gear?1:-1;c.shiftCount=(c.shiftCount||0)+1;
}

/* put the car at rest on a pose */
export function placeCar(c,x,z,y,h){
  Object.assign(c,{x,z,y,h,vx:0,vz:0,r:0,yv:0,grounded:true,gear:1,rpm:S.idle,shiftT:0,tcCut:1,axF:0,ayF:0});
  c.wheels.forEach(w=>{w.w=0;w.abs=1;});
}
/* set rolling at speed along the heading (resets, tests) */
export function setSpeed(c,sp){
  c.vx=Math.cos(c.h)*sp;c.vz=Math.sin(c.h)*sp;
  c.wheels.forEach(w=>w.w=sp/w.r);
  let g=1;while(g<7&&S.gears[g-1]*S.final*sp/S.rr*60/(2*Math.PI)>7600)g++;c.gear=g;
}
