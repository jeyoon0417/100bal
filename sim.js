// 백발백중 — shared game simulation (browser + Cloudflare Worker)
(function(root,factory){var S=factory();if(typeof module==='object'&&module.exports)module.exports=S;else root.Sim=S;})(typeof self!=='undefined'?self:globalThis,function(){
'use strict';
const WORLD=1100,MATCH=360,ORB_MIN=140,ORB_CAP=240,WT=7,SLOTS=12;
const rand=(a,b)=>a+Math.random()*(b-a);
const pick=a=>a[Math.floor(Math.random()*a.length)];
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));const t=a[i];a[i]=a[j];a[j]=t}return a};
const d2=(a,b)=>(a.x-b.x)**2+(a.y-b.y)**2;
const r1=v=>Math.round(v*10)/10;

const MODES={
 ffa:{id:'ffa',name:'개인전',desc:'6분 동안 점수 1등',team:false,time:360},
 tdm:{id:'tdm',name:'팀 데스매치',desc:'6대6, 먼저 50킬',team:true,time:360,goal:50},
 koth:{id:'koth',name:'점령전',desc:'가운데 지점을 지켜 180점',team:true,time:360,goal:180},
 ctf:{id:'ctf',name:'깃발뺏기',desc:'상대 깃발을 5번 가져오기',team:true,time:360,goal:5},
 br:{id:'br',name:'배틀로얄',desc:'목숨 1개, 마지막 1명',team:false,time:360},
};
const MODE_IDS=Object.keys(MODES);
const TEAM_NAMES=['레드','블루'],TEAM_COLORS=['#ff5a5a','#4aa3ff'];
const TEAM_SHIRTS=[['#e74c3c','#c0392b','#ff6b6b','#d64545','#b83232','#ff8080','#e05555'],['#3b6fe0','#2e86de','#54a0ff','#1f62c9','#4a7fe8','#6fb1ff','#3d8bfd']];
const NAMES=['고양이집사','치킨은반반','국밥러버','새벽세시','민초단장','붕어빵','활쟁이','갓생러','무적김씨','떡볶이왕','야근중','퇴근각','슬라임','헤드샷','감자튀김','월요병'];
const COLORS=['#e74c3c','#3b6fe0','#2ecc71','#f1c40f','#9b59b6','#e67e22','#16a085','#ff6b9d','#8d99ae','#ff9f43','#a3cb38'];
const PLAYER_COLOR='#22d3ee';
const HAIRS=['#3b2314','#1c1c22','#d9a441','#7a3b1d','#c9c9c9','#b03a2e','#5a3a8a'];
const PANTS=['#3b4a6b','#4a3b2a','#2d2d38','#5b4a7a','#3a5a40'];
const SKILLS=[
 {id:'multi',name:'멀티샷',ic:'🎯',ds:'정면 화살 +1',max:4,ap:e=>e.multi++},
 {id:'diag',name:'사선 화살',ic:'✳️',ds:'대각선 화살 +2',max:2,ap:e=>e.diag++},
 {id:'back',name:'뒤로 쏘기',ic:'↩️',ds:'뒤쪽 화살 +1',max:2,ap:e=>e.back++},
 {id:'side',name:'옆으로 쏘기',ic:'↔️',ds:'양옆 화살 +2',max:2,ap:e=>e.side++},
 {id:'pierce',name:'관통',ic:'📌',ds:'적을 1명 더 뚫음',max:3,ap:e=>e.pierce++},
 {id:'atk',name:'공격력',ic:'⚔️',ds:'공격력 +25%',max:8,ap:e=>e.dmg*=1.25},
 {id:'aspd',name:'재장전',ic:'⚡',ds:'장전 속도 +20%',max:6,ap:e=>e.fireCd*=0.83},
 {id:'spd',name:'신발',ic:'👟',ds:'이동 속도 +12%',max:4,ap:e=>e.speed*=1.12},
 {id:'hp',name:'체력 강화',ic:'❤️',ds:'최대 체력 +30, 회복',max:8,ap:e=>{e.maxHp+=30;e.hp=Math.min(e.maxHp,e.hp+60)}},
 {id:'leech',name:'흡혈',ic:'🩸',ds:'준 피해의 8% 회복',max:3,ap:e=>e.leech+=0.08},
 {id:'crit',name:'치명타',ic:'💥',ds:'15% 확률로 2배 피해',max:4,ap:e=>e.crit+=0.15},
 {id:'range',name:'장궁',ic:'🏹',ds:'사거리·화살 속도 +15%',max:3,ap:e=>{e.range*=1.15;e.aspeed*=1.15}},
 {id:'fire',name:'불화살',ic:'🔥',ds:'맞은 적이 3초간 불탐',max:2,ap:e=>e.fire++},
 {id:'shield',name:'갑옷',ic:'🛡️',ds:'받는 피해 -12%',max:3,ap:e=>e.armor*=0.88},
 {id:'bounce',name:'튕기는 화살',ic:'🪃',ds:'벽에 맞으면 1번 더 튕김',max:2,ap:e=>e.bounce++},
 {id:'homing',name:'유도 화살',ic:'🌀',ds:'화살이 앞쪽 가까운 적에게 살짝 휨',max:2,ap:e=>e.homing++},
 {id:'ice',name:'얼음 화살',ic:'❄️',ds:'맞은 적이 1.5초 느려짐',max:2,ap:e=>e.ice++},
 {id:'boom',name:'폭발 화살',ic:'💣',ds:'맞으면 주변에 폭발 피해',max:2,ap:e=>e.boom++},
 {id:'split',name:'분열 화살',ic:'🔱',ds:'적에게 맞으면 갈라져 날아감',max:2,ap:e=>e.split++},
 {id:'feast',name:'포식',ic:'🍖',ds:'처치하면 체력 35% 회복',max:2,ap:e=>e.feast++},
 {id:'blade',name:'회전 칼날',ic:'🗡️',ds:'몸 주위를 도는 칼날 +1',max:3,ap:e=>e.blade++},
 {id:'magnet',name:'자석',ic:'🧲',ds:'보석 끌어오는 범위 +60%',max:2,ap:e=>e.magnet++},
 {id:'regen',name:'재생',ic:'🌿',ds:'체력이 계속 조금씩 회복',max:3,ap:e=>e.regen++},
 {id:'guard',name:'보호막',ic:'🔰',ds:'8초마다 공격 1번을 막음',max:1,ap:e=>{e.guard++;e.guardUp=true}},
 {id:'fart',name:'방구',ic:'💨',ds:'5초마다 뿡! 주변 적에게 피해 (레벨업하면 범위↑)',max:3,ap:e=>e.fart++},
];
const SKILL_BY={};for(const s of SKILLS)SKILL_BY[s.id]=s;
const BOT_PREF=['multi','atk','aspd','blade','diag','hp','pierce','boom','crit','homing','split','side','ice','back','leech','feast','fart','regen','guard','range','spd','fire','bounce','shield','magnet'];
const FURN={crate:{w:10,h:12,high:true},barrel:{w:9,h:11,high:true},table:{w:18,h:12,high:false},bed:{w:13,h:22,high:false},shelf:{w:20,h:9,high:true}};
const STORM_R=[820,560,380,240,130,60,14];
function xpNeed(l){return 40+l*30}
function shotDirs(e,a){
 const dirs=[];
 for(let i=0;i<e.multi;i++)dirs.push(a+(i-(e.multi-1)/2)*.12);
 if(e.diag>=1)dirs.push(a+.75,a-.75);
 if(e.diag>=2)dirs.push(a+.4,a-.4);
 for(let i=0;i<e.back;i++)dirs.push(a+Math.PI+(i-(e.back-1)/2)*.2);
 if(e.side>=1)dirs.push(a+Math.PI/2,a-Math.PI/2);
 if(e.side>=2)dirs.push(a+Math.PI/2+.25,a-Math.PI/2-.25);
 return dirs;
}
function resetStats(e){
 Object.assign(e,{maxHp:100,hp:100,dmg:20,fireCd:.6,speed:68,multi:1,diag:0,back:0,side:0,pierce:0,leech:0,crit:0,range:140,aspeed:230,fire:0,armor:1,
  bounce:0,homing:0,ice:0,boom:0,split:0,feast:0,blade:0,magnet:0,regen:0,guard:0,guardUp:false,guardT:0,fart:0,fartT:0,slow:0,carry:false});
 e.skills={};e.level=1;e.xp=0;e.r=6;e.pending=0;e.opts=null;e.burn=0;e.aiming=false;e.queued=null;e.drawT=0;e.bladeCd={};
}
function angDiff(a,b){let d=b-a;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;return d}

