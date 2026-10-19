// Centered, axis-aligned geometry shared by movement, perception and impacts.
// A small separation keeps resting contacts stable without opening visible gaps.
const SKIN = .001;
export function overlaps(a, b) {
  return Math.abs(a.x-b.x)<(a.w+b.w)/2-SKIN && Math.abs(a.y-b.y)<(a.h+b.h)/2-SKIN;
}

function rayHit(x,y,dx,dy,minX,maxX,minY,maxY,box){
  let enter=-Infinity,exit=Infinity,nx=0,ny=0;
  for(let axis=0;axis<2;axis++){
    const start=axis?y:x,delta=axis?dy:dx,lo=axis?minY:minX,hi=axis?maxY:maxX;
    if(Math.abs(delta)<1e-10){if(start<lo||start>hi)return null;continue;}
    let near=(lo-start)/delta,far=(hi-start)/delta;if(near>far){const temp=near;near=far;far=temp;}
    if(near>enter){enter=near;nx=axis?0:(delta>0?-1:1);ny=axis?(delta>0?-1:1):0;}
    exit=Math.min(exit,far);if(enter>exit)return null;
  }
  if(enter<-.000001||enter>1||exit<0||dx*nx+dy*ny>=0)return null;
  return {time:Math.max(0,enter),nx,ny,box};
}
export function sweepBox(body,dx,dy,box){
  if(overlaps(body,box))return {time:0,nx:0,ny:0,box};
  return rayHit(body.x,body.y,dx,dy,box.x-(box.w+body.w)/2,box.x+(box.w+body.w)/2,
    box.y-(box.h+body.h)/2,box.y+(box.h+body.h)/2,box);
}
export function segmentHit(x1,y1,x2,y2,box,pad=0){
  const halfW=Math.max(.005,box.w/2+pad),halfH=Math.max(.005,box.h/2+pad);
  if(Math.abs(x1-box.x)<=halfW&&Math.abs(y1-box.y)<=halfH)return {time:0,nx:0,ny:0,box};
  return rayHit(x1,y1,x2-x1,y2-y1,box.x-halfW,box.x+halfW,box.y-halfH,box.y+halfH,box);
}

function limitsFor(body, options) {
  const {width=2400,ground=610,allowOutsideX=false,limits={}}=options;
  return {left:allowOutsideX?-Infinity:body.w/2,right:allowOutsideX?Infinity:width-body.w/2,
    top:body.h/2,bottom:ground-body.h/2,...limits};
}

// Spawns and stale contacts may already overlap. Find the nearest free location
// across the union of solid boxes instead of alternating pushes between walls.
function escapePenetration(body, solids, options, bounds) {
  body.x=Math.max(bounds.left,Math.min(bounds.right,body.x));
  body.y=Math.max(bounds.top,Math.min(bounds.bottom,body.y));
  if(!solids.some(b=>b.hp>0&&overlaps(body,b)))return false;
  const originalX=body.x, originalY=body.y, candidates=[];
  for(const b of solids){
    if(b.hp<=0)continue;
    candidates.push({x:b.x-(b.w+body.w)/2-SKIN,y:originalY},{x:b.x+(b.w+body.w)/2+SKIN,y:originalY});
    if(!options.horizontalOnly)candidates.push({x:originalX,y:b.y-(b.h+body.h)/2-SKIN},{x:originalX,y:b.y+(b.h+body.h)/2+SKIN});
  }
  candidates.sort((a,b)=>(a.x-originalX)**2+(a.y-originalY)**2-(b.x-originalX)**2-(b.y-originalY)**2);
  for(const p of candidates){
    if(p.x<bounds.left||p.x>bounds.right||p.y<bounds.top||p.y>bounds.bottom)continue;
    if(solids.some(b=>b.hp>0&&overlaps({x:p.x,y:p.y,w:body.w,h:body.h},b)))continue;
    body.x=p.x;body.y=p.y;return true;
  }
  return false;
}

export function depenetrate(body,solids,options={}){return escapePenetration(body,solids,options,limitsFor(body,options));}

export function moveBody(body, dx, dy, solids, options={}) {
  const bounds=limitsFor(body,options),contacts=[];
  escapePenetration(body,solids,options,bounds);
  for(let iteration=0;iteration<4&&(Math.abs(dx)>1e-9||Math.abs(dy)>1e-9);iteration++){
    let hit=null;
    for(const b of solids){if(b.hp<=0)continue;const candidate=sweepBox(body,dx,dy,b);if(candidate&&(!hit||candidate.time<hit.time))hit=candidate;}
    for(let axis=0;axis<2;axis++){
      const start=axis?body.y:body.x,delta=axis?dy:dx,lo=axis?bounds.top:bounds.left,hi=axis?bounds.bottom:bounds.right;
      if(!delta)continue;const crossing=delta<0?start+delta<lo:start+delta>hi;
      if(!crossing)continue;const time=((delta<0?lo:hi)-start)/delta;
      if(time>=0&&time<=1&&(!hit||time<hit.time))hit={time,nx:axis?0:(delta<0?1:-1),ny:axis?(delta<0?1:-1):0,box:null};
    }
    if(!hit){body.x+=dx;body.y+=dy;break;}
    const separation=hit.box?SKIN:0;
    body.x+=dx*hit.time+hit.nx*separation;body.y+=dy*hit.time+hit.ny*separation;
    contacts.push(hit);dx*=1-hit.time;dy*=1-hit.time;
    if(hit.nx)dx=0;if(hit.ny)dy=0;
  }
  body.x=Math.max(bounds.left,Math.min(bounds.right,body.x));body.y=Math.max(bounds.top,Math.min(bounds.bottom,body.y));
  return contacts;
}

const FLOOR_SUPPORT={id:null,y:610};
export function supportAt(body, solids, ground=610) {
  const feet=body.y+body.h/2;
  if(Math.abs(feet-ground)<.02)return ground===610?FLOOR_SUPPORT:{id:null,y:ground};
  for(const b of solids)if(b.hp>0&&Math.abs(feet-(b.y-b.h/2))<.02&&Math.abs(body.x-b.x)<(body.w+b.w)/2-SKIN)return {id:b.id,y:b.y-b.h/2};
  return null;
}
