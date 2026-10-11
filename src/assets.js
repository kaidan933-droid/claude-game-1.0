import * as THREE from 'three';
import {RGBELoader} from 'three/examples/jsm/loaders/RGBELoader.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {renderer,scene,sky,sun,sunDir} from './core.js';
import {roadMat,gravelMat,concreteMat} from './track.js';
import {groundMat,hills,treeSpots} from './scenery.js';
import {setBikeTextures} from './models.js';

/* HD assets: real CC0 photo-scanned textures, an HDR sky and tree models from Poly Haven
   (polyhaven.com), found through its public API at runtime and swapped in as they arrive.
   Everything has a procedural fallback, so a blocked network or a missing asset only means the
   game keeps its built-in look. ?assets=<url> points at a mock API for testing. */
const params=new URLSearchParams(location.search);
const API=(params.get('assets')||'https://api.polyhaven.com').replace(/\/$/,'');
const maxAniso=renderer.capabilities.getMaxAnisotropy();

async function json(url,ms=15000){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);
  try{const r=await fetch(url,{signal:c.signal});if(!r.ok)throw new Error(r.status+' '+url);return await r.json();}
  finally{clearTimeout(t);}
}
/* pick an asset: a preferred id that exists, else the most downloaded one in the first category
   that has any */
async function pick(type,cats,prefer=[],filter=()=>true){
  for(const id of prefer){try{const f=await json(API+'/files/'+id,8000);if(f&&Object.keys(f).length)return id;}catch(e){}}
  for(const c of cats){
    let list;try{list=await json(API+'/assets?t='+type+'&c='+encodeURIComponent(c));}catch(e){continue;}
    const ids=Object.keys(list||{}).filter(id=>filter(id,list[id]));
    if(!ids.length)continue;
    const p=prefer.find(id=>ids.includes(id));
    return p||ids.sort((a,b)=>(list[b].download_count||0)-(list[a].download_count||0))[0];
  }
  throw new Error('no '+type+' in '+cats.join('/'));
}
const findKey=(o,re)=>Object.keys(o||{}).find(k=>re.test(k));
/* the file URL for one map of a texture set at the wanted resolution (falls back to any) */
function mapUrl(files,re,res,fmt){
  const k=findKey(files,re);if(!k)return null;
  const byRes=files[k],r=byRes[res]?res:Object.keys(byRes).sort()[0];
  const f=byRes[r]&&(byRes[r][fmt]||byRes[r].jpg||byRes[r].png);
  return f&&f.url;
}
const texLoader=new THREE.TextureLoader();texLoader.setCrossOrigin('anonymous');
const loadTex=(url,srgb)=>new Promise((res,rej)=>texLoader.load(url,t=>{
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=maxAniso;if(srgb)t.colorSpace=THREE.SRGBColorSpace;res(t);},undefined,rej));
async function textureSet(cats,prefer,res='1k'){
  const id=await pick('textures',cats,prefer);
  const files=await json(API+'/files/'+id);
  const [map,normal,rough]=await Promise.all([
    loadTex(mapUrl(files,/^diff/i,res,'jpg'),true),
    mapUrl(files,/nor_gl/i,res,'jpg')?loadTex(mapUrl(files,/nor_gl/i,res,'jpg'),false):null,
    mapUrl(files,/^rough/i,res,'jpg')?loadTex(mapUrl(files,/^rough/i,res,'jpg'),false):null]);
  return {id,map,normal,rough};
}
/* put a texture set on a material, tiled `rx` x `ry` across the mesh's UVs */
function apply(mat,set,rx,ry,normalScale=1){
  for(const t of [set.map,set.normal,set.rough])if(t)t.repeat.set(rx,ry);
  mat.map=set.map;mat.color.set(0xffffff);
  if(set.normal){mat.normalMap=set.normal;mat.normalScale=new THREE.Vector2(normalScale,normalScale);mat.bumpMap=null;}
  if(set.rough){mat.roughnessMap=set.rough;mat.roughness=1;}
  mat.needsUpdate=true;
}