class World{
 constructor(mode){
  this.mode=MODES[mode]?mode:'ffa';this.M=MODES[this.mode];
  this.ents=[];this.arrows=[];this.orbs=[];this.rocks=[];this.solids=[];this.buildings=[];this.reserved=[];
  this.timeLeft=this.M.time;this.matchT=0;this.nid=1;this.ts=[0,0];this.over=false;this.win=null;
  this.zone=null;this.flags=null;this.storm=null;
  this.events=[];this.orbAdds=[];this.orbDels=[];this.arrowAdds=[];this.arrowDels=[];
 }
 id(){return this.nid++}
 emit(ev){this.events.push(ev)}
 drain(){const r={ev:this.events,oa:this.orbAdds,od:this.orbDels,aa:this.arrowAdds,ad:this.arrowDels};this.events=[];this.orbAdds=[];this.orbDels=[];this.arrowAdds=[];this.arrowDels=[];return r}
 isEnemy(a,b){return a!==b&&(!this.M.team||a.team!==b.team)}

 // ---------- map ----------
 solid(x,y,w,h,high,kind,t){const o={x,y,w,h,high:!!high,kind,t,sy:y+h};this.solids.push(o);return o}
 overlapsAny(x,y,w,h,m){
  for(const b of this.buildings)if(x<b.x+b.w+m&&x+w>b.x-m&&y<b.y+b.h+m&&y+h>b.y-m)return true;
  for(const o of this.solids)if(x<o.x+o.w+m&&x+w>o.x-m&&y<o.y+o.h+m&&y+h>o.y-m)return true;
  for(const o of this.reserved)if(x<o.x+o.w+m&&x+w>o.x-m&&y<o.y+o.h+m&&y+h>o.y-m)return true;
  return false;
 }
 modeGeo(){
  if(this.mode==='koth')return{zone:{x:550,y:550,r:56}};
  if(this.mode==='ctf')return{bases:[{x:95,y:550},{x:1005,y:550}]};
  return{};
 }
 makeBuilding(bx,by,bw,bh){
  this.buildings.push({x:bx,y:by,w:bw,h:bh,seed:Math.round(Math.random()*9900)/100});
  const sides=shuffle(['n','s','w','e']).slice(0,2),DW=18,doors=[];
  const seg=(x,y,w,h)=>{if(w>=2&&h>=2)this.solid(x,y,w,h,true,'wood','wall')};
  const hs=(y,side)=>{if(sides.includes(side)){const gx=bx+Math.round(rand(WT+8,bw-WT-8-DW));doors.push({x:gx,y,w:DW,h:WT});seg(bx,y,gx-bx,WT);seg(gx+DW,y,bx+bw-gx-DW,WT)}else seg(bx,y,bw,WT)};
  const vs=(x,side)=>{const y0=by+WT,y1=by+bh-WT;if(sides.includes(side)){const gy=y0+Math.round(rand(6,y1-y0-6-DW));doors.push({x,y:gy,w:WT,h:DW});seg(x,y0,WT,gy-y0);seg(x,gy+DW,WT,y1-gy-DW)}else seg(x,y0,WT,y1-y0)};
  hs(by,'n');hs(by+bh-WT,'s');vs(bx,'w');vs(bx+bw-WT,'e');
  for(const[px,py]of[[bx-1,by-1],[bx+bw-WT-1,by-1],[bx-1,by+bh-WT-1],[bx+bw-WT-1,by+bh-WT-1]])this.solid(px,py,WT+2,WT+2,true,'wood','post');
  const ix=bx+WT,iy=by+WT,iw=bw-2*WT,ih=bh-2*WT,placed=[];
  const free=(x,y,w,h)=>x>=ix&&y>=iy&&x+w<=ix+iw&&y+h<=iy+ih&&!placed.some(p=>x<p.x+p.w+6&&x+w>p.x-6&&y<p.y+p.h+6&&y+h>p.y-6)&&!doors.some(d=>x<d.x+d.w+14&&x+w>d.x-14&&y<d.y+d.h+14&&y+h>d.y-14);
  const put=(type,pos)=>{const f=FURN[type];for(let t=0;t<12;t++){const p=pos(f);if(free(p.x,p.y,f.w,f.h)){placed.push({x:p.x,y:p.y,w:f.w,h:f.h});this.solid(p.x,p.y,f.w,f.h,f.high,'furn',type);return}}};
  put('shelf',f=>({x:ix+Math.round(rand(2,iw-f.w-2)),y:iy}));
  put('bed',f=>({x:Math.random()<.5?ix+1:ix+iw-f.w-1,y:iy+Math.round(rand(2,ih-f.h-2))}));
  put('table',f=>({x:ix+Math.round(rand(10,iw-f.w-10)),y:iy+Math.round(rand(10,ih-f.h-10))}));
  const n=2+Math.floor(Math.random()*3);
  for(let k=0;k<n;k++)put(Math.random()<.5?'crate':'barrel',f=>({x:ix+Math.round(rand(1,iw-f.w-1)),y:iy+Math.round(rand(1,ih-f.h-1))}));
 }
 genMap(){
  this.buildings=[];this.solids=[];this.rocks=[];this.reserved=[];
  const geo=this.modeGeo();
  if(geo.zone){const z=geo.zone,m=z.r+24;this.reserved.push({x:z.x-m,y:z.y-m,w:m*2,h:m*2})}
  if(geo.bases)for(const b of geo.bases)this.reserved.push({x:b.x-70,y:b.y-70,w:140,h:140});
  for(let i=0;i<120&&this.buildings.length<7;i++){
   const bw=Math.round(rand(84,124)),bh=Math.round(rand(66,96)),bx=Math.round(rand(70,WORLD-70-bw)),by=Math.round(rand(70,WORLD-70-bh));
   if(this.overlapsAny(bx,by,bw,bh,60))continue;
   this.makeBuilding(bx,by,bw,bh);
  }
  let sc=0;
  for(let i=0;i<160&&sc<13;i++){
   const horiz=Math.random()<.5,Ln=Math.round(rand(36,84)),T=8,w=horiz?Ln:T,h=horiz?T:Ln;
   const x=Math.round(rand(50,WORLD-50-w)),y=Math.round(rand(50,WORLD-50-h));
   if(this.overlapsAny(x,y,w,h,34))continue;
   this.solid(x,y,w,h,true,'stone','wall');sc++;
   if(Math.random()<.45){
    const L2=Math.round(rand(22,44));let x2,y2,w2,h2;
    if(horiz){w2=T;h2=L2;x2=Math.random()<.5?x:x+w-T;y2=y+T}else{w2=L2;h2=T;x2=x+T;y2=Math.random()<.5?y:y+h-T}
    if(x2+w2<WORLD-40&&y2+h2<WORLD-40&&!this.overlapsAny(x2,y2,w2,h2,0))this.solid(x2,y2,w2,h2,true,'stone','wall');
   }
  }
  for(let i=0;i<80&&this.rocks.length<14;i++){
   const r={x:Math.round(rand(60,WORLD-60)),y:Math.round(rand(60,WORLD-60)),r:Math.round(rand(9,22)),bush:Math.random()<.45,seed:Math.round(Math.random()*9900)/100};
   if(this.rocks.some(o=>(o.x-r.x)**2+(o.y-r.y)**2<(o.r+r.r+36)**2)||this.overlapsAny(r.x-r.r,r.y-r.r,r.r*2,r.r*2,22))continue;
   this.rocks.push(r);
  }
  this.setupMode();
 }
 setupMode(){
  const geo=this.modeGeo();
  if(geo.zone)this.zone={x:geo.zone.x,y:geo.zone.y,r:geo.zone.r,owner:-1,cont:false};
  if(geo.bases)this.flags=geo.bases.map((b,t)=>({team:t,hx:b.x,hy:b.y,x:b.x,y:b.y,carrier:null,home:true,dropT:0}));
  if(this.mode==='br')this.storm={x:550,y:550,r:STORM_R[0],fx:550,fy:550,fr:STORM_R[0],ox:550,oy:550,or:STORM_R[0],phase:0,t:0,shrinking:false};
 }
 mapData(){
  return{b:this.buildings.map(b=>[b.x,b.y,b.w,b.h,b.seed]),
   s:this.solids.map(o=>[o.x,o.y,o.w,o.h,o.high?1:0,o.kind,o.t]),
   r:this.rocks.map(r=>[r.x,r.y,r.r,r.bush?1:0,r.seed])};
 }
 loadMap(m){
  this.buildings=m.b.map(a=>({x:a[0],y:a[1],w:a[2],h:a[3],seed:a[4]}));
  this.solids=m.s.map(a=>({x:a[0],y:a[1],w:a[2],h:a[3],high:!!a[4],kind:a[5],t:a[6],sy:a[1]+a[3]}));
  this.rocks=m.r.map(a=>({x:a[0],y:a[1],r:a[2],bush:!!a[3],seed:a[4]}));
  this.setupMode();
 }
 blockedPoint(px,py,highOnly){
  for(const o of this.solids){if(highOnly&&!o.high)continue;if(px>=o.x&&px<o.x+o.w&&py>=o.y&&py<o.y+o.h)return true}
  for(const r of this.rocks)if((px-r.x)**2+(py-r.y)**2<(r.r-1)**2)return true;
  return false;
 }
 hasLOS(ax,ay,bx,by){const dx=bx-ax,dy=by-ay,n=Math.ceil(Math.hypot(dx,dy)/4);for(let i=1;i<n;i++)if(this.blockedPoint(ax+dx*i/n,ay+dy*i/n,true))return false;return true}
 freeSpot(x,y,m){
  for(const r of this.rocks)if((x-r.x)**2+(y-r.y)**2<(r.r+m)**2)return false;
  const cy=y+3;for(const o of this.solids)if(x>o.x-m&&x<o.x+o.w+m&&cy>o.y-m&&cy<o.y+o.h+m)return false;
  return true;
 }
 collide(e){
  const R=5;
  for(const r of this.rocks){const cy=e.y+3,dx=e.x-r.x,dy=cy-r.y,d=Math.hypot(dx,dy),min=r.r+R-1;if(d<min&&d>0){e.x=r.x+dx/d*min;e.y=r.y+dy/d*min-3}}
  for(const o of this.solids){
   const cy=e.y+3;if(e.x<o.x-R||e.x>o.x+o.w+R||cy<o.y-R||cy>o.y+o.h+R)continue;
   const px=Math.max(o.x,Math.min(e.x,o.x+o.w)),py=Math.max(o.y,Math.min(cy,o.y+o.h)),dx=e.x-px,dy=cy-py,dd=dx*dx+dy*dy;
   if(dd>=R*R)continue;
   if(dd>0){const d=Math.sqrt(dd);e.x=px+dx/d*R;e.y=py+dy/d*R-3}
   else{const l=e.x-o.x,r2=o.x+o.w-e.x,t=cy-o.y,b=o.y+o.h-cy,m=Math.min(l,r2,t,b);
    if(m===l)e.x=o.x-R;else if(m===r2)e.x=o.x+o.w+R;else if(m===t)e.y=o.y-R-3;else e.y=o.y+o.h+R-3}
  }
 }
 // movement shared by server sim and client prediction
 moveEnt(e,dt){
  const mag=Math.hypot(e.mx,e.my),ox=e.x,oy=e.y;e.moving=mag>.15;
  if(e.moving){
   const nx=e.mx/mag,ny=e.my/mag,m=Math.min(1,mag)*(e.aiming?.7:1)*(e.slow>0?.6:1)*(e.carry?.9:1);
   e.x+=nx*m*e.speed*dt;e.y+=ny*m*e.speed*dt;
   if(!e.aiming){e.aim=Math.atan2(ny,nx);if(Math.abs(nx)>.1)e.face=nx>0?1:-1}
   e.walk=(e.walk||0)+dt*m*9;
  }
  this.collide(e);
  e.x=Math.max(6,Math.min(WORLD-6,e.x));e.y=Math.max(6,Math.min(WORLD-6,e.y));
  e.vx=(e.x-ox)/dt;e.vy=(e.y-oy)/dt;
  return Math.hypot(e.x-ox,e.y-oy);
 }

