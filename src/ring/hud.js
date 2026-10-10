import {clamp,hexStr,fmt} from './core.js';
import {T,cars,race,standings} from './sim/world.js';
import {SPEC,tempGrip} from './sim/car.js';

const $=id=>document.getElementById(id);

/* ---------------- gaps: time each car reaches every 100 m ---------------- */
const CP=100;let cpFirst=new Map();
export function resetGaps(){cpFirst=new Map();cars.forEach(e=>{e.cp=-1;e.cpT=0;});}
export function trackGaps(){
  for(const e of cars){
    const cp=Math.floor(e.prog/CP);
    if(cp>e.cp){e.cp=cp;e.cpT=race.time;if(!cpFirst.has(cp))cpFirst.set(cp,race.time);}
  }
}
const gapOf=e=>cpFirst.has(e.cp)?e.cpT-cpFirst.get(e.cp):0;

/* ---------------- minimap ---------------- */
const mapC=$('map'),mg=mapC.getContext('2d'),MW=mapC.width,MH=mapC.height;
let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
for(let i=0;i<T.N;i++){minX=Math.min(minX,T.X[i]);maxX=Math.max(maxX,T.X[i]);minZ=Math.min(minZ,T.Z[i]);maxZ=Math.max(maxZ,T.Z[i]);}
const pad=16,sc=Math.min((MW-2*pad)/(maxX-minX),(MH-2*pad)/(maxZ-minZ));
const ox=(MW-(maxX-minX)*sc)/2,oz=(MH-(maxZ-minZ)*sc)/2;
const mx=x=>ox+(x-minX)*sc,mz=z=>oz+(z-minZ)*sc;
const mapBase=document.createElement('canvas');mapBase.width=MW;mapBase.height=MH;
{const g=mapBase.getContext('2d');g.lineJoin='round';
  const path=()=>{g.beginPath();for(let i=0;i<T.N;i+=2)i?g.lineTo(mx(T.X[i]),mz(T.Z[i])):g.moveTo(mx(T.X[i]),mz(T.Z[i]));g.closePath();};
  path();g.strokeStyle='rgba(244,241,234,.2)';g.lineWidth=9;g.stroke();
  path();g.strokeStyle='#f4f1ea';g.lineWidth=3;g.stroke();
  const sx=mx(T.X[0]),sz=mz(T.Z[0]);g.strokeStyle='#f2c230';g.lineWidth=4;g.beginPath();g.moveTo(sx+T.NX[0]*9,sz+T.NZ[0]*9);g.lineTo(sx-T.NX[0]*9,sz-T.NZ[0]*9);g.stroke();}
export function drawMap(player){
  mg.clearRect(0,0,MW,MH);mg.drawImage(mapBase,0,0);
  for(let k=cars.length-1;k>=0;k--){const e=cars[k],me=e===player;
    mg.beginPath();mg.arc(mx(e.car.x),mz(e.car.z),me?6:4.5,0,7);mg.fillStyle=hexStr(e.color);mg.fill();
    mg.lineWidth=me?2.5:1.5;mg.strokeStyle=me?'#fff':'#111';mg.stroke();}
}

/* ---------------- HUD ---------------- */
const leds=$('leds');for(let i=0;i<15;i++){const s=document.createElement('span');if(i>=9)s.className='y';if(i>=12)s.className='r';leds.appendChild(s);}
const ledEls=[...leds.children];
const lamps=[...document.querySelectorAll('#lamps i')],startEl=$('start'),startMsg=$('startMsg');
const gb=$('gball').getContext('2d');
let boardKey='',secName='',secT=0,flashT=0;
export function flash(msg,warn,dur=2){const f=$('flash');f.textContent=msg;f.classList.add('on');f.classList.toggle('warn',!!warn);flashT=dur;}
const tempCol=t=>t<60?'#2f6fb8':t<78?'#3a9a8a':t<102?'#3fa34d':t<115?'#d29a1c':'#d8342c';

