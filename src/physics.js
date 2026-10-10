/* Scooter physics shared by the player and the AI. Numbers are in the range of a 278 cc
   Vespa GTS 300 with a rider: about 125 km/h flat out and about 10-11 s to 100 km/h. */
export const G=9.81;
export const MASS=240;                    // kg, scooter + rider
const F_LAUNCH=860;                       // N at the rear tyre while the CVT is at its low ratio
const P_WHEEL=15600;                      // W at the rear tyre
const RHO=1.2,CDA=0.55,CRR=0.015;
export const ENGINE_BRAKE=0.35;           // m/s2 when coasting off throttle
export const VTOP=35.2;                   // m/s, where power meets drag

/* forward acceleration from the engine at throttle 0..1 */
export function engineAccel(v,thr){return thr*Math.min(F_LAUNCH,P_WHEEL/Math.max(v,0.5))/MASS;}
/* aero drag + rolling resistance, as a deceleration; aeroScale < 1 when slipstreaming */
export function dragAccel(v,aeroScale=1){return (0.5*RHO*CDA*v*v*aeroScale+CRR*MASS*G*(v>0.05?1:0))/MASS;}

/* CVT: revs climb to the shift band on throttle and stay there while the ratio changes */
const IDLE=1800;
export const RPM_MAX=8400;
export function rpmTarget(v,thr){
  if(thr>0.05)return IDLE+thr*(5600+1000*Math.min(1,v/VTOP));
  return v>4?Math.min(6000,3000+v*85):IDLE;     // overrun with the clutch still in, then idle
}

/* brakes: linked front/rear discs with ABS. Pressure builds the longer the key is held and
   the deceleration curve is progressive, so a tap only scrubs a little speed */
export const BRAKE_RISE=1.6,BRAKE_FALL=4;
export const brakeDecel=p=>0.95*G*Math.pow(p,1.5);

/* tyres: peak friction per surface, and what's left once sliding */
export const MU={asphalt:1.0,curb:0.85,grass:0.45,gravel:0.4};
export const SLIDE_RATIO=0.8;
/* lean: the floorboard and stand touch down at 35 deg and nothing goes past 39 deg */
export const PHI_SCRAPE=0.61,PHI_MAX=0.68;
export const R_MIN=2.0;                   // m, tightest turn at full steering lock