 // ---------- teams / entities ----------
 teamCounts(){const h=[0,0],a=[0,0];for(const e of this.ents)if(e.team===0||e.team===1){a[e.team]++;if(e.human)h[e.team]++}return{h,a}}
 pickTeam(human){
  if(!this.M.team)return undefined;
  const c=this.teamCounts();
  if(human&&c.h[0]!==c.h[1])return c.h[0]<c.h[1]?0:1;
  return c.a[0]<=c.a[1]?0:1;
 }
 teamColor(team){
  const used=new Set(this.ents.map(e=>e.color));
  return TEAM_SHIRTS[team].find(c=>!used.has(c))||pick(TEAM_SHIRTS[team]);
 }
 spawnBox(e){
  if(this.M.team){
   if(this.mode==='ctf')return e.team?[860,1050,420,680]:[50,240,420,680];
   return e.team?[770,1050,50,1050]:[50,330,50,1050];
  }
  return[50,WORLD-50,50,WORLD-50];
 }
 placeSafe(e){
  const[x0,x1,y0,y1]=this.spawnBox(e),s=this.storm;
  for(let t=0;t<60;t++){
   let x=rand(x0,x1),y=rand(y0,y1);
   if(s){const a=rand(0,6.28),r=Math.sqrt(Math.random())*Math.max(10,Math.min(s.r,s.fr)*.8);x=Math.max(30,Math.min(WORLD-30,s.x+Math.cos(a)*r));y=Math.max(30,Math.min(WORLD-30,s.y+Math.sin(a)*r))}
   if(!this.freeSpot(x,y,14))continue;
   if(t<40&&this.ents.some(o=>o!==e&&o.alive&&this.isEnemy(e,o)&&(x-o.x)**2+(y-o.y)**2<170**2))continue;
   e.x=x;e.y=y;return;
  }
  e.x=rand(x0,x1);e.y=rand(y0,y1);
 }
 addEnt(o){
  const team=this.M.team?(o.team===0||o.team===1?o.team:this.pickTeam(o.human)):undefined;
  const e={id:this.id(),name:o.name,color:this.M.team?this.teamColor(team):o.color,hair:o.hair||pick(HAIRS),pants:o.pants||pick(PANTS),human:!!o.human,team,
   x:0,y:0,mx:0,my:0,vx:0,vy:0,score:0,kills:0,deaths:0,maxLevel:1,alive:true,respawn:0,place:0,out:false,
   hitT:0,inv:2,shootT:0,aim:0,face:1,walk:0,moving:false,sinceHit:9,modeT:0,smart:rand(.8,1.25),lead:0,err:0,losCd:0,stuck:0,killedBy:'',
   role:Math.random()<.55?'atk':'def',input:{mx:0,my:0,aiming:false,aim:0}};
  resetStats(e);this.placeSafe(e);this.ents.push(e);return e;
 }
 removeEnt(e){
  const i=this.ents.indexOf(e);if(i>=0)this.ents.splice(i,1);
  if(this.flags)for(const f of this.flags)if(f.carrier===e)this.dropFlag(f,e.x,e.y);
 }
 fillBots(){
  while(this.ents.length<SLOTS){
   const used=new Set(this.ents.map(e=>e.name)),usedC=new Set(this.ents.map(e=>e.color));
   const n=NAMES.find(x=>!used.has('🤖'+x))||pick(NAMES);
   this.addEnt({name:'🤖'+n,color:COLORS.find(x=>!usedC.has(x))||pick(COLORS),human:false});
  }
 }
 removeBot(team){
  let bots=this.ents.filter(e=>!e.human&&(team===undefined||e.team===team));
  if(!bots.length)bots=this.ents.filter(e=>!e.human);
  if(!bots.length)return;
  bots.sort((a,b)=>(a.alive-b.alive)||(a.score-b.score));
  this.removeEnt(bots[0]);
 }
 aliveCount(){let n=0;for(const e of this.ents)if(e.alive)n++;return n}
 addOrb(x,y,v,k){const o={id:this.id(),x,y,v,k:k||'n',ph:Math.random()*6};this.orbs.push(o);this.orbAdds.push(o);return o}
 fillOrbs(){let g=0;while(this.orbs.length<ORB_MIN&&g++<500){const x=rand(25,WORLD-25),y=rand(25,WORLD-25);if(!this.freeSpot(x,y,4))continue;this.addOrb(x,y,6,'n')}}
 gainXp(e,v){
  e.xp+=v;e.score+=v;
  while(e.xp>=xpNeed(e.level)){
   e.xp-=xpNeed(e.level);e.level++;e.maxLevel=Math.max(e.maxLevel,e.level);e.hp=Math.min(e.maxHp,e.hp+15);
   if(e.human){e.pending++;this.emit({k:'lvl',i:e.id})}
   else{const o=this.rollOpts(e);if(o.length){o.sort((a,b)=>BOT_PREF.indexOf(a.id)-BOT_PREF.indexOf(b.id));this.applySkill(e,Math.random()<.65?o[0]:pick(o))}}
  }
 }
 rollOpts(e){return shuffle(SKILLS.filter(s=>(e.skills[s.id]||0)<s.max)).slice(0,3)}
 applySkill(e,s){s.ap(e);e.skills[s.id]=(e.skills[s.id]||0)+1}
 chooseSkill(e,id){
  if(!e.alive||e.pending<=0||!e.opts)return false;
  const s=e.opts.find(x=>x.id===id);if(!s)return false;
  this.applySkill(e,s);e.pending--;e.opts=null;return true;
 }
 nearestEnemy(e,range){
  let best=null,bd=range*range;
  for(const o of this.ents){if(!o.alive||!this.isEnemy(e,o))continue;const d=d2(e,o);if(d<bd){bd=d;best=o}}
  return best;
 }
 newArrow(e,x,y,ang,o){
  const sp=e.aspeed;
  const ar={id:this.id(),x,y,vx:Math.cos(ang)*sp,vy:Math.sin(ang)*sp,ang,sp,owner:e,dmg:o&&o.dmg||e.dmg,pierce:o&&o.child?0:e.pierce,hit:o&&o.hit||new Set(),
   life:o&&o.life||e.range/sp,fire:e.fire,col:e.color,bounce:o&&o.child?0:e.bounce,homing:e.homing,ice:e.ice,boom:e.boom,split:o&&o.child?0:e.split,child:!!(o&&o.child),dyn:e.homing>0};
  this.arrows.push(ar);this.arrowAdds.push(ar);return ar;
 }
 fire(e,a){
  e.aim=a;e.face=Math.cos(a)>=0?1:-1;
  for(const d of shotDirs(e,a))this.newArrow(e,e.x+Math.cos(d)*5,e.y-1+Math.sin(d)*5,d);
  this.emit({k:'fire',i:e.id});
 }
 damage(t,amt,src,dot,x,y){
  if(!t.alive)return;
  if(!dot&&t.guardUp){t.guardUp=false;t.guardT=0;this.emit({k:'sp',x:Math.round(t.x),y:Math.round(t.y-2),c:'#7cf3ff'});return}
  let crit=false;
  if(!dot&&src&&Math.random()<src.crit){amt*=2;crit=true}
  amt*=t.armor;t.hp-=amt;t.sinceHit=0;
  if(!dot){t.hitT=.1;if(src&&src.alive&&src.leech)src.hp=Math.min(src.maxHp,src.hp+amt*src.leech);
   this.emit({k:'hit',v:t.id,s:src?src.id:0,a:Math.round(amt),c:crit?1:0,x:Math.round(x||t.x),y:Math.round(y||t.y)})}
  if(t.hp<=0)this.kill(t,src);
 }
 kill(t,src){
  const aliveBefore=this.aliveCount();
  t.alive=false;t.hp=0;t.respawn=3;t.burn=0;t.slow=0;t.deaths++;t.aiming=false;t.queued=null;t.pending=0;t.opts=null;
  t.killedBy=src&&src!==t?src.name:'';
  if(this.flags)for(const f of this.flags)if(f.carrier===t)this.dropFlag(f,t.x,t.y);
  if(this.mode==='br'){t.out=true;t.respawn=1e9;t.place=aliveBefore}
  const n=Math.min(14,4+t.level);
  for(let i=0;i<n;i++){const ox=t.x+rand(-16,16),oy=t.y+rand(-16,16);if(this.orbs.length<ORB_CAP&&this.freeSpot(ox,oy,2))this.addOrb(ox,oy,8,'b')}
  const sid=src&&src!==t&&this.isEnemy(src,t)?src.id:0;
  if(sid){
   src.kills++;this.gainXp(src,25+t.level*12);
   if(src.feast&&src.alive)src.hp=Math.min(src.maxHp,src.hp+src.maxHp*.35*src.feast);
   if(this.mode==='tdm')this.ts[src.team]++;
  }
  this.emit({k:'kill',v:t.id,s:sid,x:Math.round(t.x),y:Math.round(t.y)});
 }
 respawn(e){resetStats(e);e.alive=true;e.inv=2;e.modeT=0;e.shootT=.3;this.placeSafe(e);this.emit({k:'spawn',i:e.id})}

