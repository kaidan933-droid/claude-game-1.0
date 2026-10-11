import * as THREE from 'three';
import {rnd,maxAniso} from './core.js';

/* Generated PBR surface sets: colour, normal (from a height field) and roughness maps.
   draw(ctx) paints colour; height(x,y) and rough(x,y) come from Float32 arrays filled by fill(). */
function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function texFrom(c,srgb,repeat=true){const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=repeat?THREE.RepeatWrapping:THREE.ClampToEdgeWrapping;t.anisotropy=maxAniso;if(srgb)t.colorSpace=THREE.SRGBColorSpace;return t;}
/* tileable value noise */
function noiseField(w,h,cell,seed){
  const gw=Math.ceil(w/cell),gh=Math.ceil(h/cell),g=new Float32Array(gw*gh);for(let i=0;i<g.length;i++)g[i]=rnd();
  const out=new Float32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const fx=x/cell,fy=y/cell,x0=Math.floor(fx),y0=Math.floor(fy),u=fx-x0,v=fy-y0,su=u*u*(3-2*u),sv=v*v*(3-2*v);
    const a=g[(y0%gh)*gw+(x0%gw)],b=g[(y0%gh)*gw+((x0+1)%gw)],c=g[((y0+1)%gh)*gw+(x0%gw)],d=g[((y0+1)%gh)*gw+((x0+1)%gw)];
    out[y*w+x]=(a*(1-su)+b*su)*(1-sv)+(c*(1-su)+d*su)*sv;}
  return out;
}
function fbmField(w,h,cells){const out=new Float32Array(w*h);let amp=1,tot=0;for(const c of cells){const f=noiseField(w,h,c);for(let i=0;i<out.length;i++)out[i]+=f[i]*amp;tot+=amp;amp*=0.5;}for(let i=0;i<out.length;i++)out[i]/=tot;return out;}
function normalMap(H,w,h,strength){
  const c=canvas(w,h),g=c.getContext('2d'),img=g.createImageData(w,h),d=img.data;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const l=H[y*w+(x-1+w)%w],r=H[y*w+(x+1)%w],u=H[((y-1+h)%h)*w+x],dn=H[((y+1)%h)*w+x];
    let nx=(l-r)*strength,ny=(dn-u)*strength,nz=1;const L=Math.hypot(nx,ny,nz);nx/=L;ny/=L;nz/=L;
    const i=(y*w+x)*4;d[i]=(nx*0.5+0.5)*255;d[i+1]=(ny*0.5+0.5)*255;d[i+2]=(nz*0.5+0.5)*255;d[i+3]=255;}
  g.putImageData(img,0,0);return c;
}
function greyMap(V,w,h){const c=canvas(w,h),g=c.getContext('2d'),img=g.createImageData(w,h),d=img.data;
  for(let i=0;i<w*h;i++){const v=Math.max(0,Math.min(255,V[i]*255));d[i*4]=d[i*4+1]=d[i*4+2]=v;d[i*4+3]=255;}g.putImageData(img,0,0);return c;}
function colourMap(C,w,h){const c=canvas(w,h),g=c.getContext('2d'),img=g.createImageData(w,h),d=img.data;
  for(let i=0;i<w*h;i++){d[i*4]=C[i*3];d[i*4+1]=C[i*3+1];d[i*4+2]=C[i*3+2];d[i*4+3]=255;}g.putImageData(img,0,0);return c;}

