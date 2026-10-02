import * as THREE from 'three';
import {loadCharacter} from './character.js?v=20261003-walkdance';
import {createRoom} from './room.js';
import {GentleAudio} from './audio.js';
import {DANCES} from './animation.js?v=20261003-walkdance';
import {createMovement} from './movement.js?v=20261003-walkdance';

const $=id=>document.getElementById(id),clamp=THREE.MathUtils.clamp;
const canvas=$('room'),audio=new GentleAudio(),clock=new THREE.Clock();
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const STORE='gpchan-little-pause-v1';
const catalog=[
  {id:'wave',title:'처음 만난 오후',hint:'손을 흔들며 인사하기',note:'반가운 마음은 손끝에.',symbol:'✋'},
  {id:'pet',title:'다정한 손길',hint:'머리를 살살 쓰다듬기',note:'조금만 더, 이대로.',symbol:'♡'},
  {id:'snack',title:'달콤한 한 입',hint:'쿠키를 건네주기',note:'너와 나누면 더 달아.',symbol:'🍪'},
  {id:'heart',title:'너에게 보내는 하트',hint:'함께 하트 포즈 하기',note:'오늘의 마음을 담아서.',symbol:'♥'},
];
let album={};
try{const saved=JSON.parse(localStorage.getItem(STORE)||'{}');for(const item of catalog){if(saved[item.id]&&typeof saved[item.id].date==='string')album[item.id]=saved[item.id];}}catch{}
let renderer,scene,camera,room,character,ready=false,width=innerWidth,height=innerHeight;
let elapsed=0,lastParticle=0,lineUntil=0,toastUntil=0,pet=0,petButtonUntil=0,poseUntil=0,pose='idle',mood='day',photo=false;
let pendingMemory=null,snackFlight=null,active=null,suppressSnackClick=false,interactionSerial=0;
let lastAction='idle',actionUntil=0,lastInteraction=0,loadFailure=false;
const gaze={x:0,y:0},gazeTarget={x:0,y:0},pointer={x:width/2,y:height/2};
const view={preset:'close',yaw:0,pitch:.025,distance:2.9,targetY:2.18,targetX:-.19};
const desired={...view};
const counters={wave:0,pet:0,snack:0,heart:0,peace:0,photos:0};
let danceReturn=null,lastDanceStatus='idle',faceForward=false;
const follow=new THREE.Vector3();
const defaultLine='왔구나!\n오늘은 여기서 같이 쉬자.';