/* HDR sky: background + image-based light, with the sun light moved to where the HDRI's sun is */
async function loadSky(){
  const id=await pick('hdris',['sunrise-sunset','skies','outdoor'],['kloppenheim_06','spruit_sunrise','kiara_1_dawn','belfast_sunset','venice_sunset','sunflowers']);
  const files=await json(API+'/files/'+id);
  const k=findKey(files,/^hdri$/i)||findKey(files,/hdr/i);
  const res=files[k]['2k']?'2k':Object.keys(files[k]).sort()[0];
  const url=files[k][res].hdr.url;
  const tex=await new Promise((r,j)=>new RGBELoader().setDataType(THREE.FloatType).load(url,r,undefined,j));
  tex.mapping=THREE.EquirectangularReflectionMapping;
  /* brightest region = sun; average of the horizon row = fog colour */
  const {data,width:w,height:h}=tex.image;let best=-1,bi=0;const hz=new THREE.Color(0,0,0);
  for(let y=0;y<h/2;y++)for(let x=0;x<w;x+=2){const o=(y*w+x)*4,l=data[o]+data[o+1]+data[o+2];if(l>best){best=l;bi=y*w+x;}}
  const hy=Math.floor(h*0.49);for(let x=0;x<w;x++){const o=(hy*w+x)*4;hz.r+=data[o];hz.g+=data[o+1];hz.b+=data[o+2];}
  hz.multiplyScalar(1/w);
  const by=Math.floor(bi/w),bx=bi%w,el=Math.max(0.12,(0.5-(by+0.5)/h)*Math.PI),ph=((bx+0.5)/w-0.5)*Math.PI*2;
  scene.background=tex;scene.backgroundIntensity=1;scene.environment=new THREE.PMREMGenerator(renderer).fromEquirectangular(tex).texture;
  scene.environmentIntensity=0.9;
  sunDir.set(Math.cos(ph)*Math.cos(el),Math.sin(el),Math.sin(ph)*Math.cos(el)).normalize();
  if(scene.fog){const m=Math.max(hz.r,hz.g,hz.b,1e-3);scene.fog.color.setRGB(hz.r/m*0.85,hz.g/m*0.85,hz.b/m*0.85);}
  sky.visible=false;if(hills)hills.visible=false;
  return id;
}

/* tree models: instanced, as many as a triangle budget allows */
async function loadTrees(){
  const ids=[];
  const isTree=(id,a)=>/tree/i.test(id)||(a.categories||[]).some(c=>/tree/i.test(c));
  try{ids.push(await pick('models',['trees','nature','plants','vegetation'],['island_tree_01','tree_small_02','fir_tree_01','pine_tree_01'],isTree));}catch(e){}
  if(!ids.length)throw new Error('no tree models');
  const gltfs=[];
  for(const id of ids){
    const files=await json(API+'/files/'+id);
    const g=files.gltf&&(files.gltf['1k']||files.gltf[Object.keys(files.gltf)[0]]);
    const entry=g&&g.gltf;if(!entry)continue;
    const inc=entry.include||{};
    const mgr=new THREE.LoadingManager();
    mgr.setURLModifier(u=>{for(const k in inc)if(u.endsWith(k))return inc[k].url;return u;});
    const loader=new GLTFLoader(mgr);loader.setCrossOrigin('anonymous');
    gltfs.push(await new Promise((r,j)=>loader.load(entry.url,r,undefined,j)));
  }
  let planted=0;
  for(const gl of gltfs){
    const parts=[];let tris=0;
    gl.scene.updateMatrixWorld(true);
    gl.scene.traverse(o=>{if(o.isMesh){const geo=o.geometry.clone().applyMatrix4(o.matrixWorld);
      parts.push([geo,o.material]);tris+=(geo.index?geo.index.count:geo.attributes.position.count)/3;}});
    const box=new THREE.Box3();parts.forEach(([g])=>{g.computeBoundingBox();box.union(g.boundingBox);});
    const height=Math.max(0.1,box.max.y-box.min.y),base=box.min.y;
    const count=Math.max(12,Math.min(320,Math.floor(4.5e6/Math.max(tris,1))));   // ~4.5M triangles for all trees
    const spots=treeSpots(count,22,420),d=new THREE.Object3D();
    const meshes=parts.map(([g,m])=>{if(m.map)m.map.anisotropy=maxAniso;m.alphaTest=m.alphaTest||(m.transparent?0.5:0);
      const im=new THREE.InstancedMesh(g,m,spots.length);im.castShadow=im.receiveShadow=true;scene.add(im);return im;});
    spots.forEach((p,i)=>{const s=(9+Math.random()*7)/height;
      d.position.set(p[0],p[1]-base*s,p[2]);d.rotation.set(0,Math.random()*6.28,0);d.scale.setScalar(s);d.updateMatrix();
      meshes.forEach(im=>im.setMatrixAt(i,d.matrix));});
    meshes.forEach(im=>{im.instanceMatrix.needsUpdate=true;im.computeBoundingSphere();});
    planted+=spots.length;
  }
  return planted+' trees';
}

