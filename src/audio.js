/* All sound is synthesized with WebAudio, no sample files.
   Engine: a 270-degree parallel twin fires twice every two revolutions, so the average firing rate
   is rpm/60 Hz (about 160 Hz at 9500 rpm); the uneven 270/450 degree spacing adds a strong
   rpm/120 sub-harmonic, the "lope". Saw + square through a soft clipper and a throttle-opened
   lowpass, plus exhaust noise chopped at the firing rate. Only the 4 nearest other bikes get a voice. */
let ctx=null,master=null,noiseBuf=null,muted=false,voices=[],allRiders=[],fx=null,lastLit=0,lastState='',wasCrashed=false;
try{muted=localStorage.getItem('apex-muted')==='1';}catch(e){}

function noiseSource(){const s=ctx.createBufferSource();s.buffer=noiseBuf;s.loop=true;s.start(0,Math.random()*2);return s;}
function curve(k){const n=1024,c=new Float32Array(n);for(let i=0;i<n;i++){const x=i/(n-1)*2-1;c[i]=Math.tanh(k*x)/Math.tanh(k);}return c;}
function panner(){
  const p=ctx.createPanner();p.panningModel='equalpower';p.distanceModel='inverse';p.refDistance=5;p.rolloffFactor=1.3;p.maxDistance=400;
  return p;
}
function setPos(node,x,y,z){
  if(node.positionX){node.positionX.value=x;node.positionY.value=y;node.positionZ.value=z;}else node.setPosition(x,y,z);
}

function makeEngine(level){
  const out=ctx.createGain();out.gain.value=0;
  const pan=panner();out.connect(pan);pan.connect(master);
  const pre=ctx.createGain();pre.gain.value=0.5;
  const shaper=ctx.createWaveShaper();shaper.curve=curve(2.2);
  const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=600;lp.Q.value=0.8;
  pre.connect(shaper);shaper.connect(lp);lp.connect(out);
  const saw=ctx.createOscillator();saw.type='sawtooth';
  const sq=ctx.createOscillator();sq.type='square';
  const sub=ctx.createOscillator();sub.type='sine';
  const gs=ctx.createGain();gs.gain.value=0.55;const gq=ctx.createGain();gq.gain.value=0.25;const gb=ctx.createGain();gb.gain.value=0.6;
  saw.connect(gs);gs.connect(pre);sq.connect(gq);gq.connect(pre);sub.connect(gb);gb.connect(pre);
  /* exhaust "putt": band-passed noise whose level is modulated at the firing frequency */
  const nz=noiseSource(),bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=420;bp.Q.value=0.9;
  const am=ctx.createGain();am.gain.value=0.25;const lfo=ctx.createOscillator();const lfoG=ctx.createGain();lfoG.gain.value=0.25;
  lfo.connect(lfoG);lfoG.connect(am.gain);nz.connect(bp);bp.connect(am);am.connect(lp);
  /* CVT belt whine */
  const whine=ctx.createOscillator();whine.type='sine';const gw=ctx.createGain();gw.gain.value=0;whine.connect(gw);gw.connect(out);
  [saw,sq,sub,lfo,whine].forEach(o=>o.start());
  return {out,pan,lp,saw,sq,sub,lfo,whine,gw,level,
    set(rpm,thr,v,cut){
      const t=ctx.currentTime,f=rpm/60;
      saw.frequency.setTargetAtTime(f,t,0.03);sq.frequency.setTargetAtTime(f*0.5,t,0.03);sub.frequency.setTargetAtTime(f,t,0.03);
      lfo.frequency.setTargetAtTime(f,t,0.03);whine.frequency.setTargetAtTime(rpm/60*6.5,t,0.05);
      lp.frequency.setTargetAtTime(350+thr*2800+rpm*0.16,t,0.05);
      gw.gain.setTargetAtTime(0.008*Math.min(1,v/15),t,0.1);
      out.gain.setTargetAtTime(this.level*(0.3+0.7*thr)*(cut?0.35:1)*(rpm>1200?1:0.6),t,0.02);
    }};
}
function makeNoise(type,freq,q){
  const g=ctx.createGain();g.gain.value=0;const f=ctx.createBiquadFilter();f.type=type;f.frequency.value=freq;f.Q.value=q;
  const s=noiseSource();s.connect(f);f.connect(g);g.connect(master);return g;
}
function beep(freq,dur,vol){
  const o=ctx.createOscillator(),g=ctx.createGain(),t=ctx.currentTime;o.type='square';o.frequency.value=freq;
  g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);o.connect(g);g.connect(master);o.start(t);o.stop(t+dur);
}
function crashSound(){
  const t=ctx.currentTime,s=noiseSource(),g=ctx.createGain(),f=ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=2400;
  g.gain.setValueAtTime(0.9,t);g.gain.exponentialRampToValueAtTime(0.001,t+1.4);s.connect(f);f.connect(g);g.connect(master);s.stop(t+1.5);
  const o=ctx.createOscillator(),og=ctx.createGain();o.frequency.setValueAtTime(90,t);o.frequency.exponentialRampToValueAtTime(35,t+0.4);
  og.gain.setValueAtTime(1,t);og.gain.exponentialRampToValueAtTime(0.001,t+0.5);o.connect(og);og.connect(master);o.start(t);o.stop(t+0.6);
}