function toast(text){$('toast').textContent=text;$('toast').classList.add('on');toastUntil=elapsed+3.5;}
function say(text,seconds=6){$('line').textContent=text;lineUntil=elapsed+seconds;}
function caption(text){$('caption').textContent=text;}
function heartAt(x,y,amount=3){
  if(reduceMotion&&amount>1)amount=1;
  for(let i=0;i<amount;i++){
    const node=document.createElement('span');node.className='heart-particle';node.textContent=i%3===0?'♡':'♥';
    node.style.left=`${x+(Math.random()-.5)*45}px`;node.style.top=`${y+(Math.random()-.5)*20}px`;
    node.style.fontSize=`${16+Math.random()*10}px`;node.style.setProperty('--dx',`${(Math.random()-.5)*100}px`);node.style.setProperty('--spin',`${(Math.random()-.5)*35}deg`);
    $('fx').append(node);node.addEventListener('animationend',()=>node.remove(),{once:true});
  }
}
function project(v){const p=v.clone().project(camera);return {x:(p.x*.5+.5)*width,y:(-.5*p.y+.5)*height};}
function anchors(){if(!character||!camera)return null;const points=character.getAnchors(),result={};for(const name in points)result[name]=project(points[name]);const h=points.head.clone();h.x+=.22;result.headRadius=Math.abs(project(h).x-result.head.x);return result;}
function headHit(x,y){const a=anchors();if(!a)return false;const rx=Math.max(35,a.headRadius*1.28),ry=rx*1.18;return ((x-a.head.x)/rx)**2+((y-(a.head.y-ry*.37))/ry)**2<1;}
function bodyHit(x,y){const a=anchors();if(!a)return false;return Math.abs(x-a.chest.x)<a.headRadius*2.1&&y>a.head.y-a.headRadius*1.9&&y<height-140;}
function mouthHit(x,y){const a=anchors();return a&&Math.hypot(x-a.mouth.x,y-a.mouth.y)<Math.max(40,a.headRadius*.95);}
function petHeart(){const a=anchors();if(a)heartAt(a.head.x+a.headRadius*.85,a.head.y-a.headRadius*.8,3);}
function stopPointer(){const old=active;active=null;if(old&&canvas.hasPointerCapture(old.id))canvas.releasePointerCapture(old.id);if(old&&$('snack').hasPointerCapture(old.id))$('snack').releasePointerCapture(old.id);if(old?.type==='pet'){petButtonUntil=0;caption('조금 가까워지는, 작은 순간들.');}active=null;canvas.classList.remove('petting');$('mouth-target').classList.remove('on','near');if(!snackFlight)$('snack-ghost').classList.remove('on');}
function cancelTransient({keepMovement=false,keepDance=false}={}){if(!keepMovement)movement.clear();if(!keepDance){character?.animation.stop();if(danceReturn&&!keepMovement)restoreDanceView();else danceReturn=null;}interactionSerial++;snackFlight=null;$('snack-ghost').classList.remove('on');stopPointer();petButtonUntil=0;pet=0;pose='idle';poseUntil=0;actionUntil=elapsed;character?.cancelReaction?.();updatePoseButtons();}
function begin(kind){cancelTransient();faceForward=true;lastAction=kind;lastInteraction=elapsed;counters[kind]++;audio.play(kind==='snack'?'snack':'click');return interactionSerial;}
function updatePoseButtons(){for(const kind of ['heart','peace'])document.querySelector(`[data-action="${kind}"]`).setAttribute('aria-pressed',String(pose===kind));}
function remember(kind,delay=.85){if(album[kind]||pendingMemory?.kind===kind)return;pendingMemory={kind,at:elapsed+delay,serial:interactionSerial};}
function characterThumb(){
  const output=document.createElement('canvas');output.width=320;output.height=368;const ctx=output.getContext('2d');
  const a=anchors(),cx=a?.head.x??width*.55,centerY=(a?.head.y??height*.35)+(a?.headRadius??65)*.45;
  const sw=Math.min(width,(a?.headRadius??65)*5.2),sh=sw*368/320,sx=clamp(cx-sw/2,0,width-sw),sy=clamp(centerY-sh*.39,0,height-sh);
  ctx.drawImage(canvas,sx*canvas.width/width,sy*canvas.height/height,sw*canvas.width/width,sh*canvas.height/height,0,0,320,368);
  return output.toDataURL('image/jpeg',.8);
}
function saveMemory(kind){
  if(album[kind])return;
  album[kind]={date:new Date().toISOString(),image:characterThumb()};
  try{localStorage.setItem(STORE,JSON.stringify(album));}catch{for(const item of Object.values(album))delete item.image;try{localStorage.setItem(STORE,JSON.stringify(album));}catch{toast('추억은 지금 이 방에만 보관할게.');}}
  renderCards();audio.play('memory');const item=catalog.find(x=>x.id===kind);toast(`새 추억 · ${item.title}`);
}
function renderCards(){
  $('memory-count').textContent=`${Object.keys(album).length}/4`;
  $('cards').replaceChildren(...catalog.map(item=>{
    const card=document.createElement('button'),saved=album[item.id];card.className=`card ${saved?'':'locked'}`;card.disabled=!saved;
    card.setAttribute('aria-label',saved?`${item.title} 다시 보기`:`${item.title}. ${item.hint}`);
    if(saved?.image?.startsWith('data:image/jpeg;base64,')){const img=new Image();img.src=saved.image;img.alt=item.title;card.append(img);}else{const art=document.createElement('span');art.className='card-art';art.textContent=saved?item.symbol:'✳';card.append(art);}
    const title=document.createElement('b');title.textContent=saved?item.title:'아직 만나지 않은 순간';const note=document.createElement('small');note.textContent=saved?`${item.note} ↗`:item.hint;card.append(title,note);
    card.addEventListener('click',()=>{$('album').close();perform(item.id);});return card;
  }));
}
function perform(kind){
  if(!ready)return;
  if(kind==='snack'){flySnack();return;}
  if((kind==='heart'||kind==='peace')&&pose===kind){cancelTransient();say('편하게 있어도 좋지?',4);caption('조금 가까워지는, 작은 순간들.');return;}
  begin(kind);
  if(kind==='wave'){
    actionUntil=elapsed+(character.react('wave')||3.2);say('안녕!\n네가 와서 더 좋은 오후야.');caption('반가운 마음은 손끝에.');remember('wave',1.1);
  }else if(kind==='pet'){
    petButtonUntil=elapsed+2.8;actionUntil=petButtonUntil;say('헤헤… 따뜻해.\n조금만 더 쓰다듬어 줄래?');caption('살살, 다정한 손길.');remember('pet',.7);petHeart();
  }else if(kind==='heart'||kind==='peace'){
    pose=kind;poseUntil=Infinity;actionUntil=poseUntil;updatePoseButtons();
    say(kind==='heart'?'이건 너한테 주는 하트!\n잘 간직해 줘.':'하나, 둘… 브이!\n우리 지금 좀 귀엽지?');caption('이 순간, 사진으로 남겨도 좋아.');
    if(kind==='heart')remember('heart',1.4);const a=anchors();if(a)heartAt(a.chest.x,a.chest.y,5);
  }
}
function startPet(e){
  begin('pet');active={type:'pet',id:e.pointerId,lastX:e.clientX,lastY:e.clientY,travel:0,earned:false};canvas.setPointerCapture(e.pointerId);canvas.classList.add('petting');
  caption('머리 위로 손을 살살 움직여 봐.');
}
function earnPet(){if(!active||active.earned)return;active.earned=true;actionUntil=elapsed+2;remember('pet',.25);say('헤헤… 기분 좋아.\n네 손은 참 다정하네.');audio.play('happy');}
function eatSnack(){
  actionUntil=elapsed+(character.react('snack')||3.2);say('냠… 맛있다!\n달콤한 건 같이 먹어야지.');caption('작은 쿠키에 담긴 마음.');remember('snack',.65);audio.play('snack');const a=anchors();if(a)heartAt(a.mouth.x+30,a.mouth.y,4);
}
function flySnack(){
  if(!ready)return;const serial=begin('snack'),r=$('snack').getBoundingClientRect();
  snackFlight={x:r.x+r.width/2,y:r.y+20,start:elapsed,duration:.8,serial};$('snack-ghost').classList.add('on');caption('달콤한 한 입, 지피짱에게.');
}
function fullFraming(){const top=width<621?180:height<570?65:85,bottom=height<570?125:185,usable=Math.max(170,height-top-bottom),span=3.7*height/usable;return {distance:Math.max(span/(2*Math.tan(Math.PI/12)),3.0/(2*Math.tan(Math.PI/12)*width/height)),targetY:1.7+span*((top+usable/2)/height-.5)};}
function setView(preset,notify=true){
  stopPointer();document.body.classList.toggle('view-full',preset==='full');desired.preset=preset;view.preset=preset;desired.yaw=0;desired.pitch=preset==='close'?.025:.02;const mobile=width<621;
  const full=fullFraming();desired.distance=preset==='close'?(mobile?3.25:2.9):full.distance;desired.targetY=preset==='close'?(mobile?2.3:2.18):full.targetY;desired.targetX=preset==='close'?(mobile?0:-.19):0;
  $('close-view').setAttribute('aria-pressed',String(preset==='close'));$('full-view').setAttribute('aria-pressed',String(preset==='full'));if(notify)audio.play('click');
}
function togglePhoto(){movement.clear(true);photo=!photo;document.body.classList.toggle('photo-mode',photo);$('photo-ui').classList.toggle('hidden',!photo);if(photo){$('album').close();stopPointer();$('capture').focus();}else $('photo').focus();}
function downloadPhoto(){
  if(!ready)return;
  const output=document.createElement('canvas');output.width=canvas.width;output.height=canvas.height;const ctx=output.getContext('2d');ctx.drawImage(canvas,0,0);
  const scale=output.width/width;ctx.fillStyle=mood==='night'?'#e4e8efe0':'#617668e0';ctx.font=`${Math.round(13*scale)}px sans-serif`;ctx.fillText('지피짱의 쉬는 시간',27*scale,output.height-29*scale);ctx.font=`${Math.round(8*scale)}px sans-serif`;ctx.fillText(new Date().toLocaleDateString('ko-KR'),27*scale,output.height-15*scale);
  output.toBlob(blob=>{if(!blob){toast('사진 저장을 다시 눌러 줘.');return;}const url=URL.createObjectURL(blob),link=document.createElement('a');link.download=`gpchan_moment_${new Date().toISOString().replace(/[:.]/g,'-')}.png`;link.href=url;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);counters.photos++;audio.play('happy');toast('사진을 저장했어. 오늘을 기억해 줘.');},'image/png');
}

