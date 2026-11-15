// 백발백중 — one multiplayer room: 12 slots, empty slots filled with bots, 3-minute rounds.
// Transport-agnostic: sockets only need send(string) and close(code, reason).
(function(root,factory){var R=factory();if(typeof module==='object'&&module.exports)module.exports=R;else root.GameRoom=R;})(typeof self!=='undefined'?self:globalThis,function(){
'use strict';
const SNAP_EVERY=2;      // sim runs ~30Hz, snapshots ~15Hz
const INTERMISSION=8;    // seconds between rounds
const IDLE_KICK=60000;   // ms without any message

const r1=v=>Math.round(v*10)/10, r2=v=>Math.round(v*100)/100;

class GameRoom{
 constructor(Sim,hooks){
  this.S=Sim;this.hooks=hooks||{};this.clients=new Map();this.cid=0;this.tick=0;
  this.phase='play';this.interT=0;
  this.newRound(true);
 }
 resetAcc(){this.acc={ev:[],oa:[],od:[],aa:[],ad:[]}}
 newRound(first){
  const S=this.S,W=new S.World();W.genMap();this.W=W;this.phase='play';this.tick=0;
  for(const c of this.clients.values())c.e=W.addEnt({name:c.nick,color:c.color,hair:c.hair,pants:c.pants,human:true});
  this.fillBots();W.fillOrbs();W.drain();this.resetAcc();
  if(!first){for(const c of this.clients.values())this.sendWelcome(c);this.report()}
 }
 fillBots(){
  const S=this.S,W=this.W;
  while(W.ents.length<S.SLOTS){
   const used=new Set(W.ents.map(e=>e.name)),usedC=new Set(W.ents.map(e=>e.color));
   const n=S.NAMES.find(x=>!used.has('🤖'+x))||S.pick(S.NAMES);
   const col=S.COLORS.find(x=>!usedC.has(x))||S.pick(S.COLORS);
   W.addEnt({name:'🤖'+n,color:col,human:false});
  }
 }
 removeBot(){
  const bots=this.W.ents.filter(e=>!e.human);if(!bots.length)return;
  bots.sort((a,b)=>(a.alive-b.alive)||(a.score-b.score));
  this.W.removeEnt(bots[0]);
 }
 humanColor(){
  const S=this.S,used=new Set([...this.clients.values()].map(c=>c.color));
  const pal=[S.PLAYER_COLOR].concat(S.COLORS);
  return pal.find(c=>!used.has(c))||S.pick(S.COLORS);
 }
 join(sock,nick){
  const S=this.S;
  if(this.clients.size>=S.SLOTS){try{sock.send('{"t":"x","r":"full"}');sock.close(4000,'full')}catch(e){}return null}
  const cid=++this.cid;
  const c={cid,sock,nick,color:this.humanColor(),hair:S.pick(S.HAIRS),pants:S.pick(S.PANTS),e:null,seq:0,lastIn:Date.now()};
  if(this.W.ents.length>=S.SLOTS)this.removeBot();
  c.e=this.W.addEnt({name:nick,color:c.color,hair:c.hair,pants:c.pants,human:true});
  this.clients.set(cid,c);
  this.sendWelcome(c);this.broadcast(JSON.stringify({t:'r',l:this.roster()}),c);this.report();
  return cid;
 }
 leave(cid){
  const c=this.clients.get(cid);if(!c)return;
  this.clients.delete(cid);
  if(c.e)this.W.removeEnt(c.e);
  this.fillBots();
  this.broadcast(JSON.stringify({t:'r',l:this.roster()}));this.report();
 }
 roster(){return this.W.ents.map(e=>[e.id,e.name,e.color,e.hair,e.pants,e.human?1:0])}
 arrowRow(a){return[a.id,r1(a.x),r1(a.y),Math.round(a.ang*1000)/1000,Math.round(a.sp),r2(a.life),a.owner?a.owner.id:0,a.fire?1:0]}
 sendWelcome(c){
  const W=this.W;
  this.send(c,JSON.stringify({t:'w',id:c.e.id,map:W.mapData(),roster:this.roster(),
   orbs:W.orbs.map(o=>[o.id,Math.round(o.x),Math.round(o.y),o.k==='b'?1:0]),
   arrows:W.arrows.map(a=>this.arrowRow(a)),tl:r1(W.timeLeft),ph:this.phase,n:r1(this.interT)}));
 }
 send(c,s){try{c.sock.send(s)}catch(e){}}
 broadcast(s,except){for(const c of this.clients.values())if(c!==except)this.send(c,s)}
 message(cid,raw){
  const c=this.clients.get(cid);if(!c)return;
  c.lastIn=Date.now();
  if(typeof raw!=='string'||raw.length>300)return;
  let m;try{m=JSON.parse(raw)}catch(e){return}
  const e=c.e;if(!e||!m||this.phase!=='play')return;
  const num=v=>{v=+v;return isFinite(v)?v:0};
  if(m.t==='i'){
   let x=Math.max(-1,Math.min(1,num(m.x))),y=Math.max(-1,Math.min(1,num(m.y)));
   const mag=Math.hypot(x,y);if(mag>1){x/=mag;y/=mag}
   e.input.mx=x;e.input.my=y;e.input.aiming=!!m.a;e.input.aim=num(m.g);
   c.seq=m.s|0;
  }else if(m.t==='f'){
   if(e.alive){e.queued=num(m.g);e.aim=e.queued}
  }else if(m.t==='k'){
   this.W.chooseSkill(e,String(m.id));
  }
 }
 update(dt){
  const now=Date.now();
  for(const c of this.clients.values())if(now-c.lastIn>IDLE_KICK){try{c.sock.close(4001,'idle')}catch(e){}this.leave(c.cid)}
  if(this.phase==='play'){
   const W=this.W;W.step(dt);
   const d=W.drain(),A=this.acc;
   A.ev.push(...d.ev);A.oa.push(...d.oa);A.od.push(...d.od);A.aa.push(...d.aa);A.ad.push(...d.ad);
   for(const c of this.clients.values()){
    const e=c.e;
    if(e&&e.alive&&e.pending>0&&!e.opts){
     e.opts=W.rollOpts(e);
     if(!e.opts.length){e.pending=0;e.opts=null}
     else this.send(c,JSON.stringify({t:'o',ids:e.opts.map(s=>s.id)}));
    }
   }
   if(++this.tick%SNAP_EVERY===0)this.snapshot();
   if(W.timeLeft<=0)this.endRound();
  }else{
   this.interT-=dt;
   if(this.interT<=0)this.newRound(false);
  }
 }
 snapshot(){
  const W=this.W,A=this.acc,live=new Set(W.arrows.map(a=>a.id)),gone=new Set(A.ad);
  const ents=W.ents.map(e=>[e.id,r1(e.x),r1(e.y),r2(e.aim),
   (e.alive?1:0)|(e.moving?2:0)|(e.aiming?4:0)|(e.inv>0?8:0)|(e.hitT>0?16:0)|(e.burn>0?32:0)|(e.face<0?64:0),
   Math.max(0,Math.ceil(e.hp)),Math.round(e.maxHp),e.level,Math.round(e.score),e.kills]);
  const common=JSON.stringify({tl:r1(W.timeLeft),e:ents,
   aa:A.aa.filter(a=>live.has(a.id)||gone.has(a.id)).map(a=>this.arrowRow(a)),ad:A.ad,
   oa:A.oa.filter(o=>!A.od.includes(o.id)).map(o=>[o.id,Math.round(o.x),Math.round(o.y),o.k==='b'?1:0]),
   od:A.od.filter(id=>!A.oa.some(o=>o.id===id)),ev:A.ev}).slice(1,-1);
  for(const c of this.clients.values()){
   const e=c.e;if(!e)continue;
   const me={xp:Math.round(e.xp),p:e.pending,sk:e.skills,st:r2(Math.max(0,e.shootT)),fc:r2(e.fireCd),rg:Math.round(e.range),
    m:e.multi,d:e.diag,b:e.back,s:e.side,sp:r1(e.speed),rs:r1(Math.max(0,e.respawn)),kb:e.killedBy,ml:e.maxLevel};
   this.send(c,'{"t":"s",'+common+',"me":'+JSON.stringify(me)+',"k":'+c.seq+'}');
  }
  this.resetAcc();
 }
 endRound(){
  this.snapshot();
  this.phase='inter';this.interT=INTERMISSION;
  const st=this.W.ents.slice().sort((a,b)=>b.score-a.score).map(e=>[e.id,e.name,e.kills,Math.round(e.score),e.maxLevel,e.human?1:0]);
  this.broadcast(JSON.stringify({t:'e',st,n:INTERMISSION}));
  this.report();
 }
 report(){
  if(this.hooks.report)this.hooks.report({humans:this.clients.size,timeLeft:this.phase==='play'?this.W.timeLeft:this.S.MATCH+this.interT});
 }
}
return GameRoom;
});