function init(riders){
  if(ctx){if(ctx.state!=='running')ctx.resume();return;}
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
  ctx=new AC();
  master=ctx.createGain();master.gain.value=muted?0:0.8;
  const comp=ctx.createDynamicsCompressor();master.connect(comp);comp.connect(ctx.destination);
  noiseBuf=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);
  const d=noiseBuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
  voices=[makeEngine(0.5),makeEngine(0.3),makeEngine(0.3),makeEngine(0.3),makeEngine(0.3)];
  allRiders=riders;
  fx={wind:makeNoise('lowpass',700,0.5),squeal:makeNoise('bandpass',1150,9),gravel:makeNoise('lowpass',380,0.7),scrape:makeNoise('highpass',2600,0.8)};
}
export function setupAudio(riders){
  const unlock=()=>init(riders);
  window.addEventListener('keydown',unlock);window.addEventListener('pointerdown',unlock);
  const btn=document.getElementById('mute');
  const show=()=>{if(btn)btn.textContent='Sound: '+(muted?'off':'on');};show();
  const toggle=()=>{muted=!muted;try{localStorage.setItem('apex-muted',muted?'1':'0');}catch(e){}
    if(master)master.gain.setTargetAtTime(muted?0:0.8,ctx.currentTime,0.05);show();};
  btn?.addEventListener('click',toggle);
  window.addEventListener('keydown',e=>{if(e.code==='KeyM'&&e.target.tagName!=='INPUT')toggle();});
}
export const audioReady=()=>!!ctx;

export function updateAudio(camera,player,race,paused){
  if(!ctx)return;
  const t=ctx.currentTime,L=ctx.listener;
  camera.updateMatrixWorld();
  const p=camera.position,e=camera.matrixWorld.elements;
  if(L.positionX){L.positionX.value=p.x;L.positionY.value=p.y;L.positionZ.value=p.z;
    L.forwardX.value=-e[8];L.forwardY.value=-e[9];L.forwardZ.value=-e[10];L.upX.value=e[4];L.upY.value=e[5];L.upZ.value=e[6];}
  else{L.setPosition(p.x,p.y,p.z);L.setOrientation(-e[8],-e[9],-e[10],e[4],e[5],e[6]);}
  /* voice 0 follows our bike, the rest the nearest four others */
  const near=allRiders.filter(r=>r!==player).map(r=>[r,r.g.position.distanceToSquared(p)]).sort((a,b)=>a[1]-b[1]);
  [player,...near.slice(0,4).map(x=>x[0])].forEach((r,i)=>{
    const en=voices[i],q=r.g.position;setPos(en.pan,q.x,q.y+0.5,q.z);
    en.set(paused?1300:r.rpm,paused?0:r.thr,r.v,r.shiftT>0);
  });
  const v=paused?0:player.v;
  fx.wind.gain.setTargetAtTime(0.22*Math.min(1,(v/35)**2),t,0.1);
  fx.squeal.gain.setTargetAtTime(paused?0:Math.min(0.25,(player.sliding?0.18:0)+(player.abs?0.06:0)+Math.max(0,player.gripUse-0.92)*0.6),t,0.05);
  fx.gravel.gain.setTargetAtTime(!paused&&player.rough&&v>1?Math.min(0.5,0.08+v*0.02):0,t,0.08);
  fx.scrape.gain.setTargetAtTime(!paused&&player.scrape?0.12:0,t,0.03);
  /* start lights and crashes */
  if(race.state==='countdown'&&race.lit>lastLit)beep(660,0.22,0.15);
  if(race.state==='racing'&&lastState==='countdown')beep(1320,0.6,0.18);
  lastLit=race.state==='countdown'?race.lit:0;lastState=race.state;
  if(player.crash&&!wasCrashed)crashSound();
  wasCrashed=!!player.crash;
}