const movement=createMovement($('joystick'),$('stick-knob'),{canMove:()=>ready&&!photo&&!$('album').open,onStart:()=>{cancelTransient({keepMovement:true});faceForward=false;setView('full',false);lastAction='walk';lastInteraction=elapsed;caption('손을 놓으면 멈춰. 빈 곳을 끌면 시점이 바뀌어.');},onRelease:()=>{}});
function restoreDanceView(){if(!danceReturn)return;const saved=danceReturn;danceReturn=null;setView(saved.preset,false);desired.yaw=saved.yaw;desired.pitch=saved.pitch;for(const preset of ['close','full'])$(`${preset}-view`).setAttribute('aria-pressed',String(view.preset===preset));}
async function playDance(){if(!ready)return;const prior=danceReturn||{...desired};cancelTransient();danceReturn=prior;setView('full',false);faceForward=true;lastAction='dance';lastInteraction=elapsed;const id=$('dance-select').value;say('같이 춤출까?\n끝나면 다시 여기서 쉬자.',5);caption('걸어가거나 다른 반응을 누르면 춤을 멈춰.');await character.animation.start(id);}
function resetRoom(){cancelTransient();movement.clear(true);character.root.position.set(0,0,0);faceForward=true;setView('close');say('응, 다시 제자리야.',3);}
$('dance-play').addEventListener('click',playDance);
$('dance-stop').addEventListener('click',()=>{character?.animation.stop();});
function updateDanceUI(){const state=character?.animation.snapshot();if(!state)return;const item=DANCES.find(d=>d.id===state.id),busy=['loading','playing'].includes(state.status);$('dance-stop').disabled=!busy;$('dance-play').disabled=state.status==='loading';$('dance-play').textContent=state.status==='error'?'↻':'▶';$('dance-play').setAttribute('aria-label',state.status==='error'?'춤 불러오기 다시 시도':'선택한 춤 재생');$('dance-progress').style.width=`${state.duration?100*state.time/state.duration:0}%`;
 const label=state.status==='loading'?'안무를 불러오는 중…':state.status==='error'?'불러오지 못했어요. ↻로 다시 시도':state.status==='playing'?`${item?.name} · ${Math.floor(state.time)} / ${Math.ceil(state.duration)}초${state.cancelling?' · 마무리':''}`:'세 가지 안무 · 음악 없이';if($('dance-status').textContent!==label)$('dance-status').textContent=label;
 if(state.status==='idle'&&['playing','loading'].includes(lastDanceStatus)){restoreDanceView();caption('조금 가까워지는, 작은 순간들.');}lastDanceStatus=state.status;document.body.classList.toggle('full-activity',busy||movement.snapshot().speed>.02);}

