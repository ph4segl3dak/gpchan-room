import * as THREE from 'three';
const KEY={KeyW:[0,-1],ArrowUp:[0,-1],KeyS:[0,1],ArrowDown:[0,1],KeyA:[-1,0],ArrowLeft:[-1,0],KeyD:[1,0],ArrowRight:[1,0]};
const BOUNDS={minX:-2.65,maxX:2.65,minZ:-.78,maxZ:1.55};
const OBSTACLES=[{x:-2.2,z:-1.14,r:1.04},{x:2.03,z:-1.1,r:1.02},{x:2.91,z:-1.6,r:.7}];
export function createMovement(element,knob,{canMove,onStart,onRelease}){
  const keys=new Set(),stick={id:null,x:0,y:0},velocity=new THREE.Vector2();
  let engaged=false,travel=0,lastSpeed=0;
  const input=()=>{let x=stick.x,y=stick.y;for(const key of keys){x+=KEY[key][0];y+=KEY[key][1];}const length=Math.hypot(x,y);return {x:length>1?x/length:x,y:length>1?y/length:y,length:Math.min(1,length)};};
  function begin(){if(!engaged&&input().length>.05){engaged=true;onStart();}}
  function releaseStick(){const id=stick.id;stick.id=null;stick.x=stick.y=0;knob.style.transform='translate(0px,0px)';element.classList.remove('engaged');if(id!==null&&element.hasPointerCapture(id))element.releasePointerCapture(id);}
  function clear(immediate=false){keys.clear();releaseStick();engaged=false;if(immediate){velocity.set(0,0);lastSpeed=0;}onRelease?.();}
  function pointer(e){const r=element.getBoundingClientRect(),radius=r.width*.32,x=e.clientX-(r.left+r.width/2),y=e.clientY-(r.top+r.height/2),length=Math.hypot(x,y),scale=length>radius?radius/length:1;const raw=Math.min(length/radius,1),power=raw<.12?0:(raw-.12)/.88;stick.x=length?x/length*power:0;stick.y=length?y/length*power:0;knob.style.transform=`translate(${x*scale}px,${y*scale}px)`;begin();}
  element.addEventListener('pointerdown',e=>{if(!canMove()||stick.id!==null||e.button!==0)return;e.preventDefault();stick.id=e.pointerId;element.setPointerCapture(e.pointerId);element.classList.add('engaged');pointer(e);});
  element.addEventListener('pointermove',e=>{if(e.pointerId!==stick.id)return;e.preventDefault();pointer(e);});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])element.addEventListener(name,e=>{if(stick.id===e.pointerId)releaseStick();});
  addEventListener('keydown',e=>{if(!KEY[e.code]||e.altKey||e.ctrlKey||e.metaKey||!canMove()||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;e.preventDefault();keys.add(e.code);begin();});
  addEventListener('keyup',e=>{if(KEY[e.code]){keys.delete(e.code);e.preventDefault();}});
  addEventListener('blur',()=>clear(true));document.addEventListener('visibilitychange',()=>{if(document.hidden)clear(true);});
  function update(dt,root,yaw){
    const i=canMove()?input():{x:0,y:0,length:0};if(i.length>.05)begin();else engaged=false;
    const speed=1.25,cos=Math.cos(yaw),sin=Math.sin(yaw),tx=(i.x*cos+i.y*sin)*speed,tz=(-i.x*sin+i.y*cos)*speed,rate=i.length>0?8:13;
    velocity.x=THREE.MathUtils.damp(velocity.x,tx,rate,dt);velocity.y=THREE.MathUtils.damp(velocity.y,tz,rate,dt);if(i.length===0&&velocity.length()<.012)velocity.set(0,0);
    const old=root.position.clone(),next=old.clone();next.x=THREE.MathUtils.clamp(next.x+velocity.x*dt,BOUNDS.minX,BOUNDS.maxX);next.z=THREE.MathUtils.clamp(next.z+velocity.y*dt,BOUNDS.minZ,BOUNDS.maxZ);
    for(const obstacle of OBSTACLES){const x=next.x-obstacle.x,z=next.z-obstacle.z,d=Math.hypot(x,z);if(d<obstacle.r){next.x=obstacle.x+x/Math.max(d,.001)*obstacle.r;next.z=obstacle.z+z/Math.max(d,.001)*obstacle.r;}}
    root.position.copy(next);lastSpeed=next.distanceTo(old)/Math.max(dt,.001);travel+=next.distanceTo(old);
    if(velocity.length()>.035){const angle=Math.atan2(velocity.x,velocity.y),delta=Math.atan2(Math.sin(angle-root.rotation.y),Math.cos(angle-root.rotation.y));root.rotation.y+=delta*(1-Math.exp(-dt*9));}
    return lastSpeed;
  }
  return {update,clear,snapshot(){return {keys:[...keys],stick:{...stick},velocity:velocity.toArray(),speed:lastSpeed,travel,bounds:BOUNDS,obstacles:OBSTACLES};}};
}
