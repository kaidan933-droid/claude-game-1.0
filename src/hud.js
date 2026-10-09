import {clamp,hexStr} from './core.js';
import {S,SIDE,LEN,ds,mod,corners} from './track.js';
import {riders,player} from './bikes.js';

const minX=Math.min(...S.map(p=>p.x)),maxX=Math.max(...S.map(p=>p.x)),minZ=Math.min(...S.map(p=>p.z)),maxZ=Math.max(...S.map(p=>p.z));
/* ---------------- minimap ---------------- */
const mapC=document.getElementById('map'),mg=mapC.getContext('2d'),MS=320;
const pad=30,sc=Math.min((MS-2*pad)/(maxX-minX),(MS-2*pad)/(maxZ-minZ));
const ox=(MS-(maxX-minX)*sc)/2,oz=(MS-(maxZ-minZ)*sc)/2;
const mx=x=>ox+(x-minX)*sc,mz=z=>oz+(z-minZ)*sc;
const mapBase=document.createElement('canvas');mapBase.width=mapBase.height=MS;
(function(){const g=mapBase.getContext('2d');g.lineJoin='round';
  const path=()=>{g.beginPath();S.forEach((p,i)=>i?g.lineTo(mx(p.x),mz(p.z)):g.moveTo(mx(p.x),mz(p.z)));g.closePath();};
  path();g.strokeStyle='rgba(255,244,230,.22)';g.lineWidth=16;g.stroke();
  path();g.strokeStyle='#fff4e6';g.lineWidth=6;g.stroke();
  const p=S[0],sd=SIDE[0];g.strokeStyle='#ffb43a';g.lineWidth=5;g.beginPath();
  g.moveTo(mx(p.x+sd[0]*14),mz(p.z+sd[1]*14));g.lineTo(mx(p.x-sd[0]*14),mz(p.z-sd[1]*14));g.stroke();
  g.font='600 15px "Chakra Petch", sans-serif';g.textAlign='center';g.textBaseline='middle';
  corners.forEach(c=>{const i=mod(c.ip),q=S[i],sd=SIDE[i],o=c.sg*30;g.fillStyle=c.kind==='hairpin'?'#ff8a70':'#d8c2aa';g.fillText(String(c.num),mx(q.x+sd[0]*o),mz(q.z+sd[1]*o));});
})();
function drawMap(){
  mg.clearRect(0,0,MS,MS);mg.drawImage(mapBase,0,0);
  for(let i=riders.length-1;i>=0;i--){const r=riders[i],P=r.g.position,me=r===player;
    mg.beginPath();mg.arc(mx(P.x),mz(P.z),me?11:8,0,Math.PI*2);mg.fillStyle=hexStr(r.color);mg.fill();
    mg.lineWidth=me?4:2.5;mg.strokeStyle=me?'#fff4e6':'#1c1522';mg.stroke();}
}

/* ---------------- HUD ---------------- */
const $=id=>document.getElementById(id);
const revEl=$('rev'),SEG=14;
for(let i=0;i<SEG;i++){const s=document.createElement('span');if(i>=8)s.classList.add('mid');if(i>=12)s.classList.add('red');revEl.appendChild(s);}
const segs=[...revEl.children];
const GEARS=[0,78,118,158,198,240,999];
const gearFor=k=>{let gi=1;while(k>=GEARS[gi]&&gi<6)gi++;return gi;};
const fmt=t=>{const m=Math.floor(t/60),s=t-m*60;return m+':'+(s<10?'0':'')+s.toFixed(3);};
const sfx=n=>['th','st','nd','rd'][n]||'th';
const ARROWS={fast:'M20 44 C20 30 24 20 36 12',medium:'M18 44 L18 30 C18 20 24 15 36 15',tight:'M16 44 L16 24 C16 14 24 12 36 18',hairpin:'M13 44 L13 18 C13 3 35 3 35 18 L35 28'};
let lapStart=0,best=null,lastLap=0,boardKey='',noteKey='';
function updateHud(simTime){
  const gu=player.gripUse||0;
  $('gripBar').style.width=Math.min(100,gu*80)+'%';
  $('gripBar').parentElement.classList.toggle('slip',player.sliding);
  $('crash').classList.toggle('on',!!player.crash);
  const kmh=player.v*3.6;$('spd').textContent=Math.round(kmh);
  const gi=gearFor(kmh);$('gear').textContent=gi;
  const lo=GEARS[gi-1],hi=GEARS[gi]===999?300:GEARS[gi];
  const rpm=clamp(0.42+0.58*(kmh-lo)/(hi-lo),0,1),lit=Math.round(rpm*SEG);
  segs.forEach((s,i)=>s.classList.toggle('on',i<lit));
  const lap=Math.floor(player.s/LEN);
  if(lap>lastLap){const lt=simTime-lapStart;best=best===null?lt:Math.min(best,lt);lapStart=simTime;lastLap=lap;$('best').textContent=fmt(best);}
  $('lap').textContent=(((lap%5)+5)%5+1)+' of 5';$('time').textContent=fmt(simTime-lapStart);
  const order=[...riders].sort((a,b)=>b.s-a.s),pos=order.indexOf(player)+1;
  $('pos').textContent=pos;$('sfx').textContent=sfx(pos);
  const key=order.map(r=>r.num).join(',');
  if(key!==boardKey){boardKey=key;$('board').innerHTML=order.map((r,i)=>'<li class="'+(r===player?'me':'')+'"><span>'+(i+1)+'</span><i style="background:'+hexStr(r.color)+'"></i>'+r.name+'</li>').join('');}
  /* next corner */
  if(corners.length){
    const pi=Math.floor(((player.s%LEN)+LEN)%LEN/ds);let pick=null,dist=Infinity,inside=false;
    for(const c of corners){const into=mod(pi-c.i0);if(into<=c.i1-c.i0){pick=c;inside=true;break;}
      const d=mod(c.i0-pi);if(d<dist){dist=d;pick=c;}}
    const meters=inside?0:Math.round(dist*ds/10)*10;
    const nk=pick.num+'|'+meters;
    if(nk!==noteKey){noteKey=nk;
      $('note').className='note panel '+pick.kind;
      $('cname').textContent='Turn '+pick.num+' of '+corners.length;
      $('ctype').textContent=pick.label;
      $('cgear').textContent='Gear '+gearFor(pick.kmh)+', about '+Math.round(pick.kmh/5)*5+' km/h';
      $('cdist').textContent=inside?'Now':meters;
      $('cunit').textContent=inside?'':'m';
      $('arrowP').setAttribute('d',ARROWS[pick.kind]);
      $('arrowG').setAttribute('transform',pick.sg>0?'translate(48,0) scale(-1,1)':'');
    }
  }
}
export {updateHud,drawMap};