canvas.addEventListener('pointerdown',e=>{
  if(!ready||e.button!==0||active)return;e.preventDefault();pointer.x=e.clientX;pointer.y=e.clientY;
  if(headHit(e.clientX,e.clientY)&&movement.snapshot().stick.id===null){startPet(e);return;}
  if(bodyHit(e.clientX,e.clientY)&&movement.snapshot().stick.id===null){say('머리를 쓰다듬어 줘.\n살살 해 주면 좋아.',3);return;}
  active={type:'orbit',id:e.pointerId,lastX:e.clientX,lastY:e.clientY};canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove',e=>{
  pointer.x=e.clientX;pointer.y=e.clientY;gazeTarget.x=clamp((e.clientX/width-.5)*2,-1,1);gazeTarget.y=clamp((.5-e.clientY/height)*2,-1,1);
  canvas.classList.toggle('pettable',headHit(e.clientX,e.clientY));
  if(!active||active.id!==e.pointerId)return;
  if(active.type==='pet'){
    const delta=Math.hypot(e.clientX-active.lastX,e.clientY-active.lastY);
    if(headHit(e.clientX,e.clientY)){active.travel+=delta;petButtonUntil=elapsed+.18;if(active.travel>22)earnPet();if(elapsed-lastParticle>.27&&delta>1.5){petHeart();lastParticle=elapsed;}}
    active.lastX=e.clientX;active.lastY=e.clientY;
  }else if(active.type==='orbit'){
    desired.yaw=clamp(desired.yaw-(e.clientX-active.lastX)*.005,-.72,.72);desired.pitch=clamp(desired.pitch+(e.clientY-active.lastY)*.0025,-.1,.23);active.lastX=e.clientX;active.lastY=e.clientY;
  }
});
for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,e=>{if(active?.id===e.pointerId)stopPointer();});
canvas.addEventListener('pointerleave',()=>{if(!active){gazeTarget.x=0;gazeTarget.y=0;}});
canvas.addEventListener('wheel',e=>{if(!ready)return;e.preventDefault();desired.distance=clamp(desired.distance*Math.exp(clamp(e.deltaY,-120,120)*.0015),view.preset==='close'?2.6:5.5,view.preset==='close'?4.2:18);},{passive:false});
$('snack').addEventListener('pointerdown',e=>{
  if(!ready||e.button!==0)return;cancelTransient();active={type:'snack',id:e.pointerId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,moved:false};$('snack').setPointerCapture(e.pointerId);
});
$('snack').addEventListener('pointermove',e=>{
  if(active?.type!=='snack'||active.id!==e.pointerId)return;
  active.x=e.clientX;active.y=e.clientY;active.moved||=Math.hypot(e.clientX-active.startX,e.clientY-active.startY)>8;
  if(active.moved){$('snack-ghost').classList.add('on');$('snack-ghost').style.left=`${e.clientX}px`;$('snack-ghost').style.top=`${e.clientY}px`;$('mouth-target').classList.add('on');$('mouth-target').classList.toggle('near',mouthHit(e.clientX,e.clientY));caption('입 가까이 가져다 놓아 줘.');}
});
$('snack').addEventListener('pointerup',e=>{
  if(active?.type!=='snack'||active.id!==e.pointerId)return;const moved=active.moved,hit=mouthHit(e.clientX,e.clientY);stopPointer();
  if(moved){suppressSnackClick=true;setTimeout(()=>suppressSnackClick=false,0);if(hit){begin('snack');eatSnack();}else{caption('조금 가까워지는, 작은 순간들.');say('입 가까이 가져다 줘.\n간식 버튼을 눌러도 돼!',4);}}
});
for(const name of ['pointercancel','lostpointercapture'])$('snack').addEventListener(name,e=>{if(active?.id===e.pointerId)stopPointer();});
for(const button of document.querySelectorAll('[data-action]'))button.addEventListener('click',()=>{if(button.dataset.action==='snack'&&suppressSnackClick)return;perform(button.dataset.action);});
$('close-view').addEventListener('click',()=>setView('close'));
$('full-view').addEventListener('click',()=>setView('full'));
$('reset').addEventListener('click',resetRoom);
$('mood').addEventListener('click',()=>{
  mood=mood==='day'?'night':'day';document.body.classList.toggle('night',mood==='night');room?.setMood(mood);$('mood-icon').textContent=mood==='day'?'☀':'☾';$('mood').setAttribute('aria-label',mood==='day'?'밤으로 바꾸기':'낮으로 바꾸기');$('time-note').textContent=mood==='day'?'햇살이 머무는 오후':'별빛이 내려앉은 밤';say(mood==='day'?'햇살이 참 포근하다.\n잠깐만 더 같이 있자.':'밤에는 조금 조용히…\n그래도 네가 있어서 좋아.');audio.play();
});
$('sound').addEventListener('click',async()=>{try{const on=await audio.toggle();$('sound').setAttribute('aria-pressed',String(on));$('sound').setAttribute('aria-label',on?'소리 끄기':'소리 켜기');$('sound').title=on?'소리 끄기':'소리 켜기';toast(on?'작은 소리를 켰어.':'소리를 껐어.');}catch{toast('이 브라우저에서는 소리를 켤 수 없어.');}});
$('memories').addEventListener('click',()=>{movement.clear(true);stopPointer();$('album').showModal();audio.play();});
$('album-close').addEventListener('click',()=>$('album').close());
$('album').addEventListener('click',e=>{if(e.target===$('album')){const r=$('album').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('album').close();}});
$('photo').addEventListener('click',togglePhoto);$('photo-exit').addEventListener('click',togglePhoto);$('capture').addEventListener('click',downloadPhoto);$('retry').addEventListener('click',()=>location.reload());
document.addEventListener('keydown',e=>{
  if(!ready||e.repeat||e.altKey||e.ctrlKey||e.metaKey)return;
  if($('album').open)return;
  if(e.key==='Escape'){if(photo)togglePhoto();else{cancelTransient();say('편안하게, 잠깐 쉬어 가자.',4);}return;}
  if(e.key.toLowerCase()==='p'){togglePhoto();e.preventDefault();return;}
  if(photo&&e.key===' '){downloadPhoto();e.preventDefault();return;}
  if(e.key==='0'){resetRoom();return;}
  const kind=({'1':'wave','2':'pet','3':'snack','4':'heart','5':'peace'})[e.key];if(kind&&!photo){perform(kind);e.preventDefault();}
});
addEventListener('blur',()=>{stopPointer();petButtonUntil=0;gazeTarget.x=0;gazeTarget.y=0;});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopPointer();petButtonUntil=0;}});
function resize(){movement.clear(true);width=innerWidth;height=innerHeight;if(!renderer)return;renderer.setSize(width,height,false);renderer.setPixelRatio(Math.min(devicePixelRatio,2));camera.aspect=width/height;camera.updateProjectionMatrix();const preset=view.preset;setView(preset,false);view.distance=desired.distance;view.targetY=desired.targetY;view.targetX=desired.targetX;}
addEventListener('resize',resize);
function fail(error){loadFailure=true;$('loading').classList.add('hidden');$('error').classList.remove('hidden');$('error-text').textContent=`${error?.message||'그래픽을 준비하지 못했어요.'} 새로고침해 다시 시도해 주세요.`;console.error(error);}
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();fail(new Error('그래픽 연결이 잠시 끊겼어요.'));});

