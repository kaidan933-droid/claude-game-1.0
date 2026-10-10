/* Motorcycle physics shared by every rider. Numbers are in the range of a 457 cc parallel twin
   sport bike (Aprilia RS 457 class) with a rider: about 185-190 km/h flat out, about 5 s to 100 km/h. */
export const G=9.81;
export const MASS=255;                    // kg, bike + rider
const RHO=1.2,CDA=0.35,CRR=0.015;         // tucked rider
const LAUNCH=0.9*G;                       // m/s2, wheelie / traction limit off the line
export const IDLE=1300,REDLINE=10500,RPM_MAX=11000;
/* power at the rear wheel (kW) against rpm */
const PCURVE=[[1300,3],[3000,9],[4500,15],[6000,21],[7000,25.5],[8000,29],[9400,31],[10500,28.5],[11000,20]];
function powerAt(rpm){
  if(rpm<=PCURVE[0][0])return PCURVE[0][1]*1000;
  for(let i=1;i<PCURVE.length;i++)if(rpm<=PCURVE[i][0]){const[a,pa]=PCURVE[i-1],[b,pb]=PCURVE[i];return (pa+(pb-pa)*(rpm-a)/(b-a))*1000;}
  return PCURVE[PCURVE.length-1][1]*1000;
}
/* 6-speed box: road speed (km/h) at the redline in each gear */
export const GEAR_TOP=[75,105,130,152,172,195];
const UP_RPM=10100,DOWN_RPM=5400,SHIFT_CUT=0.08;
export const rpmInGear=(v,gear)=>v/(GEAR_TOP[gear-1]/3.6)*REDLINE;

export function dragAccel(v,aeroScale=1){return (0.5*RHO*CDA*v*v*aeroScale+CRR*MASS*G*(v>0.05?1:0))/MASS;}

/* automatic gearbox + engine: updates r.gear, r.rpm, r.shiftT, r.blip and returns the drive
   (or engine-braking) acceleration at the rear tyre for throttle 0..1 */
export function drivetrain(r,v,thr,dt){
  if(!r.gear)r.gear=1;
  r.shiftT=Math.max(0,(r.shiftT||0)-dt);r.blip=Math.max(0,(r.blip||0)-dt);
  let rpm=rpmInGear(v,r.gear);
  if(rpm>UP_RPM&&r.gear<6&&thr>0.05){r.gear++;r.shiftT=SHIFT_CUT;rpm=rpmInGear(v,r.gear);}
  else if(r.gear>1&&rpm<DOWN_RPM&&rpmInGear(v,r.gear-1)<UP_RPM-600){r.gear--;r.blip=0.15;rpm=rpmInGear(v,r.gear);}
  /* clutch slips in first gear while pulling away */
  if(r.gear===1)rpm=Math.max(rpm,thr>0.05?IDLE+thr*5200:IDLE);
  rpm=Math.max(IDLE,Math.min(RPM_MAX,rpm));
  r.rpm+=(rpm+(r.blip>0?1500:0)-r.rpm)*(1-Math.exp(-dt*14));
  if(r.shiftT>0)return 0;
  if(thr>0.05)return Math.min(LAUNCH,thr*powerAt(rpm)/Math.max(v,1)/MASS);
  return v>1?-(0.25+1.1*rpm/REDLINE):0;     // engine braking grows with revs
}

/* brakes: dual-channel ABS discs. Pressure builds the longer the key is held and the curve is
   progressive, so a tap only scrubs a little speed */
export const BRAKE_RISE=1.6,BRAKE_FALL=4;
export const brakeDecel=p=>1.12*G*Math.pow(p,1.5);

/* sport tyres: peak friction per surface, and what's left once sliding */
export const MU={asphalt:1.15,curb:0.95,grass:0.45,gravel:0.4};
export const SLIDE_RATIO=0.8;
/* lean: footpeg feelers touch at 48 deg, nothing goes past 52 deg. Full steering aims for what dry
   asphalt holds (about 48 deg), so combined braking or throttle, curbs and grass are what slide */
export const PHI_SCRAPE=0.84,PHI_MAX=0.91,PHI_RIDER=Math.atan(0.97*1.15);
export const R_MIN=2.6;                   // m, tightest turn at full steering lock
