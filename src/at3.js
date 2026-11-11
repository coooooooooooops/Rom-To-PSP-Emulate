// ATRAC3 encoder (132 kbps "LP2" layout, plain stereo, constant-length coding) -> .AT3 file bytes.
// Used for SND0.AT3, the sound the XMB plays while a game is highlighted. Pure JS, no dependencies.
const AT3=(()=>{
const QH=[-0.00001461907,-0.00009205479,-0.000056157569,0.00030117269,0.0002422519,-0.00085293897,-0.0005205574,0.0020340169,0.00078333891,-0.0042153862,-0.00075614988,0.0078402944,-0.000061169922,-0.01344162,0.0024626821,0.021736089,-0.007801671,-0.034090221,0.01880949,0.054326009,-0.043596379,-0.099384367,0.13207909,0.46424159];
const QW=new Float64Array(48);for(let i=0;i<24;i++)QW[i]=QW[47-i]=QH[i]*2;
const SUB=[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,176,192,224,256,288,320,352,384,416,448,480,512,576,640,704,768,896,1024];
const SFT=new Float64Array(64);for(let i=0;i<64;i++)SFT[i]=Math.pow(2,(i-15)/3);
const SELS=[1,3,5,6,7];                       // usable word lengths (selector ids), 2/3/4/5/6 bits per coefficient
const SBITS={1:2,3:3,5:4,6:5,7:6}, MAXQ={1:1,3:3,5:7,6:15,7:31}, INV={1:1/1.5,3:1/3.5,5:1/7.5,6:1/15.5,7:1/31.5};
const UNIT_BYTES=192, FRAME_BYTES=384, MAXFRAMES=1250;
// MDCT windows: the decoder's synthesis window is s/(s^2+(1-s)^2) with s=sin^2; the encoder uses s (their products overlap-add to 1)
const WS=new Float64Array(512), WA=new Float64Array(512);
for(let i=0;i<256;i++){const s=(Math.sin(((i+.5)/256-.5)*Math.PI)+1)/2;WA[i]=WA[511-i]=s;WS[i]=WS[511-i]=s/(s*s+(1-s)*(1-s))}
// DCT-IV table 256x256
const D4=new Float64Array(256*256);for(let k=0;k<256;k++)for(let n=0;n<256;n++)D4[k*256+n]=Math.cos(Math.PI/256*(n+.5)*(k+.5));
const CFG={mscale:-1/128,gamma:.45};
// one QMF analysis stage: x (len>=2M+48) -> lo,hi (len M)
function qmfA(x,M){const lo=new Float64Array(M),hi=new Float64Array(M);
 for(let m=0;m<M;m++){let a=0,b=0;const n=2*m;for(let t=0;t<24;t++){a+=QW[2*t]*x[n+47-2*t];b+=QW[2*t+1]*x[n+46-2*t]}lo[m]=(a+b)/2;hi[m]=(a-b)/2}
 return [lo,hi]}
// band signal b (len 256*(F+1)) -> spectrum for frame f (256 coefs), odd bands reversed
function mdct(b,f,odd,out,off){const z=new Float64Array(512),u=new Float64Array(256),o=256*f;
 for(let n=0;n<512;n++)z[n]=b[o+n]*WA[n];
 for(let n=0;n<128;n++)u[n]=-z[383-n]-z[384+n];
 for(let n=128;n<256;n++)u[n]=z[n-128]-z[383-n];
 for(let k=0;k<256;k++){let s=0;const r=k*256;for(let n=0;n<256;n++)s+=u[n]*D4[r+n];out[off+(odd?255-k:k)]=s*CFG.mscale}}
// quantise one unit's 1024 coefficients into a bit budget; returns Uint8Array(192)
function packUnit(c){
 const nu=32, E=new Float64Array(nu);
 for(let u=0;u<nu;u++){let e=0;for(let i=SUB[u];i<SUB[u+1];i++)e+=c[i]*c[i];E[u]=e}
 // candidate (selector, sf, error) tables
 const cand=[];
 for(let u=0;u<nu;u++){const n=SUB[u+1]-SUB[u];let pk=0;for(let i=SUB[u];i<SUB[u+1];i++)pk=Math.max(pk,Math.abs(c[i]));const row=[];
  for(const s of SELS){let si=pk>0?Math.ceil(3*Math.log2(pk/(INV[s]*MAXQ[s]))+15-1e-9):0;si=Math.max(0,Math.min(63,si));
   const step=SFT[si]*INV[s];let err=0;for(let i=SUB[u];i<SUB[u+1];i++){let q=Math.round(c[i]/step);q=Math.max(-MAXQ[s],Math.min(MAXQ[s],q));const d=c[i]-q*step;err+=d*d}
   row.push({s,si,err,bits:6+n*SBITS[s]})}
  cand.push(row)}
 const sel=new Int8Array(nu).fill(-1); // index into SELS or -1
 const wgt=new Float64Array(nu);for(let u=0;u<nu;u++)wgt[u]=1/Math.pow(E[u]/(SUB[u+1]-SUB[u])+1,CFG.gamma);
 const total=()=>{let last=-1,b=0;for(let u=0;u<nu;u++)if(sel[u]>=0){last=u;b+=cand[u][sel[u]].bits}
  const nb=last<0?0:(SUB[last+1]-1)>>8; return 6+2+3*(nb+1)+5+5+1+3*(last<0?1:last+1)+b}
 let cur=total();
 for(;;){let bu=-1,bi=0,br=0,bb=0;
  for(let u=0;u<nu;u++){const from=sel[u];const e0=from<0?E[u]:cand[u][from].err;
   for(let j=from+1;j<SELS.length;j++){const e1=cand[u][j].err;const old=sel[u];sel[u]=j;const t=total();sel[u]=old;const db=t-cur;if(t>UNIT_BYTES*8||db<=0)continue;
    const r=(e0-e1)*wgt[u]/db;if(r>br){br=r;bu=u;bi=j;bb=t}}}
  if(bu<0)break;sel[bu]=bi;cur=bb}
 // write
 let last=-1;for(let u=0;u<nu;u++)if(sel[u]>=0)last=u;
 const out=new Uint8Array(UNIT_BYTES);let pos=0;
 const put=(v,n)=>{for(let i=n-1;i>=0;i--){if((v>>>i)&1)out[pos>>3]|=0x80>>(pos&7);pos++}};
 const nb=last<0?0:(SUB[last+1]-1)>>8, ns=last<0?0:last;
 put(0x28,6);put(nb,2);for(let b=0;b<=nb;b++)put(0,3);put(0,5);put(ns,5);put(1,1);
 for(let u=0;u<=ns;u++)put(sel[u]<0?0:cand[u][sel[u]].s,3);
 for(let u=0;u<=ns;u++)if(sel[u]>=0)put(cand[u][sel[u]].si,6);
 for(let u=0;u<=ns;u++)if(sel[u]>=0){const k=cand[u][sel[u]],s=k.s,step=SFT[k.si]*INV[s],mq=MAXQ[s];
  const qs=[];for(let i=SUB[u];i<SUB[u+1];i++){let q=Math.round(c[i]/step);qs.push(Math.max(-mq,Math.min(mq,q)))}
  if(s===1){for(let i=0;i<qs.length;i+=2){const m=(q)=>q===0?0:q>0?1:3;put((m(qs[i])<<2)|m(qs[i+1]),4)}}
  else{const nbits=SBITS[s];for(const q of qs)put(q&((1<<nbits)-1),nbits)}}
 return out}
function le32(v){return[v&255,(v>>8)&255,(v>>16)&255,(v>>>24)&255]}function le16(v){return[v&255,(v>>8)&255]}
// L,R: Float32Array/Float64Array at 44100 Hz, values -1..1 (scaled to 16-bit range internally). Returns Uint8Array .at3
function encode(L,R,opts){opts=opts||{};const N=Math.min(L.length,MAXFRAMES*1024-2048);
 const F=Math.ceil(N/1024)+1, FR=Math.min(F,MAXFRAMES), len=1024*(FR+1)+64;
 const chans=[L,R], spec=[new Float64Array(FR*1024),new Float64Array(FR*1024)];
 for(let ch=0;ch<2;ch++){const x=new Float64Array(len);const src=chans[ch];for(let i=0;i<N;i++)x[i]=src[i]*32768;
  const [lo,hi]=qmfA(x,len/2-24);
  const pad=(a,n)=>{const r=new Float64Array(n+64);r.set(a.subarray(0,Math.min(a.length,n)));return r};
  const [b0,b1]=qmfA(pad(lo,len/2),len/4-24), [b3,b2]=qmfA(pad(hi,len/2),len/4-24);
  const bands=[b0,b1,b2,b3].map(b=>pad(b,256*(FR+1)));
  for(let f=0;f<FR;f++)for(let b=0;b<4;b++)mdct(bands[b],f,b&1,spec[ch],f*1024+b*256)}
 const data=new Uint8Array(FR*FRAME_BYTES);
 for(let f=0;f<FR;f++)for(let ch=0;ch<2;ch++)data.set(packUnit(spec[ch].subarray(f*1024,f*1024+1024)),f*FRAME_BYTES+ch*UNIT_BYTES);
 const samples=FR*1024, fmt=[...le16(0x270),...le16(2),...le32(44100),...le32(16538),...le16(FRAME_BYTES),...le16(0),...le16(14),
  ...le16(1),...le32(0x1000),...le16(0),...le16(0),...le16(1),...le16(0)];
 const body=[...[82,73,70,70],0,0,0,0,...[87,65,86,69],...[102,109,116,32],...le32(fmt.length),...fmt,...[102,97,99,116],...le32(8),...le32(N),...le32(0),...[100,97,116,97],...le32(data.length)];
 const head=new Uint8Array(body);const dv=new DataView(head.buffer);dv.setUint32(4,head.length-8+data.length,true);
 const out=new Uint8Array(head.length+data.length);out.set(head);out.set(data,head.length);return out}
return {encode,MAXFRAMES,CFG,_dbg:{qmfA,mdct,WA,WS}}})();
if(typeof module!=='undefined')module.exports=AT3;
