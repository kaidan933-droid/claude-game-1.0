import {SPEC} from './sim/car.js';
import {limitSteer,shift} from './sim/world.js';

/* Keyboard and gamepad -> throttle, brake, steering.
   Keys are digital, so pedals ramp like a foot would and steering moves at a speed-dependent rate.
   With the steering assist on, lock is capped near the front tyres' peak slip angle (what a driver
   feels through the wheel); with hands off, the wheels self-align with the direction of travel. */
const down=new Set();
const MAP={KeyW:'thr',KeyS:'brk',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right'};
const handlers={};
export function on(name,fn){(handlers[name]=handlers[name]||[]).push(fn);}
const fire=n=>(handlers[n]||[]).forEach(f=>f());
window.addEventListener('keydown',e=>{
  if(e.ctrlKey&&!['ControlLeft','ControlRight'].includes(e.code)||e.metaKey||e.altKey)return;
  if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement)return;
  if(MAP[e.code]){e.preventDefault();down.add(MAP[e.code]);return;}
  if(e.repeat)return;
  const k={ArrowUp:'up',ArrowDown:'down',KeyE:'up',ShiftLeft:'up',ShiftRight:'up',KeyQ:'down',ControlLeft:'down',ControlRight:'down',KeyR:'reset',KeyC:'camera',KeyB:'lookback',
    KeyP:'pause',Escape:'pause',KeyT:'tc',KeyY:'abs',KeyG:'gearbox',KeyH:'assist',Enter:'enter',Space:'pause'}[e.code];
  if(k){if(k==='pause'&&e.target instanceof HTMLButtonElement&&e.code==='Space')return;e.preventDefault();if(k==='lookback')down.add('lookback');else fire(k);}
});
window.addEventListener('keyup',e=>{if(MAP[e.code])down.delete(MAP[e.code]);if(e.code==='KeyB')down.delete('lookback');});
window.addEventListener('blur',()=>down.clear());

/* touch: on-screen pedals, steer and shift buttons (shown on touch devices) */
const touches=new Map();
function touchState(){const s={left:0,right:0,thr:0,brk:0};for(const t of touches.values())s[t]=1;return s;}
document.querySelectorAll('[data-touch]').forEach(el=>{
  const k=el.dataset.touch;
  const start=e=>{e.preventDefault();if(k==='up'||k==='down'){fire(k);el.classList.add('on');return;}touches.set(e.pointerId+':'+k,k);el.classList.add('on');try{el.setPointerCapture(e.pointerId);}catch(_){}};
  const end=e=>{touches.delete(e.pointerId+':'+k);el.classList.remove('on');};
  el.addEventListener('pointerdown',start);el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);el.addEventListener('lostpointercapture',end);
});
export const opts={assist:true};
try{opts.assist=localStorage.getItem('ring-assist')!=='0';}catch(e){}
export function setAssist(b){opts.assist=b;try{localStorage.setItem('ring-assist',b?'1':'0');}catch(e){}}

let thr=0,brk=0,steerIn=0,steer=0,padPrev=[],usingPad=false,revHold=0;
export const lookBack=()=>down.has('lookback');
export const usingGamepad=()=>usingPad;
function pad(){
  const gps=navigator.getGamepads?navigator.getGamepads():[];
  for(const g of gps){if(!g||!g.connected)continue;
    const b=i=>g.buttons[i]?g.buttons[i].value:0,pressed=i=>g.buttons[i]&&g.buttons[i].pressed;
    const sx=g.axes[0]||0;
    const st=Math.abs(sx)<0.06?0:Math.sign(sx)*Math.pow((Math.abs(sx)-0.06)/0.94,1.4);
    const res={thr:b(7),brk:b(6),steer:st};
    const edges=[[5,'up'],[4,'down'],[3,'camera'],[2,'reset'],[9,'pause'],[0,'enter']];
    for(const [i,n] of edges){const p=pressed(i);if(p&&!padPrev[i])fire(n);padPrev[i]=p;}
    if(Math.abs(st)>0.1||res.thr>0.05||res.brk>0.05)usingPad=true;
    return res;
  }
  return null;
}
/* returns {thr,brk,steer} for the player's car */
export function readInput(e,dt){
  const c=e.car,P=pad(),T=touchState();
  if(down.size||touches.size)usingPad=false;
  const kThr=down.has('thr')||T.thr,kBrk=down.has('brk')||T.brk;
  let wantThr=kThr?1:0,wantBrk=kBrk?1:0,steerKey=(down.has('right')||T.right?1:0)-(down.has('left')||T.left?1:0);
  if(P&&usingPad){wantThr=Math.max(wantThr,P.thr);wantBrk=Math.max(wantBrk,P.brk);}
  /* pedals: throttle ~0.12 s to full, brake pressure builds over ~0.18 s */
  thr+=Math.max(-dt*9,Math.min(dt*8,wantThr-thr));
  brk+=Math.max(-dt*10,Math.min(dt*5.5,wantBrk-brk));
  /* reverse: hold brake at a standstill */
  if(c.gear>0&&c.speed<0.6&&wantBrk&&!wantThr){revHold+=dt;if(revHold>0.6){c.gear=-1;revHold=0;}}else revHold=0;
  let outThr=thr,outBrk=brk;
  if(c.gear<0){outThr=brk;outBrk=thr;if(wantThr&&c.u>-0.5&&c.speed<0.8){c.gear=1;}}
  const u=Math.max(c.u,0),v=Math.hypot(c.vx,c.vz);
  const lock=SPEC.steerLock;
  let target;
  if(P&&usingPad){
    target=P.steer*lock*(1/(1+v/22));
    steer+=(target-steer)*Math.min(1,dt*20);
  }else{
    /* keyboard: the input itself ramps, faster back to centre */
    const rate=steerKey===0?6:(Math.sign(steerKey)!==Math.sign(steerIn)&&steerIn!==0?7:2.4+1.6/(1+v/12));
    steerIn+=Math.max(-dt*rate,Math.min(dt*rate,steerKey-steerIn));
    const align=v>5?Math.atan2(c.v+SPEC.a*c.r,Math.max(u,1)):0;
    const span=lock/(1+v*v/700);
    target=steerIn*span+(1-Math.abs(steerIn))*align*0.9;
    const sr=3.2/(1+v/30);
    steer+=Math.max(-dt*sr,Math.min(dt*sr,target-steer));
  }
  let out=steer;
  if(opts.assist)out=limitSteer(c,out,1.25);
  out=Math.max(-lock,Math.min(lock,out));
  return {thr:outThr,brk:outBrk,steer:out};
}
export function resetInput(){thr=brk=steerIn=steer=0;}
export {shift};
