/* Everything is synthesized with WebAudio.
   Engine: a flat-six four-stroke fires three times per revolution, so the main order is rpm/20 Hz
   (450 Hz at 9000 rpm, the GT3's scream). Saw + square at that order, a 1.5-order rumble and the
   crank order underneath, through a soft clipper and a throttle-opened filter; intake roar from
   band-passed noise; crackles on the overrun. */
let ctx=null,master=null,noiseBuf=null,muted=false,voices=[],fx=null;
let lastLit=0,lastState='',lastGear=1,lastWall=0;
try{muted=localStorage.getItem('ring-muted')==='1';}catch(e){}
const VOL=0.75;

function noise(){const s=ctx.createBufferSource();s.buffer=noiseBuf;s.loop=true;s.start(0,Math.random()*2);return s;}
function shaperCurve(k){const n=1024,c=new Float32Array(n);for(let i=0;i<n;i++){const x=i/(n-1)*2-1;c[i]=Math.tanh(k*x)/Math.tanh(k);}return c;}
function panner(){const p=ctx.createPanner();p.panningModel='equalpower';p.distanceModel='inverse';p.refDistance=6;p.rolloffFactor=1.2;p.maxDistance=600;return p;}
function setPos(n,x,y,z){if(n.positionX){n.positionX.value=x;n.positionY.value=y;n.positionZ.value=z;}else n.setPosition(x,y,z);}

function engineVoice(level,spatial){
  const out=ctx.createGain();out.gain.value=0;
  let dest=master;
  const pan=spatial?panner():null;if(pan){out.connect(pan);pan.connect(master);}else out.connect(master);
  const pre=ctx.createGain();pre.gain.value=0.42;
  const sh=ctx.createWaveShaper();sh.curve=shaperCurve(2.4);
  const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.Q.value=0.9;
  const pk=ctx.createBiquadFilter();pk.type='peaking';pk.frequency.value=2400;pk.Q.value=1.2;pk.gain.value=4;
  pre.connect(sh);sh.connect(lp);lp.connect(pk);pk.connect(out);
  const o3=ctx.createOscillator();o3.type='sawtooth';
  const o3b=ctx.createOscillator();o3b.type='square';
  const o15=ctx.createOscillator();o15.type='sawtooth';
  const o6=ctx.createOscillator();o6.type='triangle';
  const o1=ctx.createOscillator();o1.type='sine';
  const g3=ctx.createGain();g3.gain.value=0.5;const g3b=ctx.createGain();g3b.gain.value=0.22;
  const g15=ctx.createGain();g15.gain.value=0.3;const g6=ctx.createGain();g6.gain.value=0.16;const g1=ctx.createGain();g1.gain.value=0.35;
  o3.connect(g3);g3.connect(pre);o3b.connect(g3b);g3b.connect(pre);o15.connect(g15);g15.connect(pre);o6.connect(g6);g6.connect(pre);o1.connect(g1);g1.connect(pre);
  /* intake */
  const nz=noise(),bp=ctx.createBiquadFilter();bp.type='bandpass';bp.Q.value=1.4;const ng=ctx.createGain();ng.gain.value=0;
  nz.connect(bp);bp.connect(ng);ng.connect(out);
  /* PDK / straight-cut whine */
  const wh=ctx.createOscillator();wh.type='sine';const wg=ctx.createGain();wg.gain.value=0;wh.connect(wg);wg.connect(out);
  [o3,o3b,o15,o6,o1,wh].forEach(o=>o.start());
  return {out,pan,level,
    set(rpm,thr,v,gear,cut){
      const t=ctx.currentTime,f=rpm/20;
      o3.frequency.setTargetAtTime(f,t,0.015);o3b.frequency.setTargetAtTime(f*1.003,t,0.015);
      o15.frequency.setTargetAtTime(f*0.5,t,0.015);o6.frequency.setTargetAtTime(f*2,t,0.015);o1.frequency.setTargetAtTime(rpm/60,t,0.015);
      lp.frequency.setTargetAtTime(500+thr*3800+rpm*0.32,t,0.04);
      pk.gain.setTargetAtTime(2+6*Math.max(0,(rpm-6000)/3000)*thr,t,0.05);
      bp.frequency.setTargetAtTime(f*2.2,t,0.03);ng.gain.setTargetAtTime(0.09*thr*Math.min(1,rpm/6000),t,0.05);
      wh.frequency.setTargetAtTime(v*38+80,t,0.05);wg.gain.setTargetAtTime(gear>0?0.008*Math.min(1,v/30):0,t,0.1);
      const load=0.32+0.68*thr;
      out.gain.setTargetAtTime(this.level*load*(cut?0.35:1)*(rpm>1000?1:0.5),t,cut?0.008:0.04);
    }};
}
function noiseBus(type,freq,q){const g=ctx.createGain();g.gain.value=0;const f=ctx.createBiquadFilter();f.type=type;f.frequency.value=freq;f.Q.value=q;const s=noise();s.connect(f);f.connect(g);g.connect(master);return {g,f};}
function blip(freq,dur,vol,type='square'){const o=ctx.createOscillator(),g=ctx.createGain(),t=ctx.currentTime;o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);o.connect(g);g.connect(master);o.start(t);o.stop(t+dur);}
function pop(vol,lo=600){const t=ctx.currentTime,s=noise(),g=ctx.createGain(),f=ctx.createBiquadFilter();f.type='bandpass';f.frequency.value=lo+Math.random()*900;f.Q.value=0.8;
  g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.06+Math.random()*0.05);s.connect(f);f.connect(g);g.connect(master);s.stop(t+0.15);}
