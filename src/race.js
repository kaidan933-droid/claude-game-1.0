import {startLights,LEN} from './track.js';
import {riders,resetRider} from './bikes.js';
import {controls} from './controls.js';

/* menu/lobby -> countdown -> racing -> finished (when our rider takes the flag; the others keep running).
   Online, the host picks the light-out delay and every machine runs its own countdown from 'start'. */
export const race={state:'menu',t:0,time:0,lit:0,goAt:6,laps:5,finishOrder:[],onFinish:null,spectating:false};

function setLights(n){
  race.lit=n;
  startLights.forEach((m,i)=>{m.emissiveIntensity=i<n?3.5:0;});
}
export const randomGoAt=()=>6+Math.random()*1.2;
export function resetRace(goAt=randomGoAt()){
  riders.forEach(resetRider);
  Object.assign(race,{state:'countdown',t:0,time:0,goAt,finishOrder:[],spectating:false});
  setLights(0);controls.takeReset();
}
export function standings(){
  return [...riders].sort((a,b)=>{
    const fa=a.finishTime!==null,fb=b.finishTime!==null;
    if(fa&&fb)return a.finishTime-b.finishTime;
    if(fa!==fb)return fa?-1:1;
    return b.s-a.s;
  });
}
/* call after the bikes have moved; lap and finish times are interpolated to the line crossing */
export function stepRace(dt){
  if(race.state==='menu'||race.state==='lobby')return;
  if(race.state==='countdown'){
    race.t+=dt;
    const lit=Math.min(5,Math.floor(race.t));            // one light a second
    if(lit!==race.lit)setLights(lit);
    if(race.t>=race.goAt){setLights(0);race.state='racing';race.time=0;controls.takeReset();}
    return;
  }
  race.time+=dt;
  for(const r of riders){
    while(r.lapCount<race.laps&&Math.floor(r.s/LEN)>r.lapCount){
      const k=++r.lapCount,t=race.time-(r.s-k*LEN)/Math.max(r.v,1);
      r.lapTimes.push(t-r.lapStart);r.lapStart=t;
      if(k>=race.laps){
        r.finishTime=t;race.finishOrder.push(r);
        if(r.ctrl==='local'&&!r.auto){r.auto=true;r.crash=null;race.state='finished';race.onFinish&&race.onFinish(r);}
      }
    }
  }
}
