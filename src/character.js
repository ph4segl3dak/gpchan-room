import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import {createAnimationLayer} from './animation.js?v=20261003-walkdance';

const clamp = THREE.MathUtils.clamp;
const smooth = value => { const x = clamp(value, 0, 1); return x * x * (3 - 2 * x); };
const envelope = (time, duration, attack = .42, release = .55) =>
  smooth(time / attack) * smooth((duration - time) / release);
const DURATIONS = Object.freeze({ wave: 3.2, snack: 4.4, happy: 2.5, surprise: 1.9 });
const BODY_NAMES = ['hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
  'leftShoulder', 'rightShoulder', 'leftUpperArm', 'rightUpperArm',
  'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand',
  'leftUpperLeg','rightUpperLeg','leftLowerLeg','rightLowerLeg','leftFoot','rightFoot','leftToes','rightToes'];
const FINGERS = ['Index', 'Middle', 'Ring', 'Little'];
const SIDES = ['left', 'right'];

/** Procedural companion motions; the imported VRM and its proportions are immutable. */
export async function loadCharacter(onProgress = () => {}) {
  const loader = new GLTFLoader();
  loader.register(parser => new VRMLoaderPlugin(parser));
  const gltf = await loader.loadAsync('./assets/jibbi_chan_bunny_vroid_v026a_stocking_neutral.vrm',
    event => onProgress(event.total ? event.loaded / event.total : .5));
  const vrm = gltf.userData.vrm;
  if (!vrm) throw new Error('지피짱의 VRM 데이터를 불러오지 못했어요.');
  VRMUtils.rotateVRM0(vrm);
  const root = new THREE.Group();
  root.name = 'gpchan-companion';
  root.add(vrm.scene);
  vrm.scene.traverse(object => {
    if (object.isMesh) { object.castShadow = true; object.frustumCulled = false; }
  });

  const bones = {}, targets = {};
  const names = [...BODY_NAMES];
  for (const side of SIDES) {
    for (const finger of FINGERS) {
      for (const joint of ['Proximal', 'Intermediate', 'Distal']) names.push(`${side}${finger}${joint}`);
    }
    for (const joint of ['Metacarpal', 'Proximal', 'Distal']) names.push(`${side}Thumb${joint}`);
  }
  for (const name of names) {
    const node = vrm.humanoid.getNormalizedBoneNode(name);
    if (node) { bones[name] = node; targets[name] = new THREE.Quaternion(); }
  }
  const q = new THREE.Quaternion(), euler = new THREE.Euler();
  const pose = (name, x = 0, y = 0, z = 0) => {
    if (targets[name]) targets[name].setFromEuler(euler.set(x, y, z));
  };
  const blend = (name, x, y, z, amount) => {
    if (targets[name]) targets[name].slerp(q.setFromEuler(euler.set(x, y, z)), clamp(amount, 0, 1));
  };

  // Measure once in the neutral skeleton. The ear tips, shoes and all skinned
  // vertices are included. No reaction changes root/camera scale or position.
  vrm.update(0);
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(vrm.scene);
  const height = 2.8;
  const scale = height / (bounds.max.y - bounds.min.y);
  vrm.scene.scale.setScalar(scale);
  vrm.scene.position.y = -bounds.min.y * scale;
  root.updateMatrixWorld(true);

  // The normalized skeleton has identity rest rotations. Solve from its actual
  // segment axes, not from the differently rotated VRoid source bones.
  const arms = SIDES.map((side, index) => {
    const upper = bones[`${side}UpperArm`], lower = bones[`${side}LowerArm`], hand = bones[`${side}Hand`];
    if (!upper || !lower || !hand) return null;
    const origin = new THREE.Vector3(), elbow = new THREE.Vector3(), wrist = new THREE.Vector3();
    upper.getWorldPosition(origin); lower.getWorldPosition(elbow); hand.getWorldPosition(wrist);
    return { side, sign: index === 0 ? 1 : -1, upper, lower, hand,
      a: origin.distanceTo(elbow), b: elbow.distanceTo(wrist),
      axisA: lower.position.clone().normalize(), axisB: hand.position.clone().normalize(),
      target: new THREE.Vector3(), pole: new THREE.Vector3(), fingers: new THREE.Vector3(),
      palm: new THREE.Vector3(), curls: [0, 0, 0, 0], thumb: .12, spread: 0,
    };
  }).filter(Boolean);
  const rawBone = name => vrm.humanoid.getRawBoneNode(name);
  const headRaw = rawBone('head'), chestRaw = rawBone('upperChest') || rawBone('chest');
  const headRest = new THREE.Vector3();
  bones.head?.getWorldPosition(headRest);
  const headReference = root.worldToLocal(headRest.clone());
  const gazeTarget = new THREE.Object3D();
  gazeTarget.name = 'companion-eye-target';
  root.add(gazeTarget);
  if (vrm.lookAt) { vrm.lookAt.target = gazeTarget; vrm.lookAt.autoUpdate = true; }

  const origin = new THREE.Vector3(), direction = new THREE.Vector3(), pole = new THREE.Vector3();
  const elbow = new THREE.Vector3(), axis = new THREE.Vector3();
  const handTarget = new THREE.Vector3(), poleTarget = new THREE.Vector3();
  const parentRotation = new THREE.Quaternion(), worldUpper = new THREE.Quaternion();
  const worldLower = new THREE.Quaternion(), worldHand = new THREE.Quaternion();
  const xAxis = new THREE.Vector3(), yAxis = new THREE.Vector3(), zAxis = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const rootRotation = new THREE.Quaternion();

  const handoverTarget = new THREE.Quaternion();
  let transition = null;
  function applyTarget(name, amount, maxStep = Infinity) {
    const bone = bones[name];
    if (!bone) return;
    let target = targets[name];
    if (transition) {
      target = handoverTarget.copy(transition.pose[name]).slerp(target, smooth(transition.elapsed / .32));
    }
    bone.quaternion.rotateTowards(target, Math.min(bone.quaternion.angleTo(target) * amount, maxStep));
  }

  function solveArm(arm, amount, maxStep) {
    arm.upper.getWorldPosition(origin);
    handTarget.copy(arm.target); root.localToWorld(handTarget);
    poleTarget.copy(arm.pole); root.localToWorld(poleTarget);
    direction.copy(handTarget).sub(origin);
    const distance = clamp(direction.length(), Math.abs(arm.a - arm.b) + .035, (arm.a + arm.b) * .985);
    direction.normalize();
    pole.copy(poleTarget).sub(origin).addScaledVector(direction, -poleTarget.clone().sub(origin).dot(direction));
    if (pole.lengthSq() < 1e-6) pole.set(arm.sign, -.5, .5).addScaledVector(direction, -direction.x * arm.sign);
    pole.normalize();
    const along = (arm.a * arm.a - arm.b * arm.b + distance * distance) / (2 * distance);
    const away = Math.sqrt(Math.max(0, arm.a * arm.a - along * along));
    elbow.copy(origin).addScaledVector(direction, along).addScaledVector(pole, away);
    axis.copy(elbow).sub(origin).normalize();
    worldUpper.setFromUnitVectors(arm.axisA, axis);
    arm.upper.parent.getWorldQuaternion(parentRotation).invert();
    targets[`${arm.side}UpperArm`].copy(parentRotation).multiply(worldUpper);
    applyTarget(`${arm.side}UpperArm`, amount, maxStep);
    arm.upper.updateWorldMatrix(false, true);
    // Use the intended elbow to calculate a coherent target chain; the same
    // damping on its three joints makes interrupted actions continuous.
    axis.copy(origin).addScaledVector(direction, distance).sub(elbow).normalize();
    worldLower.setFromUnitVectors(arm.axisB, axis);
    targets[`${arm.side}LowerArm`].copy(worldUpper).invert().multiply(worldLower);
    applyTarget(`${arm.side}LowerArm`, amount, maxStep);
    arm.lower.updateWorldMatrix(false, true);
    // T-pose fingers point +/-X and palms point -Y. An explicit palm basis keeps
    // a raised wrist facing the viewer instead of twisting through the forearm.
    xAxis.copy(arm.fingers).normalize().multiplyScalar(arm.sign);
    yAxis.copy(arm.palm).negate().addScaledVector(xAxis, arm.palm.dot(xAxis)).normalize();
    zAxis.crossVectors(xAxis, yAxis).normalize();
    yAxis.crossVectors(zAxis, xAxis).normalize();
    worldHand.setFromRotationMatrix(basis.makeBasis(xAxis, yAxis, zAxis));
    root.getWorldQuaternion(rootRotation); worldHand.premultiply(rootRotation);
    targets[`${arm.side}Hand`].copy(worldLower).invert().multiply(worldHand);
    applyTarget(`${arm.side}Hand`, amount, maxStep);
  }

  function placeArm(arm, hand, elbowHint, fingerDirection, palmDirection, weight) {
    handTarget.set(...hand).add(headReference);
    poleTarget.set(...elbowHint).add(headReference);
    arm.target.lerp(handTarget, weight);
    arm.pole.lerp(poleTarget, weight);
    arm.fingers.lerp(axis.set(...fingerDirection), weight);
    arm.palm.lerp(axis.set(...palmDirection), weight);
  }
  function fingers(arm, curls, thumb, spread, weight = 1) {
    arm.curls = arm.curls.map((curl, i) => THREE.MathUtils.lerp(curl, curls[i], weight));
    arm.thumb = THREE.MathUtils.lerp(arm.thumb, thumb, weight);
    arm.spread = THREE.MathUtils.lerp(arm.spread, spread, weight);
  }
  function writeFingers(arm) {
    for (let i = 0; i < FINGERS.length; i++) {
      const curl = arm.curls[i], s = arm.sign;
      // Curl toward the palm. Index/middle divergence makes a real V silhouette.
      pose(`${arm.side}${FINGERS[i]}Proximal`, 0, (i - 1.2) * arm.spread * s, -s * curl);
      pose(`${arm.side}${FINGERS[i]}Intermediate`, 0, 0, -s * curl * .92);
      pose(`${arm.side}${FINGERS[i]}Distal`, 0, 0, -s * curl * .62);
    }
    // Thumb rest axes point diagonally toward +Z; opposition therefore uses
    // mirrored Y rotation, unlike the four fingers' palmward Z flexion.
    pose(`${arm.side}ThumbMetacarpal`, -.12 * arm.thumb, arm.sign * 1.1 * arm.thumb, -arm.sign * .3 * arm.thumb);
    pose(`${arm.side}ThumbProximal`, 0, arm.sign * .25 * arm.thumb, -arm.sign * .55 * arm.thumb);
    pose(`${arm.side}ThumbDistal`, 0, 0, -arm.sign * .5 * arm.thumb);
  }

  let reaction = null, petWeight = 0, gazeX = 0, gazeY = 0, posePeace = 0, poseHeart = 0;
  const expressions = { happy: .12, relaxed: .07, surprised: 0, aa: 0, oh: 0, blink: 0 };
  let clock = 0, blinkStart = 2.7, blinkNumber = 0;

  function react(kind) {
    if (!Object.hasOwn(DURATIONS, kind)) return 0;
    // Start from the visible pose, including a partly completed earlier action.
    // Without this short handover a wave→snack interruption first yanks the arm
    // toward rest while the new action's anticipation is still ramping up.
    transition = { elapsed: 0,
      pose: Object.fromEntries(Object.entries(bones).map(([name, bone]) => [name, bone.quaternion.clone()])),
    };
    reaction = { kind, elapsed: 0, duration: DURATIONS[kind] };
    return reaction.duration;
  }

  function cancelReaction() {
    if (!reaction) return;
    transition = { elapsed: 0,
      pose: Object.fromEntries(Object.entries(bones).map(([name, bone]) => [name, bone.quaternion.clone()])),
    };
    reaction = null;
  }

  const animation = await createAnimationLayer(vrm,bones);

  function update(dt, t, state = {}) {
    animation.restore();
    dt = clamp(Number.isFinite(dt) ? dt : 0, 0, .05);
    clock += dt;
    if (transition) {
      transition.elapsed += dt;
      if (transition.elapsed >= .32) transition = null;
    }
    t = Number.isFinite(t) ? t : clock;
    const rate = 1 - Math.exp(-dt * 8.5);
    const gestureRate = 1 - Math.exp(-dt * 11);
    const pet = clamp(Number.isFinite(state.pet) ? state.pet : 0, 0, 1);
    petWeight = THREE.MathUtils.damp(petWeight, pet, 5.8, dt);
    gazeX = THREE.MathUtils.damp(gazeX, clamp(Number(state.gaze?.x) || 0, -1, 1), 4.5, dt);
    gazeY = THREE.MathUtils.damp(gazeY, clamp(Number(state.gaze?.y) || 0, -1, 1), 4.5, dt);
    posePeace = THREE.MathUtils.damp(posePeace, state.pose === 'peace' ? 1 : 0, 6, dt);
    poseHeart = THREE.MathUtils.damp(poseHeart, state.pose === 'heart' ? 1 : 0, 6, dt);
    let wave = 0, snack = 0, joy = 0, surprise = 0, rt = 0;
    if (reaction) {
      reaction.elapsed += dt; rt = reaction.elapsed;
      const w = envelope(rt, reaction.duration);
      if (reaction.kind === 'wave') wave = w;
      if (reaction.kind === 'snack') snack = w;
      if (reaction.kind === 'happy') joy = w;
      if (reaction.kind === 'surprise') surprise = w;
      if (rt >= reaction.duration) reaction = null;
    }
    const breath = Math.sin(t * 1.7), sway = Math.sin(t * .63);
    const active = Math.max(wave, snack, joy, surprise);
    const peace = posePeace * (1 - active), heart = poseHeart * (1 - active);
    for (const name of names) if (targets[name]) targets[name].identity();
    pose('spine', -.012 + breath * .006 + petWeight * .018, sway * .018, sway * .018);
    pose('chest', -.01 + breath * .008, -sway * .01, -sway * .009);
    pose('upperChest', breath * .005, 0, -petWeight * .018);
    pose('neck', -.012 - gazeY * .035 + petWeight * .05, gazeX * .06, -petWeight * .045);
    pose('head', -.02 - gazeY * .09 + petWeight * .075, gazeX * .12,
      .016 * Math.sin(t * .47) - petWeight * .13 - peace * .075 + heart * .055);
    blend('head', -.035, gazeX * .08, -.07, wave * .6);
    blend('head', .055 + Math.sin(rt * 5.5) * .018, -.045, -.045, snack);
    blend('head', -.025 + Math.sin(rt * 6.2) * .045, 0, .055 * Math.sin(rt * 3.4), joy);
    blend('head', -.1, 0, .055, surprise);
    blend('chest', -.045, 0, .02 * Math.sin(rt * 4), joy);
    blend('chest', -.035, 0, 0, surprise);
    pose('leftShoulder', 0, -.015, .018 + petWeight * .025 + joy * .03);
    pose('rightShoulder', 0, .015, -.018 - petWeight * .025 - joy * .03);
    for (const name of ['hips', 'spine', 'chest', 'upperChest', 'neck', 'head', 'leftShoulder', 'rightShoulder']) {
      applyTarget(name, rate, dt * 3);
    }
    root.updateMatrixWorld(true);

    for (const arm of arms) {
      const s = arm.sign;
      arm.target.set(s * .31, -.815 + breath * .004, .06).add(headReference);
      arm.pole.set(s * .33, -.45, .12).add(headReference);
      arm.fingers.set(s * .08, -1, .035); arm.palm.set(-s, 0, .12);
      arm.curls = [.14, .18, .23, .27]; arm.thumb = .16; arm.spread = .015;
      placeArm(arm, [s * .31, -.78, .13], [s * .35, -.43, .16], [s * .05, -1, .03], [-s, 0, .15], petWeight * .5);
      // V pose: right hand beside the cheek; the other hand stays relaxed.
      if (arm.side === 'right') {
        placeArm(arm, [-.37, .035, .18], [-.56, -.31, .08], [-.12, 1, 0], [0, 0, 1], peace);
        fingers(arm, [.035, .035, 1.12, 1.18], .9, .24, peace);
      } else {
        placeArm(arm, [.28, -.74, .16], [.37, -.39, .13], [-.2, -1, .1], [-.8, 0, .4], peace * .65);
      }
      // Two small cupped hands form a heart beneath the collar, clear of the face.
      placeArm(arm, [s * .105, -.285, .31], [s * .40, -.43, .12], [-s * .77, .64, 0], [0, 0, 1], heart);
      fingers(arm, [.38, .63, .8, .92], .22, .02, heart);
      if (arm.side === 'right') {
        const wag = Math.sin(Math.max(0, rt - .45) * 8.4) * .16;
        placeArm(arm, [-.40 + wag * .07, .055, .18], [-.56, -.25, .06], [wag, 1, 0], [0, 0, 1], wave);
        fingers(arm, [.035, .025, .045, .08], .02, .07, wave);
        const taste = smooth((rt - .55) / .5) * (1 - smooth((rt - 2.55) / .7));
        placeArm(arm, [-.23 + taste * .08, -.37 + taste * .21, .25], [-.48, -.40, .10], [.68, .75, -.08], [.15, -.05, -1], snack);
        fingers(arm, [.48, .58, .67, .75], .5, .03, snack);
      } else {
        placeArm(arm, [.27, -.72, .18], [.38, -.42, .12], [-.15, -.98, .1], [-.8, 0, .4], snack * .7);
      }
      placeArm(arm, [s * .25, -.28, .25], [s * .46, -.42, .04], [s * .13, 1, 0], [0, 0, 1], joy);
      fingers(arm, [.8, .88, .93, 1], .7, .025, joy);
      placeArm(arm, [s * .30, -.18, .22], [s * .46, -.39, .03], [s * .25, 1, 0], [0, 0, 1], surprise);
      fingers(arm, [.04, .03, .05, .08], .02, .10, surprise);
      solveArm(arm, gestureRate, dt * 6);
      writeFingers(arm);
    }
    for (const name of names) {
      if (!BODY_NAMES.includes(name)) applyTarget(name, gestureRate, dt * 9);
    }

    if (clock > blinkStart + .22) {
      blinkNumber++;
      blinkStart = clock + 2.4 + (Math.sin(blinkNumber * 2.399) + 1) * 1.3;
    }
    const blinkPhase = (clock - blinkStart) / .22;
    const blink = blinkPhase > 0 && blinkPhase < 1 ? Math.sin(blinkPhase * Math.PI) ** 2 : 0;
    const chew = snack * smooth((rt - 1.1) / .35) * (1 - smooth((rt - 3.1) / .45));
    const facial = {
      happy: clamp(.14 + petWeight * .40 + wave * .30 + joy * .62 + peace * .28 + heart * .34 + snack * .40, 0, .88),
      relaxed: clamp(.055 + petWeight * .42 + heart * .025, 0, .55),
      surprised: surprise * .70,
      aa: chew * (.035 + .075 * (Math.sin(rt * 12) * .5 + .5)),
      oh: surprise * .18,
      blink: Math.max(blink, petWeight * .43),
    };
    for (const [name, value] of Object.entries(facial)) {
      // Blinks need a short, complete closure instead of the slower face easing.
      expressions[name] = name === 'blink' ? value : THREE.MathUtils.damp(expressions[name], value, 9, dt);
      vrm.expressionManager?.setValue(name, expressions[name]);
    }
    for(const name of ['leftUpperLeg','rightUpperLeg','leftLowerLeg','rightLowerLeg','leftFoot','rightFoot','leftToes','rightToes'])applyTarget(name,rate,dt*5);
    animation.apply(dt,state.walkSpeed||0);
    // Eye aim is a world target; the small head turn supplies most of the gesture.
    // Updating the VRM once keeps lookAt and springs from fighting a second pose pass.
    gazeTarget.position.set(gazeX * .9, headReference.y + .10 + gazeY * .65, 3.2);
    root.updateMatrixWorld(true);
    vrm.update(dt);
    root.updateMatrixWorld(true);
  }

  function getAnchors() {
    root.updateMatrixWorld(true);
    const head = headRaw?.getWorldPosition(new THREE.Vector3()) || root.localToWorld(headReference.clone());
    const headRotation = headRaw?.getWorldQuaternion(new THREE.Quaternion()) || new THREE.Quaternion();
    // v026a's head joint is level with the lips, not the base of the jaw.
    const mouth = new THREE.Vector3(0, .002, .066).multiplyScalar(scale).applyQuaternion(headRotation).add(head);
    return {
      head: new THREE.Vector3(0, .075, .035).multiplyScalar(scale).applyQuaternion(headRotation).add(head),
      mouth,
      chest: chestRaw?.getWorldPosition(new THREE.Vector3()) || head.clone().add(new THREE.Vector3(0, -.38, 0)),
      leftHand: rawBone('leftHand')?.getWorldPosition(new THREE.Vector3()) || head.clone(),
      rightHand: rawBone('rightHand')?.getWorldPosition(new THREE.Vector3()) || head.clone(),
    };
  }

  function getLandmarks(){const names=['leftFoot','rightFoot','leftToes','rightToes','leftHand','rightHand','leftIndexDistal','rightIndexDistal','leftMiddleDistal','rightMiddleDistal'];const points=names.map(name=>rawBone(name)?.getWorldPosition(new THREE.Vector3())).filter(Boolean);const top=headRaw.getWorldPosition(new THREE.Vector3());top.y+=.27;points.push(top);return points;}

  // Settle into the authored rest pose before the first visible frame.
  for (let frame = 0; frame < 60; frame++) update(1 / 60, 0, {});
  clock = 0; blinkStart = 2.7;
  onProgress(1);
  return { root, vrm, height, update, react, cancelReaction, getAnchors,getLandmarks,animation };
}
