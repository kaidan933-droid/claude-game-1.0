/* Track layout, sampled every ~2 m. Pure math, no three.js, so it can run in Node for tests.

   The circuit is a shortened homage to the Nürburgring Nordschleife, run clockwise: a sequence of
   named sections with the real ones' character (Hatzenbach esses, the Flugplatz crest, flat-out
   Schwedenkreuz, the Fuchsröhre dip, the banked Karussell, the Pflanzgarten jump, the long
   Döttinger Höhe straight). Lengths, radii and elevation are invented but in the right range.

   Conventions: world x/z plane, y up. Heading h: direction (cos h, sin h). Curvature k > 0 turns
   right (clockwise seen from above). Lateral offset d > 0 is to the driver's right, along
   n = (-sin h, cos h). */

/* [kind, ...]
   'S', length, rise                       straight
   'T', radius, angle (deg, + right), rise, bank (deg, into the turn) */
const LAYOUT=[
  ['Start / Finish'],
  ['S',320,-2],
  ['Hatzenbach'],
  ['T',110,-45,-3],['S',50,-1],['T',85,62,-2],['S',40,0],['T',75,-58,-2],['S',45,0],['T',95,52,-2],['S',150,-6],
  ['Hocheichen'],
  ['T',65,79,-3],['S',100,6],
  ['Quiddelbacher Höhe'],
  ['S',165,7],
  ['Flugplatz',{crest:[2.6,15]}],
  ['S',130,-3],['T',260,30,-4],['S',380,-16],
  ['Schwedenkreuz'],
  ['T',320,-40,-10],['S',200,-6],
  ['Aremberg'],
  ['T',42,90,-2],
  ['Fuchsröhre'],
  ['S',170,-15],['T',420,-18,-18],['S',110,-8],['T',380,22,10],['S',150,12],
  ['Adenauer Forst'],
  ['T',38,-55,2],['S',25,0],['T',34,62,1],
  ['Metzgesfeld'],
  ['S',180,-3],['T',200,-45,-4],['S',80,0],['T',170,-35,-3],
  ['Kallenhard'],
  ['S',160,-4],['T',60,85,-3],
  ['Wehrseifen'],
  ['S',240,-18],['T',34,-80,-4],
  ['Breidscheid'],
  ['S',160,-10],['T',45,90,-2],
  ['Ex-Mühle'],
  ['S',90,2],['T',70,-62,3],
  ['Bergwerk'],
  ['S',260,6],['T',52,50,2],
  ['Kesselchen'],
  ['S',200,22],['T',450,-25,12],['S',150,16],['T',380,28,10],['S',100,8],
  ['Klostertal'],
  ['T',85,87,3],['S',260,14],
  ['Karussell'],
  ['T',30,-190,2,15],['S',140,6],
  ['Hohe Acht'],
  ['T',130,55,4],['S',90,2],['T',110,-50,0],['T',150,40,-2],
  ['Wippermann'],
  ['S',120,-4],['T',60,65,-2],['S',50,0],['T',60,-62,-2],
  ['Eschbach'],
  ['S',100,-4],['T',75,52,-3],
  ['Brünnchen'],
  ['S',180,-8],['T',55,90,-4],['S',160,-10],
  ['Pflanzgarten',{crest:[2.1,13]}],
  ['T',160,-30,-6],['S',150,-8],['S',120,-6],['T',130,38,-3],['T',120,-36,-2],
  ['Schwalbenschwanz'],
  ['S',260,-2],['T',38,120,0,8],['S',40,0],['T',60,-95,0],
  ['Galgenkopf'],
  ['S',220,0],['T',160,60,-2],
  ['Döttinger Höhe'],
  ['S',2000,10],
  ['Antoniusbuche'],
  ['T',900,-10,0],['S',200,0],
  ['Tiergarten'],
  ['T',220,25,-2],['S',120,0],
  ['Hohenrain'],
  ['T',32,60,0],['S',20,0],['T',40,-45,0],['S',750,0]
];

export const HW=5.2;          // half width of the asphalt
export const LINE=0.25;       // painted edge line inside HW
export const CURB_W=1.1;      // curb outside the asphalt (corners only)

function boxSmooth(a,w){      // circular moving average, w samples wide
  const n=a.length,o=new Float64Array(n),h=Math.floor(w/2);let acc=0;
  for(let j=-h;j<=h;j++)acc+=a[((j%n)+n)%n];
  for(let i=0;i<n;i++){o[i]=acc/(2*h+1);acc+=a[(i+h+1)%n]-a[((i-h)%n+n)%n];}
  return o;
}

