// ============================================================
// Elementum 3D — Three.js scene
// Sets up renderer, camera, lights, controls, background animations,
// the 3D periodic table of element cubes, raycasting, and the
// camera "dive into element" animation.
// ============================================================

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { LAYOUT, CELL, CELL_HEIGHT, CELL_PITCH, F_BLOCK_LABELS, GRID_OFFSET_X, GRID_OFFSET_Z } from "./layout.js";
import { makeElementMaterials, clearTextureCache } from "./textures.js";
import { state, emit, on, getCatColor } from "./state.js";

let renderer, scene, camera, controls;
let elementGroup;          // group containing all element cubes
let elementMeshes = [];    // [{ mesh, layout, basePos, color, el, isLabel }]
let background;            // background animation object
let raycaster, pointer;
let hoveredMesh = null;
let selectedMesh = null;
let clock;

// Camera "dive" animation state
let diveAnim = null;       // { fromPos, toPos, fromTarget, toTarget, t, dur, mesh }

const FOCUS_DISTANCE = 3.0;     // how close camera gets to a selected cube
const DEFAULT_CAM_POS = new THREE.Vector3(0, 22, 24);
const DEFAULT_CAM_TARGET = new THREE.Vector3(0, 0, 0);

export function initScene(canvas) {
  // ---------- Renderer ----------
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // ---------- Scene ----------
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05060f, 0.012);

  // ---------- Camera ----------
  camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    500
  );
  camera.position.copy(DEFAULT_CAM_POS);

  // ---------- Controls ----------
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 6;
  controls.maxDistance = 60;
  controls.maxPolarAngle = Math.PI * 0.52;
  controls.minPolarAngle = Math.PI * 0.12;
  controls.target.copy(DEFAULT_CAM_TARGET);

  // ---------- Lights ----------
  const ambient = new THREE.AmbientLight(0x9aa0ff, 0.45);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
  keyLight.position.set(12, 28, 14);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x66d9ff, 0.6);
  rimLight.position.set(-16, 10, -12);
  scene.add(rimLight);

  const fillLight = new THREE.PointLight(0xb46bff, 0.7, 60);
  fillLight.position.set(0, -8, 0);
  scene.add(fillLight);

  // ---------- Background animation ----------
  background = createBackground();
  scene.add(background.group);

  // ---------- Build periodic table ----------
  buildTable();

  // ---------- Interaction ----------
  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2(-10, -10);
  clock = new THREE.Clock();

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerleave", () => {
    pointer.set(-10, -10);
    if (hoveredMesh) { unhighlight(hoveredMesh); hoveredMesh = null; }
    canvas.classList.remove("pointing");
  });
  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && selectedMesh) deselectElement();
  });

  // Wire up to state changes
  on("theme", applyThemeToScene);
  on("colors", () => refreshElementColors());
  on("filter", updateFilterState);
  on("deselect", deselectElement);

  applyThemeToScene(state.theme);

  // Start loop
  animate();
}