function thump(vol){const t=ctx.currentTime,s=noise(),g=ctx.createGain(),f=ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=900;
  g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.6);s.connect(f);f.connect(g);g.connect(master);s.stop(t+0.7);
  const o=ctx.createOscillator(),og=ctx.createGain();o.frequency.setValueAtTime(110,t);o.frequency.exponentialRampToValueAtTime(40,t+0.25);og.gain.setValueAtTime(vol,t);og.gain.exponentialRampToValueAtTime(0.001,t+0.3);o.connect(og);og.connect(master);o.start(t);o.stop(t+0.35);}

function init(cars){
  if(ctx){if(ctx.state!=='running')ctx.resume();return;}
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
  ctx=new AC();
  master=ctx.createGain();master.gain.value=muted?0:VOL;
  const comp=ctx.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=4;master.connect(comp);comp.connect(ctx.destination);
  noiseBuf=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);const d=noiseBuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
  voices=cars.map(e=>({e,v:engineVoice(e.human?0.55:0.4,!e.human)}));
  fx={wind:noiseBus('lowpass',900,0.4),road:noiseBus('lowpass',180,0.6),squeal:noiseBus('bandpass',1050,7),scrub:noiseBus('bandpass',420,2),
    gravel:noiseBus('lowpass',420,0.7),curb:noiseBus('bandpass',140,2),abs:noiseBus('bandpass',260,3)};
  fx.curbLfo=ctx.createOscillator();fx.curbLfo.type='square';const lg=ctx.createGain();lg.gain.value=0.5;fx.curbLfo.connect(lg);lg.connect(fx.curb.g.gain);fx.curbLfo.start();
}
export function setupAudio(getCars){
  const unlock=()=>init(getCars());
  window.addEventListener('keydown',unlock);window.addEventListener('pointerdown',unlock);
  const btn=document.getElementById('mute');
  const show=()=>{if(btn)btn.textContent='Sound: '+(muted?'off':'on');};show();
  const toggle=()=>{muted=!muted;try{localStorage.setItem('ring-muted',muted?'1':'0');}catch(e){}
    if(master)master.gain.setTargetAtTime(muted?0:VOL,ctx.currentTime,0.05);show();};
  btn?.addEventListener('click',toggle);
  window.addEventListener('keydown',e=>{if(e.code==='KeyM'&&!e.repeat)toggle();});
}
export function rebindAudio(cars){if(!ctx)return;voices.forEach((q,i)=>{if(cars[i])q.e=cars[i];});}