/* ---------------- asphalt: 10.4 m wide x 10.4 m long per tile ---------------- */
export function asphaltSet(size=1024,{lines=true}={}){
  const w=size,h=size,N=w*h,H=new Float32Array(N),R=new Float32Array(N),C=new Float32Array(N*3);
  const big=fbmField(w,h,[256,128,64]),mid=fbmField(w,h,[32,16]),fine=fbmField(w,h,[2,1]);
  for(let i=0;i<N;i++){
    const base=0.27+0.05*(big[i]-0.5)+0.06*(mid[i]-0.5)+0.05*(fine[i]-0.5);
    C[i*3]=C[i*3+1]=base*255;C[i*3+2]=base*255*1.03;
    H[i]=fine[i]*0.5;R[i]=0.88+0.08*(fine[i]-0.5);
  }
  /* aggregate: small light and dark stones that sit proud of the bitumen */
  const stones=Math.round(N/14);
  for(let s=0;s<stones;s++){
    const cx=(rnd()*w)|0,cy=(rnd()*h)|0,r=(0.5+rnd()*1.0)*w/1024*1.6,shade=rnd()<0.6?0.31+rnd()*0.1:0.17+rnd()*0.05;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const d=Math.hypot(dx,dy);if(d>r)continue;
      const x=(cx+dx+w)%w,y=(cy+dy+h)%h,i=y*w+x,k=1-d/r;
      C[i*3]=C[i*3+1]=C[i*3+2]=shade*255*(0.85+0.15*k);H[i]+=0.35*k;R[i]=0.72;}
  }
  /* sealed cracks: glossy tar snakes */
  for(let s=0;s<8;s++){let x=rnd()*w,y=rnd()*h,a=rnd()*Math.PI*2;const len=60+rnd()*300;
    for(let t=0;t<len;t++){a+=(rnd()-0.5)*0.5;x+=Math.cos(a);y+=Math.sin(a)*1.2;
      for(let k=-1;k<=1;k++){const xx=((((x+k)|0)%w)+w)%w,yy=(((y|0)%h)+h)%h,i=yy*w+xx;C[i*3]=C[i*3+1]=C[i*3+2]=28;R[i]=0.35;H[i]+=0.15;}}}
  /* repair patches: slightly different, smoother asphalt in rectangles */
  for(let s=0;s<5;s++){const x0=(rnd()*w)|0,y0=(rnd()*h)|0,pw=60+(rnd()*260)|0,ph=80+(rnd()*360)|0,tone=rnd()<0.5?0.8:1.15;
    for(let y=y0;y<y0+ph;y++)for(let x=x0;x<x0+pw;x++){const i=((y%h)*w+(x%w));C[i*3]*=tone;C[i*3+1]*=tone;C[i*3+2]*=tone;H[i]*=0.6;R[i]=Math.min(R[i],0.8);}
    /* seam */
    for(let y=y0;y<y0+ph;y++)for(const x of [x0,x0+pw]){const i=((y%h)*w+(x%w));C[i*3]=C[i*3+1]=C[i*3+2]=35;R[i]=0.4;}
    for(let x=x0;x<x0+pw;x++)for(const y of [y0,y0+ph]){const i=((y%h)*w+(x%w));C[i*3]=C[i*3+1]=C[i*3+2]=35;R[i]=0.4;}}
  /* oil and rubber stains */
  for(let s=0;s<10;s++){const cx=rnd()*w,cy=rnd()*h,r=8+rnd()*40;
    for(let y=cy-r;y<cy+r;y++)for(let x=cx-r;x<cx+r;x++){const d=Math.hypot(x-cx,y-cy)/r;if(d>1)continue;const i=((((y|0)%h)+h)%h)*w+((((x|0)%w)+w)%w);const k=(1-d)*0.35;
      C[i*3]*=1-k;C[i*3+1]*=1-k;C[i*3+2]*=1-k;R[i]-=k*0.5;}}
  /* edge lines: 12 cm wide, 25 cm in from the edge, worn */
  if(lines){const px=w/10.4;
    for(const x0 of [0.25*px,w-0.37*px])for(let y=0;y<h;y++)for(let x=x0|0;x<(x0+0.12*px)|0;x++){
      const i=y*w+x;const wear=fine[i]>0.62||rnd()<0.04;if(wear)continue;
      const v=0.86+0.08*mid[i];C[i*3]=v*246;C[i*3+1]=v*244;C[i*3+2]=v*236;R[i]=0.55;H[i]+=0.25;}}
  const set={map:texFrom(colourMap(C,w,h),true),normalMap:texFrom(normalMap(H,w,h,1.4),false),roughnessMap:texFrom(greyMap(R,w,h),false)};
  if(lines)for(const t of Object.values(set))t.wrapS=THREE.ClampToEdgeWrapping;
  return set;
}