// ============================================================
// Background animations: starfield + nebula particles + orbiting rings
// ============================================================
function createBackground() {
  const group = new THREE.Group();

  // ---- Starfield (Points) ----
  const STAR_COUNT = 2400;
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(STAR_COUNT * 3);
  const starCol = new Float32Array(STAR_COUNT * 3);
  const starSize = new Float32Array(STAR_COUNT);
  for (let i = 0; i < STAR_COUNT; i++) {
    // distribute in a large sphere
    const r = 60 + Math.random() * 80;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    starPos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    starPos[i * 3 + 2] = r * Math.cos(phi);

    const c = new THREE.Color().setHSL(
      0.55 + Math.random() * 0.2,  // blue/violet range
      0.5 + Math.random() * 0.3,
      0.5 + Math.random() * 0.5
    );
    starCol[i * 3]     = c.r;
    starCol[i * 3 + 1] = c.g;
    starCol[i * 3 + 2] = c.b;
    starSize[i] = 0.3 + Math.random() * 1.2;
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute("color", new THREE.BufferAttribute(starCol, 3));
  starGeo.setAttribute("aSize", new THREE.BufferAttribute(starSize, 1));

  const starMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float aSize;
      varying vec3 vColor;
      varying float vSize;
      uniform float uTime;
      void main() {
        vColor = color;
        vSize = aSize;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float twinkle = 0.7 + 0.3 * sin(uTime * 2.0 + position.x * 0.3 + position.y * 0.5);
        gl_PointSize = aSize * (300.0 / -mv.z) * twinkle;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        vec2 c = gl_PointCoord - vec2(0.5);
        float d = length(c);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vColor, a);
      }
    `,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(starGeo, starMat);
  group.add(stars);

  // ---- Nebula particle cloud (slow swirling) ----
  const NEB_COUNT = 600;
  const nebGeo = new THREE.BufferGeometry();
  const nebPos = new Float32Array(NEB_COUNT * 3);
  const nebCol = new Float32Array(NEB_COUNT * 3);
  const nebOff = new Float32Array(NEB_COUNT); // phase offset
  for (let i = 0; i < NEB_COUNT; i++) {
    const r = 25 + Math.random() * 35;
    const theta = Math.random() * Math.PI * 2;
    const y = (Math.random() - 0.5) * 20;
    nebPos[i * 3]     = r * Math.cos(theta);
    nebPos[i * 3 + 1] = y;
    nebPos[i * 3 + 2] = r * Math.sin(theta);
    const c = new THREE.Color().setHSL(
      0.6 + Math.random() * 0.2,
      0.8, 0.55
    );
    nebCol[i * 3]     = c.r;
    nebCol[i * 3 + 1] = c.g;
    nebCol[i * 3 + 2] = c.b;
    nebOff[i] = Math.random() * Math.PI * 2;
  }
  nebGeo.setAttribute("position", new THREE.BufferAttribute(nebPos, 3));
  nebGeo.setAttribute("color", new THREE.BufferAttribute(nebCol, 3));
  nebGeo.setAttribute("aPhase", new THREE.BufferAttribute(nebOff, 1));

  const nebMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float aPhase;
      varying vec3 vColor;
      uniform float uTime;
      void main() {
        vColor = color;
        vec3 p = position;
        // gentle swirl
        float ang = uTime * 0.06 + aPhase;
        float r = length(p.xz);
        p.x = r * cos(atan(p.z, p.x) + ang * 0.4);
        p.z = r * sin(atan(p.z, p.x) + ang * 0.4);
        p.y += sin(uTime * 0.5 + aPhase) * 1.2;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = 14.0 * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        vec2 c = gl_PointCoord - vec2(0.5);
        float d = length(c);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.0, d) * 0.25;
        gl_FragColor = vec4(vColor, a);
      }
    `,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const nebula = new THREE.Points(nebGeo, nebMat);
  group.add(nebula);

  // ---- Orbiting glowing rings around the table ----
  const rings = [];
  const ringColors = [0x00e5ff, 0xb46bff, 0xff5e9c];
  for (let i = 0; i < 3; i++) {
    const ringGeo = new THREE.TorusGeometry(22 + i * 4, 0.04, 8, 128);
    const ringMat = new THREE.MeshBasicMaterial({
      color: ringColors[i],
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2 + (i - 1) * 0.15;
    ring.rotation.z = i * 0.4;
    rings.push(ring);
    group.add(ring);
  }

  // ---- Electron-like particles drifting through scene ----
  const eCount = 40;
  const eGeo = new THREE.BufferGeometry();
  const ePos = new Float32Array(eCount * 3);
  const eData = []; // store orbit params
  for (let i = 0; i < eCount; i++) {
    const radius = 10 + Math.random() * 18;
    const speed = 0.2 + Math.random() * 0.5;
    const phase = Math.random() * Math.PI * 2;
    const tilt = (Math.random() - 0.5) * 1.2;
    const yOff = (Math.random() - 0.5) * 6;
    eData.push({ radius, speed, phase, tilt, yOff });
    ePos[i * 3] = 0; ePos[i * 3 + 1] = 0; ePos[i * 3 + 2] = 0;
  }
  eGeo.setAttribute("position", new THREE.BufferAttribute(ePos, 3));
  const eMat = new THREE.PointsMaterial({
    color: 0x9ad8ff,
    size: 0.25,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const electrons = new THREE.Points(eGeo, eMat);
  group.add(electrons);

  return {
    group,
    stars, starMat,
    nebula, nebMat,
    rings,
    electrons, eData, eMat,
    update(t, dt) {
      this.starMat.uniforms.uTime.value = t;
      this.nebMat.uniforms.uTime.value = t;
      this.stars.rotation.y += dt * 0.008;
      this.nebula.rotation.y -= dt * 0.015;
      this.rings.forEach((r, i) => {
        r.rotation.z += dt * (0.06 + i * 0.02);
      });
      // electrons
      const pos = this.electrons.geometry.attributes.position.array;
      for (let i = 0; i < this.eData.length; i++) {
        const d = this.eData[i];
        const ang = t * d.speed + d.phase;
        pos[i * 3]     = Math.cos(ang) * d.radius;
        pos[i * 3 + 1] = d.yOff + Math.sin(ang * d.tilt) * 2;
        pos[i * 3 + 2] = Math.sin(ang) * d.radius;
      }
      this.electrons.geometry.attributes.position.needsUpdate = true;
    },
  };
}

// ============================================================
// Build the 3D periodic table
// ============================================================
function buildTable() {
  elementGroup = new THREE.Group();
  scene.add(elementGroup);

  const geom = new THREE.BoxGeometry(CELL, CELL_HEIGHT, CELL);

  LAYOUT.forEach((entry) => {
    const color = getCatColor(entry.el.cat);
    const mats = makeElementMaterials(entry.el, color, state.theme);
    const mesh = new THREE.Mesh(geom, mats);
    mesh.position.set(entry.x, entry.y, entry.z);
    mesh.userData = { el: entry.el, baseY: entry.y, color };
    elementGroup.add(mesh);
    elementMeshes.push({ mesh, layout: entry, basePos: mesh.position.clone(), color, el: entry.el });
  });

  // F-block label plates
  F_BLOCK_LABELS.forEach((label) => {
    const w = CELL * label.span + (CELL_PITCH - CELL) * (label.span - 1);
    const labelGeo = new THREE.BoxGeometry(w, 0.15, CELL);
    const labelCanvas = makeLabelCanvas(label.text);
    const tex = new THREE.CanvasTexture(labelCanvas);
    tex.anisotropy = 8;
    const labelMat = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      roughness: 0.6,
      metalness: 0.2,
      opacity: 0.85,
    });
    const sideMat = new THREE.MeshStandardMaterial({
      color: 0x222a4a,
      roughness: 0.6,
      metalness: 0.2,
    });
    // top face gets the texture, sides dark
    const mesh = new THREE.Mesh(labelGeo, [sideMat, sideMat, labelMat, sideMat, sideMat, sideMat]);
    mesh.position.set(
      GRID_OFFSET_X + (label.col + (label.span - 1) / 2) * CELL_PITCH,
      0.08,
      GRID_OFFSET_Z + label.row * CELL_PITCH
    );
    elementGroup.add(mesh);
  });

  // Entrance animation: rise from below with stagger
  if (!state.reducedMotion) {
    elementMeshes.forEach((e, i) => {
      e.mesh.position.y = e.basePos.y - 12;
      e.mesh.scale.setScalar(0.01);
      const delay = i * 0.012;
      const start = performance.now() / 1000 + delay;
      e._entrance = { start, dur: 0.7 };
    });
  }
}

function makeLabelCanvas(text) {
  const S = 512;
  const canvas = document.createElement("canvas");
  canvas.width = S * 2; // wider for span
  canvas.height = S;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(0,0,0,0)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // border
  ctx.strokeStyle = "rgba(120,140,220,0.4)";
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  // text
  const lines = text.split("\n");
  ctx.fillStyle = "#98a0c8";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 60px 'Roboto Mono', monospace";
  lines.forEach((line, i) => {
    ctx.fillText(line, canvas.width / 2, canvas.height / 2 + (i - (lines.length - 1) / 2) * 80);
  });
  return canvas;
}

// ============================================================
// Theme application (fog color, electron colors, etc.)
// ============================================================
function applyThemeToScene(themeId) {
  clearTextureCache();

  // Read CSS variables to drive scene background colors
  const cs = getComputedStyle(document.body);
  const bg0 = cs.getPropertyValue("--bg-0").trim() || "#05060f";
  const accent = cs.getPropertyValue("--accent").trim() || "#00e5ff";
  const accent2 = cs.getPropertyValue("--accent-2").trim() || "#b46bff";
  const accent3 = cs.getPropertyValue("--accent-3").trim() || "#ff5e9c";

  scene.fog.color = new THREE.Color(bg0);
  renderer.setClearColor(bg0, 0);

  if (background) {
    background.rings[0].material.color.set(accent);
    background.rings[1].material.color.set(accent2);
    background.rings[2].material.color.set(accent3);
  }

  refreshElementColors();
}

// Refresh all element materials (called on theme/color change)
function refreshElementColors() {
  elementMeshes.forEach((e) => {
    const color = getCatColor(e.el.cat);
    e.color = color;
    // dispose old materials
    e.mesh.material.forEach((m) => m.dispose());
    e.mesh.material = makeElementMaterials(e.el, color, state.theme);
    e.mesh.userData.color = color;
  });
}

// ============================================================
// Filters — dim/fade non-matching, highlight matching
// ============================================================
function updateFilterState() {
  const hasFilter = state.activeCats.size > 0 || state.searchQuery;
  elementMeshes.forEach((e) => {
    const visible = isVisibleCompat(e.el);
    e._active = hasFilter && visible;
    e._dimmed = hasFilter && !visible;
  });
  // update count
  const visCount = elementMeshes.filter((e) => isVisibleCompat(e.el)).length;
  const countEl = document.getElementById("visible-count");
  if (countEl) countEl.textContent = visCount;
}

// local wrappers to avoid circular import (state.isVisible uses state.searchQuery)
function isVisibleCompat(el) {
  return stateSearchMatch(el) && stateCatMatch(el);
}
function isHighlightedCompat(el) {
  return state.activeCats.size > 0 && state.activeCats.has(el.cat);
}
function stateSearchMatch(el) {
  if (!state.searchQuery) return true;
  const q = state.searchQuery;
  return el.name.toLowerCase().includes(q) ||
         el.sym.toLowerCase().includes(q) ||
         String(el.n) === q;
}
function stateCatMatch(el) {
  if (state.activeCats.size === 0) return true;
  return state.activeCats.has(el.cat);
}

// ============================================================
// Pointer / hover / click
// ============================================================
function onPointerMove(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
}

function onPointerDown(e) {
  // ignore if drag starts (we'll check on pointerup if it was a click)
  pointerDownPos = { x: e.clientX, y: e.clientY };
}
let pointerDownPos = null;

// We detect click via pointerup-with-small-movement
export function setupClickDetection() {
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!pointerDownPos) return;
    const dx = e.clientX - pointerDownPos.x;
    const dy = e.clientY - pointerDownPos.y;
    pointerDownPos = null;
    if (Math.sqrt(dx * dx + dy * dy) > 6) return; // it was a drag

    // If a detail panel is open, ignore canvas clicks (let backdrop handle close)
    if (selectedMesh) return;

    updateRaycast();
    if (hoveredMesh) {
      selectElement(hoveredMesh);
    }
  });
}