function frame(){
  requestAnimationFrame(frame);if(!renderer||loadFailure)return;
  const dt=Math.min(clock.getDelta(),.05);elapsed+=dt;
  const smoothing=1-Math.exp(-dt*7);for(const key of ['yaw','pitch','distance','targetY','targetX'])view[key]+=(desired[key]-view[key])*smoothing;
  let walkSpeed=0;if(character){walkSpeed=movement.update(dt,character.root,view.yaw);if(faceForward&&walkSpeed<.02){const angle=character.root.rotation.y;character.root.rotation.y+=Math.atan2(Math.sin(-angle),Math.cos(-angle))*(1-Math.exp(-dt*6));}follow.lerp(character.root.position,1-Math.exp(-dt*9));}
  const target=new THREE.Vector3(follow.x+view.targetX,view.targetY,follow.z);camera.position.set(target.x+Math.sin(view.yaw)*Math.cos(view.pitch)*view.distance,target.y+Math.sin(view.pitch)*view.distance,target.z+Math.cos(view.yaw)*Math.cos(view.pitch)*view.distance);camera.lookAt(target);
  gaze.x+=(gazeTarget.x-gaze.x)*(1-Math.exp(-dt*5));gaze.y+=(gazeTarget.y-gaze.y)*(1-Math.exp(-dt*5));
  const heldPet=active?.type==='pet'&&active.earned&&headHit(pointer.x,pointer.y);
  pet+=(Number(elapsed<petButtonUntil||heldPet)-pet)*(1-Math.exp(-dt*8));
  if(pose!=='idle'&&!photo&&elapsed>poseUntil){pose='idle';updatePoseButtons();caption('조금 가까워지는, 작은 순간들.');}
  if(character){character.update(dt,elapsed,{gaze,pet,pose,walkSpeed});updateDanceUI();character.root.updateMatrixWorld(true);}
  room?.update(dt,elapsed);
  const a=anchors();
  if(a){
    $('mouth-target').style.left=`${a.mouth.x}px`;$('mouth-target').style.top=`${a.mouth.y}px`;
    if(pet>.4&&elapsed-lastParticle>.6){heartAt(a.head.x+a.headRadius*.9,a.head.y-a.headRadius*.8,1);lastParticle=elapsed;}
    if(snackFlight){const f=snackFlight,k=clamp((elapsed-f.start)/f.duration,0,1),smooth=k*k*(3-2*k);$('snack-ghost').style.left=`${THREE.MathUtils.lerp(f.x,a.mouth.x,smooth)}px`;$('snack-ghost').style.top=`${THREE.MathUtils.lerp(f.y,a.mouth.y,smooth)-Math.sin(k*Math.PI)*35}px`;if(k===1){snackFlight=null;$('snack-ghost').classList.remove('on');eatSnack();}}
  }
  renderer.render(scene,camera);
  if(pendingMemory&&elapsed>pendingMemory.at){const pending=pendingMemory;pendingMemory=null;if(pending.serial===interactionSerial)saveMemory(pending.kind);}
  if(lineUntil&&elapsed>lineUntil){lineUntil=0;$('line').textContent=mood==='night'?'이 조용한 시간이 좋아.\n너도 편하게 있어.':'오늘 하루는 어땠어?\n여기서는 조금 쉬어도 돼.';caption('조금 가까워지는, 작은 순간들.');}
  if(toastUntil&&elapsed>toastUntil){toastUntil=0;$('toast').classList.remove('on');}
  if(ready&&elapsed>10)$('pet-hint').style.opacity=elapsed-lastInteraction<10?'0':'.75';
}