/* ---------------- kerb: 1 m red/white blocks with grooves (u across, v along 2 m) ---------------- */
export function kerbSet(colA=[196,38,34],colB=[236,232,224]){
  const w=128,h=256,N=w*h,H=new Float32Array(N),R=new Float32Array(N),C=new Float32Array(N*3),fine=fbmField(w,h,[4,2]);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,c=y<h/2?colA:colB,d=0.9+0.12*(fine[i]-0.5);
    const dirt=Math.max(0,1-x/30)*0.25;
    C[i*3]=c[0]*d*(1-dirt);C[i*3+1]=c[1]*d*(1-dirt);C[i*3+2]=c[2]*d*(1-dirt);
    /* transverse grooves */
    const g=(y%32)<4?0:1;H[i]=g*0.8+fine[i]*0.2;R[i]=0.5+(1-g)*0.3+0.1*fine[i];}
  return {map:texFrom(colourMap(C,w,h),true),normalMap:texFrom(normalMap(H,w,h,4),false),roughnessMap:texFrom(greyMap(R,w,h),false)};
}

/* ---------------- grass: short-mown verge (tile ~4 m) ---------------- */
export function grassSet(size=512){
  const w=size,h=size,N=w*h,H=new Float32Array(N),R=new Float32Array(N),C=new Float32Array(N*3);
  const big=fbmField(w,h,[128,64]),mid=fbmField(w,h,[16,8]);
  for(let i=0;i<N;i++){const t=big[i],m=mid[i];
    C[i*3]=(66+38*t+16*m);C[i*3+1]=(84+34*t+18*m);C[i*3+2]=(44+16*t);H[i]=m*0.3;R[i]=0.95;}
  /* blades */
  for(let s=0;s<N/5;s++){const x=(rnd()*w)|0,y=(rnd()*h)|0,len=2+(rnd()*5)|0,lt=rnd();
    for(let k=0;k<len;k++){const i=((y-k+h)%h)*w+((x+(k>>2)+w)%w);const v=0.75+lt*0.6;C[i*3]=Math.min(255,C[i*3]*v+8*lt);C[i*3+1]=Math.min(255,C[i*3+1]*v+14*lt);C[i*3+2]*=v;H[i]+=0.6*(1-k/len);}}
  /* clover and dry patches */
  for(let s=0;s<40;s++){const cx=rnd()*w,cy=rnd()*h,r=4+rnd()*14,dry=rnd()<0.4;
    for(let y=cy-r;y<cy+r;y++)for(let x=cx-r;x<cx+r;x++){if(Math.hypot(x-cx,y-cy)>r)continue;const i=((((y|0)%h)+h)%h)*w+((((x|0)%w)+w)%w);
      if(dry){C[i*3]=C[i*3]*1.25+15;C[i*3+1]*=1.1;}else{C[i*3]*=0.85;C[i*3+1]*=1.05;}}}
  return {map:texFrom(colourMap(C,w,h),true),normalMap:texFrom(normalMap(H,w,h,2.5),false)};
}

/* ---------------- gravel trap ---------------- */
export function gravelSet(size=512){
  const w=size,h=size,N=w*h,H=new Float32Array(N),R=new Float32Array(N).fill(0.95),C=new Float32Array(N*3);
  for(let i=0;i<N;i++){C[i*3]=150;C[i*3+1]=136;C[i*3+2]=112;}
  for(let s=0;s<N/9;s++){const cx=(rnd()*w)|0,cy=(rnd()*h)|0,r=1.2+rnd()*2.6,t=0.65+rnd()*0.55,warm=rnd()*20;
    for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const d=Math.hypot(dx,dy*1.2);if(d>r)continue;const i=((cy+dy+h)%h)*w+((cx+dx+w)%w),k=1-d/r;
      C[i*3]=(178+warm)*t;C[i*3+1]=(164+warm*0.6)*t;C[i*3+2]=138*t;H[i]=Math.max(H[i],k);R[i]=0.85;}}
  return {map:texFrom(colourMap(C,w,h),true),normalMap:texFrom(normalMap(H,w,h,5),false),roughnessMap:texFrom(greyMap(R,w,h),false)};
}
