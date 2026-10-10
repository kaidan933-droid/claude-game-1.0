import {riders,SLOTS,localSlot,setSlot,setLocalSlot,setPlayer,packState,pushRemoteState,setDifficulty,getDifficulty} from './bikes.js';
import {race,resetRace,randomGoAt,standings} from './race.js';
import {net,hostRoom,joinRoom,send,toHost,broadcast,leave,roomFromUrl} from './net.js';
import {showResults,hideResults,setResultsAction} from './results.js';
import {clearEffects} from './effects.js';
import {snapCamera} from './cameras.js';

/* Menu, lobby and the online race flow.
   Solo: you plus 9 AI. Online: the host's browser owns slot assignment, the AI riders and the
   race start; every machine simulates its own rider and streams it at 20 Hz. Humans take grid
   slots from the back forward in join order, and each one replaces an AI rider. Anyone who joins
   during a race spectates and gets a slot on the next grid. */
const $=id=>document.getElementById(id);
const menu=$('menu'),lobby=$('lobby'),banner=$('banner');
let myName='';
try{myName=localStorage.getItem('apex-name')||'';}catch(e){}
$('pname').value=myName;
/* bot difficulty picker (the host's choice is what counts online, since the host runs the bots) */
let diffLabel='';
function pickDifficulty(d){
  setDifficulty(d);try{localStorage.setItem('apex-difficulty',d);}catch(e){}
  document.querySelectorAll('[data-diff]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.diff===d)));
}
document.querySelectorAll('[data-diff]').forEach(b=>b.addEventListener('click',()=>pickDifficulty(b.dataset.diff)));
let savedDiff='easy';try{savedDiff=localStorage.getItem('apex-difficulty')||'easy';}catch(e){}
pickDifficulty(savedDiff);
const DIFF_NAME={easy:'Easy',medium:'Medium',hard:'Hard'};
$('roomCode').value=roomFromUrl();
const nameNow=()=>{myName=($('pname').value.trim()||'Rider').slice(0,16);try{localStorage.setItem('apex-name',myName);}catch(e){}return myName;};
const say=(el,t)=>{$(el).textContent=t;};
function showBanner(t,ms){banner.textContent=t;banner.hidden=!t;if(ms)setTimeout(()=>{if(banner.textContent===t)banner.hidden=true;},ms);}

/* ---------- solo ---------- */
function startSolo(){
  nameNow();
  riders.forEach(r=>setSlot(r,'ai'));
  setLocalSlot(SLOTS-1,myName);
  menu.hidden=true;lobby.hidden=true;hideResults();
  resetRace();clearEffects();snapCamera();
}

/* ---------- host ---------- */
let players=[];          // host: [{id,name,conn,slot}] in join order; id 'host' is us
function assignSlots(){
  const racing=players.slice(0,SLOTS);
  racing.forEach((p,i)=>{p.slot=SLOTS-1-i;});
  players.slice(SLOTS).forEach(p=>{p.slot=null;});
  const bySlot=new Map(racing.map(p=>[p.slot,p]));
  riders.forEach(r=>{const p=bySlot.get(r.slot);
    if(!p)setSlot(r,'ai');else if(p.id==='host')setLocalSlot(r.slot,p.name);else setSlot(r,'remote',p.name);});
}
const slotList=()=>riders.map(r=>({name:r.name,human:r.human,level:r.level}));
function sendLobby(){
  for(const p of players)if(p.conn)send(p.conn,{t:'lobby',slots:slotList(),you:p.slot,code:net.code,diff:getDifficulty()});
  renderLobby();
}
async function startHost(){
  nameNow();say('menuMsg','Opening a room…');
  try{await hostRoom();}catch(e){say('menuMsg','Could not open a room ('+(e.type||e.message)+'). Check your connection.');return;}
  players=[{id:'host',name:myName,conn:null,slot:null}];
  net.onConnect=()=>{};
  net.onMessage=hostMessage;
  net.onDisconnect=conn=>{
    const p=players.find(q=>q.conn===conn);if(!p)return;
    players=players.filter(q=>q!==p);
    if(p.slot!==null&&race.state!=='lobby'){setSlot(riders[p.slot],'ai');showBanner(p.name+' left – an AI rider took over',4000);}
    if(race.state==='lobby'){assignSlots();sendLobby();}
  };
  race.state='lobby';assignSlots();
  menu.hidden=true;lobby.hidden=false;renderLobby();
}
function hostMessage(m,conn){
  if(m.t==='hello'){
    if(players.length>=SLOTS){send(conn,{t:'full'});setTimeout(()=>conn.close(),300);return;}
    const p={id:conn.peer,name:String(m.name||'Rider').slice(0,16),conn,slot:null,seen:performance.now()};players.push(p);
    if(race.state==='lobby'){assignSlots();sendLobby();}
    else{send(conn,{t:'spectate',slots:slotList(),laps:race.laps});showBanner(p.name+' joined – racing next round',4000);}
    return;
  }
  const p=players.find(q=>q.conn===conn);if(!p)return;
  p.seen=performance.now();
  if(p.slot===null)return;
  const r=riders[p.slot];
  if(m.t==='st'&&r.ctrl==='remote')pushRemoteState(r,m.st);
  else if(m.t==='fin'&&r.ctrl==='remote'){r.finishTime=m.time;r.lapCount=race.laps;}
}
function hostStart(){
  assignSlots();
  const goAt=randomGoAt();
  for(const p of players)if(p.conn)send(p.conn,{t:'start',slots:slotList(),you:p.slot,goAt,laps:race.laps});
  lobby.hidden=true;hideResults();resetRace(goAt);clearEffects();snapCamera();
}
function hostBackToLobby(){hideResults();race.state='lobby';assignSlots();sendLobby();lobby.hidden=false;}

/* ---------- client ---------- */
let spectating=false,hostSeen=0;
async function startJoin(){
  const code=$('roomCode').value.trim().toUpperCase();
  if(code.length!==5){say('menuMsg','Enter the 5-letter room code.');return;}
  nameNow();say('menuMsg','Connecting to room '+code+'…');
  net.onMessage=clientMessage;
  net.onHostLost=hostLost;
  try{await joinRoom(code);hostSeen=performance.now();}catch(e){
    say('menuMsg',e.type==='peer-unavailable'?'No room called '+code+'. Check the code.':'Could not connect ('+(e.type||e.message)+'). Some networks block direct connections.');return;}
  toHost({t:'hello',name:myName});
  menu.hidden=true;lobby.hidden=false;race.state='lobby';renderLobby('Connected – waiting for the host…');
}
/* apply the host's slot list: we drive `you`, other humans are remote, AI riders are remote too
   (the host runs them) */
function applySlots(slots,you){
  riders.forEach((r,i)=>{if(i===you)return;setSlot(r,'remote',slots[i].human?slots[i].name:null);});
  if(you!==null&&you!==undefined)setLocalSlot(you,myName);else setLocalSlot(null);
}
function clientMessage(m){
  if(m.t==='full'){say('menuMsg','That lobby is full (10 riders).');leave();menu.hidden=false;lobby.hidden=true;return;}
  hostSeen=performance.now();
  if(m.t==='lobby'){diffLabel=DIFF_NAME[m.diff]||'';spectating=false;race.spectating=false;race.state='lobby';hideResults();applySlots(m.slots,m.you);lobby.hidden=false;showBanner('');renderLobby('Waiting for the host to start…');return;}
  if(m.t==='start'){spectating=false;race.laps=m.laps||race.laps;applySlots(m.slots,m.you);lobby.hidden=true;hideResults();showBanner('');
    resetRace(m.goAt);clearEffects();snapCamera();return;}
  if(m.t==='spectate'){spectating=true;race.laps=m.laps||race.laps;applySlots(m.slots,null);lobby.hidden=true;
    race.state='racing';race.spectating=true;showBanner('Spectating – you’ll race next round');return;}
  if(m.t==='snap'){
    m.st.forEach((st,i)=>{const r=riders[i];if(r.ctrl==='remote')pushRemoteState(r,st);});
    if(spectating)race.time=m.time;
  }
}
function hostLost(){
  riders.forEach(r=>{if(r.ctrl==='remote')setSlot(r,'ai');});
  spectating=false;race.spectating=false;
  if(race.state==='lobby'){lobby.hidden=true;menu.hidden=false;race.state='menu';showBanner('The host closed the room',5000);}
  else showBanner('The host left – finishing against the AI',6000);
}

/* ---------- lobby panel ---------- */
function renderLobby(msg){
  const host=net.role==='host';
  $('roomShow').textContent=net.code||'';
  $('slots').innerHTML=riders.map((r,i)=>'<li class="'+(r.human?'human':'')+(i===localSlot?' me':'')+'"><span>'+(i+1)+'</span>'+
    (r.human?r.name+' <small>RS 457</small>':r.name+' <small>AI · '+r.level+'</small>')+'</li>').join('');
  $('startBtn').hidden=!host;
  const humans=riders.filter(r=>r.human).length;
  const d=host?DIFF_NAME[getDifficulty()]:diffLabel;
  say('lobbyMsg',(msg||(host?humans+' rider'+(humans>1?'s':'')+' + '+(SLOTS-humans)+' AI · share the invite link':''))+(d?' · bots: '+d:''));
}
$('copyLink').addEventListener('click',()=>{
  const url=location.origin+location.pathname+'?room='+net.code;
  (navigator.clipboard?navigator.clipboard.writeText(url):Promise.reject()).then(()=>say('lobbyMsg','Invite link copied'),()=>say('lobbyMsg',url));
});
$('soloBtn').addEventListener('click',startSolo);
$('hostBtn').addEventListener('click',startHost);
$('joinBtn').addEventListener('click',startJoin);
$('roomCode').addEventListener('keydown',e=>{if(e.key==='Enter')startJoin();});
$('startBtn').addEventListener('click',hostStart);
$('leaveBtn').addEventListener('click',()=>{leave();riders.forEach(r=>setSlot(r,'ai'));setLocalSlot(SLOTS-1,myName||'You');
  race.state='menu';lobby.hidden=true;menu.hidden=false;showBanner('');say('menuMsg','');});
if(roomFromUrl())setTimeout(()=>$('joinBtn').focus(),0);

/* results screen action: solo races again, the host goes back to the lobby, clients wait */
export function onLocalFinish(r){
  if(net.role==='client')toHost({t:'fin',time:r.finishTime});
  setResultsAction(net.role==='client'?null:net.role==='host'?'Back to lobby':'Race again');
  showResults();
}
export function resultsAction(){if(net.role==='host')hostBackToLobby();else if(net.role==='off')startSolo();}

/* ---------- per frame ---------- */
let acc=0;
/* a dropped tab or lost Wi-Fi can leave a data channel open for a long time, so both sides also
   watch for silence: everyone sends at least one message a second */
const SILENCE=6000;
let beat=0;
export function netTick(dt){
  if(race.spectating)setPlayer(standings()[0]);
  if(net.role==='off')return;
  const now=performance.now();
  if(net.role==='host'){
    for(const p of players)if(p.conn&&now-p.seen>SILENCE){p.seen=now;try{p.conn.close();}catch(e){}net.conns.delete(p.conn);net.onDisconnect(p.conn);}
  }else if(now-hostSeen>SILENCE){leave();hostLost();return;}
  beat+=dt;
  if(beat>1){beat=0;if(net.role==='host')broadcast({t:'ping'});else toHost({t:'ping'});}
  if(race.state==='lobby'||race.state==='menu')return;
  acc+=dt;if(acc<0.05)return;acc=0;               // 20 Hz
  if(net.role==='host')broadcast({t:'snap',time:race.time,st:riders.map(packState)});
  else if(localSlot!==null)toHost({t:'st',st:packState(riders[localSlot])});
}
export const isOnline=()=>net.role!=='off';
export const onlineCount=()=>net.role==='host'?players.length:null;