export function buildTrack(){
  /* ---- 1. segments, with heading closed to exactly one clockwise turn ---- */
  const segs=[];let name='Start / Finish',feat=null;
  for(const e of LAYOUT){
    if(e.length<=2&&typeof e[0]==='string'&&e[0]!=='S'&&e[0]!=='T'){name=e[0];feat=e[1]||null;segs.push({mark:true,name,feat});continue;}
    if(e[0]==='S')segs.push({len:e[1],ang:0,rise:e[2],bank:0});
    else segs.push({r:e[1],ang:e[2]*Math.PI/180,rise:e[3],bank:(e[4]||0)*Math.PI/180});
  }
  const arcs=segs.filter(s=>!s.mark&&s.r);
  let net=0,abs=0;arcs.forEach(s=>{net+=s.ang;abs+=Math.abs(s.ang);});
  const c=(2*Math.PI-net)/abs;
  arcs.forEach(s=>{s.ang+=c*Math.abs(s.ang);s.len=s.r*Math.abs(s.ang);});
  /* ---- 2. close the loop by stretching straights (minimum-norm change) ---- */
  const real=segs.filter(s=>!s.mark);
  for(let it=0;it<(globalThis.__noClose?0:2);it++){
    let h=0,x=0,z=0;const straights=[];
    for(const s of real){
      if(s.r){const k=s.ang/s.len,steps=Math.max(4,Math.ceil(s.len/1));const dl=s.len/steps;
        for(let j=0;j<steps;j++){h+=k*dl/2;x+=Math.cos(h)*dl;z+=Math.sin(h)*dl;h+=k*dl/2;}}
      else{straights.push({s,ux:Math.cos(h),uz:Math.sin(h)});x+=Math.cos(h)*s.len;z+=Math.sin(h)*s.len;}
    }
    /* U dL = -E, dL = U^T (U U^T)^-1 (-E), weighted by length so long straights take more */
    let a=0,b=0,d=0;straights.forEach(q=>{const w=q.s.len;a+=w*q.ux*q.ux;b+=w*q.ux*q.uz;d+=w*q.uz*q.uz;});
    const det=a*d-b*b,ex=-x,ez=-z,lx=(d*ex-b*ez)/det,lz=(-b*ex+a*ez)/det;
    straights.forEach(q=>{q.s.len+=q.s.len*(q.ux*lx+q.uz*lz);q.s.len=Math.max(15,q.s.len);});
  }
  /* ---- 3. sample ---- */
  let LEN=0;real.forEach(s=>LEN+=s.len);
  const N=Math.round(LEN/2),ds=LEN/N;
  const kRaw=new Float64Array(N),rise=new Float64Array(N),bankRaw=new Float64Array(N);
  const sections=[],crests=[];
  {let s0=0,si=0;
    for(const s of segs){
      if(s.mark){sections.push({name:s.name,s:s0});if(s.feat&&s.feat.crest)crests.push({s:s0,h:s.feat.crest[0],w:s.feat.crest[1]});continue;}
      const i0=Math.round(s0/ds),i1=Math.round((s0+s.len)/ds);
      for(let i=i0;i<i1&&i<N;i++){kRaw[i]=s.r?s.ang/s.len:0;rise[i]=s.rise/Math.max(1,i1-i0);}
      /* banking (outside of the turn higher) runs a little past both ends of the arc */
      if(s.r&&s.bank)for(let i=i0-10;i<i1+14;i++)bankRaw[((i%N)+N)%N]=-s.bank*Math.sign(s.ang);
      s0+=s.len;si++;
    }
  }
  /* clothoid-ish transitions: smoothing the curvature keeps the total turning */
  let K=boxSmooth(boxSmooth(kRaw,13),9);
  let tot=0;for(let i=0;i<N;i++)tot+=K[i]*ds;
  for(let i=0;i<N;i++)K[i]*=2*Math.PI/tot;
  const X=new Float64Array(N),Z=new Float64Array(N),H=new Float64Array(N);
  {let x=0,z=0,h=0;
    for(let i=0;i<N;i++){X[i]=x;Z[i]=z;H[i]=h+K[i]*ds/2;h+=K[i]*ds/2;x+=Math.cos(h)*ds;z+=Math.sin(h)*ds;h+=K[i]*ds/2;}
    for(let i=0;i<N;i++){X[i]-=x*i/N;Z[i]-=z*i/N;}
  }
  /* elevation: drift removed, smoothed hard, then sharp crests added on top */
  let drift=0;for(let i=0;i<N;i++)drift+=rise[i];
  const Yr=new Float64Array(N);{let y=0;for(let i=0;i<N;i++){Yr[i]=y;y+=rise[i]-drift/N;}}
  let Y=boxSmooth(boxSmooth(boxSmooth(Yr,61),61),41);
  for(const c of crests){
    const ic=(c.s+60)/ds;
    for(let i=0;i<N;i++){let di=i-ic;di=((di%N)+N*1.5)%N-N/2;const x=di*ds/c.w;Y[i]+=c.h*Math.exp(-0.5*x*x);}
  }
  const BANK=boxSmooth(boxSmooth(bankRaw,15),9).map(b=>Math.tan(b));
  /* derived per-sample data */
  const TX=new Float64Array(N),TZ=new Float64Array(N),NX=new Float64Array(N),NZ=new Float64Array(N),DY=new Float64Array(N),DDY=new Float64Array(N);
  const m=i=>((i%N)+N)%N;
  for(let i=0;i<N;i++){
    const a=m(i+1),b=m(i-1);let tx=X[a]-X[b],tz=Z[a]-Z[b];const l=Math.hypot(tx,tz);tx/=l;tz/=l;
    TX[i]=tx;TZ[i]=tz;NX[i]=-tz;NZ[i]=tx;
    DY[i]=(Y[a]-Y[b])/(2*ds);DDY[i]=(Y[a]-2*Y[i]+Y[b])/(ds*ds);
  }
  /* recompute curvature from the final positions */
  for(let i=0;i<N;i++){const a=m(i+2),b=m(i-2);
    const h1=Math.atan2(TZ[b],TX[b]),h2=Math.atan2(TZ[a],TX[a]);let dh=h2-h1;dh=Math.atan2(Math.sin(dh),Math.cos(dh));K[i]=dh/(4*ds);}

  /* curbs where the corner is tight, runoff and barriers: wider on the outside of corners */
  const Kabs=boxSmooth(K.map(Math.abs),25);
  const CURB=new Uint8Array(N);
  for(let i=0;i<N;i++)if(Kabs[i]>1/260)CURB[i]=1;
  const BAR_L=new Float64Array(N),BAR_R=new Float64Array(N),GRAVEL_L=new Uint8Array(N),GRAVEL_R=new Uint8Array(N);
  const Ks=boxSmooth(K,41);
  for(let i=0;i<N;i++){
    /* outside of a right turn (k>0) is the left side */
    const out=Math.min(1,Math.abs(Ks[m(i-20)])*60);
    const base=HW+3.6;
    const wideL=Ks[m(i-20)]>0?out*9:0,wideR=Ks[m(i-20)]<0?out*9:0;
    BAR_L[i]=base+wideL;BAR_R[i]=base+wideR;
    if(wideL>4)GRAVEL_L[i]=1;if(wideR>4)GRAVEL_R[i]=1;
  }
  const bl=boxSmooth(BAR_L,31),br=boxSmooth(BAR_R,31);BAR_L.set(bl);BAR_R.set(br);
  /* the start/finish straight has a pit wall on the right and grandstand on the left */
  for(let i=m(-160);i!==m(140);i=m(i+1)){BAR_R[i]=HW+2.2;BAR_L[i]=HW+6;GRAVEL_L[i]=GRAVEL_R[i]=0;}
  {const ssm=boxSmooth(BAR_R,15);BAR_R.set(ssm);}

  const T={N,ds,LEN,X,Z,Y,H,TX,TZ,NX,NZ,K,DY,DDY,BANK,CURB,BAR_L,BAR_R,GRAVEL_L,GRAVEL_R,sections,crests,mod:m};
  T.idx=s=>m(Math.floor(s/ds));
  /* local search for the nearest sample, starting from a hint index */
  T.project=(x,z,hint)=>{
    let best=hint,bd=Infinity;
    for(let j=-6;j<=6;j++){const i=m(hint+j),dx=x-X[i],dz=z-Z[i],d=dx*dx+dz*dz;if(d<bd){bd=d;best=i;}}
    /* walk further if still at the window edge (fast cars, resets) */
    for(let guard=0;guard<400;guard++){
      const a=m(best+1),b=m(best-1);
      const da=(x-X[a])**2+(z-Z[a])**2,db=(x-X[b])**2+(z-Z[b])**2;
      if(da<bd){best=a;bd=da;}else if(db<bd){best=b;bd=db;}else break;
    }
    const dx=x-X[best],dz=z-Z[best];
    const along=dx*TX[best]+dz*TZ[best],d=dx*NX[best]+dz*NZ[best];
    return {i:best,s:best*ds+along,d,along};
  };
  T.lerp=(arr,s)=>{const f=(((s%LEN)+LEN)%LEN)/ds,i=Math.floor(f)%N,j=(i+1)%N,t=f-Math.floor(f);return arr[i]*(1-t)+arr[j]*t;};
  T.heightAt=(s,d)=>T.lerp(Y,s)+d*T.lerp(BANK,s);
  T.surfaceAt=(s,d)=>{
    const i=T.idx(s),a=Math.abs(d);
    if(a<=HW)return 0;                                        // asphalt
    if(a<=HW+CURB_W&&CURB[i])return 1;                        // curb
    if(d<0?GRAVEL_L[i]:GRAVEL_R[i])return a>HW+2.5?3:2;       // grass strip, then gravel
    return 2;                                                 // grass
  };
  T.sectionAt=s=>{s=((s%LEN)+LEN)%LEN;let r=sections[0];for(const q of sections)if(q.s<=s)r=q;return r;};
  /* corners for the HUD: runs of real curvature */
  T.corners=[];
  {let cur=null;
    for(let i=0;i<N;i++){const k=K[i];
      if(Math.abs(k)>1/250){const sg=Math.sign(k);
        if(cur&&cur.sg===sg&&i-cur.i1<=12){cur.i1=i;if(Math.abs(k)>cur.kmax){cur.kmax=Math.abs(k);cur.ip=i;}}
        else{cur={sg,i0:i,i1:i,kmax:Math.abs(k),ip:i};T.corners.push(cur);}
      }}
    T.corners=T.corners.filter(c=>c.i1-c.i0>=5);
    T.corners.forEach(c=>{c.r=1/c.kmax;c.kind=c.r<45?'hairpin':c.r<90?'tight':c.r<180?'medium':'fast';
      c.label=c.kind.charAt(0).toUpperCase()+c.kind.slice(1)+' '+(c.sg>0?'right':'left');c.name=T.sectionAt(c.ip*ds).name;});
  }
  return T;
}

