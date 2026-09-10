import * as THREE from 'three';
import { clips } from './simulation.js';

const C = { lime: 0xc4f86a, cyan: 0x4be4d2, pink: 0xec527e };
const seed = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const vec = (p) => new THREE.Vector3(...p);

export function createLab(canvas, onReady) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  renderer.setClearColor(0x080e13);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x080e13, .047);
  const camera = new THREE.PerspectiveCamera(37, 1, .1, 100);
  const group = new THREE.Group();
  scene.add(group);
  const material = (color, props = {}) => new THREE.MeshStandardMaterial({ color, roughness: .56, metalness: .28, ...props });
  const dark = material(0x141f25), metal = material(0x2b4149, { metalness: .75, roughness: .34 });
  const glow = (color, strength = 1) => material(color, { emissive: color, emissiveIntensity: strength, roughness: .4 });
  const cyan = glow(C.cyan, 2), lime = glow(C.lime, 2), pink = glow(C.pink, 2);
  function mesh(geometry, mat, at, parent = group) { const m = new THREE.Mesh(geometry, mat); m.position.set(...at); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
  function box(size, at, mat = dark, parent = group) { return mesh(new THREE.BoxGeometry(...size), mat, at, parent); }
  function orb(size, at, mat, parent = group, detail = 2) { const m = mesh(new THREE.IcosahedronGeometry(1, detail), mat, at, parent); m.scale.set(...size); return m; }
  function rod(a, b, radius = .025, mat = metal, parent = group, radial = 6) { const start = vec(a), end = vec(b); const m = mesh(new THREE.CylinderGeometry(radius * .82, radius, start.distanceTo(end), radial), mat, start.clone().add(end).multiplyScalar(.5).toArray(), parent); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize()); return m; }
  function wire(points, radius, mat, parent = group) { return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(vec)), 44, radius, 6, false), mat, [0, 0, 0], parent); }
  function label(text, width, height, at, parent = group, color = '#b3d3c5', bg = '#111e23', font = 22) { const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * height / width); const ctx = c.getContext('2d'); if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height); } ctx.font = `${font}px monospace`; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; text.split('\n').forEach((s, i, arr) => ctx.fillText(s, 256, c.height / 2 + (i - (arr.length - 1) / 2) * font * 1.65)); const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; const m = mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: tx, transparent: true, toneMapped: false }), at, parent); return m; }

  scene.add(new THREE.AmbientLight(0x779fac, 1.1));
  const key = new THREE.DirectionalLight(0xc3ebe9, 3.1); key.position.set(-3, 8, 5); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: .1, far: 24 }); key.shadow.bias = -.001; scene.add(key);
  const rim = new THREE.DirectionalLight(0x426bad, 2.8); rim.position.set(-4, 3, -5); scene.add(rim);
  const feedLight = new THREE.PointLight(0x8fe1ba, 22, 8, 2); feedLight.position.set(1.5, 3, 1); scene.add(feedLight);
  const pinkLight = new THREE.PointLight(0xc64176, 12, 7, 2); pinkLight.position.set(-3, 2, 1); scene.add(pinkLight);

  // A miniature nocturnal laboratory, with the city just outside the glass.
  const floor = box([65, .12, 65], [0, -.95, 0], material(0x080f14));
  const floorGrid = new THREE.GridHelper(45, 40, 0x19393a, 0x12282e); floorGrid.position.y = -.875; scene.add(floorGrid);
  const windowData = [];
  for (let i = 0; i < 23; i++) {
    const h = 2.4 + seed(i + 30) * 8, w = .6 + seed(i + 91) * 1.1, x = (i - 11) * .94;
    box([w, h, .6], [x, h / 2 - .85, -6 - seed(i) * 2.8], material(i % 3 ? 0x0b1621 : 0x101923));
    for (let j = 0; j < 16; j++) for (let k = 0; k < 3; k++) { if (seed(i * 210 + j * 3 + k) < .43) continue; const wy = j * .46; if (wy > h - .5) continue; windowData.push({ size: [.022 + seed(j + i) * .023, .06 + seed(k + i + j) * .06, .01], at: [x + (k - 1) * w * .23, wy - .4, -5.683 - seed(i) * 2.8], color: seed(j + i) > .64 ? 0x684662 : 0x2d697d }); }
  }
  const cityWindows = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), windowData.length);
  const windowTransform = new THREE.Object3D();
  windowData.forEach((item, i) => { windowTransform.position.set(...item.at); windowTransform.scale.set(...item.size); windowTransform.updateMatrix(); cityWindows.setMatrixAt(i, windowTransform.matrix); cityWindows.setColorAt(i, new THREE.Color(item.color)); });
  group.add(cityWindows);
  for (const x of [-6.4, -1.8, 3, 7.6]) { box([.065, 10, .12], [x, 3, -5.3], metal); box([.011, 9, .012], [x + .033, 3, -5.22], glow(0x31676c, 1)); }
  box([21, .065, .12], [0, 4.8, -5.3], dark);
  box([9.1, .27, 5.1], [0, .25, .15], material(0x152129, { roughness: .4, metalness: .65 }));
  box([9.16, .035, 5.14], [0, .39, .15], material(0x26363b, { metalness: .6 }));
  box([9.04, .025, .03], [0, .28, 2.72], cyan);
  box([.03, .025, 5], [-4.55, .28, .15], cyan);
  for (const x of [-3.7, 3.7]) for (const z of [-1.7, 2]) box([.16, 1.2, .16], [x, -.37, z], dark);
  const deskLines = new THREE.GridHelper(8.9, 20, 0x274147, 0x1d3238); deskLines.position.set(0, .414, .15); deskLines.scale.z = .57; group.add(deskLines);
  // Isolation pad and restraint frame.
  box([4.05, .045, 2.8], [-1.38, .435, .22], material(0x0b171b, { roughness: .75 }));
  for (const z of [-1.15, 1.59]) box([4.05, .015, .017], [-1.38, .46, z], glow(0x477966, .6));
  const padText = label('F–001   /   NEURAL INTERFACE', 1.72, .15, [-1.52, .47, 1.42], group, '#608f7b', null, 30); padText.rotation.x = -Math.PI / 2;
  // A rigid overhead boom carries the cable directly above the cranial implant.
  const tetherAnchor = vec([-.738, 3.27, .2]);
  rod([-2.55, .45, -1.03], [-2.55, 3.43, -1.03], .06, metal);
  rod([-2.55, 3.43, -1.03], [-.738, 3.43, -1.03], .055, metal);
  rod([-.738, 3.43, -1.03], [-.738, 3.43, .2], .055, metal);
  box([.48, .1, .44], [-2.55, .5, -1.03], dark);
  for (const at of [[-2.55, 3.43, -1.03], [-.738, 3.43, -1.03]]) orb([.085, .085, .085], at, metal, group, 1);
  rod([-.738, 3.49, .2], tetherAnchor.toArray(), .075, dark);
  rod([-.738, 3.32, .2], [ -.738, 3.285, .2], .081, lime);
  // Original low-poly Drosophila, facing its terminal.
  const fly = new THREE.Group(); fly.position.set(-1.35, 1.43, .35); fly.rotation.y = .24; group.add(fly);
  const shell = material(0x587b7d, { flatShading: true, metalness: .33, roughness: .53 });
  const abdomen = orb([.91, .39, .43], [-.83, -.02, 0], material(0x152c31, { flatShading: true }), fly);
  for (let i = 0; i < 5; i++) { const ring = mesh(new THREE.TorusGeometry(.36 - i * .035, .035, 4, 14), material(0x2b4548), [-.65 - i * .17, -.01, 0], fly); ring.rotation.y = Math.PI / 2; ring.scale.z = .94; }
  const thorax = orb([.66, .53, .5], [-.05, .08, 0], shell, fly);
  const head = new THREE.Group(); head.position.set(.63, .19, 0); fly.add(head);
  orb([.41, .4, .4], [0, 0, 0], material(0x71888b, { flatShading: true }), head);
  const eyeMaterial = material(0x9e1837, { flatShading: true, roughness: .29, metalness: .45, emissive: 0x3c0614, emissiveIntensity: .4 });
  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = orb([.28, .37, .255], [.12, .04, .29 * side], eyeMaterial, head, 2); eyes.push(eye);
    orb([.065, .045, .045], [.21, .25, .47 * side], material(0xe7a8a0, { roughness: .1, emissive: 0x995069 }), head, 1);
    wire([[.25, .3, side * .15], [.48, .49, side * .21], [.7, .57, side * .37]], .012, metal, head);
    orb([.038, .027, .027], [.7, .57, side * .37], dark, head, 1);
  }
  rod([.28, -.17, 0], [.51, -.35, 0], .045, metal, head); orb([.06, .08, .11], [.51, -.35, 0], dark, head, 1);
  // Fine thorax bristles catch the monitor light.
  for (let i = 0; i < 72; i++) { const a = seed(i + 4) * Math.PI * 2, b = seed(i + 51) * Math.PI; const p = [Math.cos(a) * Math.sin(b) * .64 - .05, Math.abs(Math.cos(b)) * .51 + .1, Math.sin(a) * Math.sin(b) * .49]; if (p[0] > .3) continue; rod(p, [p[0] + (p[0] + .05) * .19, p[1] + .08 + seed(i) * .08, p[2] * 1.14], .006, material(0x19292c), fly, 3); }
  const legs = [];
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    const leg = new THREE.Group(); fly.add(leg); const x = .33 - i * .46;
    const a = [x, -.17, side * .3], b = [x + (.52 - i * .48), -.37, side * .75], c = [x + (.59 - i * .35), -.94, side * .99], d = [c[0] + .24, -.96, c[2] + side * .08];
    rod(a, b, .034, metal, leg); orb([.055, .055, .055], b, shell, leg, 1); rod(b, c, .022, metal, leg); rod(c, d, .012, dark, leg); legs.push(leg);
  }
  const wings = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Group(); wing.position.set(-.18, .41, .23 * side); fly.add(wing);
    const points = [[0, 0, 0], [-.75, .07, .38 * side], [-1.72, .01, 1.1 * side], [-2.03, -.035, 1.05 * side], [-2.21, -.04, .83 * side], [-1.77, -.03, .41 * side], [-.66, -.015, .03 * side]];
    const vertices = []; for (let i = 1; i < points.length - 1; i++) vertices.push(...points[0], ...points[i], ...points[i + 1]);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geo.computeVertexNormals();
    const m = mesh(geo, material(0xa9dce2, { transparent: true, opacity: .48, side: THREE.DoubleSide, roughness: .2, metalness: .5, flatShading: true }), [0, 0, 0], wing); m.castShadow = false;
    const vein = material(0x77999b, { transparent: true, opacity: .68, metalness: .5 });
    const line = [...points, points[0]]; for (let j = 0; j < line.length - 1; j++) rod(line[j], line[j + 1], .009, vein, wing, 4);
    for (let j = 2; j < 6; j++) rod([-.1, 0, .025 * side], points[j], .006, vein, wing, 3);
    rod([-.83, .01, .31 * side], [-1.23, .025, .7 * side], .007, vein, wing, 3);
    rod([-1.38, -.02, .31 * side], [-1.68, .01, .87 * side], .007, vein, wing, 3);
    wings.push(wing);
  }
  const harness = mesh(new THREE.TorusGeometry(.515, .035, 5, 18, Math.PI * 1.5), dark, [-.13, .06, 0], fly); harness.rotation.y = Math.PI / 2;
  // The implant is seated in the crown between the eyes, not on the thorax.
  mesh(new THREE.CylinderGeometry(.12, .15, .11, 12), metal, [0, .39, 0], head);
  const cranialRing = mesh(new THREE.TorusGeometry(.125, .019, 6, 18), lime, [0, .444, 0], head);
  cranialRing.rotation.x = Math.PI / 2;
  rod([0, .445, 0], [0, .65, 0], .05, dark, head, 12);
  for (const y of [.49, .545, .6]) mesh(new THREE.CylinderGeometry(.066, .066, .025, 10), metal, [0, y, 0], head);
  const electrode = orb([.059, .025, .059], [0, .635, 0], glow(C.lime, 2), head, 1);
  const socketTip = new THREE.Vector3(0, .675, 0);
  const tetherCurve = new THREE.CatmullRomCurve3([
    tetherAnchor.clone(), vec([-.69, 3.05, .22]), vec([-.75, 2.66, .2]), vec([-.738, 2.295, .2])
  ]);
  const tetherSegments = 28, tetherSides = 8, tetherRadius = .039;
  const tether = mesh(new THREE.TubeGeometry(tetherCurve, tetherSegments, tetherRadius, tetherSides, false), material(0x172b2b, { roughness: .39, metalness: .15 }), [0, 0, 0]);
  const stripeGeometry = new THREE.BufferGeometry();
  stripeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((tetherSegments + 1) * 3), 3));
  group.add(new THREE.Line(stripeGeometry, new THREE.LineBasicMaterial({ color: C.lime, transparent: true, opacity: .9 })));
  const tetherPoint = new THREE.Vector3();
  function updateTether() {
    // Follow the moving implant while keeping the upper end fixed to the boom.
    head.localToWorld(tetherCurve.points[3].copy(socketTip));
    group.worldToLocal(tetherCurve.points[3]);
    tetherCurve.points[2].copy(tetherCurve.points[3]).add(new THREE.Vector3(-.025, .34, 0));
    tetherCurve.updateArcLengths();
    const frames = tetherCurve.computeFrenetFrames(tetherSegments, false);
    const positions = tether.geometry.attributes.position, normals = tether.geometry.attributes.normal;
    for (let i = 0; i <= tetherSegments; i++) {
      tetherCurve.getPointAt(i / tetherSegments, tetherPoint);
      const n = frames.normals[i], b = frames.binormals[i];
      for (let j = 0; j <= tetherSides; j++) {
        const angle = j / tetherSides * Math.PI * 2, c = -Math.cos(angle), s = Math.sin(angle);
        const nx = c * n.x + s * b.x, ny = c * n.y + s * b.y, nz = c * n.z + s * b.z;
        const index = i * (tetherSides + 1) + j;
        positions.setXYZ(index, tetherPoint.x + tetherRadius * nx, tetherPoint.y + tetherRadius * ny, tetherPoint.z + tetherRadius * nz);
        normals.setXYZ(index, nx, ny, nz);
      }
      stripeGeometry.attributes.position.setXYZ(i, tetherPoint.x, tetherPoint.y, tetherPoint.z + tetherRadius + .002);
    }
    positions.needsUpdate = normals.needsUpdate = stripeGeometry.attributes.position.needsUpdate = true;
    tether.geometry.computeBoundingSphere();
    stripeGeometry.computeBoundingSphere();
  }
  updateTether();

  // A standalone phone: rounded aluminum edge, black glass, and ordinary controls.
  function phoneOutline(width, height, radius) {
    const x = width / 2, y = height / 2, r = radius, shape = new THREE.Shape();
    shape.moveTo(-x + r, -y); shape.lineTo(x - r, -y);
    shape.quadraticCurveTo(x, -y, x, -y + r); shape.lineTo(x, y - r);
    shape.quadraticCurveTo(x, y, x - r, y); shape.lineTo(-x + r, y);
    shape.quadraticCurveTo(-x, y, -x, y - r); shape.lineTo(-x, -y + r);
    shape.quadraticCurveTo(-x, -y, -x + r, -y);
    return shape;
  }
  const terminal = new THREE.Group(); terminal.position.set(1.78, 0, -.4); terminal.rotation.set(.08, -.68, 0); group.add(terminal);
  const phoneEdge = material(0x677279, { roughness: .26, metalness: .9 });
  mesh(new THREE.ExtrudeGeometry(phoneOutline(1.8, 3.3, .2), { depth: .1, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: .018, bevelThickness: .018, curveSegments: 12 }), phoneEdge, [0, 0, -.05], terminal);
  mesh(new THREE.ShapeGeometry(phoneOutline(1.77, 3.27, .19), 12), material(0x030508, { roughness: .16, metalness: .35 }), [0, 0, .07], terminal);
  box([.27, .028, .008], [-.04, 1.53, .078], dark, terminal);
  orb([.027, .027, .008], [.2, 1.53, .082], material(0x172c3b, { roughness: .08, metalness: .65 }), terminal, 2);
  box([.36, .018, .006], [0, -1.53, .078], material(0xb9c1c5), terminal);
  box([.023, .3, .058], [.919, .61, 0], phoneEdge, terminal);
  for (const y of [.72, .31]) box([.023, .24, .058], [-.919, y, 0], phoneEdge, terminal);

  // Signal box, cables, and a conspicuously untouched piece of fruit.
  const boxGroup = new THREE.Group(); boxGroup.position.set(3.15, .8, 1.65); boxGroup.rotation.y = -.16; group.add(boxGroup);
  box([1.19, .7, .75], [0, 0, 0], dark, boxGroup);
  label('NEUROLINK\n166,700 CELLS', .83, .33, [-.06, .05, .386], boxGroup, '#8db798', '#101d20', 34);
  for (let i = 0; i < 5; i++) orb([.022, .022, .015], [-.36 + i * .17, -.24, .392], i % 2 ? cyan : lime, boxGroup, 1);
  // Route the supply around the back of the desk and up the boom; no loose side leads enter the fly.
  wire([[3.1, .62, 1.33], [3.55, .49, .8], [3.3, .49, -1.65], [-1.9, .49, -1.65], [-2.65, .63, -1.1], [-2.65, 3.38, -1.03], [-2.55, 3.51, -1.03], [-.74, 3.51, -1.03], [-.738, 3.51, .2]], .031, dark);
  const fruit = orb([.16, .18, .15], [-3.59, .6, 1.73], material(0x73832d, { flatShading: true }), group, 1); rod([-3.59, .76, 1.73], [-3.55, .84, 1.72], .014, dark);

  const feed = createFeed(renderer);
  const screen = mesh(new THREE.PlaneGeometry(1.62, 2.88), feed.screenMaterial, [0, 0, .079], terminal); screen.castShadow = false;
  terminal.position.y += .417 - new THREE.Box3().setFromObject(terminal).min.y;
  // Capture the exact composited portrait display, including swipes and captions.
  const sensoryTarget = new THREE.WebGLRenderTarget(90, 160);
  const sensoryScene = new THREE.Scene();
  const sensoryCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  sensoryCamera.position.z = 1;
  sensoryScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), feed.screenMaterial));
  const sensoryPixels = new Uint8Array(90 * 160 * 4);
  const dustGeo = new THREE.BufferGeometry(), dustPos = new Float32Array(90 * 3);
  for (let i = 0; i < 90; i++) { dustPos[i * 3] = seed(i + 600) * 10 - 5; dustPos[i * 3 + 1] = seed(i + 700) * 6; dustPos[i * 3 + 2] = seed(i + 900) * 8 - 4; }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3)); const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0x82c1a1, size: .013, transparent: true, opacity: .45 })); group.add(dust);

  const views = [{ theta: .36, phi: 1.17, radius: 12.6, target: [0, 1.35, 0] }, { theta: .67, phi: 1.24, radius: 7.1, target: [-1.12, 1.55, .2] }, { theta: .02, phi: 1.45, radius: 6.9, target: [.9, 1.9, 0] }];
  let viewIndex = 0, orbit = { ...views[0], target: [...views[0].target] }, targetOrbit = { ...orbit }, lastWidth = 0, lastHeight = 0;
  function resize() { const { width, height } = canvas.getBoundingClientRect(); if (width === lastWidth && height === lastHeight) return; lastWidth = width; lastHeight = height; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function render(time, dt, state) {
    resize();
    const move = reduced ? 0 : time;
    // Display mappings only: backend telemetry is never generated by the animation.
    const excitement = Math.min(1.5, Math.max(0, (state.pam11Hz || 0) / 60));
    const motor = Math.min(1.5, Math.max(0, (state.motorHz || 0) / 60));
    fly.position.y = 1.43 + Math.sin(move * 2.3) * .014 + Math.sin(move * 39) * excitement * .017;
    head.rotation.z = Math.sin(move * .7) * .025 + Math.max(-.13, Math.min(.13, (state.turnHz || 0) / 200));
    updateTether();
    wings.forEach((w, i) => { w.rotation.x = (i ? 1 : -1) * (Math.sin(move * (motor > .1 ? 49 : 13)) * (.025 + motor * .21) + Math.sin(move * .61) * .012); });
    legs.forEach((l, i) => { l.rotation.x = Math.sin(move * 3.5 + i * 1.5) * .013 * (1 + excitement * 3); });
    electrode.material.emissiveIntensity = 1.4 + Math.sin(move * 6) * .4 + excitement * 3;
    dust.rotation.y = move * .005;
    const smooth = 1 - Math.exp(-dt * 5);
    for (const k of ['theta', 'phi', 'radius']) orbit[k] += (targetOrbit[k] - orbit[k]) * smooth;
    orbit.target = orbit.target.map((v, i) => v + (targetOrbit.target[i] - v) * smooth);
    const narrow = Math.max(1, 1.52 / camera.aspect), radius = orbit.radius * (narrow > 1 ? Math.pow(narrow, .52) : 1);
    camera.position.set(orbit.target[0] + radius * Math.sin(orbit.phi) * Math.sin(orbit.theta), orbit.target[1] + radius * Math.cos(orbit.phi), orbit.target[2] + radius * Math.sin(orbit.phi) * Math.cos(orbit.theta));
    camera.lookAt(...orbit.target);
    feed.render(state.clipElapsed, state.clipIndex, state.swipe);
    feedLight.intensity = 18 + Math.sin(time * 1.8) * 3 + excitement * 22;
    feedLight.color.set([0x97d4ce, 0x77baff, 0x8ebafa, 0xebc879, 0xdc9eff][state.clipIndex % 5]);
    renderer.setRenderTarget(null); renderer.render(scene, camera);
  }
  resize(); onReady?.();
  return {
    render, clips,
    captureFrame() {
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(sensoryTarget);
      renderer.render(sensoryScene, sensoryCamera);
      renderer.readRenderTargetPixels(sensoryTarget, 0, 0, 90, 160, sensoryPixels);
      renderer.setRenderTarget(previous);
      return sensoryPixels.slice();
    },
    nextClip(index) { feed.capture(); feed.setClip(index); },
    setView(index) { viewIndex = index % views.length; targetOrbit = { ...views[viewIndex], target: [...views[viewIndex].target] }; return viewIndex; },
    orbit(dx, dy) { targetOrbit.theta = THREE.MathUtils.clamp(targetOrbit.theta - dx * .005, -.7, 1.3); targetOrbit.phi = THREE.MathUtils.clamp(targetOrbit.phi - dy * .003, .7, 1.65); },
    dispose() { renderer.dispose(); }
  };
}