function updateRaycast() {
  raycaster.setFromCamera(pointer, camera);
  const meshes = elementMeshes.map((e) => e.mesh);
  const intersects = raycaster.intersectObjects(meshes, false);

  const newHover = intersects.length > 0 ? intersects[0].object : null;

  if (newHover !== hoveredMesh) {
    if (hoveredMesh) unhighlight(hoveredMesh);
    hoveredMesh = newHover;
    if (hoveredMesh) highlight(hoveredMesh);
    renderer.domElement.classList.toggle("pointing", !!hoveredMesh);
  }
}

function highlight(mesh) {
  mesh.userData._hover = true;
}
function unhighlight(mesh) {
  mesh.userData._hover = false;
}

// ============================================================
// Select element — camera dives to the cube
// ============================================================
function selectElement(mesh) {
  if (selectedMesh) return; // one at a time
  selectedMesh = mesh;
  const el = mesh.userData.el;

  // Disable controls during dive
  controls.enabled = false;

  // Compute target camera position: in front of the cube, looking at it
  const cubePos = mesh.position.clone();
  // approach from current camera direction (in the XZ plane, slightly above)
  const dir = new THREE.Vector3().subVectors(camera.position, cubePos).normalize();
  // but bias toward a nice viewing angle
  const idealDir = new THREE.Vector3(dir.x, 0.6, dir.z).normalize();
  const camTarget = cubePos.clone().add(idealDir.multiplyScalar(FOCUS_DISTANCE));

  diveAnim = {
    fromPos: camera.position.clone(),
    toPos: camTarget,
    fromTarget: controls.target.clone(),
    toTarget: cubePos.clone(),
    t: 0,
    dur: state.reducedMotion ? 0.1 : 1.1,
    mesh,
  };

  // Let the rest of the app know (UI panel will open at the end of the dive)
  setTimeout(() => emit("select", el), state.reducedMotion ? 100 : 850);
}

