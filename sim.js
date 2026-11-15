// 백발백중 — shared game simulation (browser + Cloudflare Worker)
(function(root,factory){var S=factory();if(typeof module==='object'&&module.exports)module.exports=S;else root.Sim=S;})(typeof self!=='undefined'?self:globalThis,function(){
'use strict';
const WORLD=1100,MATCH=180,ORB_MIN=140,ORB_CAP=240,WT=7,SLOTS=12;
const rand=(a,b)=>a+Math.random()*(b-a);
const pick=a=>a[Math.floor(Math.random()*a.length)];
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));const t=a[i];a[i]=a[j];a[j]=t}return a};
const d2=(a,b)=>(a.x-b.x)**2+(a.y-b.y)**2;

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
];
const SKILL_BY={};for(const s of SKILLS)SKILL_BY[s.id]=s;
const BOT_PREF=['multi','atk','aspd','diag','hp','pierce','crit','side','back','leech','range','spd','fire','shield'];
const FURN={crate:{w:10,h:12,high:true},barrel:{w:9,h:11,high:true},table:{w:18,h:12,high:false},bed:{w:13,h:22,high:false},shelf:{w:20,h:9,high:true}};
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
 Object.assign(e,{maxHp:100,hp:100,dmg:20,fireCd:.6,speed:68,multi:1,diag:0,back:0,side:0,pierce:0,leech:0,crit:0,range:140,aspeed:230,fire:0,armor:1});
 e.skills={};e.level=1;e.xp=0;e.r=6;e.pending=0;e.opts=null;e.burn=0;e.aiming=false;e.queued=null;e.drawT=0;
}

class World{
 constructor(){
  this.ents=[];this.arrows=[];this.orbs=[];this.rocks=[];this.solids=[];this.buildings=[];
  this.timeLeft=MATCH;this.matchT=0;this.nid=1;
  this.events=[];this.orbAdds=[];this.orbDels=[];this.arrowAdds=[];this.arrowDels=[];
 }
 id(){return this.nid++}
 emit(ev){this.events.push(ev)}
 drain(){const r={ev:this.events,oa:this.orbAdds,od:this.orbDels,aa:this.arrowAdds,ad:this.arrowDels};this.events=[];this.orbAdds=[];this.orbDels=[];this.arrowAdds=[];this.arrowDels=[];return r}

