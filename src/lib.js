const u32=(v)=>[v&255,(v>>8)&255,(v>>16)&255,(v>>>24)&255], u16=(v)=>[v&255,(v>>8)&255];
function sfo(title){
  const t=new TextEncoder().encode(title.slice(0,60)+'\0'), tmax=Math.max(4,(t.length+3)&~3);
  const keys=['MEMSIZE','BOOTABLE','CATEGORY','DISC_ID','DISC_VERSION','PARENTAL_LEVEL','PSP_SYSTEM_VER','REGION','TITLE'];
  const enc=new TextEncoder(), ko=[]; let kt=[]; keys.forEach(k=>{ko.push(kt.length);kt.push(...enc.encode(k),0)}); while(kt.length%4)kt.push(0);
  const S=(s)=>[...enc.encode(s),0], I=(v)=>u32(v);
  const ent=[['0404',I(1),4],['0404',I(1),4],['0204',S('MG'),4],['0204',S('UCJS10041'),12],['0204',S('1.00'),8],['0404',I(1),4],['0204',S('1.00'),8],['0404',I(32768),4],['0204',[...t],tmax]];
  const kstart=20+16*keys.length, dstart=kstart+kt.length; let off=0, hdr=[0,80,83,70,...u32(0x101),...u32(kstart),...u32(dstart),...u32(keys.length)], data=[];
  ent.forEach((e,i)=>{hdr.push(...u16(ko[i]),...u16(parseInt(e[0],16)),...u32(e[1].length),...u32(e[2]),...u32(off));const d=e[1].slice();while(d.length<e[2])d.push(0);data.push(...d);off+=e[2]});
  return new Uint8Array([...hdr,...kt,...data]);
}
function pbp(sfoB,icon,pic,psp,snd){ // slots: PARAM.SFO, ICON0, ICON1, PIC0, PIC1, SND0, DATA.PSP, DATA.PSAR
  const parts=[sfoB,icon,new Uint8Array(0),new Uint8Array(0),pic,snd||new Uint8Array(0),psp]; let o=40; const offs=[];
  parts.forEach(p=>{offs.push(o);o+=p.length}); offs.push(o);
  const h=new Uint8Array([0,80,66,80,...u32(0x10000),...offs.flatMap(u32)]);
  return new Blob([h,...parts]);
}

// Throws a readable Error if an EBOOT.PBP would not be accepted by the XMB (bad header, unsorted/missing SFO keys, wrong PNG sizes, bad AT3).
function checkPbp(b){
  const dv=new DataView(b.buffer,b.byteOffset,b.byteLength), rd=(o)=>dv.getUint32(o,true), bad=(m)=>{throw new Error('EBOOT check failed: '+m)};
  if(b.length<40||b[0]!==0||b[1]!==80||b[2]!==66||b[3]!==80)bad('not a PBP');
  const o=[];for(let i=0;i<8;i++)o.push(rd(8+4*i)); if(o[0]!==40)bad('SFO must start at 40'); if(o[7]!==b.length)bad('DATA.PSAR offset');
  for(let i=1;i<8;i++)if(o[i]<o[i-1]||o[i]>b.length)bad('offsets out of order');
  const sfoLen=o[1]-o[0]; if(rd(o[0]+16)<9||sfoLen<100)bad('SFO too small');
  const n=rd(o[0]+16),kt=o[0]+rd(o[0]+8),dt=o[0]+rd(o[0]+12),keys={};
  for(let i=0;i<n;i++){const e=o[0]+20+16*i,ko=dv.getUint16(e,true);let k='';for(let j=kt+ko;b[j];j++)k+=String.fromCharCode(b[j]);keys[k]=dt+rd(e+12)}
  for(const k of ['BOOTABLE','CATEGORY','TITLE','MEMSIZE'])if(!(k in keys))bad('SFO lacks '+k);
  if(String.fromCharCode(b[keys.CATEGORY],b[keys.CATEGORY+1])!=='MG')bad('CATEGORY must be MG');
  const png=(a,z,w,h,name)=>{if(z-a<33||b[a]!==0x89||b[a+1]!==80||b[a+2]!==78||b[a+3]!==71)bad(name+' is not a PNG');
   if(dv.getUint32(a+16)!==w||dv.getUint32(a+20)!==h)bad(name+' must be '+w+'x'+h+' (is '+dv.getUint32(a+16)+'x'+dv.getUint32(a+20)+')');
   if(z-a>500000)bad(name+' PNG is too large ('+(z-a)+' bytes)')};
  png(o[1],o[2],144,80,'ICON0'); png(o[4],o[5],480,272,'PIC1');
  if(o[6]>o[5]){const a=o[5],z=o[6];if(z-a>500000)bad('SND0.AT3 over 500 KB');
   if(String.fromCharCode(b[a],b[a+1],b[a+2],b[a+3])!=='RIFF'||String.fromCharCode(b[a+8],b[a+9],b[a+10],b[a+11])!=='WAVE')bad('SND0 is not a RIFF/WAVE (AT3) file');
   if(dv.getUint16(a+20,true)!==0x270)bad('SND0 is not ATRAC3')}
  if(!(b[o[6]]===0x7f&&b[o[6]+1]===69&&b[o[6]+2]===76&&b[o[6]+3]===70))bad('DATA.PSP is not an ELF');
  return true}
