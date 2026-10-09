import {clamp,renderer,scene,camera,sky,sun,sunDir} from './core.js';
import './track.js';
import './scenery.js';
import {riders,player,stepRider} from './bikes.js';
import {updateCamera} from './cameras.js';
import {updateHud,drawMap} from './hud.js';

let paused=false,simTime=0;
const pauseBtn=document.getElementById('pause');
function setPaused(p){paused=p;pauseBtn.textContent=p?'Play':'Pause';}
pauseBtn.addEventListener('click',()=>setPaused(!paused));
window.addEventListener('keydown',e=>{
  if(e.code==='Space'&&!(e.target instanceof HTMLButtonElement)){e.preventDefault();setPaused(!paused);}
});
try{if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)setPaused(true);}catch(e){}

riders.forEach(r=>stepRider(r,0.016));
let last=performance.now();
function frame(now){
  requestAnimationFrame(frame);
  const dt=clamp((now-last)/1000,0,0.05);last=now;
  const sdt=paused?0:dt;simTime+=sdt;
  if(sdt>0)riders.forEach(r=>stepRider(r,sdt));
  updateCamera(dt);
  sky.position.copy(camera.position);
  sun.target.position.copy(player.g.position);sun.position.copy(player.g.position).addScaledVector(sunDir,300);
  renderer.render(scene,camera);
  try{updateHud(simTime);drawMap();}catch(err){console.error(err);}
}
requestAnimationFrame(frame);