export function updateHud(player,dt){
  const c=player.car;
  /* start */
  const showStart=race.state==='grid'||(race.state==='racing'&&race.time<1.5);
  startEl.classList.toggle('on',showStart);startEl.classList.toggle('go',race.state==='racing');
  lamps.forEach((l,i)=>l.classList.toggle('lit',race.state==='grid'&&i<race.lit));
  startMsg.textContent=race.state==='racing'?'GO!':'Hold the throttle around 4000 rpm and wait for lights out';
  /* speed, revs, gear */
  $('spd').textContent=Math.round(c.speed*3.6);
  $('gear').textContent=c.gear<0?'R':c.shiftT>0?'-':c.gear;
  $('gearMode').textContent=c.autoShift?'Auto':'Manual';
  const r=clamp((c.rpm-4500)/(SPEC.redline-4500),0,1),n=Math.round(r*15);
  ledEls.forEach((s,i)=>s.classList.toggle('on',i<n));
  leds.classList.toggle('flash',c.rpm>SPEC.redline-300&&!c.autoShift&&Math.floor(performance.now()/80)%2===0);
  const L=(id,state,act)=>{const el=$(id);el.classList.toggle('off',!state);el.classList.toggle('act',!!act);};
  L('lTC',c.tc,c.tcActive);L('lABS',c.abs,c.absActive);L('lDRS',true,c.drs);
  $('pThr').style.height=(c.thr*100)+'%';$('pBrk').style.height=(c.brk*100)+'%';
  c.wheels.forEach((w,i)=>{const el=$('ty'+i);el.style.background=tempCol(w.temp);el.firstChild.style.height=clamp(w.slip/1.3,0,1)*100+'%';
    el.firstChild.style.background=w.slip>1.2?'rgba(255,90,60,.8)':'rgba(255,255,255,.35)';el.lastChild.textContent=Math.round(w.temp)+'°';
    el.title='Tyre '+Math.round(w.temp)+' C, grip '+Math.round(tempGrip(w.temp)*100)+'%';});
  /* g-ball */
  gb.clearRect(0,0,120,120);gb.strokeStyle='rgba(255,255,255,.25)';gb.lineWidth=2;
  [1,2].forEach(k=>{gb.beginPath();gb.arc(60,60,k*26,0,7);gb.stroke();});
  gb.beginPath();gb.moveTo(60,6);gb.lineTo(60,114);gb.moveTo(6,60);gb.lineTo(114,60);gb.stroke();
  const gx=clamp(c.ayF/9.81,-2.2,2.2)*26,gy=clamp(-c.axF/9.81,-2.2,2.2)*26;
  gb.fillStyle='#f2c230';gb.beginPath();gb.arc(60+gx,60+gy,7,0,7);gb.fill();
  /* race panel */
  const order=standings(),pos=order.indexOf(player)+1;
  $('pos').textContent=pos;
  const lapNow=Math.min(race.laps,Math.max(1,player.lap+1));
  $('lap').textContent=(player.finish!==null?race.laps:lapNow)+' / '+race.laps;
  const lapT=player.finish!==null?player.lapTimes[player.lapTimes.length-1]:race.state==='racing'||race.state==='finished'?race.time-player.lapStart:0;
  $('time').textContent=fmt(lapT);
  $('last').textContent=player.lapTimes.length?fmt(player.lapTimes[player.lapTimes.length-1]):'-';
  $('best').textContent=player.lapTimes.length?fmt(Math.min(...player.lapTimes)):'-';
  const lead=order[0];
  const rows=order.map((e,i)=>{let g='';
    if(i>0){if(e.finish!==null&&lead.finish!==null)g='+'+(e.finish-lead.finish).toFixed(1);
      else{const lapsDown=Math.floor((lead.prog-e.prog)/T.LEN);g=lapsDown>=1?'+'+lapsDown+' lap':'+'+gapOf(e).toFixed(1);}}
    return '<li class="'+(e===player?'me':'')+'"><span>'+(i+1)+'</span><i style="background:'+hexStr(e.color)+'"></i>'+e.name+'<em>'+g+'</em></li>';}).join('');
  if(rows!==boardKey){boardKey=rows;$('board').innerHTML=rows;}
  /* sector name */
  const sec=T.sectionAt(player.s).name;
  if(sec!==secName){secName=sec;secT=3.5;$('secName').textContent=sec;}
  secT-=dt;$('sector').classList.toggle('dim',secT<0);
  $('km').textContent='km '+(((player.s%T.LEN)+T.LEN)%T.LEN/1000).toFixed(1)+' of '+(T.LEN/1000).toFixed(1);
  if(flashT>0){flashT-=dt;if(flashT<=0)$('flash').classList.remove('on');}
}
