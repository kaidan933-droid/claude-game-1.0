import {clamp,camera,sky,sun,sunDir} from './core.js';
import {LEN,VMAX} from './track.js';
import './scenery.js';
import {riders,player,stepRider,interact,resetRider,setSlot} from './bikes.js';
import {onLocalFinish,resultsAction,netTick,isOnline} from './lobby.js';
import {updateCamera,snapCamera,camModeNow} from './cameras.js';
import {render} from './post.js';
import {updateEffects,clearEffects} from './effects.js';
import {setupAudio,updateAudio} from './audio.js';
import {hd,loadHD,setHD,showHD} from './assets.js';
/* HD (Poly Haven) assets: start loading straight away; turning them off needs a reload */
{const b=document.getElementById('hdBtn');
  const label=()=>{b.textContent='HD assets: '+(hd.enabled?'On':'Off');};label();
  b.addEventListener('click',()=>{if(hd.enabled&&hd.started){setHD(false);location.reload();return;}setHD(!hd.enabled);label();});
  showHD();loadHD();}
import {race,stepRace} from './race.js';
import {updateResults} from './results.js';
import {updateHud,drawMap} from './hud.js';

const NORENDER=new URLSearchParams(location.search).has('norender');   // headless multiplayer tests: simulate only
let paused=false;
const pauseBtn=document.getElementById('pause');
function setPaused(p){if(p&&isOnline())return;paused=p;pauseBtn.textContent=p?'Play':'Pause';}   // online races can't pause
pauseBtn.addEventListener('click',()=>setPaused(!paused));
document.getElementById('again').addEventListener('click',resultsAction);
window.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT')return;
  if(e.code==='Enter'&&race.state==='finished'&&!document.getElementById('again').hidden){e.preventDefault();resultsAction();}
  else if(e.code==='Space'&&!(e.target instanceof HTMLButtonElement)){e.preventDefault();setPaused(!paused);}
});
try{if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)setPaused(true);}catch(e){}
race.onFinish=onLocalFinish;
setupAudio(riders);
riders.forEach(resetRider);                 // bikes wait on the grid behind the menu
if(import.meta.env.DEV)window.__apex={race,riders,get player(){return player;},LEN,stepRider,interact,stepRace,updateEffects,setSlot,hd};   // dev-only hook for poking the race from the console

let last=performance.now();
function frame(now){
  requestAnimationFrame(frame);
  const dt=clamp((now-last)/1000,0,0.05);last=now;
  const sdt=paused&&!isOnline()?0:dt;
  if(sdt>0){
    if(race.state==='racing'||race.state==='finished'){riders.forEach(r=>stepRider(r,sdt));interact();}   // bikes sit on the grid until lights out
    else if(isOnline())riders.forEach(r=>{if(r.ctrl==='remote')stepRider(r,sdt);});
    stepRace(sdt);
    updateEffects(sdt,riders);
  }
  netTick(dt);
  updateCamera(dt);
  sky.position.copy(camera.position);
  sun.target.position.copy(player.g.position);sun.position.copy(player.g.position).addScaledVector(sunDir,300);
  const cm=camModeNow();
  if(!NORENDER)render(player.v/VMAX,cm==='chase'||cm==='onboard');
  try{updateAudio(camera,player,race,paused);}catch(err){console.error(err);}
  try{updateHud();drawMap();if(race.state==='finished')updateResults();}catch(err){console.error(err);}
}
requestAnimationFrame(frame);