 // ---------- flags ----------
 dropFlag(f,x,y){f.carrier.carry=false;f.carrier=null;f.home=false;f.x=x;f.y=y;f.dropT=0;this.emit({k:'drop',t:f.team})}
 flagHome(f){if(f.carrier)f.carrier.carry=false;f.carrier=null;f.home=true;f.x=f.hx;f.y=f.hy;f.dropT=0}

 // ---------- bots ----------
 botGoal(e){
  const m=this.mode;
  if(m==='koth'){const z=this.zone;return{x:z.x+rand(-30,30),y:z.y+rand(-30,30),p:.65}}
  if(m==='ctf'){
   const own=this.flags[e.team],en=this.flags[1-e.team];
   if(en.carrier===e)return{x:own.hx,y:own.hy,p:1,force:true};
   if(!own.home){const c=own.carrier||own;return{x:c.x,y:c.y,p:.9,force:Math.random()<.5}}
   if(e.role==='atk'){if(en.carrier)return{x:en.carrier.x+rand(-25,25),y:en.carrier.y+rand(-25,25),p:.6};return{x:en.x,y:en.y,p:.85,force:Math.random()<.45}}
   return{x:own.hx+rand(-70,70),y:own.hy+rand(-70,70),p:.6};
  }
  if(m==='br'){
   const s=this.storm,tx=s.shrinking?s.fx:s.x,ty=s.shrinking?s.fy:s.y,tr=s.shrinking?s.fr:s.r,d=Math.hypot(e.x-tx,e.y-ty);
   if(d>tr*.75)return{x:tx+rand(-tr*.3,tr*.3),y:ty+rand(-tr*.3,tr*.3),p:1,force:Math.hypot(e.x-s.x,e.y-s.y)>s.r*.92};
  }
  return null;
 }
 botThink(e,dt){
  const tgt=this.nearestEnemy(e,420),td=tgt?Math.sqrt(d2(e,tgt)):1e9;
  if(e.aiming){
   e.drawT-=dt;
   if(tgt){const ft=td/e.aspeed*e.lead;e.aim=Math.atan2(tgt.y+tgt.vy*ft-e.y,tgt.x+tgt.vx*ft-e.x)+e.err;e.face=Math.cos(e.aim)>=0?1:-1}
   if(e.drawT<=0){e.aiming=false;if(tgt&&td<e.range*1.1){this.fire(e,e.aim);e.shootT=e.fireCd}}
  }else if(e.shootT<=0&&tgt&&td<e.range*.9&&(e.losCd-=dt)<=0){
   e.losCd=.15;
   if(this.hasLOS(e.x,e.y-1,tgt.x,tgt.y-1)){e.aiming=true;e.drawT=rand(.35,.65)/e.smart;e.lead=rand(0,.9)*e.smart;e.err=rand(-.15,.15)/e.smart}
  }
  e.modeT-=dt;
  if(e.modeT<=0){
   e.modeT=rand(.3,.75);let ang=null;
   const goal=this.botGoal(e);
   if(goal&&goal.force){ang=Math.atan2(goal.y-e.y,goal.x-e.x)+rand(-.25,.25);e.modeT=rand(.25,.5)}
   else if(tgt&&td<e.range*1.4){
    const to=Math.atan2(tgt.y-e.y,tgt.x-e.x);
    if(e.hp<e.maxHp*.3&&tgt.hp>e.hp){ang=to+Math.PI+rand(-.6,.6);e.modeT=rand(.8,1.4)}
    else if(Math.random()<.2)ang=null;
    else{const side=Math.random()<.5?1:-1;ang=to+side*(Math.PI/2+(td>e.range*.6?-.5:.5))}
   }else if(goal&&Math.random()<goal.p){ang=Math.atan2(goal.y-e.y,goal.x-e.x)+rand(-.3,.3);e.modeT=rand(.5,1)}
   else if(tgt&&e.hp>e.maxHp*.55&&Math.random()<.55){ang=Math.atan2(tgt.y-e.y,tgt.x-e.x)+rand(-.3,.3);e.modeT=rand(.6,1.1)}
   else{let ob=null,od=1e12;for(const o of this.orbs){const d=d2(e,o);if(d<od){od=d;ob=o}}ang=ob?Math.atan2(ob.y-e.y,ob.x-e.x):rand(0,6.28);e.modeT=rand(.4,.9)}
   if(ang===null){e.mx=0;e.my=0}else{e.mx=Math.cos(ang);e.my=Math.sin(ang)}
  }
  if(e.x<30&&e.mx<0)e.mx=-e.mx;if(e.x>WORLD-30&&e.mx>0)e.mx=-e.mx;
  if(e.y<30&&e.my<0)e.my=-e.my;if(e.y>WORLD-30&&e.my>0)e.my=-e.my;
 }

