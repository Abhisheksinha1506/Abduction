import { WORLD } from './config.js';

// All artwork is drawn in world units. The renderer never changes game state.
const TAU = Math.PI * 2;
const INK = '#123747';
const MINT = '#b8ffca';
const CORAL = '#ff886f';
const PAL = {
  farm: { top:'#122e42', bottom:'#285d66', far:'#245b64', mid:'#28696b', near:'#1d5558', ground:'#244b48', accent:'#cd7466' },
  town: { top:'#1c3049', bottom:'#426777', far:'#35576c', mid:'#376778', near:'#285962', ground:'#294e4c', accent:'#d89c71' },
  industrial: { top:'#222a47', bottom:'#586474', far:'#404b68', mid:'#3f5e6f', near:'#2e4c5e', ground:'#304a50', accent:'#cf866f' },
  base: { top:'#152f46', bottom:'#3d7374', far:'#2b5e68', mid:'#326e70', near:'#21595b', ground:'#294c48', accent:'#8ba49b' },
  boss: { top:'#302c48', bottom:'#6c6377', far:'#554e69', mid:'#4a5a68', near:'#344956', ground:'#3c474e', accent:'#e18b7a' }
};
const rand = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const finite = (v, fallback=0) => Number.isFinite(v) ? v : fallback;
function oval(c,x,y,rx,ry,fill,stroke=null,lw=1) { c.beginPath(); c.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,TAU); if(fill){c.fillStyle=fill;c.fill();} if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.stroke();} }
function line(c,x1,y1,x2,y2,color,width=1) { c.beginPath(); c.moveTo(x1,y1); c.lineTo(x2,y2); c.strokeStyle=color;c.lineWidth=width;c.stroke(); }
function poly(c,points,fill,stroke=null,lw=1) { c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.stroke();} }
function rect(c,x,y,w,h,fill,r=0,stroke=null,lw=1) { c.beginPath(); if(r&&c.roundRect)c.roundRect(x,y,w,h,r);else c.rect(x,y,w,h);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.stroke();} }
function glow(c,x,y,r,color,strength=.5) { if(r<=0)return;const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');c.save();c.globalAlpha*=strength;c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);c.restore(); }
function label(c,text,x,y,color='#e0ffe7',size=11,align='center') { c.font=`600 ${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;c.textAlign=align;c.textBaseline='middle';c.fillStyle=color;c.fillText(text,x,y); }

function sky(c,w,h,cam,time,theme,menu) {
  const p=PAL[theme]||PAL.farm;
  const g=c.createLinearGradient(0,0,0,620);g.addColorStop(0,p.top);g.addColorStop(.65,p.bottom);g.addColorStop(1,'#56857c');c.fillStyle=g;c.fillRect(0,0,w,h);
  // A luminous, gently imperfect moon and a sparse, deliberate star field.
  const mx=w*.798-cam*.035,my=166;
  glow(c,mx,my,210,'#97dbbc',.13);
  for(let i=0;i<95;i++) {
    const x=((rand(i+1)*1800-cam*.08)%w+w)%w,y=35+rand(i+402)*340;
    const alpha=(.25+rand(i+729)*.5)*(.8+.2*Math.sin(time*.5+i));
    c.globalAlpha=alpha; const r=rand(i+990)>.94?1.7:.7;
    oval(c,x,y,r,r,'#d8fbe0');
    if(r>1){line(c,x-4,y,x+4,y,'#a2ceba',.7);line(c,x,y-4,x,y+4,'#a2ceba',.7);}
  }
  c.globalAlpha=1;
  oval(c,mx,my,83,83,'#bbd9bd');
  c.save();c.beginPath();c.arc(mx,my,83,0,TAU);c.clip();
  const mg=c.createLinearGradient(mx-80,my-80,mx+80,my+80);mg.addColorStop(0,'#e9efd0');mg.addColorStop(1,'#9bc9b1');c.fillStyle=mg;c.fillRect(mx-85,my-85,170,170);
  c.globalAlpha=.16;oval(c,mx+32,my-11,49,59,'#6aa49e');oval(c,mx-24,my+43,33,19,'#6aa49e');oval(c,mx-41,my-22,15,18,'#6aa49e');oval(c,mx+20,my-46,11,8,'#6aa49e');oval(c,mx-5,my+6,16,12,'#a9c1a5');
  for(let i=0;i<27;i++)oval(c,mx-65+rand(i+100)*130,my-66+rand(i+210)*130,2+rand(i+38)*8,2+rand(i+38)*5,'#568b8c');
  c.restore();
  // Thin vapor drifts below the stars. Motifs repeat seamlessly while flying.
  for(let i=0;i<7;i++) {
    const x=((i*310+rand(i+19)*190-cam*.16+time*(i%2?.8:1.2))%(w+500)+w+500)%(w+500)-250;
    const y=210+rand(i+54)*145;
    c.save();c.globalAlpha=.045;oval(c,x,y,130+rand(i+55)*60,9,'#d7f0cb');oval(c,x+70,y-4,120,5,'#d7f0cb');c.restore();
  }
  // Hand-shaped layered hills, kept low so objects read cleanly against the sky.
  hills(c,w,cam*.12,425,130,p.far,3);
  hills(c,w,cam*.24,478,100,p.mid,7);
  hills(c,w,cam*.40,538,80,p.near,12);
  c.save();c.globalAlpha=.08;
  for(let i=0;i<11;i++){const x=i*180-(cam*.38%180);c.beginPath();c.moveTo(x,509);c.quadraticCurveTo(x+80,496,x+170,529);c.strokeStyle='#d2e8ac';c.lineWidth=2;c.stroke();}
  c.restore();
  distantScenery(c,w,cam,time,theme);
  // Thin haze gives the darkest silhouettes an atmospheric edge.
  const fog=c.createLinearGradient(0,515,0,610);fog.addColorStop(0,'#8dc7aa00');fog.addColorStop(1,'#8dc7aa12');c.fillStyle=fog;c.fillRect(0,515,w,95);
}

function hills(c,w,offset,base,amp,color,seed) {
  c.beginPath();c.moveTo(-200,720);
  const span=460, start=Math.floor(offset/span)-1;
  for(let i=start;i<start+Math.ceil(w/span)+4;i++) {
    const x=i*span-offset,y=base-rand(i+seed)*amp;
    if(i===start)c.lineTo(x,y);
    c.bezierCurveTo(x+span*.35,y-38,x+span*.68,base-rand(i+1+seed)*amp-22,x+span,base-rand(i+1+seed)*amp);
  }
  c.lineTo(w+300,720);c.closePath();c.fillStyle=color;c.fill();
}

function distantScenery(c,w,cam,time,theme) {
  const off=cam*.55;
  c.save();c.strokeStyle='#25525a';c.lineCap='round';
  for(let i=0;i<18;i++) {
    const x=i*165-off-90, y=569+rand(i+6)*10, s=.65+rand(i+20)*.7;
    if(x < -170 || x > w+170)continue;
    if((theme==='industrial'||theme==='base'||theme==='boss')&&i%3===0) {
      rect(c,x,y-100*s,45*s,100*s,'#2a515b');rect(c,x-8*s,y-105*s,61*s,7*s,'#355f64');
      rect(c,x+60*s,y-67*s,50*s,67*s,'#2a515b');
      for(let j=0;j<3;j++){rect(c,x+9*s+j*12*s,y-73*s,6*s,3*s,'#86a47c');rect(c,x+9*s+j*12*s,y-52*s,6*s,3*s,'#577b70');}
      const pulse=.4+.35*Math.sin(time*2+i);c.globalAlpha=pulse;oval(c,x+22*s,y-108*s,2.5,2.5,CORAL);c.globalAlpha=1;
    } else if(i%5===1) {
      // Water tower, thin supports and an ellipsoid reservoir.
      line(c,x-16*s,y-71*s,x-22*s,y,'#214851',3);line(c,x+16*s,y-71*s,x+22*s,y,'#214851',3);
      line(c,x-20*s,y-10*s,x+18*s,y-55*s,'#214851',1.5);line(c,x+20*s,y-10*s,x-18*s,y-55*s,'#214851',1.5);
      rect(c,x-25*s,y-93*s,50*s,29*s,'#386a70',6);oval(c,x,y-93*s,25*s,7*s,'#4a7778');oval(c,x,y-64*s,25*s,6*s,'#315e64');
      rect(c,x-17*s,y-88*s,4*s,18*s,'#578782',2);
    } else {
      const type=i%3;
      line(c,x,y,x,y-56*s,'#244c50',5*s);
      if(type===0){for(let j=0;j<3;j++)poly(c,[[x-21*s+j*3*s,y-15*s-j*14*s],[x,y-84*s+j*5*s],[x+21*s-j*3*s,y-15*s-j*14*s]],'#2c5b5c');}
      else {oval(c,x,y-55*s,24*s,30*s,'#2b5b5d');oval(c,x-15*s,y-43*s,21*s,22*s,'#2b5b5d');oval(c,x+14*s,y-42*s,22*s,23*s,'#2b5b5d');}
    }
  }
  c.restore();
  // Distant pole wires frame the human world without interfering with play.
  c.save();c.globalAlpha=.6;
  for(let i=0;i<7;i++){
    const x=i*420-cam*.68-90,y=516+(i%2)*9;
    line(c,x,y,x,609,'#28515a',4);line(c,x-17,y+6,x+17,y+6,'#28515a',3);
    c.beginPath();c.moveTo(x,y+9);c.quadraticCurveTo(x+210,y+55,x+420,516+((i+1)%2)*9+9);c.strokeStyle='#2a5258';c.lineWidth=1.2;c.stroke();
  }c.restore();
}

function ground(c,w,cam,theme,time) {
  const p=PAL[theme]||PAL.farm;
  const g=c.createLinearGradient(0,600,0,720);g.addColorStop(0,p.ground);g.addColorStop(.23,'#1e3e3d');g.addColorStop(1,'#142e34');
  c.fillStyle=g;c.fillRect(0,609,w,111);
  rect(c,0,609,w,4,'#668970');rect(c,0,613,w,4,'#344e44');
  c.save();c.globalAlpha=.24;
  for(let i=0;i<155;i++) {
    const wx=i*23+rand(i+80)*18,x=wx-cam;
    if(x<0||x>w)continue;
    const y=624+rand(i+11)*84;
    rect(c,x,y,3+rand(i+75)*11,1.2,'#91b099',1);
  }c.restore();
  // Bare footpath and small tufts make the play surface easy to read.
  for(let i=0;i<61;i++){
    const x=i*43+rand(i+4)*12-cam;if(x< -15||x>w+15)continue;
    const tall=4+rand(i+72)*8;
    line(c,x,610,x-3,610-tall,'#729875',1.3);line(c,x+1,610,x+5,607-tall*.6,'#547b62',1.3);
  }
  // Fence occupies the lower background, with deliberate gaps for buildings.
  for(let i=0;i<48;i++) {
    const x=i*57+20-cam;
    if(x<-80||x>w+80||i%9>5)continue;
    rect(c,x,585,5,25,'#486b60',1);poly(c,[[x,585],[x+2.5,581],[x+5,585]],'#628375');
    rect(c,x+4,591,53,3,'#47665b');rect(c,x+4,601,53,3,'#47665b');
  }
}

function drawBarn(c,b,theme,time) {
  const x=b.x-b.w/2,y=b.y-b.h/2,w=b.w,h=b.h;
  const health=finite(b.hp,100);if(health<=0){rubble(c,b.x,b.y+b.h/2,w,theme);return;}
  const industrial=theme==='industrial'||theme==='base'||theme==='boss';
  c.save();
  oval(c,b.x,y+h+3,w*.65,7,'#0d2b3045');
  if(industrial) {
    const roof=Math.min(18,h*.19);
    rect(c,x,y+roof,w,h-roof,'#4e706c',2,INK,2);
    poly(c,[[x-5,y+roof],[x+12,y],[x+w-12,y],[x+w+5,y+roof]],'#87a19a',INK,2);
    rect(c,x+8,y+roof+4,w-16,6,'#718c7f');
    const dw=w*.34,dh=h*.6;
    rect(c,b.x-dw/2,y+h-dh,dw,dh,'#1d4148',2,'#89a090',2);
    for(let j=1;j<5;j++)line(c,b.x-dw/2+3,y+h-dh+j*dh/5,b.x+dw/2-3,y+h-dh+j*dh/5,'#426369',1);
    for(let j=0;j<2;j++){const wx=x+10+j*(w-30);rect(c,wx,y+h*.42,17,h*.2,'#a6b999',1,INK,2);line(c,wx+8,y+h*.42,wx+8,y+h*.62,'#3b5b5d',2);}
    rect(c,b.x-16,y+roof+13,32,11,'#304e51',1);label(c,theme==='base'?'51':'NO. 08',b.x,y+roof+18,'#cbd6b5',6);
    for(let j=0;j<Math.floor(w/19);j++)poly(c,[[x+j*19,y+h-8],[x+j*19+7,y+h-8],[x+j*19+12,y+h],[x+j*19+5,y+h]],j%2?'#839371':'#324d48');
    line(c,x+w*.8,y,x+w*.8,y-25,'#769a8f',2);oval(c,x+w*.8,y-25,3,3,CORAL);glow(c,x+w*.8,y-25,15,CORAL,.25+.15*Math.sin(time*3));
    if(theme==='base'){line(c,x+20,y,x+20,y-28,'#6f958d',2);c.beginPath();c.arc(x+20,y-32,14,.1,Math.PI-.1);c.fillStyle='#9db2a5';c.fill();line(c,x+20,y-32,x+32,y-44,'#a3bbb0',1.5);}
  } else {
    const roof=h*.28, body=h-roof;
    rect(c,x,y+roof,w,body,theme==='town'?'#8b8270':'#9f655b',1,INK,2);
    for(let j=1;j<Math.floor(w/11);j++)line(c,x+j*11,y+roof+2,x+j*11,y+h-1,theme==='town'?'#6d7063':'#80534c',1);
    poly(c,[[x-7,y+roof+4],[x+w*.20,y+5],[b.x,y-7],[x+w*.80,y+5],[x+w+7,y+roof+4]],'#30545b',INK,2);
    line(c,x+w*.20,y+6,b.x,y-5,'#7e9b8b',2);line(c,b.x,y-5,x+w*.80,y+6,'#7e9b8b',2);
    line(c,x-5,y+roof+5,x+w+5,y+roof+5,'#c5b39a',3);
    const dw=w*.39,dh=body*.7,dy=y+h-dh;
    rect(c,b.x-dw/2,dy,dw,dh,'#573f3e',1,'#c7b599',2.5);
    line(c,b.x,dy+1,b.x,y+h,'#c7b599',2);
    line(c,b.x-dw/2+3,dy+4,b.x-2,y+h-3,'#ad9c80',2);line(c,b.x+dw/2-3,dy+4,b.x+2,y+h-3,'#ad9c80',2);
    for(let j=0;j<2;j++){
      const wx=x+w*(j?.78:.12),wy=y+roof+body*.25;
      glow(c,wx+6,wy+8,20,'#e9c27c',.12);rect(c,wx,wy,12,17,'#d9b77a',1,INK,2);line(c,wx+6,wy,wx+6,wy+17,'#614f49',1.5);line(c,wx,wy+8,wx+12,wy+8,'#614f49',1.5);
    }
    oval(c,b.x,y+roof*.52,7,7,'#c1c3a1',INK,2);line(c,b.x-6,y+roof*.52,b.x+6,y+roof*.52,'#3a5c5e',2);line(c,b.x,y+roof*.52-6,b.x,y+roof*.52+6,'#3a5c5e',2);
    if(theme==='farm') {
      // Small attached silo; its size stays within the collision silhouette.
      const sx=x+w-24, sy=y+roof+8;
      rect(c,sx,sy,19,h-roof-8,'#789489',1,'#385c5a',1.5);oval(c,sx+9.5,sy,9.5,5,'#a4b39c','#385c5a',1.5);
      for(let j=1;j<4;j++)line(c,sx+1,sy+j*(h-roof-8)/4,sx+18,sy+j*(h-roof-8)/4,'#4f756f',1);
    }
  }
  if(b.shelter) {
    const n=b.occupants?.length||finite(b.occupancy,0);
    if(n>0){rect(c,b.x-16,y-28,32,15,'#22494b',7,'#86ba9d',1);label(c,`${n} IN`,b.x,y-20,'#bce3b4',8);}
  }
  if(health/finite(b.maxHp,100)<.5){c.globalAlpha=.6;line(c,x+w*.36,y+h*.4,x+w*.47,y+h*.6,'#122b32',2);line(c,x+w*.47,y+h*.6,x+w*.42,y+h*.8,'#122b32',2);}
  if(b.flash>0){c.globalAlpha=clamp(b.flash,0,.3);rect(c,x,y,w,h,'#fff1cd',2);}
  c.restore();
}

function rubble(c,x,y,w,theme) {
  const col=theme==='farm'?'#83645a':'#60726b';
  for(let i=0;i<7;i++){const px=x-w*.45+i*w*.15;poly(c,[[px,y],[px-7,y-7-rand(i+92)*12],[px+9,y-9-rand(i+54)*10],[px+17,y]],col,INK,1);}
}

function shadow(c,e) {
  if(e.kind==='plane'||e.state==='sheltered'||e.dead||!Number.isFinite(e.x)||!Number.isFinite(e.y))return;
  const altitude=Math.max(0,WORLD.ground-e.y-(e.h||24)/2);
  c.save();c.globalAlpha=Math.max(.07,.22-altitude*.0005);oval(c,e.x,WORLD.ground+2,(e.w||20)*.48*(1+altitude*.001),3+Math.min(5,(e.w||20)*.05),'#061e29');c.restore();
}

function person(c,e,time) {
  const h=e.h||30,w=e.w||16,s=h/32;
  const lifted=e.physical==='lifted',air=e.physical==='airborne',stunned=e.physical==='stunned';
  const attack=e.state==='aim'||e.state==='committed';
  const fleeing=e.state==='flee'||e.state==='fleeing';
  const speed=Math.abs(e.vx||0),walk=Math.sin(time*(fleeing?17:10)+(e.id||0)*1.3)*(speed>2?3:0);
  const flip=attack&&Number.isFinite(e.aimX)?(e.aimX<e.x?-1:1):(e.facing||e.direction||((e.vx||0)<-1?-1:1));
  const skin=['#e5b195','#ca947d','#d9b383','#b77b64'][Math.abs((e.id||0)%4)];
  const shirt=e.kind==='agent'?'#484e68':e.kind==='gunner'?'#899e72':e.kind==='thrower'?'#d5a06b':['#d98b7a','#a8b9a1','#779fac','#ba9fc1'][Math.abs((e.id||0)%4)];
  c.save();c.translate(e.x,e.y);c.scale(s*flip,s);
  if(air)c.rotate(clamp((e.vx||0)*.005,-.65,.65));
  if(stunned)c.rotate(.6);
  if(e.state==='sheltered')c.globalAlpha=.28;
  c.lineCap='round';c.lineJoin='round';
  // Boots, knees, and bent legs add a readable walking rhythm even at small scale.
  const spread=lifted?4:walk;
  line(c,-3,5,-4-spread,13,'#243b49',4);line(c,3,5,4+spread,13,'#243b49',4);
  line(c,-4-spread,14,-1-spread,14,'#b4b9a0',2.5);line(c,4+spread,14,7+spread,14,'#b4b9a0',2.5);
  rect(c,-6,-7,12,15,shirt,3,INK,1.2);
  if(e.kind==='agent'){poly(c,[[-2,-7],[0,-3],[2,-7]],'#e1e5d1');line(c,0,-3,0,4,'#ca738e',1.4);}
  if(e.kind==='thrower'){line(c,-3,-6,-3,6,'#605a51',1.5);line(c,3,-6,3,6,'#605a51',1.5);}
  const armY=lifted?-13:attack?-7:-1;
  line(c,-5,-4,-9+(lifted?-1:walk*.4),armY,shirt,3);line(c,5,-4,9+(lifted?1:-walk*.4),armY,shirt,3);
  oval(c,-9+(lifted?-1:walk*.4),armY,2,2,skin);oval(c,9+(lifted?1:-walk*.4),armY,2,2,skin);
  oval(c,0,-12,5.7,6.5,skin,INK,1.3);
  if(e.kind==='agent') {
    rect(c,-5,-16,10,4,'#303b4f',2);rect(c,-5,-13,11,3,'#253d4f',1);line(c,-3,-12,0,-12,'#9fdfbc',1);
  } else if(e.kind==='thrower') {
    rect(c,-8,-17,16,3,'#bcb48b',1);rect(c,-5,-21,10,5,'#bcb48b',2);rect(c,-4,-17,9,1,'#71644e');
  } else if(e.kind==='gunner') {
    c.beginPath();c.arc(0,-14,6,Math.PI,TAU);c.fillStyle='#647966';c.fill();rect(c,-6,-14,15,2,'#9caa7e',1);
  } else {
    c.beginPath();c.arc(-1,-14,5.8,Math.PI,TAU);c.lineTo(5,-12);c.lineTo(2,-15);c.closePath();c.fillStyle=['#655052','#8c654d','#c1a26c'][Math.abs((e.id||0)%3)];c.fill();
  }
  oval(c,3,-12,1,1.1,'#263e45');
  if(e.kind==='thrower') {
    c.save();c.translate(11,attack?-9:2);c.rotate(attack?-.8:.15);line(c,0,-14,0,12,'#8e9b85',1.5);line(c,-4,-19,-4,-13,'#bdd0ac',1.3);line(c,0,-20,0,-13,'#bdd0ac',1.3);line(c,4,-19,4,-13,'#bdd0ac',1.3);line(c,-4,-13,4,-13,'#bdd0ac',1.3);c.restore();
  } else if(e.kind==='gunner'||e.kind==='agent') {
    c.save();c.translate(8,attack?-7:0);c.rotate(attack?-1.05:-.2);rect(c,-3,-2,15,4,e.kind==='agent'?'#7fa8a4':'#7c6c54',1,INK,1);rect(c,6,-2,7,2,e.kind==='agent'?'#a9efc1':'#bfbea1',1);c.restore();
  }
  c.restore();
  if(stunned) {
    for(let i=0;i<3;i++){const a=time*3+i*TAU/3;star(c,e.x+Math.cos(a)*10,e.y-h*.7+Math.sin(a)*3,2.5,'#ffe3a3');}
  }
  if(fleeing&&Math.sin(time*5+(e.id||0))>-.2)label(c,'!',e.x,e.y-h*.5-10,'#f2cf9b',14);
}

function star(c,x,y,r,color) { poly(c,[[x,y-r],[x+r*.3,y-r*.3],[x+r,y],[x+r*.3,y+r*.3],[x,y+r],[x-r*.3,y+r*.3],[x-r,y],[x-r*.3,y-r*.3]],color); }

function cow(c,e,time) {
  const s=(e.w||38)/38,flip=e.direction||((e.vx||0)<0?-1:1),walk=Math.sin(time*8+(e.id||0))*(Math.abs(e.vx||0)>2?2:0);
  c.save();c.translate(e.x,e.y);c.scale(s*flip,s);
  if(e.physical==='airborne')c.rotate((e.vx||0)*.002);
  for(let i=0;i<4;i++){const x=-12+i*7;line(c,x,4,x+(i%2?walk:-walk),12,'#b8c5af',3);line(c,x+(i%2?walk:-walk),12,x+2+(i%2?walk:-walk),12,'#354951',3);}
  oval(c,-2,-1,17,10,'#dce0c5',INK,1.5);oval(c,-8,-4,6,5,'#43565d');oval(c,5,1,5,6,'#43565d');
  line(c,-18,-3,-23,4,'#d2dabd',2);line(c,-23,4,-22,7,'#40555a',3);
  oval(c,15,-4,8,9,'#dce0c5',INK,1.5);oval(c,18,1,7,4,'#cea094',INK,1);
  poly(c,[[10,-10],[8,-16],[14,-11]],'#ceccae',INK,1);poly(c,[[18,-11],[22,-16],[22,-8]],'#ceccae',INK,1);
  oval(c,13,-6,1.3,1.7,'#223e45');oval(c,20,-6,1.1,1.5,'#223e45');oval(c,17,1,1,1,'#805e60');oval(c,21,1,1,1,'#805e60');
  c.restore();
}

function rock(c,e) {
  const w=e.w||36,h=e.h||29;
  c.save();c.translate(e.x,e.y);if(e.physical==='airborne')c.rotate(finite(e.rotation,(e.vx||0)*.003));
  poly(c,[[-w*.5,h*.3],[-w*.47,-h*.12],[-w*.22,-h*.48],[w*.15,-h*.53],[w*.48,-h*.17],[w*.5,h*.28],[w*.25,h*.48],[-w*.24,h*.48]],'#809e9a',INK,2);
  poly(c,[[-w*.47,-h*.12],[-w*.22,-h*.48],[w*.15,-h*.53],[w*.29,-h*.14],[-w*.12,h*.1]],'#aec2ae');
  poly(c,[[-w*.12,h*.1],[w*.29,-h*.14],[w*.48,-h*.17],[w*.5,h*.28],[w*.25,h*.48]],'#587a7b');
  line(c,-w*.2,-h*.29,w*.02,-h*.33,'#d1d9ba',1.5);line(c,-w*.32,h*.22,-w*.17,h*.3,'#637f7c',1);
  c.restore();
}

function truck(c,e,time) {
  const w=e.w||92,h=e.h||42,s=w/92,flip=(e.vx||0)<0?-1:1;
  c.save();c.translate(e.x,e.y);c.scale(s*flip,s);if(e.physical==='airborne')c.rotate(clamp((e.vx||0)*.002,-.4,.4));
  rect(c,-43,-16,55,30,'#d7a579',3,INK,2);rect(c,-43,-16,55,4,'#f0c99a',2);
  for(let j=0;j<5;j++)line(c,-36+j*10,-10,-36+j*10,10,'#a87a5d',1.4);
  line(c,-42,-2,11,-2,'#ae7f5d',2);rect(c,-42,13,81,5,'#34545b',1,INK,1);
  poly(c,[[12,-9],[17,-20],[33,-20],[42,-5],[45,13],[12,13]],'#80b3a0',INK,2);
  poly(c,[[20,-16],[31,-16],[37,-6],[19,-6]],'#274e60',INK,1.3);poly(c,[[21,-15],[25,-15],[21,-7]],'#a8cfb4');
  rect(c,18,-2,5,2,'#d5ddbb',1);rect(c,42,4,4,5,'#f7d890',1);rect(c,-45,7,3,4,CORAL,1);
  for(const x of [-28,29]){oval(c,x,16,10,10,'#163a45','#8ca59a',1.5);oval(c,x,16,5,5,'#758f87');oval(c,x,16,2,2,'#c9d1b3');}
  if(e.state==='unload'){label(c,'DELIVERY',-15,-24,'#f2c898',7);}
  c.restore();
}

function plane(c,e,time) {
  const s=(e.w||90)/90,flip=(e.vx||0)<0?-1:1;
  c.save();c.translate(e.x,e.y);c.scale(s*flip,s);
  // Retrofuturist crop-duster with two stacked wings and a luminous nose.
  poly(c,[[-43,1],[-34,-11],[-29,-10],[-26,-1],[32,-4],[43,1],[34,7],[-29,8]],'#d99376',INK,2);
  poly(c,[[-9,-5],[-19,-22],[-8,-24],[17,-4]],'#b56e62',INK,1.5);
  poly(c,[[-15,3],[-31,18],[-18,21],[20,6]],'#e6ad86',INK,1.5);
  line(c,-12,-17,-16,16,'#678b87',2);line(c,7,-8,0,12,'#678b87',2);
  oval(c,16,-5,9,5,'#afd4ba',INK,1.5);line(c,42,-13,42,15,'#b5ccbb',2);
  c.globalAlpha=.4;oval(c,43,1,3,18,'#dce5c8');c.globalAlpha=1;oval(c,35,1,5,5,'#ffe1a2');
  for(let i=0;i<3;i++){const d=(time*70+i*13)%50;c.globalAlpha=(1-d/50)*.23;oval(c,-45-d,4,5+d*.2,3,'#b0cec0');}c.restore();
}

function bomb(c,e,time) {
  const s=(e.w||28)/28;
  c.save();c.translate(e.x,e.y);c.scale(s,s);c.rotate(finite(e.rotation,Math.sin(time+(e.id||0))*.12));
  glow(c,0,0,28,'#f9ac7a',.17);oval(c,0,0,11,14,'#517a7c',INK,2);rect(c,-9,-5,18,9,'#dc9f78',2);rect(c,-3,-15,6,4,'#a4c2a6',1);
  poly(c,[[-8,7],[-15,16],[-5,13]],'#b6c8ac',INK,1);poly(c,[[8,7],[15,16],[5,13]],'#b6c8ac',INK,1);
  oval(c,0,-1,4,4,'#ffe5ad');glow(c,0,-1,12,'#ffcf91',.25+.2*Math.sin(time*8));c.restore();
}

function entity(c,e,time) {
  if(!Number.isFinite(e.x)||!Number.isFinite(e.y)||e.dead||e.state==='sheltered'||e.physical==='captured'||e.physical==='dead')return;
  if(e.kind==='cow')cow(c,e,time);
  else if(e.kind==='rock')rock(c,e);
  else if(e.kind==='truck')truck(c,e,time);
  else if(e.kind==='plane')plane(c,e,time);
  else if(e.kind==='bomb')bomb(c,e,time);
  else person(c,e,time);
}

function telegraphs(c,g,time) {
  for(const e of g.entities||[]) {
    if(e.physical!=='grounded'&&e.physical)continue;
    if(e.state!=='aim'&&e.state!=='committed')continue;
    const x=e.x,y=e.y-(e.h||30)*.55,progress=clamp(finite(e.attackProgress,.5),0,1);
    const color=e.kind==='agent'?'#d9a4e6':'#ffc29a';
    c.save();c.globalAlpha=e.state==='committed'?.65:.25;c.setLineDash([4,7]);line(c,x,y,finite(e.aimX,g.ufo.x),finite(e.aimY,g.ufo.y),color,e.state==='committed'?1.5:1);c.setLineDash([]);c.restore();
    oval(c,x,y-11,10,10,'#193f49',color,1.2);c.beginPath();c.arc(x,y-11,12,-Math.PI/2,-Math.PI/2+TAU*progress);c.strokeStyle=color;c.lineWidth=2;c.stroke();
    label(c,e.kind==='agent'?'⌖':'!',x,y-10,color,13);
  }
}

function beam(c,g,time,reduced) {
  const u=g.ufo;if(!u?.beamOn)return;
  const angle=finite(u.beamAngle),startY=u.y+12;
  let len=Math.min(450,(WORLD.ground-startY)/Math.max(.3,Math.cos(angle)));
  // Stop the light at solid scenery using the same centered rectangles as physics.
  const dx=Math.sin(angle),dy=Math.cos(angle);
  for(const b of g.buildings||[]) {
    if(!(b.hp>0))continue;
    let entry=0,exit=len;
    for(const [origin,dir,lo,hi] of [[u.x,dx,b.x-b.w/2,b.x+b.w/2],[startY,dy,b.y-b.h/2,b.y+b.h/2]]) {
      if(Math.abs(dir)<.00001){if(origin<lo||origin>hi){entry=Infinity;break;}continue;}
      let a=(lo-origin)/dir,z=(hi-origin)/dir;if(a>z)[a,z]=[z,a];entry=Math.max(entry,a);exit=Math.min(exit,z);
    }
    if(entry<=exit&&exit>0)len=Math.min(len,Math.max(0,entry));
  }
  if(len<0)return;
  const spread=19+len*.068;
  const full=finite(u.load)>=finite(u.capacity,30),col=full?'#ffcc8c':'#b5ffd0';
  c.save();c.translate(u.x,startY);c.rotate(-angle);
  const grad=c.createLinearGradient(0,0,0,len);grad.addColorStop(0,full?'#ffcf9865':'#b7ffd285');grad.addColorStop(.5,full?'#ffcc8c28':'#93f4bc30');grad.addColorStop(1,full?'#ffd7a312':'#bbffcd10');
  poly(c,[[-14,0],[14,0],[spread,len],[-spread,len]],grad);
  const inner=c.createLinearGradient(0,0,0,len);inner.addColorStop(0,'#d8ffe742');inner.addColorStop(1,'#c7ffdc00');poly(c,[[-4,0],[4,0],[20,len],[-20,len]],inner);
  c.save();c.globalAlpha=.35;line(c,-14,0,-spread,len,col,1);line(c,14,0,spread,len,col,1);c.restore();
  if(!reduced){for(let i=0;i<13;i++){const t=((i/13-time*.22)%1+1)%1;const half=14+t*(spread-14);const x=(rand(i+50)*2-1)*half;c.globalAlpha=.1+.5*(1-t);line(c,x,t*len,x,t*len+4+t*5,col,1.3);}c.globalAlpha=1;}
  oval(c,0,len,spread,7,'#aaffc61b',col,1);oval(c,0,len,spread*.63,4,'#ccffd917');c.restore();
  glow(c,u.x,startY,34,col,.22);
}

export function drawShip(c,x,y,scale=1,time=0) {
  c.save();c.translate(x,y);c.scale(scale,scale);
  // The dome is translucent glass, with the pilot visible behind its reflections.
  glow(c,0,13,44,'#91ffd0',.17);
  c.beginPath();c.ellipse(0,-4,26,28,0,Math.PI,TAU);c.closePath();
  const dome=c.createLinearGradient(-20,-30,20,0);dome.addColorStop(0,'#c0edce');dome.addColorStop(.35,'#6faeac');dome.addColorStop(1,'#356c80');c.fillStyle=dome;c.fill();c.strokeStyle=INK;c.lineWidth=2;c.stroke();
  oval(c,0,-13,10,12,'#a9dba7',INK,1.5);oval(c,-4,-14,3.6,4.8,'#294451');oval(c,4,-14,3.6,4.8,'#294451');line(c,-2,-7,2,-7,'#5f8b76',1);rect(c,-9,-4,18,7,'#5b938e',4);
  c.save();c.globalAlpha=.6;c.beginPath();c.ellipse(-10,-16,7,13,.4,Math.PI*.8,Math.PI*1.7);c.strokeStyle='#edffe6';c.lineWidth=3;c.stroke();c.restore();
  oval(c,0,1,44,12,'#93bcb2',INK,2);
  const top=c.createLinearGradient(0,-8,0,9);top.addColorStop(0,'#e4e9cc');top.addColorStop(.45,'#b9d3bb');top.addColorStop(1,'#629a96');oval(c,0,-1,43,10,top);
  poly(c,[[-44,1],[-33,12],[-16,17],[18,17],[34,11],[44,1]],'#467f83',INK,2);
  c.beginPath();c.ellipse(0,1,44,12,0,0,Math.PI);c.strokeStyle='#c6dec2';c.lineWidth=2;c.stroke();
  oval(c,0,14,16,4,'#1d4c5e','#6ba39c',1.5);oval(c,0,15,9,2.7,'#b8ffcb');
  for(let i=0;i<5;i++) {const x=-30+i*15,y=6+Math.sin((i/4)*Math.PI)*4;oval(c,x,y,3.6,2.2,i===2?'#e6ffd6':'#c9e8ac');}
  for(const x of [-34,34]){oval(c,x,0,4,2,'#609992');line(c,x-3,-1,x+2,-1,'#cee3c7',1);}
  line(c,0,-32,0,-38,'#739b91',1.5);oval(c,0,-39,2.4,2.4,'#e9ad88');
  c.restore();
}

function ship(c,u,time,reduced=false) {
  if(!u)return;
  c.save();c.translate(u.x,u.y);c.rotate(clamp(finite(u.angle,(u.vx||0)*.0005),-.24,.24));
  if(u.invulnerable>0){c.globalAlpha=reduced?.9:.78+.22*Math.sin(time*20);oval(c,0,-2,56,37,null,'#d4ffe4',1.5);glow(c,0,0,70,'#a9f9dd',.12);}
  drawShip(c,0,0,1,time);c.restore();
  if(u.hp>0&&u.hp<=u.maxHp*.3){glow(c,u.x,u.y,64,CORAL,.12);if(reduced||Math.sin(time*5)>.1)label(c,'HULL CRITICAL',u.x,u.y-60,'#ffb69b',10);}
}

function projectiles(c,list,time) {
  for(const p of list||[]) {
    const a=Math.atan2(p.vy||0,p.vx||1);c.save();c.translate(p.x,p.y);c.rotate(a);
    if(p.kind==='plasma'||p.kind==='boss') {
      glow(c,0,0,18,p.kind==='boss'?'#ffd493':'#e5a5f3',.34);const trail=c.createLinearGradient(-24,0,5,0);trail.addColorStop(0,'#c48be400');trail.addColorStop(1,'#db9bea');poly(c,[[-24,-1],[0,-5],[6,0],[0,5],[-24,1]],trail);oval(c,0,0,5,4,'#f6dcff');oval(c,1,-1,2,2,'#fff5ed');
    } else if(p.kind==='arc') {
      c.rotate(time*5);line(c,-11,0,9,0,'#ccb98e',2);line(c,6,-4,11,-4,'#e1d7b0',1.5);line(c,6,4,11,4,'#e1d7b0',1.5);line(c,6,-4,6,4,'#e1d7b0',1.5);line(c,6,0,12,0,'#e1d7b0',1.5);
    } else {line(c,-10,0,2,0,'#f0b77e99',2);line(c,-3,0,3,0,'#fff1bd',3);}
    c.restore();
  }
}

function drawBoss(c,b,time) {
  if(!b||b.hp<=0)return;
  const x=b.x,y=b.y,w=b.w||190,h=b.h||340,groundY=y+h/2;
  const pulse=.65+.35*Math.sin(time*5),vulnerable=!!b.vulnerable;
  c.save();c.translate(x,groundY);
  oval(c,0,5,w*.7,12,'#0c243455');
  // Broad feet and offset pistons anchor a multi-part machine in the world.
  for(const side of [-1,1]) {
    rect(c,side*49-20,-105,40,86,'#547476',8,INK,4);rect(c,side*49-11,-97,22,55,'#253f50',4);
    line(c,side*49-7,-92,side*49-7,-50,'#9db3a1',4);line(c,side*49+7,-92,side*49+7,-50,'#9db3a1',4);
    oval(c,side*49,-105,27,24,'#748f83',INK,3);oval(c,side*49,-105,12,12,'#d5b27c',INK,2);
    rect(c,side*50-36,-28,72,28,'#69877f',5,INK,3);rect(c,side*50-32,-11,64,7,'#314e58',2);
    for(let j=0;j<4;j++)rect(c,side*50-25+j*16,-26,7,9,'#a2b39b',1);
  }
  poly(c,[[-64,-121],[-79,-245],[-53,-278],[53,-278],[79,-245],[64,-121]],'#63867f',INK,4);
  poly(c,[[-64,-121],[-64,-220],[-43,-243],[-43,-136]],'#94a798');poly(c,[[64,-121],[64,-220],[43,-243],[43,-136]],'#385d66');
  rect(c,-44,-159,88,32,'#304f5c',4,INK,3);for(let i=0;i<6;i++)rect(c,-35+i*13,-151,7,16,'#78948a',1);
  const coreY=(finite(b.coreY,y-55)-groundY);
  glow(c,0,coreY,82,vulnerable?'#d6ffbb':'#fc937b',vulnerable?.23*pulse:.12);
  oval(c,0,coreY,46,46,'#294d5a',INK,3);oval(c,0,coreY,35,35,vulnerable?'#c5efb1':'#6c6264','#9cb9a3',3);
  if(vulnerable) {
    oval(c,0,coreY,22,22,'#ecffd0');oval(c,0,coreY,10,10,'#ffffff');
    for(let j=0;j<8;j++){const a=j*TAU/8+time*.4;line(c,Math.cos(a)*39,coreY+Math.sin(a)*39,Math.cos(a)*45,coreY+Math.sin(a)*45,'#d5ffba',3);}
    label(c,'CORE EXPOSED',0,-h-34,'#dcffc5',11);
  } else {
    for(let j=-1;j<=1;j++)rect(c,-29,coreY+j*13-4,58,8,'#375665',2);oval(c,0,coreY,8,8,'#f4a281');
  }
  // Oversized shoulder joints, articulated arms, and rocket-fist warning lamps.
  for(const side of [-1,1]) {
    const raised=b.state==='telegraph'||b.state==='charge'||b.state==='volley'||b.state==='attack';
    const lift=raised?18+Math.sin(time*3)*3:0;
    oval(c,side*88,-235,31,30,'#8ca294',INK,4);oval(c,side*88,-235,18,18,'#3e6570',INK,2);oval(c,side*88,-235,7,7,'#c3cbb0');
    const ex=side*115,ey=-168-lift;
    line(c,side*96,-213,ex,ey,'#233f4c',24);line(c,side*96,-213,ex,ey,'#a0b1a0',11);
    oval(c,ex,ey,21,22,'#597b7b',INK,3);rect(c,ex-25,ey+12,50,49,'#7b9487',8,INK,3);
    rect(c,ex-19,ey+23,38,10,raised?'#f9b293':'#bcaa83',2);for(let j=0;j<3;j++)line(c,ex-10+j*10,ey+39,ex-10+j*10,ey+56,'#3e5d62',2);
    if(raised)glow(c,ex,ey+29,29,CORAL,.2*pulse);
  }
  rect(c,-29,-289,58,15,'#2b4c58',3,INK,3);
  const headY=-h+20;
  rect(c,-47,headY,94,58,'#8fa896',12,INK,4);rect(c,-39,headY+14,78,20,'#294652',5,INK,2);
  const eyeColor=b.phase>=3?'#ff9a7f':'#e8c78b';rect(c,-31,headY+21,23,6,eyeColor,2);rect(c,8,headY+21,23,6,eyeColor,2);
  rect(c,-22,headY+44,44,5,'#45666b',1);line(c,-35,headY+3,-43,headY-17,'#94b5a4',2);oval(c,-44,headY-19,3,3,CORAL);
  if(b.flash>0){c.globalAlpha=.32;oval(c,0,coreY,57,57,'#fff8dd');c.globalAlpha=1;}
  const barY=-h-20;rect(c,-75,barY,150,5,'#1e3948',3);rect(c,-75,barY,150*clamp(b.hp/b.maxHp,0,1),5,vulnerable?'#ceefad':'#eaa385',3);
  c.restore();
  if((b.state==='telegraph'||b.state==='charge')&&Number.isFinite(b.telegraphX)) {
    c.save();c.globalAlpha=.5;rect(c,b.telegraphX-38,WORLD.ground-5,76,5,CORAL,2);c.setLineDash([7,8]);line(c,b.telegraphX,80,b.telegraphX,WORLD.ground,CORAL,1);c.restore();
  }
}

function warnings(c,g,w,cam,time) {
  const d=g.director||{};
  if(!(d.warning>0))return;
  const y=finite(d.warningY,230),left=d.warningSide==='left'||d.warningSide===-1;
  const x=left?38:w-38;
  c.save();
  c.globalAlpha=.15+.08*Math.sin(time*9);rect(c,0,y-25,w,50,'#f7ba8c');c.setLineDash([12,10]);line(c,0,y,w,y,'#ffc18c',1);c.setLineDash([]);c.globalAlpha=1;
  rect(c,x-23,y-24,46,48,'#24404d',9,'#edac87',1.5);
  poly(c,left?[[x-6,y-9],[x+7,y],[x-6,y+9]]:[[x+6,y-9],[x-7,y],[x+6,y+9]],'#ffce9d');
  const labelX=left?x+37:x-37;
  label(c,'AIRCRAFT INBOUND',labelX,y-10,'#ffcc9f',10,left?'left':'right');label(c,'CLEAR FLIGHT PATH',labelX,y+7,'#e2bd9d',8,left?'left':'right');
  c.restore();
}

function effects(c,g,time) {
  for(const p of g.particles||[]) {
    const alpha=clamp(finite(p.life,1)/finite(p.maxLife,1),0,1),size=finite(p.size,3);
    c.save();c.globalAlpha=alpha;
    if(size>7)glow(c,p.x,p.y,size*2,p.color||MINT,.25);
    if(size>3)rect(c,p.x-size*.5,p.y-size*.5,size,size,p.color||MINT,size*.25);
    else oval(c,p.x,p.y,size,size,p.color||MINT);
    c.restore();
  }
  for(const t of g.texts||[]) {
    c.save();c.globalAlpha=clamp(finite(t.life,1)*1.5,0,1);c.shadowColor='#17333e';c.shadowBlur=6;label(c,t.text,t.x,t.y,t.color||MINT,t.big?18:11);c.restore();
  }
}

function targetMarks(c,g,time) {
  if(!g.ufo?.beamOn)return;
  for(const e of g.entities||[]) {
    if(e.physical!=='lifted')continue;
    const w=(e.w||20)+8,h=(e.h||30)+8,clr=e.collectible===false?'#f4d5a2':'#cbffd0';
    c.save();c.globalAlpha=.5+.15*Math.sin(time*5+(e.id||0));
    for(const sx of [-1,1])for(const sy of [-1,1]){const x=e.x+sx*w/2,y=e.y+sy*h/2;line(c,x,y,x-sx*5,y,clr,1);line(c,x,y,x,y-sy*5,clr,1);}
    c.restore();
  }
}

export function render(c,game,opts={}) {
  if(!c)return;
  const g=game||{},w=finite(opts.width,1280),h=finite(opts.height,720),time=finite(opts.time,g.time||0),cam=finite(g.camera?.x,finite(g.camera)),theme=g.mission?.theme||'farm';
  c.save();c.lineCap='round';c.lineJoin='round';
  const ambientTime=opts.reducedMotion?0:time;
  sky(c,w,h,cam,ambientTime,theme,opts.menu);
  ground(c,w,cam,theme,time);
  c.save();c.translate(-cam,0);
  for(const b of g.buildings||[]) if(Number.isFinite(b.x)&&Number.isFinite(b.y))drawBarn(c,b,theme,time);
  const entities=g.entities||[];
  for(const e of entities)shadow(c,e);
  if(g.ufo)beam(c,g,time,opts.reducedMotion);
  telegraphs(c,g,time);
  // Layer ground objects behind airborne cargo, with stable ordering for clarity.
  for(const e of entities)if(e.physical!=='lifted'&&e.physical!=='airborne')entity(c,e,time);
  drawBoss(c,g.boss,ambientTime);
  for(const e of entities)if(e.physical==='lifted'||e.physical==='airborne')entity(c,e,time);
  projectiles(c,g.projectiles,time);
  targetMarks(c,g,ambientTime);
  ship(c,g.ufo,time,opts.reducedMotion);
  effects(c,g,time);
  c.restore();
  warnings(c,g,w,cam,ambientTime);
  // Cinematic corner shading stays very light to retain tactical visibility.
  const vignette=c.createRadialGradient(w*.5,h*.45,w*.25,w*.5,h*.45,w*.72);vignette.addColorStop(0,'#0b243200');vignette.addColorStop(1,'#071b3438');c.fillStyle=vignette;c.fillRect(0,0,w,h);
  if(opts.menu){const shade=c.createLinearGradient(0,0,w,0);shade.addColorStop(0,'#112e4070');shade.addColorStop(.6,'#112e4000');c.fillStyle=shade;c.fillRect(0,0,w,h);}
  c.restore();
}
