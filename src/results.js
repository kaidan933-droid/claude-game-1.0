import {fmt,hexStr} from './core.js';
import {race,standings} from './race.js';
import {player} from './bikes.js';

const el=document.getElementById('results');
const ORD=n=>n+(['th','st','nd','rd'][n]||'th');
let key='';
export function showResults(){el.hidden=false;key='';updateResults();const b=el.querySelector('button');if(!b.hidden)b.focus();}
/* label for the results button; null hides it (online clients wait for the host) */
export function setResultsAction(label){
  const b=el.querySelector('button'),h=el.querySelector('.hint2');
  b.hidden=!label;if(label)b.textContent=label;h.textContent=label?'or press Enter':'Waiting for the host to start the next race…';
}
export function hideResults(){el.hidden=true;}
export function updateResults(){
  if(el.hidden)return;
  const order=standings(),win=order[0].finishTime;
  const rows=order.map((r,i)=>{
    const done=r.finishTime!==null,best=r.lapTimes.length?Math.min(...r.lapTimes):null;
    return '<tr class="'+(r===player?'me':'')+'"><td>'+(i+1)+'</td><td><i style="background:'+hexStr(r.color)+'"></i>'+r.name+(r.level?' <small>'+r.level+'</small>':'')+'</td>'+
      '<td>'+(done?fmt(r.finishTime):'Lap '+Math.min(race.laps,r.lapCount+1)+' of '+race.laps)+'</td>'+
      '<td>'+(done?(i?'+'+(r.finishTime-win).toFixed(3):'Winner'):'')+'</td><td>'+(best===null?'':fmt(best))+'</td></tr>';
  }).join('');
  const place=order.indexOf(player)+1,k=rows+place;
  if(k===key)return;key=k;
  el.querySelector('h2').textContent=place===1?'Victory':'Finished '+ORD(place);
  el.querySelector('tbody').innerHTML=rows;
}