window.__gpchanRoom={get ready(){return ready;},snapshot(){return {ready,time:elapsed,mood,photo,pose,pet,movement:movement.snapshot(),position:character?.root.position.toArray(),heading:character?.root.rotation.y,follow:follow.toArray(),dance:character?.animation.snapshot(),landmarks:character?.getLandmarks().map(v=>project(v)),active:active?.type??null,lastAction,actionActive:elapsed<actionUntil,counters:{...counters},memories:Object.keys(album),camera:{...view},desiredCamera:{...desired},gaze:{...gaze},anchors:anchors(),sound:audio.enabled,snackFlying:!!snackFlight,particles:$('fx').children.length,render:renderer?{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures}:null};}};

async function init(){
  renderCards();
  try{
    renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});renderer.setClearColor(0xf1efe5);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    scene=new THREE.Scene();scene.background=new THREE.Color(0xf1efe5);camera=new THREE.PerspectiveCamera(30,width/height,.05,80);room=createRoom();scene.add(room.root);resize();frame();
    character=await loadCharacter(progress=>{const amount=Math.round(clamp(progress,0,1)*95);$('load-progress').style.width=`${amount}%`;$('load-percent').textContent=`${amount}%`;$('load-text').textContent=amount>75?'머리핀을 정리하는 중이에요.':'지피짱이 곧 올 거예요.';});scene.add(character.root);character.update(.016,elapsed,{gaze,pet:0,pose:'idle'});renderer.render(scene,camera);
    ready=true;$('load-progress').style.width='100%';$('load-percent').textContent='100%';$('loading').style.opacity='0';setTimeout(()=>$('loading').classList.add('hidden'),700);say(defaultLine,14);
  }catch(error){fail(error);}
}
init();
