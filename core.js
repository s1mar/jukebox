/* Jukebox core: pure functions, no DOM. Used by index.html and by gates/core_test.js. */
(function(root){
'use strict';

/* ---------- YouTube link -> {id, start} ---------- */
const ID_RE=/^[A-Za-z0-9_-]{11}$/;
const HOSTS=['youtube.com','youtube-nocookie.com','youtu.be'];
const WRAPPERS=['l.facebook.com','lm.facebook.com','l.messenger.com','m.facebook.com','www.google.com','google.com','l.instagram.com'];

function parseTime(v){
  if(v==null) return 0;
  v=String(v).trim().toLowerCase();
  if(/^\d+$/.test(v)) return parseInt(v,10);
  if(/^\d+s$/.test(v)) return parseInt(v,10);
  const m=v.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
  if(!m||(!m[1]&&!m[2]&&!m[3])) return 0;
  return (+(m[1]||0))*3600+(+(m[2]||0))*60+(+(m[3]||0));
}
function decodeFully(s){
  for(let i=0;i<3;i++){ let d; try{ d=decodeURIComponent(s); }catch(e){ break; } if(d===s) break; s=d; }
  return s;
}
function firstUrl(s){ const m=s.match(/https?:\/\/[^\s<>"']+/i); return m?m[0]:s; }
function cleanId(seg){
  if(!seg) return null;
  if(ID_RE.test(seg)) return seg;
  if(seg.length>11&&ID_RE.test(seg.slice(0,11))&&!/[A-Za-z0-9_-]/.test(seg[11])) return seg.slice(0,11);
  return null;
}
function fromUrl(u,depth){
  let url;
  try{ url=new URL(u); }catch(e){ try{ url=new URL('https://'+u); }catch(e2){ return null; } }
  const host=url.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/,'');
  if(WRAPPERS.includes(url.hostname.toLowerCase())||WRAPPERS.includes(host)){
    if(depth>=3) return null;
    const inner=url.searchParams.get('u')||url.searchParams.get('url')||url.searchParams.get('q');
    return inner?fromUrl(decodeFully(inner),depth+1):null;
  }
  if(!HOSTS.includes(host)) return null;
  const parts=url.pathname.split('/').filter(Boolean);
  let id=null;
  if(host==='youtu.be') id=cleanId(parts[0]);
  else if(parts[0]==='watch') id=cleanId(url.searchParams.get('v'));
  else if(['shorts','embed','live','v','e'].includes(parts[0])) id=cleanId(parts[1]);
  else if(parts[0]==='attribution_link'){ const inner=url.searchParams.get('u'); if(inner&&depth<3) return fromUrl('https://www.youtube.com'+decodeFully(inner),depth+1); }
  if(!id) return null;
  let t=url.searchParams.get('t')||url.searchParams.get('start');
  if(!t&&url.hash){ const h=new URLSearchParams(url.hash.slice(1)); t=h.get('t'); }
  const start=parseTime(t);
  return {id,start:start>0?start:0};
}
function extractYouTube(input){
  if(input==null) return {error:'empty'};
  let s=decodeFully(String(input).trim());
  if(!s) return {error:'empty'};
  if(ID_RE.test(s)) return {id:s,start:0};
  const r=fromUrl(firstUrl(s),0);
  if(r) return r;
  const m=s.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^\s#]*&)?v=|shorts\/|embed\/|live\/|v\/))([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/);
  if(m) return {id:m[1],start:0};
  if(/list=/.test(s)) return {error:'playlist'};
  if(/youtube\.com\/(@|channel\/|c\/|user\/)/.test(s)) return {error:'channel'};
  return {error:'nomatch'};
}

/* ---------- Spotify link -> {id} (tracks only) ---------- */
const SP_HOSTS=['open.spotify.com','play.spotify.com'];
const SP_SHORT=['spotify.link','spoti.fi','spotify.app.link'];
function unwrap(u,depth){
  let url; try{ url=new URL(u); }catch(e){ try{ url=new URL('https://'+u); }catch(e2){ return null; } }
  const host=url.hostname.toLowerCase();
  if(WRAPPERS.includes(host)||WRAPPERS.includes(host.replace(/^www\./,''))){
    if(depth>=3) return null;
    const inner=url.searchParams.get('u')||url.searchParams.get('url')||url.searchParams.get('q');
    return inner?unwrap(decodeFully(inner),depth+1):null;
  }
  return url;
}
function extractSpotify(input){
  if(input==null) return {error:'empty'};
  const s=decodeFully(String(input).trim());
  if(!s) return {error:'empty'};
  const url=unwrap(firstUrl(s),0);
  if(url){
    const host=url.hostname.toLowerCase();
    if(SP_SHORT.includes(host)) return {error:'sp_short'};
    if(SP_HOSTS.includes(host)){
      const parts=url.pathname.split('/').filter(Boolean).filter(p=>!/^intl-[a-z-]+$/i.test(p)&&p!=='embed');
      const pid=(parts[1]||'').match(/^[A-Za-z0-9]{22}(?![A-Za-z0-9])/);
      if(parts[0]==='track'&&pid) return {id:pid[0]};
      const hl=(url.searchParams.get('highlight')||'').match(/^spotify:track:([A-Za-z0-9]{22})$/);
      if(hl) return {id:hl[1]};
      if(['album','playlist','episode','show','artist'].includes(parts[0])) return {error:'sp_'+parts[0]};
    }
  }
  let m=s.match(/spotify:(track|album|playlist|episode|show|artist):([A-Za-z0-9]{22})(?![A-Za-z0-9])/);
  if(m) return m[1]==='track'?{id:m[2]}:{error:'sp_'+m[1]};
  m=s.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]{22})(?![A-Za-z0-9])/i);
  if(m) return m[1].toLowerCase()==='track'?{id:m[2]}:{error:'sp_'+m[1].toLowerCase()};
  return {error:'nomatch'};
}
/* Any supported link -> {src, key, id, start}. YouTube songs keep the bare video id as
   their key (older data uses it); Spotify songs use 'sp:<id>' so the two never collide. */
function extractLink(input){
  const y=extractYouTube(input);
  if(y.id) return {src:'yt',key:y.id,id:y.id,start:y.start};
  const p=extractSpotify(input);
  if(p.id) return {src:'sp',key:'sp:'+p.id,id:p.id,start:0};
  if(p.error&&p.error!=='nomatch'&&p.error!=='empty') return {error:p.error};
  return {error:y.error};
}
function keyRef(key){ key=String(key||''); return key.slice(0,3)==='sp:'?{src:'sp',id:key.slice(3)}:{src:'yt',id:key}; }

/* ---------- document + merge ---------- */
function newDoc(){ return {v:1,songs:{},notes:{},plays:{},seen:{}}; }
function normalize(d){
  d=d&&typeof d==='object'?d:{};
  return {v:1,songs:d.songs||{},notes:d.notes||{},plays:d.plays||{},seen:d.seen||{}};
}
function newer(a,b){ if(!a) return b; if(!b) return a; return (b.ts||0)>(a.ts||0)?b:a; }
/* taking a record out and putting it back are timed facts of their own: the later one wins,
   whatever else changed on the record since (a title fix, a play, a ghost mark) */
const delOf=x=>x?(x.delAt||(x.deleted?Math.max(x.ts||0,(x.addedAt||0)+1):0)):0; // an old-format removal came after its add
const liveOf=x=>x?(x.liveAt||(!x.deleted&&!x.delAt?Math.max(x.addedAt||0,x.ts||0):x.addedAt)||0):0; // old-format records: a live copy counts its last change as live
function mergeDrops(a,b){
  const m=new Map();
  for(const x of [...(a||[]),...(b||[])]) m.set(x.by+'|'+x.at,x);
  return [...m.values()].sort((x,y)=>x.at-y.at);
}
function merge(a,b){
  a=normalize(a); b=normalize(b);
  const out=newDoc();
  for(const id of new Set([...Object.keys(a.songs),...Object.keys(b.songs)])){
    const sa=a.songs[id], sb=b.songs[id], w=newer(sa,sb);
    const s=Object.assign({},w);
    s.drops=mergeDrops(sa&&sa.drops,sb&&sb.drops);
    if(sa&&sb){ const first=(sa.addedAt||Infinity)<=(sb.addedAt||Infinity)?sa:sb; s.addedAt=first.addedAt; s.addedBy=first.addedBy; s.claim=first.claim||first.slot; }
    const delAt=Math.max(delOf(sa),delOf(sb)), liveAt=Math.max(liveOf(sa),liveOf(sb));
    if(delAt) s.delAt=delAt; else delete s.delAt; s.liveAt=liveAt; s.deleted=delAt>liveAt;
    out.songs[id]=s;
  }
  for(const id of new Set([...Object.keys(a.notes),...Object.keys(b.notes)])) out.notes[id]=Object.assign({},newer(a.notes[id],b.notes[id]));
  for(const id of new Set([...Object.keys(a.plays),...Object.keys(b.plays)])){
    const pa=a.plays[id]||{}, pb=b.plays[id]||{}, o={};
    for(const u of new Set([...Object.keys(pa),...Object.keys(pb)])) o[u]=Math.max(pa[u]||0,pb[u]||0);
    out.plays[id]=o;
  }
  for(const u of new Set([...Object.keys(a.seen),...Object.keys(b.seen)])) out.seen[u]=Math.max(a.seen[u]||0,b.seen[u]||0);
  fixSlots(out);
  return out;
}
/* Slot numbers are never reused (deleted songs keep theirs). Each song keeps the slot it
   claimed when added; the displayed slot is derived from claims alone, so every phone
   computes the same answer whatever order merges happen in. On a clash the later add
   moves to the end. */
function fixSlots(d){
  const songs=Object.values(d.songs);
  for(const s of songs){ if(!s.claim) s.claim=s.slot||0; if(!(s.claim>0&&s.claim<1e6)) s.claim=0; } // corrupt numbers just move to the end
  songs.sort((x,y)=>((x.addedAt||0)-(y.addedAt||0))||(x.id<y.id?-1:1));
  const used=new Set(), claimed=new Set(songs.map(s=>s.claim).filter(Boolean)); let max=0;
  for(const s of songs){
    if(!s.claim||used.has(s.claim)){ do s.slot=++max; while(claimed.has(s.slot)||used.has(s.slot)); } // a clash loser takes a number nobody claimed
    else { s.slot=s.claim; if(s.claim>max) max=s.claim; }
    used.add(s.slot);
  }
  return d;
}
function nextSlot(d){ let m=0; for(const s of Object.values(d.songs)) if(s.slot>m) m=s.slot; return m+1; }
const LETTERS='ABCDEFGHJKLMNPQRSTUVWXYZ';
function slotLabel(n){ n=Math.max(1,n|0); const row=Math.floor((n-1)/10), num=(n-1)%10+1; return (row<LETTERS.length?LETTERS[row]:'Z'+(row-LETTERS.length+1))+num; }
function labelToSlot(l){ const m=String(l||'').toUpperCase().match(/^([A-Z])(\d{1,2})$/); if(!m) return 0; const r=LETTERS.indexOf(m[1]); const n=+m[2]; if(r<0||n<1||n>10) return 0; return r*10+n; }
function activeSongs(d){ return Object.values(d.songs).filter(s=>!s.deleted).sort((a,b)=>a.slot-b.slot); }
function notesFor(d,songId){ return Object.values(d.notes).filter(n=>n.songId===songId&&!n.deleted).sort((a,b)=>a.at-b.at); }
function totalPlays(d,id){ const p=d.plays[id]||{}; let t=0; for(const k in p) t+=p[k]; return t; }

/* ---------- song of the day: same answer on both phones ---------- */
function hash32(str){ let h=2166136261>>>0; for(let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619)>>>0; } return h>>>0; }
function songOfDay(d,dateStr,dayStart){
  const ids=activeSongs(d).filter(s=>!s.ghost&&(!dayStart||Math.max(s.addedAt||0,s.delAt?(s.liveAt||0):0)<dayStart)).map(s=>s.id).sort();
  if(!ids.length) return null;
  return ids[hash32('jukebox:'+dateStr)%ids.length];
}

/* ---------- utf8 base64 (GitHub contents API) + base64url (pair links) ---------- */
function b64encode(str){
  const bytes=new TextEncoder().encode(str); let bin='';
  for(let i=0;i<bytes.length;i+=0x8000) bin+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));
  return btoa(bin);
}
function b64decode(b64){
  const bin=atob(String(b64).replace(/\s/g,'')); const bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
const b64url=s=>b64encode(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64url=s=>{ s=String(s).replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4) s+='='; return b64decode(s); };

function uid(){ const a=new Uint8Array(9); (root.crypto||{}).getRandomValues?root.crypto.getRandomValues(a):a.forEach((_,i)=>a[i]=Math.random()*256|0); return Array.from(a,x=>x.toString(36).padStart(2,'0')).join('').slice(0,14); }

root.JBCore={parseTime,extractYouTube,extractSpotify,extractLink,keyRef,newDoc,normalize,merge,fixSlots,nextSlot,slotLabel,labelToSlot,activeSongs,notesFor,totalPlays,songOfDay,hash32,b64encode,b64decode,b64url,unb64url,uid};
})(typeof window!=='undefined'?window:globalThis);
