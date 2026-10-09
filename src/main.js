import {clamp,renderer,scene,camera,sky,sun,sunDir} from './core.js';
import {LEN} from './track.js';
import './scenery.js';
import {riders,player,stepRider} from './bikes.js';
import {updateCamera,snapCamera} from './cameras.js';
import {race,resetRace,stepRace} from './race.js';
import {showResults,hideResults,updateResults} from './results.js';
import {updateHud,drawMap} from './hud.js';

let paused=false;
const pauseBtn=document.getElementById('pause');
function setPaused(p){paused=p;pauseBtn.textContent=p?'Play':'Pause';}
pauseBtn.addEventListener('click',()=>setPaused(!paused));
function again(){hideResults();resetRace();snapCamera();}
document.getElementById('again').addEventListener('click',again);
window.addEventListener('keydown',e=>{
  if(e.code==='Enter'&&race.state==='finished'){e.preventDefault();again();}
  else if(e.code==='Space'&&!(e.target instanceof HTMLButtonElement)){e.preventDefault();setPaused(!paused);}
});
try{if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)setPaused(true);}catch(e){}
race.onFinish=showResults;
if(import.meta.env.DEV)window.__apex={race,riders,player,LEN};   // dev-only hook for poking the race from the console

resetRace();
let last=performance.now();
function frame(now){
  requestAnimationFrame(frame);
  const dt=clamp((now-last)/1000,0,0.05);last=now;
  const sdt=paused?0:dt;
  if(sdt>0){
    if(race.state!=='countdown')riders.forEach(r=>stepRider(r,sdt));   // bikes sit on the grid until lights out
    stepRace(sdt);
  }
  updateCamera(dt);
  sky.position.copy(camera.position);
  sun.target.position.copy(player.g.position);sun.position.copy(player.g.position).addScaledVector(sunDir,300);
  renderer.render(scene,camera);
  try{updateHud();drawMap();if(race.state==='finished')updateResults();}catch(err){console.error(err);}
}
requestAnimationFrame(frame);
