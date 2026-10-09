import {startLights,LEN} from './track.js';
import {riders,player,resetRider} from './bikes.js';
import {controls} from './controls.js';

/* countdown -> racing -> finished (when the player takes the flag; the others keep running) */
export const race={state:'countdown',t:0,time:0,lit:0,goAt:6,laps:5,finishOrder:[],onFinish:null};

function setLights(n){
  race.lit=n;
  startLights.forEach((m,i)=>{m.emissiveIntensity=i<n?3.5:0;});
}
export function resetRace(){
  riders.forEach(resetRider);
  Object.assign(race,{state:'countdown',t:0,time:0,goAt:6+Math.random()*1.2,finishOrder:[]});
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
        if(r===player){r.auto=true;r.crash=null;race.state='finished';race.onFinish&&race.onFinish();}
      }
    }
  }
}