export function updateAudio(camera,player,race,paused,cockpit){
  if(!ctx)return;
  const t=ctx.currentTime,L=ctx.listener;
  camera.updateMatrixWorld();
  const p=camera.position,m=camera.matrixWorld.elements;
  if(L.positionX){L.positionX.value=p.x;L.positionY.value=p.y;L.positionZ.value=p.z;L.forwardX.value=-m[8];L.forwardY.value=-m[9];L.forwardZ.value=-m[10];L.upX.value=m[4];L.upY.value=m[5];L.upZ.value=m[6];}
  else{L.setPosition(p.x,p.y,p.z);L.setOrientation(-m[8],-m[9],-m[10],m[4],m[5],m[6]);}
  for(const {e,v} of voices){
    const c=e.car;
    if(v.pan)setPos(v.pan,c.x,c.y+0.6,c.z);
    v.set(paused?1100:c.rpm,paused?0:Math.max(c.thr*c.tcCut,0.05),c.speed,c.gear,c.shiftT>0);
  }
  const c=player.car,sp=paused?0:c.speed;
  /* wind is louder outside; inside the cockpit the road and tyres dominate */
  fx.wind.g.gain.setTargetAtTime((cockpit?0.1:0.2)*Math.min(1.4,(sp/60)**2),t,0.1);
  fx.road.g.gain.setTargetAtTime(paused?0:0.1*Math.min(1,sp/40),t,0.1);
  /* tyres: squeal near and past the peak, scrub when the fronts plough */
  let sq=0,scrub=0,off=0,curb=0;
  c.wheels.forEach(w=>{if(w.load<200)return;
    if(w.surf<2){sq=Math.max(sq,Math.min(1,(w.slip-0.85)*1.4));if(w.front)scrub=Math.max(scrub,Math.min(1,(w.slip-1.3)));}
    else off=1;
    if(w.surf===1)curb=1;});
  sq*=Math.min(1,sp/6);
  fx.squeal.g.gain.setTargetAtTime(paused?0:Math.max(0,sq)*0.22,t,0.04);
  fx.squeal.f.frequency.setTargetAtTime(900+Math.max(0,sq)*500,t,0.05);
  fx.scrub.g.gain.setTargetAtTime(paused?0:Math.max(0,scrub)*0.2*Math.min(1,sp/10),t,0.05);
  fx.gravel.g.gain.setTargetAtTime(!paused&&off&&sp>1?Math.min(0.5,0.1+sp*0.012):0,t,0.06);
  fx.curb.g.gain.setTargetAtTime(!paused&&curb&&sp>2?0.35:0,t,0.02);
  fx.curbLfo.frequency.setTargetAtTime(Math.max(5,sp*1.6),t,0.05);
  fx.abs.g.gain.setTargetAtTime(!paused&&c.absActive?0.12*(0.5+0.5*Math.sin(t*90)):0,t,0.01);
  /* overrun crackle and shifts */
  if(!paused&&c.thr<0.1&&c.rpm>4800&&Math.random()<0.18)pop(0.12+Math.random()*0.18);
  if(c.gear!==lastGear){if(c.gear>lastGear&&c.thr>0.5){pop(0.3,300);}else if(c.gear<lastGear){pop(0.22,500);setTimeout(()=>ctx&&pop(0.18),40);}lastGear=c.gear;}
  const hit=Math.max(player.wall||0,player.contact||0);
  if(hit>2&&lastWall<=2)thump(Math.min(1,0.25+hit*0.06));
  lastWall=hit;
  if(race.state==='grid'&&race.lit>lastLit)blip(660,0.22,0.12);
  if(race.state==='racing'&&lastState==='grid')blip(1320,0.6,0.15);
  lastLit=race.state==='grid'?race.lit:0;lastState=race.state;
}