/* Minimum-curvature racing line: lateral offsets inside the asphalt, relaxed at several scales. */
export function racingLine(T,margin=1.25){
  const {N,X,Z,NX,NZ,mod}=T,D=new Float64Array(N),lim=HW-margin;
  const px=new Float64Array(N),pz=new Float64Array(N);
  for(const k of [40,28,18,12,8,5,3]){
    for(let it=0;it<(k>8?160:120);it++){
      for(let i=0;i<N;i++){px[i]=X[i]+NX[i]*D[i];pz[i]=Z[i]+NZ[i]*D[i];}
      for(let i=0;i<N;i++){
        const a=mod(i-k),b=mod(i+k);
        const mx=(px[a]+px[b])/2,mz=(pz[a]+pz[b])/2;
        const delta=(mx-px[i])*NX[i]+(mz-pz[i])*NZ[i];
        D[i]=Math.max(-lim,Math.min(lim,D[i]+0.55*delta));
      }
    }
  }
  /* path curvature and segment lengths of the line */
  const LX=new Float64Array(N),LZ=new Float64Array(N),LK=new Float64Array(N),LDS=new Float64Array(N);
  for(let i=0;i<N;i++){LX[i]=X[i]+NX[i]*D[i];LZ[i]=Z[i]+NZ[i]*D[i];}
  for(let i=0;i<N;i++){const j=mod(i+1);LDS[i]=Math.hypot(LX[j]-LX[i],LZ[j]-LZ[i]);}
  for(let i=0;i<N;i++){
    const a=mod(i-3),b=mod(i+3);
    const h1=Math.atan2(LZ[i]-LZ[a],LX[i]-LX[a]),h2=Math.atan2(LZ[b]-LZ[i],LX[b]-LX[i]);
    let dh=h2-h1;dh=Math.atan2(Math.sin(dh),Math.cos(dh));
    let l=0;for(let j=-3;j<3;j++)l+=LDS[mod(i+j)];
    LK[i]=dh/(l/2);               // turn angle over the distance between chord midpoints
  }
  const sm=boxSmooth(LK,5);
  return {D,LX,LZ,LK:sm,LDS};
}
