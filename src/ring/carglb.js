import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/examples/jsm/loaders/DRACOLoader.js';
import {lin} from './core.js';
import {SPEC} from './sim/car.js';
import {NOSE,TAIL} from './carmodel.js';

/* Optional real car model: public/models/gt3rs.glb (+ optional gt3rs.json overrides).
   The model is fitted to the physics car (length, ground, axle positions), its wheels are found and
   re-pivoted so they spin and steer, and the paint is recoloured per car. If the file is missing the
   game keeps the built-in car. */
const BASE='models/';
const ZF=SPEC.a,ZR=-(SPEC.wb-SPEC.a);

async function fetchJSON(url){try{const r=await fetch(url);if(!r.ok)return null;return await r.json();}catch(e){return null;}}
async function exists(url){try{const r=await fetch(url,{method:'HEAD'});return r.ok&&!/text\/html/.test(r.headers.get('content-type')||'');}catch(e){return false;}}

export async function loadCarModel(){
  if(!(await exists(BASE+'gt3rs.glb')))return null;
  const cfg=(await fetchJSON(BASE+'gt3rs.json'))||{};
  const loader=new GLTFLoader();
  const draco=new DRACOLoader();draco.setDecoderPath('draco/');loader.setDRACOLoader(draco);
  const gltf=await new Promise((res,rej)=>loader.load(BASE+'gt3rs.glb',res,undefined,rej));
  const src=gltf.scene;
  /* ---- orient and scale: length along z, nose to +z, sitting on the ground ---- */
  src.updateMatrixWorld(true);
  let box=new THREE.Box3().setFromObject(src),size=box.getSize(new THREE.Vector3());
  const holder=new THREE.Group();holder.add(src);
  if(size.x>size.z)src.rotation.y+=Math.PI/2;
  if(cfg.rotateY)src.rotation.y+=cfg.rotateY*Math.PI/180;
  holder.updateMatrixWorld(true);box=new THREE.Box3().setFromObject(holder);size=box.getSize(new THREE.Vector3());
  const s=(NOSE-TAIL)/size.z;src.scale.multiplyScalar(s);
  holder.updateMatrixWorld(true);box=new THREE.Box3().setFromObject(holder);
  /* front heuristic: the nose is the lower end (unless the config says otherwise) */
  let fwd=cfg.forward||0;
  if(!fwd){
    /* best cue: tail lights at the back, headlights at the front (by mesh or material name) */
    let rear=0,nr=0,front=0,nf=0;
    src.traverse(o=>{if(!o.isMesh)return;const nm=(o.name+' '+(Array.isArray(o.material)?'':o.material.name||'')).toLowerCase();
      if(/steer|wheel|brake/.test(nm))return;
      const c=new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
      if(/tail|lights?_red|rear.?light|stop/.test(nm)){rear+=c.z;nr++;}
      else if(/head|projector|front.?light/.test(nm)){front+=c.z;nf++;}});
    if(nr&&nf)fwd=front/nf>rear/nr?1:-1;else if(nr)fwd=rear/nr<(box.min.z+box.max.z)/2?1:-1;else if(nf)fwd=front/nf>(box.min.z+box.max.z)/2?1:-1;
  }
  if(!fwd){
    const zMid=(box.min.z+box.max.z)/2;let hiF=0,hiR=0;
    src.traverse(o=>{if(!o.isMesh)return;const b=new THREE.Box3().setFromObject(o),c=b.getCenter(new THREE.Vector3());if(c.z>zMid)hiF=Math.max(hiF,b.max.y);else hiR=Math.max(hiR,b.max.y);});
    fwd=hiF<=hiR?1:-1;
  }
  if(fwd<0){src.rotation.y+=Math.PI;holder.updateMatrixWorld(true);box=new THREE.Box3().setFromObject(holder);}
  src.position.y-=box.min.y;src.position.z+=(NOSE+TAIL)/2-(box.min.z+box.max.z)/2;src.position.x-=(box.min.x+box.max.x)/2;
  holder.updateMatrixWorld(true);
  return {holder,cfg};
}

const WHEEL_RE=/wheel|tire|tyre|rim|felge|reifen/i,PAINT_RE=/paint|body|carpaint|exterior|lack/i,TAIL_RE=/tail|brake|rear.?light|stop/i;

/* one car from the loaded template */
export function buildCarGLB(tpl,color){
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);
  const car=tpl.holder.clone(true);body.add(car);
  car.updateMatrixWorld(true);
  const paint=new THREE.MeshPhysicalMaterial({color:lin(color),metalness:0.35,roughness:0.34,clearcoat:1,clearcoatRoughness:0.04,envMapIntensity:1.2});
  let tail=null;const cfg=tpl.cfg;
  car.traverse(o=>{
    if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;
    const mats=Array.isArray(o.material)?o.material:[o.material];
    const out=mats.map(m=>{
      const nm=(m.name||'')+' '+(o.name||'');
      if(cfg.paintMaterial?m.name===cfg.paintMaterial:PAINT_RE.test(m.name||''))return paint;
      if(cfg.tailMaterial?m.name===cfg.tailMaterial:TAIL_RE.test(nm)){const t=m.clone();t.emissive=new THREE.Color(1,0.05,0.03);t.emissiveIntensity=0.6;tail=tail||t;return t;}
      if(/glass|window|scheibe/i.test(nm)){m.transparent=true;m.opacity=Math.min(m.opacity??1,0.55);}
      return m;
    });
    o.material=Array.isArray(o.material)?out:out[0];
  });
  /* wheels: by name, grouped into the four corners, re-pivoted at their own centres */
  const found=[];
  car.traverse(o=>{if(!o.isMesh)return;const nm=o.name+' '+(o.parent?o.parent.name:'');
    if(cfg.wheelNames?cfg.wheelNames.some(w=>nm.includes(w)):WHEEL_RE.test(nm))found.push(o);});
  const corners=[[1,1],[1,0],[0,1],[0,0]].map(([front,left])=>({front,left,objs:[]}));
  for(const o of found){const c=new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
    /* only parts that sit where a road wheel can be (not the steering wheel or spare parts) */
    const front=c.z>(ZF+ZR)/2?1:0,axle=front?ZF:ZR;
    if(Math.abs(c.x)<0.45||c.y>0.75||Math.abs(c.z-axle)>0.7)continue;
    const left=c.x>0?1:0;corners.find(k=>k.front===front&&k.left===left).objs.push(o);}
  const wheels=corners.map(k=>{
    const g=new THREE.Group(),spin=new THREE.Group();g.add(spin);
    if(k.objs.length){
      const b=new THREE.Box3();k.objs.forEach(o=>b.expandByObject(o));const c=b.getCenter(new THREE.Vector3());
      g.position.copy(c);root.add(g);g.updateMatrixWorld(true);
      k.objs.forEach(o=>spin.attach(o));
    }else{g.position.set(k.left?SPEC.tf/2:-SPEC.tf/2,k.front?SPEC.rf:SPEC.rr,k.front?ZF:ZR);root.add(g);}
    const dummy=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial());dummy.visible=false;
    return {g,spin,disc:dummy,cal:dummy,face:dummy,left:k.left,front:k.front,glb:true,r:k.front?SPEC.rf:SPEC.rr};
  });
  const empty=()=>{const o=new THREE.Group();body.add(o);return o;};
  return {root,body,wheels,paint,tail:tail||new THREE.MeshStandardMaterial(),steeringWheel:empty(),wingFlap:empty(),wingMain:empty(),
    cab:empty(),inner:empty(),shell:car,glb:true};
}
