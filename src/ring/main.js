import * as THREE from 'three';
import {camera,scene,sky,sun,sunDir,fogSun,patchAll,clamp,hexStr,fmt,skyUniforms,renderer} from './core.js';
import {updateScenery,sunVisibility,startLights} from './scenery.js';
import {T,cars,DRIVERS,setupCars,resetCars,step,race,DT,standings,resetToTrack,shift} from './sim/world.js';
import {buildCar} from './carmodel.js';
import {updateCamera,cycle,camMode,setLookBack,snap} from './cameras.js';
import {render} from './post.js';
import {updateEffects,clearEffects} from './effects.js';
import {setupAudio,updateAudio,rebindAudio} from './audio.js';
import {readInput,resetInput,on,lookBack,opts as inOpts,setAssist} from './input.js';
import {updateHud,drawMap,flash,resetGaps,trackGaps} from './hud.js';

const $=id=>document.getElementById(id);
const PAINTS=[['Ice Grey',0x66737b],['Shark Blue',0x2f6fb8],['Python Green',0x3fae3a],['Guards Red',0xc8202a],['Signal Yellow',0xf2c230],['GT Silver',0xa9adb2],['Black',0x161618]];

/* ---------------- settings ---------------- */
const set={laps:2,diff:1,auto:1,tc:true,abs:true,assist:inOpts.assist,paint:0};
try{Object.assign(set,JSON.parse(localStorage.getItem('ring-setup')||'{}'));}catch(e){}
if(!(set.paint>=0&&set.paint<7))set.paint=0;
const save=()=>{try{localStorage.setItem('ring-setup',JSON.stringify(set));}catch(e){}};
function syncMenu(){
  document.querySelectorAll('.seg[data-opt]').forEach(seg=>seg.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.v===+set[seg.dataset.opt]))));
  document.querySelectorAll('[data-tog]').forEach(b=>b.setAttribute('aria-pressed',String(!!set[b.dataset.tog])));
  document.querySelectorAll('#swatches button').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===set.paint)));
}
$('swatches').innerHTML=PAINTS.map(p=>'<button type="button"><i style="background:'+hexStr(p[1])+'"></i>'+p[0]+'</button>').join('');
document.querySelectorAll('#swatches button').forEach((b,i)=>b.addEventListener('click',()=>{set.paint=i;save();syncMenu();applyPaint();}));
document.querySelectorAll('.seg[data-opt] button').forEach(b=>b.addEventListener('click',()=>{set[b.parentElement.dataset.opt]=+b.dataset.v;save();syncMenu();}));
document.querySelectorAll('[data-tog]').forEach(b=>b.addEventListener('click',()=>{set[b.dataset.tog]=!set[b.dataset.tog];save();syncMenu();}));
syncMenu();

/* ---------------- cars ---------------- */
const PLAYER_GRID=5;     // start 6th
function gridOrder(){const ai=[1,2,3,4,5,6,7,8,9];const o=ai.slice(0,PLAYER_GRID).concat([0],ai.slice(PLAYER_GRID));return o;}
setupCars({difficulty:set.diff,gridOrder:gridOrder()});
let player=cars.find(e=>e.human);
const vis=new Map();
function makeVisuals(){
  for(const e of cars){
    if(vis.has(e.id))continue;
    const v=buildCar(e.color,e.num,{caliper:e.human?0xf2c230:0xc8202a});
    scene.add(v.root);patchAll(v.root);vis.set(e.id,v);
  }
}
DRIVERS[0].color=PAINTS[set.paint][1];player.color=DRIVERS[0].color;
makeVisuals();
function applyPaint(){
  const col=PAINTS[set.paint][1];DRIVERS[0].color=col;cars.forEach(e=>{if(e.human)e.color=col;});
  vis.get(0).paint.color.set(col).convertSRGBToLinear();
}
applyPaint();
patchAll(scene);

/* ---------------- race flow ---------------- */
let state='menu',paused=false,lightT=0,goAt=0,resultsT=-1;
function applyCarSettings(){
  const c=player.car;c.tc=set.tc;c.abs=set.abs;c.autoShift=!!set.auto;setAssist(set.assist);
}
function newRace(){
  setupCars({difficulty:set.diff,gridOrder:gridOrder()});
  player=cars.find(e=>e.human);applyPaint();
  rebindAudio(cars);
  race.laps=set.laps;race.state='grid';race.time=0;race.lit=0;race.finishOrder=[];
  lightT=0;goAt=5.6+Math.random()*1.8;resultsT=-1;
  applyCarSettings();resetInput();resetGaps();clearEffects();snap();
  startLights.forEach(m=>m.emissiveIntensity=0);
  $('results').hidden=true;$('menu').hidden=true;$('pausemenu').hidden=true;
  state='race';setPaused(false);
}
function toMenu(){state='menu';$('menu').hidden=false;$('pausemenu').hidden=true;$('results').hidden=true;setPaused(false);
  setupCars({difficulty:set.diff,gridOrder:gridOrder()});player=cars.find(e=>e.human);applyPaint();race.state='grid';race.lit=0;$('go').focus();}