 // ---------- map ----------
 solid(x,y,w,h,high,kind,t){const o={x,y,w,h,high:!!high,kind,t,sy:y+h};this.solids.push(o);return o}
 overlapsAny(x,y,w,h,m){
  for(const b of this.buildings)if(x<b.x+b.w+m&&x+w>b.x-m&&y<b.y+b.h+m&&y+h>b.y-m)return true;
  for(const o of this.solids)if(x<o.x+o.w+m&&x+w>o.x-m&&y<o.y+o.h+m&&y+h>o.y-m)return true;
  return false;
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
  this.buildings=[];this.solids=[];this.rocks=[];
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
   const nx=e.mx/mag,ny=e.my/mag,m=Math.min(1,mag)*(e.aiming?.7:1);
   e.x+=nx*m*e.speed*dt;e.y+=ny*m*e.speed*dt;
   if(!e.aiming){e.aim=Math.atan2(ny,nx);if(Math.abs(nx)>.1)e.face=nx>0?1:-1}
   e.walk=(e.walk||0)+dt*m*9;
  }
  this.collide(e);
  e.x=Math.max(6,Math.min(WORLD-6,e.x));e.y=Math.max(6,Math.min(WORLD-6,e.y));
  e.vx=(e.x-ox)/dt;e.vy=(e.y-oy)/dt;
  return Math.hypot(e.x-ox,e.y-oy);
 }

 // ---------- entities ----------
 placeSafe(e){
  for(let t=0;t<40;t++){
   const x=rand(50,WORLD-50),y=rand(50,WORLD-50);
   if(!this.freeSpot(x,y,14))continue;
   if(t<30&&this.ents.some(o=>o!==e&&o.alive&&(x-o.x)**2+(y-o.y)**2<170**2))continue;
   e.x=x;e.y=y;return;
  }
  e.x=rand(50,WORLD-50);e.y=rand(50,WORLD-50);
 }
 addEnt(o){
  const e={id:this.id(),name:o.name,color:o.color,hair:o.hair||pick(HAIRS),pants:o.pants||pick(PANTS),human:!!o.human,
   x:0,y:0,mx:0,my:0,vx:0,vy:0,score:0,kills:0,deaths:0,maxLevel:1,alive:true,respawn:0,
   hitT:0,inv:2,shootT:0,aim:0,face:1,walk:0,moving:false,sinceHit:9,modeT:0,smart:rand(.8,1.25),lead:0,err:0,losCd:0,stuck:0,killedBy:'',
   input:{mx:0,my:0,aiming:false,aim:0}};
  resetStats(e);this.placeSafe(e);this.ents.push(e);return e;
 }
 removeEnt(e){const i=this.ents.indexOf(e);if(i>=0)this.ents.splice(i,1)}
 addOrb(x,y,v,k){const o={id:this.id(),x,y,v,k:k||'n',ph:Math.random()*6};this.orbs.push(o);this.orbAdds.push(o);return o}
 fillOrbs(){let g=0;while(this.orbs.length<ORB_MIN&&g++<500){const x=rand(25,WORLD-25),y=rand(25,WORLD-25);if(!this.freeSpot(x,y,4))continue;this.addOrb(x,y,6,'n')}}
 gainXp(e,v){
  e.xp+=v;e.score+=v;
  while(e.xp>=xpNeed(e.level)){
   e.xp-=xpNeed(e.level);e.level++;e.maxLevel=Math.max(e.maxLevel,e.level);e.hp=Math.min(e.maxHp,e.hp+15);
   if(e.human){e.pending++;this.emit({k:'lvl',i:e.id})}
   else{const o=this.rollOpts(e);if(o.length){o.sort((a,b)=>BOT_PREF.indexOf(a.id)-BOT_PREF.indexOf(b.id));this.applySkill(e,Math.random()<.7?o[0]:pick(o))}}
  }
 }
 rollOpts(e){return shuffle(SKILLS.filter(s=>(e.skills[s.id]||0)<s.max)).slice(0,3)}
 applySkill(e,s){s.ap(e);e.skills[s.id]=(e.skills[s.id]||0)+1}
 // human picks a skill from e.opts (array of skill objects); returns true if applied
 chooseSkill(e,id){
  if(!e.alive||e.pending<=0||!e.opts)return false;
  const s=e.opts.find(x=>x.id===id);if(!s)return false;
  this.applySkill(e,s);e.pending--;e.opts=null;return true;
 }
 nearestEnemy(e,range){
  let best=null,bd=range*range;
  for(const o of this.ents){if(o===e||!o.alive)continue;const d=d2(e,o);if(d<bd){bd=d;best=o}}
  return best;
 }
 fire(e,a){
  e.aim=a;e.face=Math.cos(a)>=0?1:-1;
  for(const d of shotDirs(e,a)){
   const c=Math.cos(d),s=Math.sin(d);
   const ar={id:this.id(),x:e.x+c*5,y:e.y-1+s*5,vx:c*e.aspeed,vy:s*e.aspeed,ang:d,sp:e.aspeed,owner:e,dmg:e.dmg,pierce:e.pierce,hit:new Set(),life:e.range/e.aspeed,fire:e.fire,col:e.color};
   this.arrows.push(ar);this.arrowAdds.push(ar);
  }
  this.emit({k:'fire',i:e.id});
 }
 damage(t,amt,src,dot,x,y){
  if(!t.alive)return;
  let crit=false;
  if(!dot&&src&&Math.random()<src.crit){amt*=2;crit=true}
  amt*=t.armor;t.hp-=amt;t.sinceHit=0;
  if(!dot){t.hitT=.1;if(src&&src.alive&&src.leech)src.hp=Math.min(src.maxHp,src.hp+amt*src.leech);
   this.emit({k:'hit',v:t.id,s:src?src.id:0,a:Math.round(amt),c:crit?1:0,x:Math.round(x||t.x),y:Math.round(y||t.y)})}
  if(t.hp<=0)this.kill(t,src);
 }
 kill(t,src){
  t.alive=false;t.hp=0;t.respawn=3;t.burn=0;t.deaths++;t.aiming=false;t.queued=null;t.pending=0;t.opts=null;
  t.killedBy=src&&src!==t?src.name:'';
  const n=Math.min(14,4+t.level);
  for(let i=0;i<n;i++){const ox=t.x+rand(-16,16),oy=t.y+rand(-16,16);if(this.orbs.length<ORB_CAP&&this.freeSpot(ox,oy,2))this.addOrb(ox,oy,8,'b')}
  const sid=src&&src!==t?src.id:0;
  if(sid){src.kills++;this.gainXp(src,25+t.level*12)}
  this.emit({k:'kill',v:t.id,s:sid,x:Math.round(t.x),y:Math.round(t.y)});
 }
 respawn(e){resetStats(e);e.alive=true;e.inv=2;e.modeT=0;e.shootT=.3;this.placeSafe(e);this.emit({k:'spawn',i:e.id})}
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
   if(tgt&&td<e.range*1.4){
    const to=Math.atan2(tgt.y-e.y,tgt.x-e.x);
    if(e.hp<e.maxHp*.3&&tgt.hp>e.hp){ang=to+Math.PI+rand(-.6,.6);e.modeT=rand(.8,1.4)}
    else if(Math.random()<.2)ang=null;
    else{const side=Math.random()<.5?1:-1;ang=to+side*(Math.PI/2+(td>e.range*.6?-.5:.5))}
   }else if(tgt&&e.hp>e.maxHp*.55&&Math.random()<.55){ang=Math.atan2(tgt.y-e.y,tgt.x-e.x)+rand(-.3,.3);e.modeT=rand(.6,1.1)}
   else{let ob=null,od=1e12;for(const o of this.orbs){const d=d2(e,o);if(d<od){od=d;ob=o}}ang=ob?Math.atan2(ob.y-e.y,ob.x-e.x):rand(0,6.28);e.modeT=rand(.4,.9)}
   if(ang===null){e.mx=0;e.my=0}else{e.mx=Math.cos(ang);e.my=Math.sin(ang)}
  }
  if(e.x<30&&e.mx<0)e.mx=-e.mx;if(e.x>WORLD-30&&e.mx>0)e.mx=-e.mx;
  if(e.y<30&&e.my<0)e.my=-e.my;if(e.y>WORLD-30&&e.my>0)e.my=-e.my;
 }

 // ---------- step ----------
 step(dt){
  this.timeLeft-=dt;this.matchT+=dt;
  for(const e of this.ents){
   if(!e.alive){e.respawn-=dt;if(e.respawn<=0)this.respawn(e);continue}
   e.inv=Math.max(0,e.inv-dt);e.hitT=Math.max(0,e.hitT-dt);e.shootT-=dt;e.sinceHit+=dt;
   if(e.human){
    const I=e.input;e.mx=I.mx;e.my=I.my;e.aiming=!!I.aiming;
    if(e.aiming){e.aim=I.aim;e.face=Math.cos(e.aim)>=0?1:-1}
    if(e.queued!==null&&e.shootT<=0){this.fire(e,e.queued);e.shootT=e.fireCd;e.queued=null}
   }else this.botThink(e,dt);
   const moved=this.moveEnt(e,dt);
   if(!e.human&&e.moving){if(moved<e.speed*dt*.3)e.stuck+=dt;else e.stuck=0;if(e.stuck>.35){e.stuck=0;const a=rand(0,6.28);e.mx=Math.cos(a);e.my=Math.sin(a);e.modeT=rand(.5,.9)}}
   if(e.sinceHit>4)e.hp=Math.min(e.maxHp,e.hp+e.maxHp*.025*dt);
   if(e.burn>0){e.burn-=dt;this.damage(e,e.burnDps*dt,e.burnSrc,true);if(!e.alive)continue}
   for(let i=this.orbs.length-1;i>=0;i--){
    const o=this.orbs[i],dx=e.x-o.x,dy=e.y-o.y,d=dx*dx+dy*dy;
    if(d<(e.r+24)**2){
     if(d<(e.r+4)**2){this.gainXp(e,o.v);this.orbs.splice(i,1);this.orbDels.push(o.id);if(e.human)this.emit({k:'pick',i:e.id})}
     else{const dd=Math.sqrt(d);o.x+=dx/dd*130*dt;o.y+=dy/dd*130*dt}
    }
   }
  }
  for(let i=this.arrows.length-1;i>=0;i--){
   const a=this.arrows[i];a.x+=a.vx*dt;a.y+=a.vy*dt;a.life-=dt;
   let dead=a.life<=0||a.x<0||a.y<0||a.x>WORLD||a.y>WORLD;
   if(!dead&&this.blockedPoint(a.x,a.y,true)){dead=true;this.emit({k:'sp',x:Math.round(a.x-a.vx*.01),y:Math.round(a.y-a.vy*.01),c:'#d8c8a8'})}
   if(!dead)for(const e of this.ents){
    if(!e.alive||e===a.owner||a.hit.has(e))continue;
    if((a.x-e.x)**2+(a.y-e.y+1)**2<(e.r+2)**2){
     a.hit.add(e);
     if(e.inv<=0){this.damage(e,a.dmg,a.owner,false,a.x,a.y);if(a.fire&&e.alive){e.burn=3;e.burnDps=a.dmg*.3*a.fire;e.burnSrc=a.owner}}
     else this.emit({k:'sp',x:Math.round(a.x),y:Math.round(a.y),c:'#7cf3ff'});
     if(a.pierce>0)a.pierce--;else{dead=true;break}
    }
   }
   if(dead){this.arrows.splice(i,1);this.arrowDels.push(a.id)}
  }
  this.fillOrbs();
 }
}
return{World,WORLD,MATCH,SLOTS,WT,NAMES,COLORS,PLAYER_COLOR,HAIRS,PANTS,SKILLS,SKILL_BY,BOT_PREF,FURN,xpNeed,shotDirs,rand,pick,shuffle};
});