function createFeed(renderer) {
  const size = { width: 360, height: 640 };
  const target = new THREE.WebGLRenderTarget(size.width, size.height);
  const previous = new THREE.WebGLRenderTarget(size.width, size.height);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x17204a);
  const camera = new THREE.PerspectiveCamera(45, size.width / size.height, .1, 100); camera.position.set(0, 3.3, 7.2); camera.lookAt(0, .4, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 2.3));
  const light = new THREE.DirectionalLight(0xd3f6ff, 5); light.position.set(2, 5, 3); scene.add(light);
  const light2 = new THREE.PointLight(0xfc63c5, 20, 20); light2.position.set(-3, 2, 1); scene.add(light2);
  const groups = [], animated = [];
  const mat = (color, metalness = .3) => new THREE.MeshStandardMaterial({ color, metalness, roughness: .25 });
  const m = (geo, material, xyz, parent) => { const mesh = new THREE.Mesh(geo, material); mesh.position.set(...xyz); parent.add(mesh); return mesh; };
  for (let i = 0; i < clips.length; i++) { const g = new THREE.Group(); groups.push(g); animated.push([]); scene.add(g); }
  // 01: metallic candy knot over a luminous lilac pedestal.
  const knot = m(new THREE.TorusKnotGeometry(.89, .31, 110, 14, 2, 3), mat(0xa4e5ee, .85), [0, .9, 0], groups[0]); animated[0].push(knot);
  m(new THREE.CylinderGeometry(1.52, 1.65, .32, 64), mat(0xa5a3f3, .5), [0, -.48, 0], groups[0]);
  const floor0 = m(new THREE.PlaneGeometry(60, 60), mat(0x7253b1, .2), [0, -.66, 0], groups[0]); floor0.rotation.x = -Math.PI / 2;
  for (let i = 0; i < 3; i++) { const ring = m(new THREE.TorusGeometry(1.25 + i * .29, .018, 5, 90), new THREE.MeshBasicMaterial({ color: 0xbba9ff }), [0, -.29 - i * .04, 0], groups[0]); ring.rotation.x = Math.PI / 2; }
  // 02: endlessly running through a tiny neon city.
  m(new THREE.BoxGeometry(3.9, .1, 80), mat(0x211a42), [0, -.6, -25], groups[1]);
  for (const x of [-1.3, 0, 1.3]) m(new THREE.BoxGeometry(.035, .01, 80), new THREE.MeshBasicMaterial({ color: 0xff8ec7 }), [x, -.54, -25], groups[1]);
  for (let i = 0; i < 22; i++) { const building = m(new THREE.BoxGeometry(.8, 1 + seed(i) * 6, 1.5), mat(i % 2 ? 0x6848b5 : 0x22569b), [(i % 2 ? -1 : 1) * 2.55, .6, -i * 2.5], groups[1]); animated[1].push(building); }
  const runner = new THREE.Group(); runner.position.z = 1.3; groups[1].add(runner); m(new THREE.IcosahedronGeometry(.32, 1), mat(0xffec7d), [0, .3, 0], runner); m(new THREE.BoxGeometry(.39, .53, .29), mat(0xfc7c48), [0, -.09, 0], runner);
  for (const x of [-.14, .14]) m(new THREE.BoxGeometry(.12, .27, .17), mat(0x91faff), [x, -.47, .01], runner);
  animated[1].push(runner);
  for (let i = 0; i < 19; i++) { const coin = m(new THREE.TorusGeometry(.16, .07, 6, 14), mat(0xffd549, .7), [0, .0, -i * 2.1 - 1], groups[1]); animated[1].push(coin); }
  // 03: pastel kinetic orbs.
  const floor2 = m(new THREE.PlaneGeometry(60, 60), mat(0x20384b), [0, -.8, 0], groups[2]); floor2.rotation.x = -Math.PI / 2;
  for (let i = 0; i < 11; i++) { const ball = m(new THREE.SphereGeometry(.37 - i * .014, 24, 16), mat([0xed86ce, 0x9d96f6, 0x8deada, 0xece786][i % 4], .5), [0, 0, 0], groups[2]); animated[2].push(ball); }
  m(new THREE.CylinderGeometry(1.45, 1.45, .2, 64), mat(0x577694), [0, -.7, 0], groups[2]);
  // 04: fruit with zero thoughts rotates through the algorithm.
  const fruitGroup = new THREE.Group(); groups[3].add(fruitGroup); animated[3].push(fruitGroup);
  const banana = m(new THREE.TorusGeometry(1.02, .28, 5, 20, Math.PI * 1.15), mat(0xffcc32), [0, 0, 0], fruitGroup); banana.rotation.z = -.3;
  for (const x of [-.2, .2]) { m(new THREE.SphereGeometry(.095, 12, 10), mat(0xffffff), [x, 1.06, .25], fruitGroup); m(new THREE.SphereGeometry(.045, 10, 8), mat(0x111726), [x, 1.05, .33], fruitGroup); }
  const floor3 = m(new THREE.PlaneGeometry(60, 60), mat(0xea6a73), [0, -1.2, 0], groups[3]); floor3.rotation.x = -Math.PI / 2;
  for (let i = 0; i < 14; i++) { const mini = m(new THREE.IcosahedronGeometry(.12, 0), mat(i % 2 ? 0xffe272 : 0xa4fd96), [Math.sin(i * 2) * 1.6, Math.cos(i * 2) * 1.5 + .4, -.5], groups[3]); animated[3].push(mini); }
  // 05: the loop that never gets anywhere.
  for (let i = 0; i < 24; i++) { const ring = m(new THREE.TorusGeometry(1.1, .1, 5, 6), mat(new THREE.Color().setHSL(i / 30 + .5, .9, .64), .5), [0, .6, -i * 1.3], groups[4]); animated[4].push(ring); }

  const uiCanvas = document.createElement('canvas'); uiCanvas.width = 360; uiCanvas.height = 640;
  const oldCanvas = document.createElement('canvas'); oldCanvas.width = 360; oldCanvas.height = 640;
  const ui = new THREE.CanvasTexture(uiCanvas), oldUI = new THREE.CanvasTexture(oldCanvas);
  ui.colorSpace = oldUI.colorSpace = THREE.SRGBColorSpace;
  const screenMaterial = new THREE.ShaderMaterial({
    uniforms: { frame: { value: target.texture }, prev: { value: previous.texture }, overlay: { value: ui }, oldOverlay: { value: oldUI }, progress: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform sampler2D frame;uniform sampler2D prev;uniform sampler2D overlay;uniform sampler2D oldOverlay;uniform float progress;varying vec2 vUv;void main(){float y=vUv.y+progress;vec2 p=vec2(vUv.x,mod(y,1.0));vec4 video;vec4 ui;if(y>=1.0){video=texture2D(frame,p);ui=texture2D(overlay,p);}else{video=texture2D(prev,p);ui=texture2D(oldOverlay,p);}gl_FragColor=vec4(mix(video.rgb,ui.rgb,ui.a),1.0);}',
    toneMapped: false
  });
  let active = 0;
  function drawUI(index) {
    const c = uiCanvas.getContext('2d'), clip = clips[index]; c.clearRect(0, 0, 360, 640);
    let g = c.createLinearGradient(0, 370, 0, 640); g.addColorStop(0, '#00000000'); g.addColorStop(1, '#060a17ee'); c.fillStyle = g; c.fillRect(0, 370, 360, 270);
    g = c.createLinearGradient(0, 0, 0, 110); g.addColorStop(0, '#05080c80'); g.addColorStop(1, '#05080c00'); c.fillStyle = g; c.fillRect(0, 0, 360, 110);
    c.textAlign = 'center'; c.fillStyle = '#ffffffaa'; c.font = '500 15px Arial'; c.fillText('Following', 116, 39); c.fillStyle = '#fff'; c.font = 'bold 16px Arial'; c.fillText('For You', 219, 39); c.fillRect(194, 50, 49, 3);
    c.font = 'bold 24px Arial'; c.fillStyle = '#fff'; c.textAlign = 'center';
    if (index === 3) { c.fillText('THEY DO NOT KNOW', 180, 133); c.fillText('I AM A BANANA', 180, 163); }
    else { c.font = 'bold 21px Arial'; c.shadowColor = '#00000088'; c.shadowBlur = 7; c.fillText(clip.caption, 180, 140); c.shadowBlur = 0; }
    c.font = '32px Arial'; c.fillText('♥', 322, 362); c.font = 'bold 10px Arial'; c.fillText(clip.likes, 322, 382);
    c.font = '29px Arial'; c.fillText('●', 322, 423); c.fillStyle = '#232440'; c.font = 'bold 16px Arial'; c.fillText('···', 322, 419); c.fillStyle = '#fff'; c.font = 'bold 10px Arial'; c.fillText('2,481', 322, 443);
    c.font = '33px Arial'; c.fillText('↗', 322, 485); c.font = 'bold 10px Arial'; c.fillText('Share', 322, 506);
    c.textAlign = 'left'; c.font = 'bold 16px Arial'; c.fillText(clip.user, 20, 528); c.font = '14px Arial'; c.fillText(clip.caption, 20, 553); c.fillStyle = '#ffffffad'; c.font = '12px Arial'; c.fillText(clip.tag, 20, 576); c.fillText('♫ original audio · loop forever', 20, 607);
    c.fillStyle = '#ffffffb0'; c.fillRect(125, 629, 110, 3); ui.needsUpdate = true;
  }
  drawUI(0);
  return {
    screenMaterial,
    capture() { renderer.setRenderTarget(previous); renderer.render(scene, camera); oldCanvas.getContext('2d').clearRect(0, 0, 360, 640); oldCanvas.getContext('2d').drawImage(uiCanvas, 0, 0); oldUI.needsUpdate = true; },
    setClip(index) { active = index; drawUI(index); },
    render(t, index, swipe) {
      active = index; groups.forEach((g, i) => g.visible = i === active);
      scene.background.set([0x8270ca, 0x181437, 0x254659, 0xf68987, 0x101021][active]);
      camera.position.set(0, active === 1 ? 2.3 : active === 4 ? .7 : 3.3, active === 4 ? 5 : 7.2); camera.lookAt(0, active === 4 ? .6 : .4, active === 1 ? -4 : 0);
      knot.rotation.set(t * .33, t * .47, Math.sin(t * .5) * .3); knot.position.y = .8 + Math.sin(t * 1.3) * .15;
      if (active === 1) { animated[1].slice(0, 22).forEach((m, i) => m.position.z = ((t * 7 - i * 2.5) % 55 + 55) % 55 - 50); const run = animated[1][22]; run.position.x = Math.sin(t * 1.5) > .4 ? 1.3 : Math.sin(t * 1.5) < -.4 ? -1.3 : 0; run.position.y = Math.abs(Math.sin(t * 11)) * .12; run.rotation.z = Math.sin(t * 11) * .12; animated[1].slice(23).forEach((coin, i) => { coin.position.z = ((t * 7 - i * 2.1) % 40 + 40) % 40 - 36; coin.rotation.y = t * 3; coin.position.x = run.position.x; }); }
      animated[2].forEach((ball, i) => { const a = t * .8 + i * Math.PI * 2 / 11; ball.position.set(Math.sin(a) * .95, Math.abs(Math.sin(t * 1.7 + i * .3)) * 2.3 - .18, Math.cos(a) * .95); });
      fruitGroup.rotation.set(.1, Math.sin(t * .8) * .8, Math.sin(t * 1.6) * .2); fruitGroup.position.y = Math.sin(t * 2) * .2;
      animated[3].slice(1).forEach((obj, i) => { obj.rotation.x = t; obj.rotation.z = -t; obj.position.y = Math.cos(t + i * 2) * 1.8 + .5; });
      animated[4].forEach((ring, i) => { ring.position.z = ((t * 2.3 - i * 1.3) % 31.2 + 31.2) % 31.2 - 29; ring.rotation.z = t * .23 + i * .14; });
      screenMaterial.uniforms.progress.value = swipe;
      renderer.setRenderTarget(target); renderer.render(scene, camera);
    }
  };
}