function setPaused(p){paused=p;$('pause').textContent=p?'Play':'Pause';if(state==='race')$('pausemenu').hidden=!p;}
$('go').addEventListener('click',newRace);
$('again').addEventListener('click',newRace);
$('setup2').addEventListener('click',toMenu);
$('resume').addEventListener('click',()=>setPaused(false));
$('restart').addEventListener('click',newRace);
$('tomenu').addEventListener('click',toMenu);
$('pause').addEventListener('click',()=>{if(state==='race')setPaused(!paused);});
on('pause',()=>{if(state==='race'&&$('results').hidden)setPaused(!paused);});
on('enter',()=>{if(state==='menu')newRace();else if(!$('results').hidden)newRace();});
on('camera',cycle);
on('reset',()=>{if(state==='race'&&!paused&&race.state!=='grid'){resetToTrack(player,0);resetInput();flash('Back on track',false,1.2);}});
/* manual shifting on the arrows (and E/Q, paddles); shifting while in auto switches to manual */
function manual(){const c=player.car;if(c.autoShift){c.autoShift=false;set.auto=0;save();syncMenu();flash('Manual gearbox: up / down arrows',false,1.6);}}
on('up',()=>{if(state!=='race')return;const c=player.car;manual();if(c.gear<0){c.gear=1;return;}shift(c,c.gear+1);});
on('down',()=>{if(state!=='race')return;const c=player.car;manual();shift(c,c.gear-1);});
on('tc',()=>{set.tc=!set.tc;player.car.tc=set.tc;save();syncMenu();flash('Traction control '+(set.tc?'on':'off'),false,1.2);});
on('abs',()=>{set.abs=!set.abs;player.car.abs=set.abs;save();syncMenu();flash('ABS '+(set.abs?'on':'off'),false,1.2);});
on('gearbox',()=>{set.auto=set.auto?0:1;player.car.autoShift=!!set.auto;save();syncMenu();flash(set.auto?'PDK automatic':'Manual: up / down arrows to shift',false,1.4);});
on('assist',()=>{set.assist=!set.assist;setAssist(set.assist);save();syncMenu();flash('Steering help '+(set.assist?'on':'off'),false,1.2);});
race.onFinish=()=>{resultsT=2.5;const pos=standings().indexOf(player)+1;flash(pos===1?'Winner!':'Finished P'+pos,false,3);};

/* ---------------- results ---------------- */
let resKey='';
function updateResults(){
  const el=$('results');if(el.hidden)return;
  const order=standings(),win=order[0].finish;
  const rows=order.map((e,i)=>{const done=e.finish!==null,best=e.lapTimes.length?Math.min(...e.lapTimes):null;
    return '<tr class="'+(e===player?'me':'')+'"><td>'+(i+1)+'</td><td><i style="background:'+hexStr(e.color)+'"></i>'+e.name+'</td><td>'+(done?fmt(e.finish):'running')+'</td><td>'+(done&&win!==null?(i?'+'+(e.finish-win).toFixed(3):'Winner'):'')+'</td><td>'+(best===null?'':fmt(best))+'</td></tr>';}).join('');
  if(rows===resKey)return;resKey=rows;
  const place=order.indexOf(player)+1;
  el.querySelector('h2').textContent=place===1?'Victory':'Finished P'+place;
  el.querySelector('tbody').innerHTML=rows;
}