function deselectElement() {
  if (!selectedMesh) return;
  const mesh = selectedMesh;
  selectedMesh = null;

  // Animate camera back to default
  diveAnim = {
    fromPos: camera.position.clone(),
    toPos: DEFAULT_CAM_POS.clone(),
    fromTarget: controls.target.clone(),
    toTarget: DEFAULT_CAM_TARGET.clone(),
    t: 0,
    dur: state.reducedMotion ? 0.1 : 0.9,
    mesh: null,
    returning: true,
  };
  emit("deselect-done", null);
}

// expose for main
export function deselectFromUI() {
  deselectElement();
}

// ============================================================
// Animation loop
// ============================================================
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.getElapsedTime();

  // Background
  background.update(t, dt);

  // Element entrance + idle/hover/filter animations
  elementMeshes.forEach((e) => {
    // ----- Entrance: rise from below with stagger -----
    if (e._entrance) {
      const elapsed = t - e._entrance.start;
      if (elapsed >= 0) {
        const p = Math.min(1, elapsed / e._entrance.dur);
        const eased = easeOutBack(p);
        e.mesh.position.y = e.basePos.y - 12 * (1 - eased);
        e.mesh.scale.setScalar(0.01 + 0.99 * eased);
        if (p >= 1) {
          e.mesh.position.y = e.basePos.y;
          e.mesh.scale.setScalar(1);
          delete e._entrance;
        }
      }
      return; // don't run other anims during entrance
    }

    // ----- Target states from filters -----
    const isHover = !!e.mesh.userData._hover && e.mesh !== selectedMesh;
    const isSelected = e.mesh === selectedMesh;

    // Smooth scale — dimmed elements shrink, active elements grow slightly
    const wantScale = e._dimmed ? 0.85 : (e._active ? 1.05 : 1);
    const curScale = e.mesh.scale.x;
    e.mesh.scale.setScalar(curScale + (wantScale - curScale) * Math.min(1, dt * 6));

    // Compute target Y: idle float, active raise, hover lift, selected lift
    const idleFloat = Math.sin(t * 0.8 + e.layout.col * 0.5 + e.layout.row * 0.3) * 0.04;
    let targetY = e.basePos.y + idleFloat;
    if (e._active) targetY = e.basePos.y + 0.8 + idleFloat;
    if (isHover) targetY = Math.max(targetY, e.basePos.y + 0.45);
    if (isSelected) targetY = e.basePos.y + 1.0;
    e.mesh.position.y += (targetY - e.mesh.position.y) * Math.min(1, dt * 8);

    // Emissive: active elements bright + pulse, dimmed elements very dark
    let boost = 0.12;
    if (e._dimmed) boost = 0.01;
    if (e._active) boost = 0.5 + Math.sin(t * 4 + e.layout.col) * 0.15;
    if (isHover) boost = Math.max(boost, 0.55);
    if (isSelected) boost = 0.85 + Math.sin(t * 3) * 0.1;

    // top face
    const topMat = e.mesh.material[2];
    if (topMat && topMat.emissiveIntensity !== undefined) {
      topMat.emissiveIntensity += (boost - topMat.emissiveIntensity) * Math.min(1, dt * 6);
    }
    // side faces
    const sideTarget = e._dimmed ? 0.005 : (e._active ? 0.15 : 0.06);
    [0, 1, 4, 5].forEach((idx) => {
      const m = e.mesh.material[idx];
      if (m && m.emissiveIntensity !== undefined) {
        m.emissiveIntensity += (sideTarget - m.emissiveIntensity) * Math.min(1, dt * 6);
      }
    });
  });

  // Hover detection (only when not diving and no selection)
  if (!selectedMesh && !diveAnim) {
    updateRaycast();
  }

  // Camera dive animation
  if (diveAnim) {
    diveAnim.t += dt;
    const p = Math.min(1, diveAnim.t / diveAnim.dur);
    const eased = easeInOutCubic(p);
    camera.position.lerpVectors(diveAnim.fromPos, diveAnim.toPos, eased);
    controls.target.lerpVectors(diveAnim.fromTarget, diveAnim.toTarget, eased);
    if (p >= 1) {
      if (diveAnim.returning) {
        controls.enabled = true;
      }
      diveAnim = null;
    }
  }

  controls.update();
  renderer.render(scene, camera);
}

// ============================================================
// Easing
// ============================================================
function easeOutBack(x) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
function easeInOutCubic(x) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

// ============================================================
// Resize
// ============================================================
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
