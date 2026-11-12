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
function zipStore(files){ // files: [{name, data:Uint8Array}] | [{name:'dir/'}] | [{name, raw:{method,crc,csize,usize,bytes}}]
  const d=new Date(), dt=((d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1))&65535, dd=(((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate())&65535;
  const enc=new TextEncoder(), parts=[], cen=[]; let off=0;
  for(const f of files){
    const n=enc.encode(f.name), isDir=f.name.endsWith('/'); let body,m,c,cs,us;
    if(f.raw){body=f.raw.bytes;m=f.raw.method;c=f.raw.crc;cs=f.raw.csize;us=f.raw.usize}
    else{body=isDir?new Uint8Array(0):f.data;m=0;c=isDir?0:crc32(body);cs=us=body.length}
    const L=new Uint8Array([...u32(0x04034b50),20,0,0,8,...u16(m),...u16(dt),...u16(dd),...u32(c),...u32(cs),...u32(us),...u16(n.length),0,0]);
    parts.push(L,n,body);
    // external attr: file = -rw-r--r--, folder = drwxr-xr-x (+ MS-DOS folder bit)
    cen.push(new Uint8Array([...u32(0x02014b50),20,3,20,0,0,8,...u16(m),...u16(dt),...u16(dd),...u32(c),...u32(cs),...u32(us),...u16(n.length),0,0,0,0,0,0,0,0,...u32(isDir?0x41ED0010:0x81A40000),...u32(off)]),n);
    off+=L.length+n.length+body.length;
  }
  if(off>0xFFFFFFF0||files.length>65534)throw new Error('That is more than one zip can hold (4 GB). Build fewer games per zip.');
  let cs=0; cen.forEach(p=>cs+=p.length);
  const end=new Uint8Array([...u32(0x06054b50),0,0,0,0,...u16(files.length),...u16(files.length),...u32(cs),...u32(off),0,0]);
  return new Blob([...parts,...cen,end],{type:'application/zip'});
}
// Reads a zip's central directory. Returns [{name, method, crc, csize, usize, bytes}] where bytes are the still-compressed data (no inflating needed).
function zipList(b){
  const dv=new DataView(b.buffer,b.byteOffset,b.byteLength); let e=-1;
  for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--)if(dv.getUint32(i,true)===0x06054b50){e=i;break}
  if(e<0)throw new Error('this is not a zip file');
  const n=dv.getUint16(e+10,true), cdOff=dv.getUint32(e+16,true);
  if(n===0xFFFF||cdOff===0xFFFFFFFF)throw new Error('zip64 zips (over 4 GB) are not supported');
  const dec=new TextDecoder(), out=[]; let p=cdOff;
  for(let i=0;i<n;i++){
    if(p+46>b.length||dv.getUint32(p,true)!==0x02014b50)throw new Error('the zip is damaged (bad file list)');
    const fl=dv.getUint16(p+8,true), m=dv.getUint16(p+10,true), crc=dv.getUint32(p+16,true), cs=dv.getUint32(p+20,true), us=dv.getUint32(p+24,true),
      nl=dv.getUint16(p+28,true), xl=dv.getUint16(p+30,true), cl=dv.getUint16(p+32,true), lo=dv.getUint32(p+42,true);
    if(fl&1)throw new Error('password-protected zips are not supported');
    if(cs===0xFFFFFFFF||us===0xFFFFFFFF||lo===0xFFFFFFFF)throw new Error('zip64 zips (over 4 GB) are not supported');
    if(dv.getUint32(lo,true)!==0x04034b50)throw new Error('the zip is damaged (bad file header)');
    const ds=lo+30+dv.getUint16(lo+26,true)+dv.getUint16(lo+28,true);
    if(ds+cs>b.length)throw new Error('the zip is damaged or cut short');
    out.push({name:dec.decode(b.subarray(p+46,p+46+nl)),method:m,crc,csize:cs,usize:us,bytes:b.subarray(ds,ds+cs)});
    p+=46+nl+xl+cl;
  }
  return out;
}
// ---- Saves -------------------------------------------------------------------------------------------------
// The RetroArch PSP cores ignore the game folder for settings: they hard-code ms0:/PSP/RETROARCH as their home, read
// PSP/RETROARCH/retroarch.cfg from there, and look for PSP/RETROARCH/SAVEFILES and SAVESTATES (they log "savefile_directory is
// not a directory, ignoring" and never save when those are missing). With no config, autosave is off and a HOME exit
// loses everything. So the settings live in ONE shared PSP/RETROARCH/retroarch.cfg, and savefiles_in_content_dir /
// savestates_in_content_dir make each game write its .srm and .state.auto next to its ROM, so games stay separate.
const CFG_MARK='# ROM to PSP save settings';
const SAVE_CFG=CFG_MARK+' (the PSP cores only read this file from PSP/RETROARCH; do not move it)\n'+
 'savefiles_in_content_dir = \"true\"\nsavestates_in_content_dir = \"true\"\nsavestate_auto_save = \"true\"\nsavestate_auto_load = \"true\"\n'+
 'autosave_interval = \"10\"\nsavestate_thumbnail_enable = \"false\"\nconfig_save_on_exit = \"false\"\n';
const KEEP={savefiles:'Fallback folder for game saves (.srm). Do not delete this folder.\n',savestates:'Fallback folder for save states. Do not delete this folder.\n',system:'Cores look for BIOS files here. Do not delete this folder.\n'};
function saveFiles(base,shared){ // shared=true: base is 'PSP/RETROARCH/' (config + folders the cores need). A game folder needs nothing extra: its saves go next to the ROM.
  if(!shared)return [];
  const enc=new TextEncoder(), out=[{name:base},{name:base+'retroarch.cfg',data:enc.encode(SAVE_CFG)}];
  for(const k of ['savefiles','savestates','system'])out.push({name:base+k+'/'},{name:base+k+'/README.txt',data:enc.encode(KEEP[k])});
  return out;
}
// Repairs a zip made by an older ROM to PSP: adds PSP/RETROARCH/retroarch.cfg and its save folders, and resets file permissions to
// -rw-r--r--. Everything else is copied untouched (no re-compressing). Returns {entries, games, added, notes}.
function repairZip(bytes){
  const list=zipList(bytes), have=new Map(list.map(e=>[e.name.toLowerCase(),e])), notes=[], extra=[], bases=[], psp=new Set();
  for(const e of list){
    const m=/^(.*\/)?eboot\.pbp$/i.exec(e.name); if(!m||/(^|\/)__MACOSX\//.test(e.name))continue;
    const base=m[1]||''; if(!have.has((base+'core.pbp').toLowerCase())&&!have.has((base+'launch.txt').toLowerCase()))continue;
    bases.push(base); const g=/^(.*?\/)?PSP\/GAME\//i.exec(base); psp.add((g&&g[1]||'')+'PSP/');
  }
  const add=(f)=>{if(!have.has(f.name.toLowerCase())){have.set(f.name.toLowerCase(),f);extra.push(f)}};
  for(const p of psp){
    const cfg=have.get((p+'RETROARCH/retroarch.cfg').toLowerCase());
    if(cfg&&cfg.method===0&&new TextDecoder().decode(cfg.bytes).indexOf(CFG_MARK)!==0)notes.push('kept the retroarch.cfg already in '+p+'RETROARCH (add the lines from the README, "Core fixes round 4", if saves still fail)');
    saveFiles(p+'RETROARCH/',true).forEach(add);
  }
  const entries=list.map((e)=>({name:e.name,raw:e})).concat(extra);
  return {entries,games:bases.length,added:extra.length,notes};
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
if(typeof module!=='undefined')module.exports={sfo,pbp,checkPbp,zipStore,zipList,repairZip,saveFiles,SAVE_CFG,CFG_MARK,crc32,cleanTitle,slug,EXT,SYS};
