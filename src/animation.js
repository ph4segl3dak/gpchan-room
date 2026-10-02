import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createVRMAnimationClip,VRMAnimationLoaderPlugin} from '@pixiv/three-vrm-animation';

export const DANCES=[{id:'kpop_omg',name:'OMG',artist:'NewJeans · LORE'},{id:'kpop_after_like',name:'After LIKE',artist:'IVE · LORE'},{id:'kpop_hype_boy',name:'Hype Boy',artist:'NewJeans · JULI'}];
const smooth=x=>{x=THREE.MathUtils.clamp(x,0,1);return x*x*(3-2*x);};

// Keep procedural gestures as a clean base. Full-body samples never accumulate
// into the following frame, and asynchronous loads cannot revive a cancelled dance.
export async function createAnimationLayer(vrm,bones){
  const response=await fetch('./assets/animations/walk.json');
  if(!response.ok)throw new Error('걷기 동작을 불러오지 못했어요.');
  const walk=await response.json(),cache=new Map(),base=new Map();
  const nodes=new Map(Object.entries(bones).map(([bone,node])=>[node.name,{bone,node}]));
  const q=new THREE.Quaternion(),p=new THREE.Vector3();
  let dance=null,generation=0,walkTime=0,walkWeight=0,handover=null;
  function restore(){for(const [node,v]of base){node.quaternion.copy(v.q);node.position.copy(v.p);}base.clear();}
  function save(node){if(!base.has(node))base.set(node,{q:node.quaternion.clone(),p:node.position.clone()});}
  async function start(id){
    if(!DANCES.some(d=>d.id===id))return false;
    if(dance?.status==='playing')handover={elapsed:0,pose:new Map(Object.values(bones).map(node=>[node,{q:node.quaternion.clone(),p:node.position.clone()}]))};
    const ticket=++generation;dance={id,status:'loading',time:0,duration:0,cancelTime:null};
    try{
      let clip=cache.get(id);
      if(!clip){const loader=new GLTFLoader();loader.register(parser=>new VRMAnimationLoaderPlugin(parser));const gltf=await loader.loadAsync(`./assets/animations/${id}.vrma`);const animation=gltf.userData.vrmAnimations?.[0];if(!animation)throw new Error('안무 데이터가 없어요.');clip=createVRMAnimationClip(animation,vrm);cache.set(id,clip);}
      if(ticket!==generation)return false;
      const tracks=clip.tracks.flatMap(track=>{const parsed=THREE.PropertyBinding.parseTrackName(track.name),target=nodes.get(parsed.nodeName);if(!target||!['quaternion','position'].includes(parsed.propertyName))return [];const interpolant=track.createInterpolant();return [{...target,property:parsed.propertyName,interpolant,initial:Array.from(interpolant.evaluate(0)),anchor:(base.get(target.node)?.p||target.node.position).clone()}];});
      if(tracks.length<12)throw new Error('전신 안무를 읽지 못했어요.');
      dance={id,status:'playing',time:0,duration:clip.duration,tracks,cancelTime:null};return true;
    }catch(error){if(ticket===generation)dance={id,status:'error',time:0,duration:0,error:error.message};return false;}
  }
  function stop(immediate=false){generation++;if(!dance)return;if(immediate||dance.status!=='playing'){dance=null;return;}if(dance.cancelTime===null)dance.cancelTime=0;}
  function finishHandover(dt){
    if(!handover)return;handover.elapsed+=dt;const amount=smooth(handover.elapsed/.5);
    for(const [node,v] of handover.pose){save(node);node.quaternion.copy(q.copy(v.q).slerp(node.quaternion,amount));node.position.copy(p.copy(v.p).lerp(node.position,amount));}
    if(amount===1)handover=null;
  }
  function apply(dt,speed){
    walkWeight=THREE.MathUtils.damp(walkWeight,Math.min(speed/.75,1),speed>0?8:10,dt);
    if(speed>.015)walkTime+=dt*Math.max(.35,speed/1.1);
    if(walkWeight>.001){
      const t=walkTime%walk.duration,index=Math.min(walk.frames.length-2,Math.floor(t*walk.fps)),a=walk.frames[index],b=walk.frames[index+1],fraction=THREE.MathUtils.clamp((t-a.time)/(b.time-a.time),0,1);
      for(const [name,v]of Object.entries(a.bones)){const node=bones[name];if(!node||!b.bones[name])continue;save(node);q.fromArray(v).slerp(new THREE.Quaternion().fromArray(b.bones[name]),fraction);node.quaternion.slerp(q,walkWeight);}
    }
    const s=dance;if(!s||s.status!=='playing'){finishHandover(dt);return;}
    if(s.cancelTime!==null)s.cancelTime+=dt;else s.time+=dt;
    if(s.time>=s.duration||(s.cancelTime!==null&&s.cancelTime>=.5)){dance=null;finishHandover(dt);return;}
    const weight=smooth(s.time/1.2)*smooth((s.duration-s.time)/1)*(s.cancelTime===null?1:1-smooth(s.cancelTime/.5));
    for(const track of s.tracks){const node=track.node;save(node);const values=track.interpolant.evaluate(s.time);if(track.property==='quaternion'){q.fromArray(values).normalize();node.quaternion.slerp(q,weight);}else{p.fromArray(values);if(track.bone==='hips')p.sub(new THREE.Vector3(...track.initial)).add(track.anchor);node.position.lerp(p,weight);}}
    finishHandover(dt);
  }
  return {restore,apply,start,stop,snapshot(){return {id:dance?.id??null,status:dance?.status??'idle',time:dance?.time??0,duration:dance?.duration??0,cancelling:dance?.cancelTime!==null&&dance?.cancelTime!==undefined,error:dance?.error??null,walkWeight,walkTime};}};
}