const CT=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(b){let c=~0;for(let i=0;i<b.length;i++)c=CT[(c^b[i])&255]^(c>>>8);return ~c>>>0}
function zipStore(files){ // files: [{name, data:Uint8Array}]
  const d=new Date(), dt=((d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1))&65535, dd=(((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate())&65535;
  const enc=new TextEncoder(), parts=[], cen=[]; let off=0;
  for(const f of files){
    const n=enc.encode(f.name), c=crc32(f.data), L=new Uint8Array([...u32(0x04034b50),20,0,0,8,0,0,...u16(dt),...u16(dd),...u32(c),...u32(f.data.length),...u32(f.data.length),...u16(n.length),0,0]);
    parts.push(L,n,f.data);
    cen.push(new Uint8Array([...u32(0x02014b50),20,3,20,0,0,8,0,0,...u16(dt),...u16(dd),...u32(c),...u32(f.data.length),...u32(f.data.length),...u16(n.length),0,0,0,0,0,0,0,0,...u32(0x81A40000),...u32(off)]),n); // external attr = -rw-r--r--
    off+=L.length+n.length+f.data.length;
  }
  let cs=0; cen.forEach(p=>cs+=p.length);
  const end=new Uint8Array([...u32(0x06054b50),0,0,0,0,...u16(files.length),...u16(files.length),...u32(cs),...u32(off),0,0]);
  return new Blob([...parts,...cen,end],{type:'application/zip'});
}
const SYS={
 gba:{core:'gba',name:'Game Boy Advance',repo:'Nintendo_-_Game_Boy_Advance',hue:265},
 snes:{core:'snes',name:'Super Nintendo',repo:'Nintendo_-_Super_Nintendo_Entertainment_System',hue:285},
 nes:{core:'nes',name:'NES',repo:'Nintendo_-_Nintendo_Entertainment_System',hue:5},
 gb:{core:'gb',name:'Game Boy',repo:'Nintendo_-_Game_Boy',hue:95},
 gbc:{core:'gb',name:'Game Boy Color',repo:'Nintendo_-_Game_Boy_Color',hue:170},
 md:{core:'md',name:'Mega Drive / Genesis',repo:'Sega_-_Mega_Drive_-_Genesis',hue:225},
 sms:{core:'md',name:'Master System',repo:'Sega_-_Master_System_-_Mark_III',hue:15},
 gg:{core:'md',name:'Game Gear',repo:'Sega_-_Game_Gear',hue:200},
 pce:{core:'pce',name:'PC Engine',repo:'NEC_-_PC_Engine_-_TurboGrafx_16',hue:30}};
const EXT={gba:'gba',sfc:'snes',smc:'snes',swc:'snes',fig:'snes',nes:'nes',gb:'gb',gbc:'gbc',md:'md',gen:'md',smd:'md',sms:'sms',gg:'gg',pce:'pce'};
const NO={z64:'N64',n64:'N64',v64:'N64',iso:'a disc game',cue:'a disc game',chd:'a disc game',cso:'a disc game',gcm:'GameCube',nds:'Nintendo DS',zip:'a zip (unzip it first)','7z':'an archive (unzip it first)',bin:'an unclear .bin (rename it to .md for Genesis or .gba for GBA)'};
function cleanTitle(fn){return fn.replace(/\.[^.]+$/,'').replace(/\s*[\(\[][^\)\]]*[\)\]]/g,'').replace(/\s*#.*$/,'').replace(/_/g,' ').replace(/\s+/g,' ').trim()||'Game'}
function slug(s){return s.normalize('NFKD').replace(/[^\x00-\x7f]/g,'').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,24)||'GAME'}
if(typeof module!=='undefined')module.exports={sfo,pbp,checkPbp,zipStore,crc32,cleanTitle,slug,EXT,SYS};
