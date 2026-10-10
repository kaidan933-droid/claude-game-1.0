import Peer from 'peerjs';

/* Thin PeerJS wrapper. The host registers a well-known peer id built from a 5-letter room code;
   everyone else connects to it, so the host's browser is the hub for all traffic.
   ?peerhost=host:port points at a self-hosted PeerServer (used for local testing). */
const PREFIX='apexrun-';
const params=new URLSearchParams(location.search);
function options(){
  const o={debug:+(params.get('peerdebug')||0),config:{iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]}};
  const ph=params.get('peerhost');
  if(ph){const [host,port]=ph.split(':');Object.assign(o,{host,port:+port||9000,path:'/',secure:false});}
  return o;
}
const ALPHA='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode=()=>Array.from({length:5},()=>ALPHA[Math.floor(Math.random()*ALPHA.length)]).join('');

export const net={role:'off',code:null,peer:null,host:null,conns:new Set(),
  onMessage:null,onConnect:null,onDisconnect:null,onHostLost:null};

/* host: resolves with the room code once the id is registered */
export function hostRoom(){
  return new Promise((resolve,reject)=>{
    let tries=0;
    const attempt=()=>{
      const code=newCode(),peer=new Peer(PREFIX+code,options());
      peer.on('open',()=>{Object.assign(net,{role:'host',code,peer});resolve(code);});
      peer.on('error',e=>{
        if(e.type==='unavailable-id'&&++tries<5){peer.destroy();attempt();return;}
        if(net.role!=='host')reject(e);
      });
      peer.on('connection',conn=>{
        conn.on('open',()=>{net.conns.add(conn);net.onConnect&&net.onConnect(conn);});
        conn.on('data',m=>net.onMessage&&net.onMessage(m,conn));
        const gone=()=>{if(net.conns.delete(conn))net.onDisconnect&&net.onDisconnect(conn);};
        conn.on('close',gone);conn.on('error',gone);
      });
    };
    attempt();
  });
}
/* client: resolves once the data channel to the host is open */
export function joinRoom(code){
  return new Promise((resolve,reject)=>{
    const peer=new Peer(options());
    let opened=false;
    const timer=setTimeout(()=>{if(!opened){peer.destroy();reject(new Error('timeout'));}},25000);
    peer.on('error',e=>{if(!opened){clearTimeout(timer);peer.destroy();reject(e);}});
    peer.on('open',()=>{
      const conn=peer.connect(PREFIX+code.toUpperCase(),{reliable:true,serialization:'json'});
      conn.on('open',()=>{opened=true;clearTimeout(timer);Object.assign(net,{role:'client',code:code.toUpperCase(),peer,host:conn});resolve();});
      conn.on('data',m=>net.onMessage&&net.onMessage(m,conn));
      const lost=()=>{if(net.role==='client'){net.role='off';net.onHostLost&&net.onHostLost();}};
      conn.on('close',lost);conn.on('error',lost);
    });
  });
}
export function send(conn,msg){try{if(conn&&conn.open)conn.send(msg);}catch(e){}}
export function toHost(msg){send(net.host,msg);}
export function broadcast(msg){for(const c of net.conns)send(c,msg);}
export function leave(){
  const p=net.peer;Object.assign(net,{role:'off',code:null,peer:null,host:null});net.conns.clear();
  if(p)try{p.destroy();}catch(e){}
}
/* closing the tab tears the connections down straight away so others notice quickly */
window.addEventListener('pagehide',()=>{if(net.role!=='off')leave();});
export const roomFromUrl=()=>(params.get('room')||'').toUpperCase();