/* ---------- public ---------- */
export const hd={enabled:true,done:0,ok:0,total:0,started:false,log:[]};
try{hd.enabled=localStorage.getItem('apex-hd')!=='off'&&localStorage.getItem('apex-quality')!=='low';}catch(e){}
const show=()=>{const el=document.getElementById('hdStatus');if(!el)return;
  el.textContent=!hd.enabled?'':!hd.started?'':hd.done<hd.total?'Loading HD assets '+hd.done+'/'+hd.total+'…'
    :hd.ok?hd.ok+' of '+hd.total+' HD asset groups loaded':'Couldn’t reach the HD asset library – using the built-in look';};
export function loadHD(){
  if(!hd.enabled||hd.started)return;hd.started=true;
  const jobs=[
    ['sky',loadSky],
    ['asphalt',async()=>{const s=await textureSet(['asphalt','road'],['asphalt_02','asphalt_track','asphalt_04']);apply(roadMat,s,4,5,0.8);return s.id;}],
    ['grass',async()=>{const s=await textureSet(['grass','terrain','ground','natural'],['aerial_grass_rock','grass_path_2','rocky_terrain_02']);apply(groundMat,s,1200,1200,0.6);return s.id;}],
    ['gravel',async()=>{const s=await textureSet(['gravel','ground','sand'],['gravel_floor','gravel_concrete_03','aerial_beach_01']);apply(gravelMat,s,4,2);return s.id;}],
    ['concrete',async()=>{const s=await textureSet(['concrete','wall','floor'],['concrete_wall_008','concrete_floor_02']);apply(concreteMat,s,2,1);return s.id;}],
    ['bike materials',async()=>{
      const [leather,metal]=await Promise.all([
        textureSet(['leather','fabric'],['leather_red_02','leather_white']).catch(()=>null),
        textureSet(['metal'],['metal_plate','metal_grate_rusty','brushed_metal']).catch(()=>null)]);
      if(!leather&&!metal)throw new Error('none found');
      setBikeTextures({leather,metal});return [leather&&leather.id,metal&&metal.id].filter(Boolean).join(', ')||'none';}],
    ['trees',loadTrees]];
  hd.total=jobs.length;show();
  for(const [name,fn] of jobs)fn().then(r=>{hd.ok++;hd.log.push(name+': '+r);},e=>{hd.log.push(name+': fallback ('+(e&&e.message)+')');})
    .finally(()=>{hd.done++;show();});
}
export function setHD(on){hd.enabled=on;try{localStorage.setItem('apex-hd',on?'on':'off');}catch(e){}show();if(on)loadHD();}
export const showHD=show;