 // ---------- mode rules ----------
 stepMode(dt){
  const m=this.mode;
  if(m==='tdm'&&Math.max(...this.ts)>=this.M.goal){this.over=true;this.win=this.ts[0]>this.ts[1]?0:1}
  if(m==='koth'){
   const z=this.zone,inT=[0,0];
   for(const e of this.ents)if(e.alive&&(e.x-z.x)**2+(e.y-z.y)**2<z.r*z.r)inT[e.team]++;
   z.cont=inT[0]>0&&inT[1]>0;
   if(!z.cont&&(inT[0]||inT[1])){
    const t=inT[0]?0:1;if(z.owner!==t){z.owner=t;this.emit({k:'zone',t})}
    this.ts[t]+=dt;
    for(const e of this.ents)if(e.alive&&e.team===t&&(e.x-z.x)**2+(e.y-z.y)**2<z.r*z.r)e.score+=dt*3;
   }
   if(Math.max(...this.ts)>=this.M.goal){this.over=true;this.win=this.ts[0]>=this.M.goal?0:1}
  }
  if(m==='ctf'){
   for(const f of this.flags){
    if(f.carrier){
     const c=f.carrier;f.x=c.x;f.y=c.y;
     const own=this.flags[c.team];
     if(own.home&&(c.x-own.hx)**2+(c.y-own.hy)**2<26*26){
      this.ts[c.team]++;c.score+=100;this.emit({k:'cap',t:c.team,i:c.id});this.flagHome(f);
      if(this.ts[c.team]>=this.M.goal){this.over=true;this.win=c.team}
     }
     continue;
    }
    if(!f.home){f.dropT+=dt;if(f.dropT>20){this.flagHome(f);this.emit({k:'ret',t:f.team})}}
    for(const e of this.ents){
     if(!e.alive||(e.x-f.x)**2+(e.y-f.y)**2>=11*11)continue;
     if(e.team!==f.team){if(!e.carry){f.carrier=e;e.carry=true;f.home=false;this.emit({k:'take',t:f.team,i:e.id});break}}
     else if(!f.home){this.flagHome(f);e.score+=30;this.emit({k:'ret',t:f.team,i:e.id});break}
    }
   }
  }
  if(m==='br'){
   const s=this.storm;s.t+=dt;
   const PH=50,HOLD=22;
   if(s.phase<STORM_R.length-1){
    if(!s.shrinking&&s.t>=HOLD){
     s.shrinking=true;s.ox=s.x;s.oy=s.y;s.or=s.r;
     const nr=STORM_R[s.phase+1],off=Math.max(0,s.r-nr)*.55,a=rand(0,6.28),k=Math.random();
     s.fr=nr;s.fx=Math.max(nr*.5,Math.min(WORLD-nr*.5,s.x+Math.cos(a)*off*k));s.fy=Math.max(nr*.5,Math.min(WORLD-nr*.5,s.y+Math.sin(a)*off*k));
     this.emit({k:'storm'});
    }
    if(s.shrinking){
     const p=Math.min(1,(s.t-HOLD)/(PH-HOLD));
     s.x=s.ox+(s.fx-s.ox)*p;s.y=s.oy+(s.fy-s.oy)*p;s.r=s.or+(s.fr-s.or)*p;
     if(p>=1){s.shrinking=false;s.phase++;s.t=0}
    }
   }
   const dps=5+s.phase*3;
   for(const e of this.ents)if(e.alive&&(e.x-s.x)**2+(e.y-s.y)**2>s.r*s.r)this.damage(e,dps*dt,null,true);
   const alive=this.ents.filter(e=>e.alive);
   if(alive.length<=1&&this.ents.length>1){this.over=true;this.win=alive.length?alive[0].id:null;if(alive[0])alive[0].place=1}
  }
  if(this.timeLeft<=0&&!this.over){
   this.over=true;
   if(this.M.team)this.win=this.ts[0]===this.ts[1]?-1:(this.ts[0]>this.ts[1]?0:1);
   if(m==='br'){const alive=this.ents.filter(e=>e.alive).sort((a,b)=>b.hp-a.hp||b.kills-a.kills);alive.forEach((e,i)=>e.place=i+1);this.win=alive[0]?alive[0].id:null}
  }
 }
 modeState(){
  const o={};
  if(this.M.team)o.ts=this.ts.map(v=>Math.floor(v));
  if(this.zone)o.z=[this.zone.owner,this.zone.cont?1:0];
  if(this.flags)o.f=this.flags.map(f=>[Math.round(f.x),Math.round(f.y),f.carrier?f.carrier.id:0,f.home?1:0]);
  if(this.storm){const s=this.storm;o.st=[r1(s.x),r1(s.y),r1(s.r),r1(s.fx),r1(s.fy),r1(s.fr),s.shrinking?1:0];o.al=this.aliveCount()}
  return o;
 }
 // client: apply mirrored mode state (byId maps ids to entity objects)
 applyModeState(ms,byId){
  if(ms.ts)this.ts=ms.ts;
  if(ms.z&&this.zone){this.zone.owner=ms.z[0];this.zone.cont=!!ms.z[1]}
  if(ms.f&&this.flags)ms.f.forEach((a,i)=>{const f=this.flags[i];f.x=a[0];f.y=a[1];f.carrier=a[2]&&byId[a[2]]||null;f.home=!!a[3]});
  if(ms.st&&this.storm){const s=this.storm,a=ms.st;s.x=a[0];s.y=a[1];s.r=a[2];s.fx=a[3];s.fy=a[4];s.fr=a[5];s.shrinking=!!a[6]}
  if(ms.al!==undefined)this.aliveN=ms.al;
 }
 standings(){
  const rows=this.ents.slice();
  if(this.mode==='br')rows.sort((a,b)=>(a.place||99)-(b.place||99)||b.kills-a.kills);
  else rows.sort((a,b)=>b.score-a.score);
  return rows;
 }

