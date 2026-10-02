import * as THREE from 'three';

// The room is deliberately quiet in the central portrait region. All upright
// furniture is behind the character and outside her gesture space.
export function createRoom() {
  const root = new THREE.Group();
  root.name = 'gpchan-cozy-room';
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const colorChanges = [];
  const curtains = [];
  const clouds = [];
  const leaves = [];
  let disposed = false;
  let night = 0;
  let targetNight = 0;

  const color = (hex) => new THREE.Color(hex);
  const ownGeometry = (g) => { geometries.add(g); return g; };
  const ownMaterial = (m) => { materials.add(m); return m; };
  function surface(day, dark = day, options = {}) {
    const m = ownMaterial(new THREE.MeshStandardMaterial({
      color: day, roughness: 0.85, metalness: 0,
      emissive: day, emissiveIntensity: 0.25, ...options,
    }));
    colorChanges.push({ m, day: color(day), dark: color(dark),
      lift: options.emissive === undefined, liftLevel: options.emissiveIntensity ?? 0.25 });
    return m;
  }
  function flat(day, dark = day, options = {}) {
    const m = ownMaterial(new THREE.MeshBasicMaterial({ color: day, ...options }));
    colorChanges.push({ m, day: color(day), dark: color(dark) });
    return m;
  }
  function mesh(g, m, x = 0, y = 0, z = 0, parent = root) {
    const object = new THREE.Mesh(ownGeometry(g), m);
    object.position.set(x, y, z);
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function box(w, h, d, m, x, y, z, parent) {
    return mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z, parent);
  }
  function sphere(rx, ry, rz, m, x, y, z, parent) {
    const o = mesh(new THREE.SphereGeometry(1, 28, 18), m, x, y, z, parent);
    o.scale.set(rx, ry, rz);
    return o;
  }
  function cylinder(rt, rb, h, m, x, y, z, parent, segments = 48) {
    return mesh(new THREE.CylinderGeometry(rt, rb, h, segments), m, x, y, z, parent);
  }
  function rod(a, b, radius, m, parent = root) {
    const start = new THREE.Vector3(...a);
    const end = new THREE.Vector3(...b);
    const direction = end.clone().sub(start);
    const o = cylinder(radius, radius, direction.length(), m, 0, 0, 0, parent, 12);
    o.position.copy(start.add(end).multiplyScalar(0.5));
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return o;
  }
  function canvasTexture(w, h, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    draw(canvas.getContext('2d'), w, h);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.add(texture);
    return texture;
  }

  const plaster = surface('#fff3e6', '#8b88a1', { emissiveIntensity: 0.38 });
  const wallInset = surface('#e9dfd4', '#7c7a95');
  const wood = surface('#decaad', '#a99891', { emissiveIntensity: 0.18 });
  const cream = surface('#fff4df', '#c5bfd0', { emissiveIntensity: 0.30 });
  const fabric = surface('#b6d0c3', '#7e9d9f', { side: THREE.DoubleSide });
  const seam = surface('#a9c3b4', '#708997');
  const lavender = surface('#d6c9df', '#a29abc');
  const blush = surface('#dfb8b2', '#b194ad');
  const brass = surface('#b99c6d', '#b9a082', { roughness: 0.48, metalness: 0.3 });
  const ink = surface('#776a66', '#67677f');

  // Broad surfaces keep the full-body camera inside a complete room.
  const floor = mesh(new THREE.PlaneGeometry(28, 28), surface('#e9d7bf', '#928699'), 0, -0.045, 0);
  floor.rotation.x = -Math.PI / 2;
  box(20, 10, 0.18, plaster, 0, 4.95, -2.43);
  box(20, 0.055, 0.055, cream, 0, 0.105, -2.29);
  box(20, 0.12, 0.055, wallInset, 0, 0.02, -2.30);
  const line = flat('#c8b294', '#817789', { transparent: true, opacity: 0.22 });
  for (let x = -9; x <= 9; x += 0.6) {
    const plank = mesh(new THREE.PlaneGeometry(0.008, 24), line, x, -0.043, 0);
    plank.rotation.x = -Math.PI / 2;
  }

  // Flat woven rug, with a stitched border and no collision-height geometry.
  const rug = mesh(new THREE.CircleGeometry(1, 96), surface('#e9dfe7', '#b5a9c8'), 0, -0.032, 0.05);
  rug.rotation.x = -Math.PI / 2;
  rug.scale.set(1.78, 1.20, 1);
  const rugBorder = mesh(new THREE.RingGeometry(0.954, 0.969, 96), flat('#c5b7cc', '#9488a8'), 0, -0.031, 0.05);
  rugBorder.rotation.x = -Math.PI / 2;
  rugBorder.scale.set(1.78, 1.20, 1);
  const contactTexture = canvasTexture(128, 128, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gradient.addColorStop(0, 'rgba(94,74,97,.24)');
    gradient.addColorStop(0.42, 'rgba(94,74,97,.12)');
    gradient.addColorStop(1, 'rgba(94,74,97,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  });
  const contactMat = ownMaterial(new THREE.MeshBasicMaterial({
    map: contactTexture, transparent: true, depthWrite: false, opacity: 0.8,
  }));
  const contact = mesh(new THREE.PlaneGeometry(1.6, 1.02), contactMat, 0, -0.027, 0.02);
  contact.rotation.x = -Math.PI / 2;
  for (const [x, z, width, depth] of [[-2.20, -1.14, 1.30, 1.03], [2.03, -1.10, 1.00, 0.85], [2.91, -1.60, 0.90, 0.75]]) {
    const shadow = mesh(new THREE.PlaneGeometry(width, depth), contactMat, x, -0.038, z);
    shadow.rotation.x = -Math.PI / 2;
  }

  // No central window mullion: the face and dark rabbit ears read against sky.
  const windowX = -0.10;
  const spring = 1.83;
  function archPath(path, radius, bottom) {
    path.moveTo(-radius, bottom);
    path.lineTo(radius, bottom);
    path.lineTo(radius, spring);
    path.absarc(0, spring, radius, 0, Math.PI, false);
    path.lineTo(-radius, bottom);
    path.closePath();
    return path;
  }
  const innerRadius = 1.58;
  const innerBottom = 0.65;
  const arch = archPath(new THREE.Shape(), innerRadius, innerBottom);
  const skyGeometry = new THREE.ShapeGeometry(arch, 64);
  const positions = skyGeometry.attributes.position;
  const uv = skyGeometry.attributes.uv;
  for (let i = 0; i < positions.count; i++) {
    uv.setXY(i, (positions.getX(i) + innerRadius) / (innerRadius * 2),
      (positions.getY(i) - innerBottom) / (spring + innerRadius - innerBottom));
  }
  const skyMaterial = ownMaterial(new THREE.ShaderMaterial({
    uniforms: {
      uNight: { value: 0 },
      uDayTop: { value: color('#c5dce7') },
      uDayBottom: { value: color('#f5e3ce') },
      uNightTop: { value: color('#526384') },
      uNightBottom: { value: color('#a9a3bc') },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `
      varying vec2 vUv;
      uniform float uNight;
      uniform vec3 uDayTop, uDayBottom, uNightTop, uNightBottom;
      void main() {
        float skyY = smoothstep(0.0, 1.0, vUv.y);
        vec3 day = mix(uDayBottom, uDayTop, skyY);
        vec3 dusk = mix(uNightBottom, uNightTop, skyY);
        vec3 c = mix(day, dusk, uNight);
        float glow = exp(-length((vUv-vec2(.25,.65))*vec2(1.7,1.0))*4.0);
        c += vec3(.055,.041,.024)*glow*(1.0-uNight);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    toneMapped: false,
  }));
  mesh(skyGeometry, skyMaterial, windowX, 0, -2.318);
  const frameShape = archPath(new THREE.Shape(), 1.73, 0.50);
  const frameHole = archPath(new THREE.Path(), innerRadius, innerBottom);
  frameShape.holes.push(frameHole);
  mesh(new THREE.ExtrudeGeometry(frameShape, {
    depth: 0.11, steps: 1, bevelEnabled: true, bevelSegments: 3,
    bevelSize: 0.026, bevelThickness: 0.026, curveSegments: 64,
  }), cream, windowX, 0, -2.31);
  box(3.66, 0.105, 0.43, cream, windowX, 0.565, -2.18);
  box(3.48, 0.035, 0.37, wood, windowX, 0.505, -2.20);

  // Small cloud clusters stay within the lower clear window, away from faces.
  const cloudMat = flat('#fff8ee', '#b9b4ca', { transparent: true, opacity: 0.65, depthWrite: false });
  for (const [cx, cy, width, speed] of [[-0.93, 1.65, 0.67, 0.030], [0.91, 1.12, 0.60, -0.023]]) {
    const group = new THREE.Group();
    group.position.set(windowX + cx, cy, -2.285);
    root.add(group);
    const cloudShape = new THREE.Shape();
    cloudShape.moveTo(-width * 0.48, -0.015);
    cloudShape.bezierCurveTo(-width * 0.50, 0.07, -width * 0.32, 0.095, -width * 0.27, 0.072);
    cloudShape.bezierCurveTo(-width * 0.25, 0.21, -width * 0.03, 0.22, width * 0.06, 0.14);
    cloudShape.bezierCurveTo(width * 0.19, 0.22, width * 0.34, 0.16, width * 0.34, 0.074);
    cloudShape.bezierCurveTo(width * 0.57, 0.065, width * 0.55, -0.039, width * 0.40, -0.060);
    cloudShape.bezierCurveTo(width * 0.17, -0.106, -width * 0.39, -0.103, -width * 0.48, -0.015);
    mesh(new THREE.ShapeGeometry(cloudShape, 24), cloudMat, 0, 0, 0, group);
    clouds.push({ group, cx: group.position.x, speed });
  }
  const moonMat = flat('#fff2d7', '#fff1d3', { transparent: true, opacity: 0, depthWrite: false });
  // A crescent silhouette formed directly as a shape, without a dark cutout.
  const moonShape = new THREE.Shape();
  moonShape.moveTo(0.084, 0.143);
  moonShape.bezierCurveTo(-0.21, 0.18, -0.21, -0.18, 0.084, -0.143);
  moonShape.bezierCurveTo(-0.051, -0.095, -0.051, 0.095, 0.084, 0.143);
  mesh(new THREE.ShapeGeometry(moonShape, 32), moonMat, windowX - 0.96, 2.70, -2.265);
  const starPositions = [];
  // Deterministic sky detail; never use frame-random motion.
  let seed = 7421;
  function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
  for (let i = 0; i < 31; i++) {
    const x = (random() * 2 - 1) * 1.43;
    const y = 0.98 + random() * 2.20;
    if (y > spring && x * x + (y - spring) ** 2 > 1.43 ** 2) continue;
    starPositions.push(windowX + x, y, -2.27);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  ownGeometry(starGeometry);
  const starMaterial = ownMaterial(new THREE.PointsMaterial({
    color: '#fff3d8', size: 0.018, transparent: true, opacity: 0, depthWrite: false,
  }));
  const stars = new THREE.Points(starGeometry, starMaterial);
  root.add(stars);

  // Linen curtains with actual pleats and a minute slow sway.
  rod([-2.34, 3.58, -1.98], [2.14, 3.58, -1.98], 0.028, brass);
  sphere(0.064, 0.064, 0.064, brass, -2.36, 3.58, -1.98);
  sphere(0.064, 0.064, 0.064, brass, 2.16, 3.58, -1.98);
  for (const side of [-1, 1]) {
    const geometry = new THREE.PlaneGeometry(0.73, 3.26, 32, 30);
    const p = geometry.attributes.position;
    const original = new Float32Array(p.array.length);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const fromTop = (1.63 - y) / 3.26;
      const gather = Math.sin(fromTop * Math.PI) * 0.12;
      const newX = x * (1 - gather * 1.8) + side * gather;
      const newZ = Math.cos((x + 0.365) * Math.PI * 11.4) * (0.036 + fromTop * 0.022);
      p.setXYZ(i, newX, y + Math.cos(x * 25) * 0.013 * fromTop, newZ);
    }
    geometry.computeVertexNormals();
    original.set(p.array);
    const curtain = mesh(geometry, fabric, windowX + side * 1.94, 1.92, -1.95);
    curtains.push({ curtain, original, side });
    for (let i = 0; i < 7; i++) {
      const ring = mesh(new THREE.TorusGeometry(0.039, 0.008, 8, 16), brass,
        windowX + side * 1.94 - 0.31 + i * 0.105, 3.56, -1.956);
      ring.rotation.y = Math.PI / 2;
    }
    const tie = box(0.57, 0.060, 0.13, seam, windowX + side * 2.055, 1.30, -1.927);
    tie.rotation.z = side * 0.12;
  }

  // Left: a soft ottoman and a tiny hand-sewn bunny cushion.
  const ottoman = new THREE.Group();
  ottoman.position.set(-2.20, 0, -1.14);
  root.add(ottoman);
  cylinder(0.43, 0.39, 0.18, wood, 0, 0.08, 0, ottoman);
  cylinder(0.46, 0.43, 0.36, lavender, 0, 0.35, 0, ottoman);
  sphere(0.47, 0.12, 0.46, lavender, 0, 0.555, 0, ottoman);
  const cushion = new THREE.Group();
  cushion.position.set(0, 0.74, -0.01);
  cushion.rotation.y = 0.13;
  ottoman.add(cushion);
  sphere(0.265, 0.235, 0.14, cream, 0, 0, 0, cushion);
  const leftEar = sphere(0.066, 0.21, 0.059, cream, -0.12, 0.275, -0.015, cushion);
  leftEar.rotation.z = -0.21;
  const rightEar = sphere(0.066, 0.19, 0.059, cream, 0.12, 0.26, -0.015, cushion);
  rightEar.rotation.z = 0.23;
  sphere(0.027, 0.122, 0.012, blush, -0.126, 0.278, 0.039, cushion).rotation.z = -0.21;
  sphere(0.027, 0.108, 0.012, blush, 0.124, 0.264, 0.039, cushion).rotation.z = 0.23;
  sphere(0.013, 0.017, 0.006, ink, -0.085, 0.028, 0.132, cushion);
  sphere(0.013, 0.017, 0.006, ink, 0.085, 0.028, 0.132, cushion);
  sphere(0.038, 0.017, 0.006, blush, -0.14, -0.025, 0.12, cushion);
  sphere(0.038, 0.017, 0.006, blush, 0.14, -0.025, 0.12, cushion);
  sphere(0.015, 0.010, 0.007, blush, 0, -0.015, 0.141, cushion);
  rod([0, -0.020, 0.142], [-0.021, -0.040, 0.142], 0.003, ink, cushion);
  rod([0, -0.020, 0.142], [0.021, -0.040, 0.142], 0.003, ink, cushion);

  // Right: round side table, two books, and a compact leafy plant.
  const table = new THREE.Group();
  table.position.set(2.03, 0, -1.10);
  root.add(table);
  cylinder(0.48, 0.48, 0.085, wood, 0, 0.77, 0, table);
  cylinder(0.055, 0.067, 0.69, cream, 0, 0.38, 0, table, 24);
  cylinder(0.29, 0.31, 0.055, cream, 0, 0.047, 0, table);
  box(0.40, 0.075, 0.24, lavender, -0.12, 0.85, 0.12, table).rotation.y = -0.15;
  box(0.35, 0.048, 0.23, fabric, -0.10, 0.91, 0.12, table).rotation.y = 0.05;
  const pot = surface('#cfa68f', '#ae8e98');
  cylinder(0.153, 0.115, 0.25, pot, 0.12, 0.955, -0.06, table);
  cylinder(0.16, 0.16, 0.030, pot, 0.12, 1.075, -0.06, table);
  cylinder(0.143, 0.143, 0.008, ink, 0.12, 1.084, -0.06, table);
  const leafMat = surface('#82ad93', '#729c9a', { side: THREE.DoubleSide });
  const stemMat = surface('#799983', '#627d81');
  for (let i = 0; i < 7; i++) {
    const angle = i * 2.399;
    const radius = 0.11 + (i % 3) * 0.033;
    const height = 0.26 + (i % 4) * 0.061;
    const end = [0.12 + Math.sin(angle) * radius, 1.084 + height, -0.06 + Math.cos(angle) * radius];
    rod([0.12, 1.084, -0.06], end, 0.009, stemMat, table);
    const leaf = sphere(0.063, 0.124, 0.015, leafMat, ...end, table);
    leaf.rotation.set(-0.35 + Math.cos(angle) * 0.45, angle, Math.sin(angle) * -0.6);
    leaves.push({ leaf, x: leaf.rotation.x, z: leaf.rotation.z, offset: angle });
  }

  // A shaded reading lamp gives the night palette a warm side accent.
  const lampX = 2.91;
  const lampZ = -1.60;
  cylinder(0.24, 0.28, 0.07, brass, lampX, 0.028, lampZ);
  cylinder(0.022, 0.022, 1.85, brass, lampX, 0.98, lampZ, root, 16);
  const lampShade = surface('#f1dfb7', '#eed2ad', {
    side: THREE.DoubleSide, emissive: '#edc68f', emissiveIntensity: 0.02,
  });
  mesh(new THREE.CylinderGeometry(0.27, 0.41, 0.39, 48, 1, true), lampShade, lampX, 1.92, lampZ);
  const rim = mesh(new THREE.TorusGeometry(0.41, 0.012, 8, 48), cream, lampX, 1.725, lampZ);
  rim.rotation.x = Math.PI / 2;
  const lampLight = new THREE.PointLight('#ffd1a0', 0.10, 2.7, 2);
  lampLight.position.set(lampX, 1.76, lampZ + 0.05);
  root.add(lampLight);

  // One small floating shelf with books and a sculptural bud vase.
  box(1.18, 0.07, 0.35, wood, 2.82, 2.66, -2.12);
  const bookColors = [lavender, fabric, blush, cream];
  for (let i = 0; i < 4; i++) {
    const h = [0.32, 0.38, 0.30, 0.35][i];
    const book = box(0.085, h, 0.18, bookColors[i], 2.43 + i * 0.094, 2.71 + h / 2, -2.105);
    if (i === 3) book.rotation.z = -0.13;
    box(0.043, 0.01, 0.008, cream, 2.43 + i * 0.094, 2.78, -2.009);
  }
  sphere(0.12, 0.13, 0.095, cream, 3.07, 2.815, -2.12);
  cylinder(0.039, 0.063, 0.13, cream, 3.07, 2.94, -2.12);
  rod([3.07, 2.98, -2.12], [3.10, 3.20, -2.12], 0.006, stemMat);
  sphere(0.085, 0.083, 0.048, blush, 3.10, 3.21, -2.12);

  // A simple botanical print opposite the shelf, kept far outside portrait crop.
  box(0.62, 0.86, 0.045, wood, -3.06, 2.46, -2.25);
  const artTexture = canvasTexture(256, 360, (ctx, w, h) => {
    ctx.fillStyle = '#f8eddd'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#acb99b'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(123, 284); ctx.quadraticCurveTo(133, 207, 132, 98); ctx.stroke();
    ctx.fillStyle = '#a9b9a1';
    for (const [x, y, angle] of [[115, 235, -0.55], [146, 197, 0.65], [117, 162, -0.6], [145, 125, 0.5]]) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
      ctx.beginPath(); ctx.ellipse(0, 0, 16, 32, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    ctx.fillStyle = '#c7b6ba'; ctx.beginPath(); ctx.arc(132, 91, 19, 0, Math.PI * 2); ctx.fill();
  });
  mesh(new THREE.PlaneGeometry(0.55, 0.79), surface('#ffffff', '#bbb5c7', { map: artTexture }), -3.06, 2.46, -2.221);

  // Soft motes are behind GPChan, avoiding bright particles over her eyes.
  const dustTexture = canvasTexture(32, 32, (ctx) => {
    const glow = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    glow.addColorStop(0, 'rgba(255,255,255,1)');
    glow.addColorStop(0.22, 'rgba(255,255,255,.8)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, 32, 32);
  });
  const dustBase = new Float32Array(26 * 3);
  for (let i = 0; i < 26; i++) {
    dustBase[i * 3] = (random() - 0.5) * 5.8;
    dustBase[i * 3 + 1] = 0.45 + random() * 3.1;
    dustBase[i * 3 + 2] = -1.80 + random() * 0.7;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustBase.slice(), 3));
  ownGeometry(dustGeometry);
  const dustMaterial = ownMaterial(new THREE.PointsMaterial({
    color: '#fff4dc', map: dustTexture, size: 0.039, transparent: true,
    opacity: 0.34, depthWrite: false, sizeAttenuation: true,
  }));
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  dust.name = 'quiet-window-motes';
  root.add(dust);

  const hemi = new THREE.HemisphereLight('#fff7ec', '#b9aa9b', 0.63);
  const key = new THREE.DirectionalLight('#fff5e8', 0.96);
  key.position.set(-3.0, 5.0, 4.5);
  key.target.position.set(0, 1.45, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -4;
  key.shadow.camera.right = 4;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -3;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 15;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.018;
  key.shadow.radius = 4;
  const fill = new THREE.DirectionalLight('#c9e1e5', 0.13);
  fill.position.set(3.5, 3.2, 0.5);
  root.add(hemi, key, key.target, fill);
  const hemiDay = color('#fff7ec');
  const hemiNight = color('#c1cce9');
  const groundDay = color('#b9aa9b');
  const groundNight = color('#7c758e');
  const keyDay = color('#fff5e8');
  const keyNight = color('#fff0e4');

  function setMood(value) {
    targetNight = value === 'night' ? 1 : 0;
    root.userData.mood = value === 'night' ? 'night' : 'day';
  }

  function update(dt = 0, t = 0) {
    if (disposed) return;
    const step = Number.isFinite(dt) ? THREE.MathUtils.clamp(dt, 0, 0.1) : 0;
    const time = Number.isFinite(t) ? t : 0;
    night = THREE.MathUtils.damp(night, targetNight, 2.6, step);
    for (const change of colorChanges) {
      change.m.color.copy(change.day).lerp(change.dark, night);
      if (change.lift) {
        change.m.emissive.copy(change.m.color);
        change.m.emissiveIntensity = THREE.MathUtils.lerp(change.liftLevel, change.liftLevel * 0.36, night);
      }
    }
    skyMaterial.uniforms.uNight.value = night;
    hemi.color.copy(hemiDay).lerp(hemiNight, night);
    hemi.groundColor.copy(groundDay).lerp(groundNight, night);
    // GPChan remains equally readable at night; scenery supplies the mood.
    hemi.intensity = 0.63;
    key.color.copy(keyDay).lerp(keyNight, night);
    key.intensity = 0.96;
    fill.intensity = 0.13;
    lampLight.intensity = THREE.MathUtils.lerp(0.10, 1.05, night);
    lampShade.emissiveIntensity = THREE.MathUtils.lerp(0.02, 0.26, night);
    moonMat.opacity = night * 0.95;
    starMaterial.opacity = night * (0.56 + Math.sin(time * 0.6) * 0.055);
    cloudMat.opacity = THREE.MathUtils.lerp(0.65, 0.17, night);
    dustMaterial.opacity = THREE.MathUtils.lerp(0.34, 0.22, night);
    for (const cloud of clouds) cloud.group.position.x = cloud.cx + Math.sin(time * cloud.speed) * 0.11;
    for (const { curtain, original, side } of curtains) {
      const p = curtain.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = original[i * 3 + 1];
        const fromTop = (1.63 - y) / 3.26;
        p.setZ(i, original[i * 3 + 2] + Math.sin(time * 0.55 + y * 1.2 + side) * 0.018 * fromTop);
      }
      p.needsUpdate = true;
    }
    for (const item of leaves) {
      item.leaf.rotation.x = item.x + Math.sin(time * 0.72 + item.offset) * 0.014;
      item.leaf.rotation.z = item.z + Math.sin(time * 0.48 + item.offset) * 0.018;
    }
    const dustPosition = dustGeometry.attributes.position;
    for (let i = 0; i < dustPosition.count; i++) {
      dustPosition.setXYZ(i,
        dustBase[i * 3] + Math.sin(time * 0.14 + i * 2.7) * 0.095,
        dustBase[i * 3 + 1] + Math.sin(time * 0.18 + i * 1.3) * 0.09,
        dustBase[i * 3 + 2]);
    }
    dustPosition.needsUpdate = true;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    key.shadow.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    root.removeFromParent();
    root.clear();
  }

  setMood('day');
  update(0, 0);
  return { root, update, setMood, dispose };
}
