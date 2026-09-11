/* The whole retained network in 3D, lit up by what is actually firing.
 *
 * Positions are published soma coordinates from the MaleCNS annotations, so this
 * is where the cells sit in the animal rather than a layout an algorithm chose.
 * 27,038 of the 166,700 retained neurons have no published soma location and are
 * not drawn, and only a seeded sample of the 25.5 million connections is drawn,
 * because no browser will render them all. Every plastic synapse is included.
 *
 * Brightness is that neuron's spike count in the window just simulated, streamed
 * as raw bytes from the trainer.
 */

import * as THREE from "three";

const VERTEX = `
  attribute float activity;
  attribute float family;
  varying float vAct;
  varying float vFam;
  void main() {
    vAct = activity;
    vFam = family;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // Pixels, not world units. 139,662 cells in a panel a few hundred pixels
    // wide means each one has to be about one pixel or the brain turns into fog.
    gl_PointSize = (0.9 + 2.4 * activity) * (3.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;

const FRAGMENT = `
  varying float vAct;
  varying float vFam;
  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = dot(d, d);
    if (r > 0.25) discard;
    // Deliberately dim. 139,662 additively blended points will wash out to a
    // solid white silhouette at any brightness that looks reasonable for one
    // point, and then no anatomy is visible at all.
    vec3 quiet = vec3(0.10, 0.15, 0.19);
    vec3 hot = vec3(0.25, 0.72, 0.94);
    if (vFam > 1.5) hot = vec3(1.00, 0.36, 0.54);   // dopamine and MBON
    else if (vFam > 0.5) hot = vec3(1.00, 0.82, 0.40); // Kenyon cells
    vec3 c = mix(quiet, hot, clamp(vAct * 1.6, 0.0, 1.0));
    float a = (0.12 + 0.85 * vAct) * smoothstep(0.25, 0.02, r);
    gl_FragColor = vec4(c, a);
  }`;

export class BrainView {
  constructor(host) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    host.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
    this.camera.position.set(0, 0, 3.1);
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.spin = { x: -0.35, y: 0.6 };
    this.drag = null;
    this.ready = false;
    this.bindControls();
    addEventListener("resize", () => this.resize());
    requestAnimationFrame(() => this.frame());
  }

  bindControls() {
    const el = this.renderer.domElement;
    el.style.cursor = "grab";
    el.addEventListener("pointerdown", (e) => {
      this.drag = { x: e.clientX, y: e.clientY };
      el.style.cursor = "grabbing";
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!this.drag) return;
      this.spin.y += (e.clientX - this.drag.x) * 0.008;
      this.spin.x += (e.clientY - this.drag.y) * 0.008;
      this.drag = { x: e.clientX, y: e.clientY };
    });
    const stop = () => { this.drag = null; el.style.cursor = "grab"; };
    el.addEventListener("pointerup", stop);
    el.addEventListener("pointercancel", stop);
    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.camera.position.z = Math.max(0.9, Math.min(7, this.camera.position.z + e.deltaY * 0.0016));
    }, { passive: false });
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  async load(base = "media/brain") {
    const grab = async (name, Type) => new Type(await (await fetch(`${base}/${name}`)).arrayBuffer());
    const meta = await (await fetch(`${base}/meta.json`)).json();
    const positions = await grab("positions.f32", Float32Array);
    const edges = await grab("edges.u32", Uint32Array);
    const plastic = await grab("edge-plastic.u8", Uint8Array);
    this.meta = meta;
    this.count = positions.length / 3;
    this.activity = new Float32Array(this.count);
    this.family = new Float32Array(this.count);

    const points = new THREE.BufferGeometry();
    points.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    points.setAttribute("activity", new THREE.BufferAttribute(this.activity, 1));
    points.setAttribute("family", new THREE.BufferAttribute(this.family, 1));
    // Normal blending, not additive. The central brain has a dense rind of cell
    // bodies, and additively blended points there sum past white no matter how
    // faint each one is, erasing exactly the anatomy this view exists to show.
    this.cloud = new THREE.Points(points, new THREE.ShaderMaterial({
      vertexShader: VERTEX, fragmentShader: FRAGMENT,
      transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    }));
    this.pivot.add(this.cloud);

    // Connections. The plastic ones are drawn separately and brighter, because
    // they are the only synapses training can alter.
    const line = (mask, color, opacity, blending) => {
      const keep = [];
      for (let i = 0; i < plastic.length; i++) if (!!plastic[i] === mask) keep.push(i);
      const buf = new Float32Array(keep.length * 6);
      keep.forEach((e, k) => {
        const a = edges[e * 2] * 3, b = edges[e * 2 + 1] * 3;
        buf.set([positions[a], positions[a + 1], positions[a + 2],
                 positions[b], positions[b + 1], positions[b + 2]], k * 6);
      });
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(buf, 3));
      const seg = new THREE.LineSegments(geom, new THREE.LineBasicMaterial({
        color, transparent: true, opacity, depthWrite: false, blending,
      }));
      this.pivot.add(seg);
      return seg;
    };
    // Both layers blend normally, so a dense tangle settles at the wire color
    // instead of summing past it. The plastic bundle needs this more than the
    // bulk wiring does: 7,804 synapses converge onto six output neurons, so near
    // that apex the overlap is total and any additive glow turns solid white.
    this.wires = line(false, 0x1b3d4d, 0.05, THREE.NormalBlending);
    this.plasticWires = line(true, 0xffa83c, 0.16, THREE.NormalBlending);

    this.ready = true;
    this.resize();
    return meta;
  }

  /* Mark which drawn neurons are Kenyon cells (1) or dopamine/MBON (2). */
  setFamilies(kenyon, circuit) {
    kenyon.forEach((i) => { if (i >= 0) this.family[i] = 1; });
    circuit.forEach((i) => { if (i >= 0) this.family[i] = 2; });
    this.cloud.geometry.attributes.family.needsUpdate = true;
  }

  setActivity(bytes) {
    if (!this.ready || bytes.length !== this.count) return;
    for (let i = 0; i < this.count; i++) this.activity[i] = bytes[i] / 255;
    this.cloud.geometry.attributes.activity.needsUpdate = true;
  }

  frame() {
    requestAnimationFrame(() => this.frame());
    if (!this.ready) return;
    if (!this.drag) this.spin.y += 0.0012;
    this.pivot.rotation.x = this.spin.x;
    this.pivot.rotation.y = this.spin.y;
    this.renderer.render(this.scene, this.camera);
  }
}
