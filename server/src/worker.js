// 백발백중 — Cloudflare Worker entry: static game files + matchmaking + room Durable Objects
import Sim from '../../sim.js';
import GameRoom from './room-logic.js';

const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,OPTIONS','Access-Control-Allow-Headers':'*'};
const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json',...CORS}});
const lobbyOf=env=>env.LOBBY.get(env.LOBBY.idFromName('lobby'));

export default{
 async fetch(req,env){
  const url=new URL(req.url);
  if(req.method==='OPTIONS')return new Response(null,{headers:CORS});
  if(url.pathname==='/api/assign'){
   const r=await lobbyOf(env).fetch('https://lobby/assign');
   return json(await r.json());
  }
  if(url.pathname==='/api/stats'){
   const r=await lobbyOf(env).fetch('https://lobby/stats');
   return json(await r.json());
  }
  if(url.pathname==='/api/ws'){
   const room=url.searchParams.get('room')||'';
   if(!/^[a-z0-9]{1,16}$/.test(room))return new Response('bad room',{status:400});
   if(req.headers.get('Upgrade')!=='websocket')return new Response('websocket only',{status:426});
   return env.ROOM.get(env.ROOM.idFromName(room)).fetch(req);
  }
  if(url.pathname==='/api/health')return json({ok:true});
  if(env.ASSETS)return env.ASSETS.fetch(req);
  return new Response('not found',{status:404});
 }
};

// Keeps a light in-memory list of rooms so players are packed together (humans first, bots fill the rest).
export class Lobby{
 constructor(state,env){this.state=state;this.env=env;this.rooms=new Map()}
 async fetch(req){
  const url=new URL(req.url),now=Date.now();
  if(url.pathname==='/report'){
   const r=await req.json();
   if(!r.room)return new Response('no room',{status:400});
   if(r.humans<=0)this.rooms.delete(r.room);
   else{const old=this.rooms.get(r.room);this.rooms.set(r.room,{h:r.humans,tl:r.timeLeft,at:now,pend:old?old.pend:0})}
   return new Response('ok');
  }
  if(url.pathname==='/assign'){
   let best=null,bs=-1;
   for(const[id,r]of this.rooms){
    if(now-r.at>120000&&r.pend<=0){this.rooms.delete(id);continue}
    const n=r.h+r.pend;
    if(n>=12||r.tl<20)continue;
    if(n>bs){bs=n;best=id}
   }
   if(!best){best='r'+Math.random().toString(36).slice(2,9).replace(/[^a-z0-9]/g,'');this.rooms.set(best,{h:0,tl:180,at:now,pend:0})}
   const r=this.rooms.get(best);r.pend++;
   setTimeout(()=>{r.pend=Math.max(0,r.pend-1)},8000);
   return Response.json({room:best,players:r.h});
  }
  if(url.pathname==='/stats'){
   return Response.json({rooms:[...this.rooms].map(([id,r])=>({id,humans:r.h,timeLeft:Math.round(r.tl)})),players:[...this.rooms.values()].reduce((s,r)=>s+r.h,0)});
  }
  return new Response('not found',{status:404});
 }
}

// One game room. Runs the shared simulation while at least one player is connected.
export class Room{
 constructor(state,env){this.state=state;this.env=env;this.game=null;this.timer=null;this.name=null}
 ensure(){
  if(!this.game)this.game=new GameRoom(Sim,{report:r=>this.report(r)});
  if(!this.timer){
   let last=Date.now();
   this.timer=setInterval(()=>{
    const now=Date.now();let dt=(now-last)/1000;last=now;if(dt>.1)dt=.1;
    try{this.game.update(dt)}catch(e){console.error('update',e&&e.stack||e)}
    if(this.game.clients.size===0){clearInterval(this.timer);this.timer=null;this.game=null}
   },33);
  }
 }
 async fetch(req){
  const url=new URL(req.url);
  this.name=url.searchParams.get('room')||this.name;
  const nick=(url.searchParams.get('nick')||'').replace(/[<>&"'\\]/g,'').trim().slice(0,8)||'플레이어';
  const pair=new WebSocketPair(),client=pair[0],server=pair[1];
  server.accept();
  this.ensure();
  const game=this.game;
  const cid=game.join({send:s=>server.send(s),close:(c,r)=>server.close(c,r)},nick);
  if(cid!==null){
   server.addEventListener('message',ev=>{if(this.game===game)game.message(cid,ev.data)});
   const bye=()=>{if(this.game===game)game.leave(cid)};
   server.addEventListener('close',bye);server.addEventListener('error',bye);
  }
  return new Response(null,{status:101,webSocket:client});
 }
 report(r){
  if(!this.name)return;
  try{
   lobbyOf(this.env).fetch('https://lobby/report',{method:'POST',body:JSON.stringify({room:this.name,humans:r.humans,timeLeft:r.timeLeft})}).catch(()=>{});
  }catch(e){}
 }
}