 // ---------- step ----------
 step(dt){
  if(this.over)return;
  this.timeLeft-=dt;this.matchT+=dt;
  for(const e of this.ents){
   if(!e.alive){if(!e.out){e.respawn-=dt;if(e.respawn<=0)this.respawn(e)}continue}
   e.inv=Math.max(0,e.inv-dt);e.hitT=Math.max(0,e.hitT-dt);e.shootT-=dt;e.sinceHit+=dt;e.slow=Math.max(0,e.slow-dt);
   if(e.guard&&!e.guardUp){e.guardT+=dt;if(e.guardT>=8){e.guardUp=true;e.guardT=0}}
   if(e.human){
    const I=e.input;e.mx=I.mx;e.my=I.my;e.aiming=!!I.aiming;
    if(e.aiming){e.aim=I.aim;e.face=Math.cos(e.aim)>=0?1:-1}
    if(e.queued!==null&&e.shootT<=0){this.fire(e,e.queued);e.shootT=e.fireCd;e.queued=null}
   }else this.botThink(e,dt);
   const moved=this.moveEnt(e,dt);
   if(!e.human&&e.moving){if(moved<e.speed*dt*.3)e.stuck+=dt;else e.stuck=0;if(e.stuck>.35){e.stuck=0;const a=rand(0,6.28);e.mx=Math.cos(a);e.my=Math.sin(a);e.modeT=rand(.5,.9)}}
   if(e.sinceHit>4)e.hp=Math.min(e.maxHp,e.hp+e.maxHp*.025*dt);
   if(e.regen)e.hp=Math.min(e.maxHp,e.hp+e.maxHp*.015*e.regen*dt);
   if(e.burn>0){e.burn-=dt;this.damage(e,e.burnDps*dt,e.burnSrc,true);if(!e.alive)continue}
   if(e.fart){
    e.fartT+=dt;
    if(e.fartT>=5){
     e.fartT=0;const r=[0,26,36,48][Math.min(3,e.fart)];
     this.emit({k:'fart',i:e.id,x:Math.round(e.x),y:Math.round(e.y+3),r});
     for(const o of this.ents)if(o.alive&&this.isEnemy(e,o)&&o.inv<=0&&(o.x-e.x)**2+(o.y-e.y)**2<r*r)this.damage(o,e.dmg*.6,e,false,o.x,o.y);
     if(!e.alive)continue;
    }
   }
   if(e.blade){
    for(let i=0;i<e.blade;i++){
     const a=this.matchT*4+i*Math.PI*2/e.blade,bx=e.x+Math.cos(a)*15,by=e.y-1+Math.sin(a)*15;
     for(const o of this.ents){
      if(!o.alive||!this.isEnemy(e,o)||(o.x-bx)**2+(o.y-1-by)**2>=8*8)continue;
      if((e.bladeCd[o.id]||0)>this.matchT)continue;
      e.bladeCd[o.id]=this.matchT+.5;
      if(o.inv<=0)this.damage(o,e.dmg*.4,e,false,bx,by);
     }
    }
   }
   const mr=(e.r+24)*(1+.6*e.magnet);
   for(let i=this.orbs.length-1;i>=0;i--){
    const o=this.orbs[i],dx=e.x-o.x,dy=e.y-o.y,d=dx*dx+dy*dy;
    if(d<mr*mr){
     if(d<(e.r+4)**2){this.gainXp(e,o.v);this.orbs.splice(i,1);this.orbDels.push(o.id);if(e.human)this.emit({k:'pick',i:e.id})}
     else{const dd=Math.sqrt(d);o.x+=dx/dd*130*dt;o.y+=dy/dd*130*dt}
    }
   }
  }
  for(let i=this.arrows.length-1;i>=0;i--){
   const a=this.arrows[i],px=a.x,py=a.y;
   if(a.homing){
    let best=null,bd=55*55;
    for(const e of this.ents){if(!e.alive||!a.owner||!this.isEnemy(a.owner,e)||a.hit.has(e))continue;const dx=e.x-a.x,dy=e.y-1-a.y,d=dx*dx+dy*dy;if(d<bd&&(dx*a.vx+dy*a.vy)>.6*Math.sqrt(d)*a.sp){bd=d;best=e}}
    if(best){const want=Math.atan2(best.y-1-a.y,best.x-a.x),df=angDiff(a.ang,want),mx=a.homing*1.2*dt;a.ang+=Math.max(-mx,Math.min(mx,df));a.vx=Math.cos(a.ang)*a.sp;a.vy=Math.sin(a.ang)*a.sp}
   }
   a.x+=a.vx*dt;a.y+=a.vy*dt;a.life-=dt;
   let dead=a.life<=0||a.x<0||a.y<0||a.x>WORLD||a.y>WORLD;
   if(!dead&&this.blockedPoint(a.x,a.y,true)){
    if(a.bounce>0){
     const bx=this.blockedPoint(a.x,py,true),by=this.blockedPoint(px,a.y,true);
     if(bx||!by)a.vx=-a.vx;if(by||!bx)a.vy=-a.vy;
     a.x=px;a.y=py;a.bounce--;a.ang=Math.atan2(a.vy,a.vx);a.dyn=true;a.life+=.15;
     this.emit({k:'sp',x:Math.round(px),y:Math.round(py),c:'#ffe066'});
    }else{
     dead=true;this.emit({k:'sp',x:Math.round(a.x-a.vx*.01),y:Math.round(a.y-a.vy*.01),c:'#d8c8a8'});
     if(a.boom)this.explode(a,a.x-a.vx*.01,a.y-a.vy*.01,null);
    }
   }
   if(!dead)for(const e of this.ents){
    if(!e.alive||e===a.owner||a.hit.has(e)||(a.owner&&!this.isEnemy(a.owner,e)))continue;
    if((a.x-e.x)**2+(a.y-e.y+1)**2<(e.r+2)**2){
     a.hit.add(e);
     if(e.inv<=0){
      this.damage(e,a.dmg,a.owner,false,a.x,a.y);
      if(e.alive){if(a.fire){e.burn=3;e.burnDps=a.dmg*.3*a.fire;e.burnSrc=a.owner}if(a.ice)e.slow=Math.max(e.slow,1.5*a.ice)}
      if(a.boom)this.explode(a,a.x,a.y,e);
      if(a.split&&a.owner){
       const n=a.split*2;
       for(let k=0;k<n;k++){const off=(k%2?1:-1)*(.45+Math.floor(k/2)*.45);this.newArrow(a.owner,a.x,a.y,a.ang+off,{child:true,dmg:a.dmg*.5,life:a.owner.range*.45/a.sp,hit:new Set([e])})}
       a.split=0;
      }
     }
     else this.emit({k:'sp',x:Math.round(a.x),y:Math.round(a.y),c:'#7cf3ff'});
     if(a.pierce>0)a.pierce--;else{dead=true;break}
    }
   }
   if(dead){this.arrows.splice(i,1);this.arrowDels.push(a.id)}
  }
  this.fillOrbs();
  this.stepMode(dt);
 }
 explode(a,x,y,skip){
  this.emit({k:'boom',x:Math.round(x),y:Math.round(y)});
  for(const e of this.ents){
   if(!e.alive||e===skip||e===a.owner||(a.owner&&!this.isEnemy(a.owner,e))||e.inv>0)continue;
   if((e.x-x)**2+(e.y-1-y)**2<24*24)this.damage(e,a.dmg*.45*a.boom,a.owner,false,e.x,e.y);
  }
 }
}
return{World,WORLD,MATCH,SLOTS,WT,MODES,MODE_IDS,TEAM_NAMES,TEAM_COLORS,NAMES,COLORS,PLAYER_COLOR,HAIRS,PANTS,SKILLS,SKILL_BY,BOT_PREF,FURN,xpNeed,shotDirs,rand,pick,shuffle};
});