/* ---------------- visuals per car ---------------- */
const q=new THREE.Quaternion(),eu=new THREE.Euler(0,0,0,'YXZ');
function syncCar(e,dt){
  const v=vis.get(e.id),c=e.car;
  v.root.position.set(c.x,c.y,c.z);
  /* sit on the road's slope and bank */
  const i=e.idx,tx=T.TX[i],tz=T.TZ[i],nx=T.NX[i],nz=T.NZ[i],fx=Math.cos(c.h),fz=Math.sin(c.h);
  const gx=T.DY[i]*tx+T.BANK[i]*nx,gz=T.DY[i]*tz+T.BANK[i]*nz;
  const gF=gx*fx+gz*fz,gR=gx*-fz+gz*fx;
  const air=c.grounded?0:1;
  eu.set(-Math.atan(gF)-air*clamp(c.yv*0.01,-0.08,0.08),Math.PI/2-c.h,-Math.atan(gR));
  v.root.quaternion.setFromEuler(eu);
  /* body on its springs */
  v.body.rotation.set(clamp(-c.axF*0.0022,-0.035,0.035),0,clamp(-c.ayF*0.0026,-0.045,0.045));
  v.body.position.y=clamp(-(c.lf-1)*0.03,-0.04,0.05)+Math.sin(performance.now()*0.05+e.id)*(c.wheels.some(w=>w.surf===1)?0.006:0)+(c.wheels.some(w=>w.surf>=2)?Math.sin(performance.now()*0.03)*0.012*Math.min(1,c.speed/10):0);
  v.wheels.forEach((W,k)=>{
    const w=c.wheels[k];
    W.spin.rotation.x+=(W.left?1:-1)*w.w*dt;
    if(W.front)W.g.rotation.y=(W.left?0:Math.PI)-w.steer;
    W.disc.material.emissiveIntensity=clamp((w.brakeTemp-380)/350,0,1)*2.5;
  });
  v.tail.emissiveIntensity=c.brk>0.05?7:0.8;
  v.wingFlap.rotation.x+=((c.drs?0.02:0.42)-v.wingFlap.rotation.x)*Math.min(1,dt*12);
  v.steeringWheel.rotation.z=-c.steer*11;
  /* cheap LOD: brake parts and the steering wheel only up close */
  const dc=camera.position.distanceToSquared(v.root.position),nearCar=dc<60*60;
  if(v.lodNear!==nearCar){v.lodNear=nearCar;v.wheels.forEach(W=>{W.disc.visible=W.cal.visible=nearCar;});}
  v.steeringWheel.visible=e===player&&camMode()==='cockpit';
}

/* ---------------- loop ---------------- */
setupAudio(()=>cars);
let last=performance.now(),acc=0,visT=0,sunVis=1,wrongT=0;
const tmpV=new THREE.Vector3();
if(import.meta.env.DEV)window.__ring={cars,race,T,step,player:()=>player,camera,newRace,scene,THREE,camMode,updateCamera,vis,renderer};
function frame(now){
  requestAnimationFrame(frame);
  const dt=clamp((now-last)/1000,0,0.1);last=now;
  const running=state==='race'&&!paused;
  /* lights */
  if(running&&race.state==='grid'){
    lightT+=dt;const lit=Math.min(5,Math.floor(lightT));
    if(lit!==race.lit){race.lit=lit;startLights.forEach((m,k)=>m.emissiveIntensity=k<lit?14:0);}
    if(lightT>=goAt){race.state='racing';race.time=0;race.lit=0;startLights.forEach(m=>m.emissiveIntensity=0);}
  }
  if(running){
    acc+=dt;let n=0;
    const inp=readInput(player,dt);
    while(acc>=DT&&n<40){step(DT,inp);acc-=DT;n++;}
    if(n>=40)acc=0;
    trackGaps();
    if(resultsT>0){resultsT-=dt;if(resultsT<=0){$('results').hidden=false;resKey='';updateResults();$('again').focus();}}
    /* wrong way */
    const hd=Math.atan2(Math.sin(player.car.h-Math.atan2(T.TZ[player.idx],T.TX[player.idx])),Math.cos(player.car.h-Math.atan2(T.TZ[player.idx],T.TX[player.idx])));
    if(Math.abs(hd)>2&&player.car.speed>3&&race.state==='racing'){wrongT+=dt;if(wrongT>1.5){flash('Wrong way, press R',true,0.5);}}else wrongT=0;
  }
  for(const e of cars)syncCar(e,running?dt:0);
  setLookBack(lookBack());
  if(!window.__camHold)updateCamera(dt,player,vis.get(player.id));
  /* scene follows the camera */
  sky.position.copy(camera.position);
  skyUniforms.time.value+=dt;
  sun.target.position.copy(vis.get(player.id).root.position);
  sun.position.copy(sun.target.position).addScaledVector(sunDir,500);
  camera.updateMatrixWorld();
  fogSun.sunView.value.copy(sunDir).transformDirection(camera.matrixWorldInverse);
  updateScenery(camera);
  visT-=dt;if(visT<=0){visT=1/30;sunVis=sunVisibility(camera.position);}
  updateEffects(running?dt:0,cars,cars.map(e=>vis.get(e.id)),camera.position);
  const cm=camMode();
  render(dt,{sunVis,cockpit:cm==='cockpit',blur:(cm==='chase'||cm==='near'||cm==='cockpit'||cm==='bonnet')?Math.max(0,player.car.speed/80-0.65)*0.05:0});
  try{updateAudio(camera,player,race,!running,cm==='cockpit'||cm==='bonnet');}catch(err){console.error(err);}
  try{updateHud(player,dt);drawMap(player);updateResults();}catch(err){console.error(err);}
}
requestAnimationFrame(frame);
$('go').focus();
