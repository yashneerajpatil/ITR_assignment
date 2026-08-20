/* ============================================================
   3D Rigid Body Rotation Visualizer
   ------------------------------------------------------------
   Visualizes a fixed reference frame and a rotatable body frame
   using the ZYX Euler-angle convention:

       R = Rz(psi) * Ry(theta) * Rx(phi)

   phi   (roll)  -> rotation about X
   theta (pitch) -> rotation about Y
   psi   (yaw)   -> rotation about Z

   The same 3x3 matrix that is displayed numerically is the exact
   matrix used to orient the 3D body frame — there is no separate
   or independent rotation logic driving the visualization.
   ============================================================ */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/* ---------------------------------------------------------------
   Module-level state
--------------------------------------------------------------- */

let scene, camera, renderer, controls;
let referenceFrameGroup, bodyFrameGroup;
let container;

const AXIS_LENGTH = 2.4;

// Colors for reference frame (muted / desaturated -> "fixed")
const REF_COLORS = {
  x: 0xc96b6b,
  y: 0x6fb583,
  z: 0x6e93c9,
};

// Colors for body frame (vivid / saturated -> "rotatable")
const BODY_COLORS = {
  x: 0xff5069,
  y: 0x35e0a1,
  z: 0x43b6ff,
};

// Current slider state (degrees)
const state = {
  roll: 0,
  pitch: 0,
  yaw: 0,
};

// Auto Roll state — continuously spins Roll (phi) at a fixed speed (deg/sec)
// until toggled off or the user manually edits Roll.
const autoRoll = {
  enabled: false,
  speedDegPerSec: 45,
};

const clock = new THREE.Clock();

/* ---------------------------------------------------------------
   Scene / renderer / camera setup
--------------------------------------------------------------- */

function createScene() {
  container = document.getElementById("canvas-container");

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0d12);

  const width = container.clientWidth;
  const height = container.clientHeight;

  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  camera.position.set(4.2, 3.4, 5.2);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  container.appendChild(renderer.domElement);

  // Soft ambient + directional light (mostly for grid/origin marker shading)
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.4);
  dirLight.position.set(3, 5, 2);
  scene.add(dirLight);

  // Subtle ground grid for spatial reference (does not rotate, purely cosmetic)
  const grid = new THREE.GridHelper(8, 16, 0x1c2330, 0x161c28);
  grid.position.y = -1.6;
  scene.add(grid);

  // Origin marker
  const originGeom = new THREE.SphereGeometry(0.05, 16, 16);
  const originMat = new THREE.MeshBasicMaterial({ color: 0xe7ecf3 });
  const originMesh = new THREE.Mesh(originGeom, originMat);
  scene.add(originMesh);

  createControls();
  createReferenceFrame();
  createBodyFrame();

  window.addEventListener("resize", onWindowResize);
}

/* ---------------------------------------------------------------
   Orbit camera controls (view only — never rotates the frames)
--------------------------------------------------------------- */

function createControls() {
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 2.5;
  controls.maxDistance = 14;
  controls.target.set(0, 0, 0);
}

/* ---------------------------------------------------------------
   Helper: build one labeled axis (arrow + text sprite)
--------------------------------------------------------------- */

function buildAxis(direction, color, length, labelText, opacity) {
  const group = new THREE.Group();

  const dir = direction.clone().normalize();
  const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(0, 0, 0), length, color, length * 0.16, length * 0.09);

  // Apply opacity to arrow line + cone materials for reference-frame styling
  arrow.line.material.transparent = true;
  arrow.line.material.opacity = opacity;
  arrow.line.material.linewidth = 2;
  arrow.cone.material.transparent = true;
  arrow.cone.material.opacity = opacity;

  group.add(arrow);

  const label = makeTextSprite(labelText, color);
  label.position.copy(dir.clone().multiplyScalar(length + 0.32));
  group.add(label);

  return group;
}

function makeTextSprite(text, colorHex) {
  const canvas = document.createElement("canvas");
  const size = 128;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  const cssColor = "#" + colorHex.toString(16).padStart(6, "0");
  ctx.font = "700 56px 'IBM Plex Mono', monospace";
  ctx.fillStyle = cssColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, size / 2, size / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.42, 0.42, 0.42);
  sprite.renderOrder = 999;
  return sprite;
}

/* ---------------------------------------------------------------
   Reference frame (fixed world frame — never rotates)
--------------------------------------------------------------- */

function createReferenceFrame() {
  referenceFrameGroup = new THREE.Group();
  referenceFrameGroup.name = "ReferenceFrame";

  referenceFrameGroup.add(buildAxis(new THREE.Vector3(1, 0, 0), REF_COLORS.x, AXIS_LENGTH, "X", 0.55));
  referenceFrameGroup.add(buildAxis(new THREE.Vector3(0, 1, 0), REF_COLORS.y, AXIS_LENGTH, "Y", 0.55));
  referenceFrameGroup.add(buildAxis(new THREE.Vector3(0, 0, 1), REF_COLORS.z, AXIS_LENGTH, "Z", 0.55));

  scene.add(referenceFrameGroup);
}

/* ---------------------------------------------------------------
   Body frame (rotates according to the computed rotation matrix R)
--------------------------------------------------------------- */

function createBodyFrame() {
  bodyFrameGroup = new THREE.Group();
  bodyFrameGroup.name = "BodyFrame";
  // Rotation is applied manually via a Matrix4 built from R (see updateRotation),
  // so automatic matrix recomposition from position/quaternion/scale is disabled.
  bodyFrameGroup.matrixAutoUpdate = false;

  bodyFrameGroup.add(buildAxis(new THREE.Vector3(1, 0, 0), BODY_COLORS.x, AXIS_LENGTH * 0.82, "Xb", 1.0));
  bodyFrameGroup.add(buildAxis(new THREE.Vector3(0, 1, 0), BODY_COLORS.y, AXIS_LENGTH * 0.82, "Yb", 1.0));
  bodyFrameGroup.add(buildAxis(new THREE.Vector3(0, 0, 1), BODY_COLORS.z, AXIS_LENGTH * 0.82, "Zb", 1.0));

  bodyFrameGroup.matrix.identity();

  scene.add(bodyFrameGroup);
}

/* ---------------------------------------------------------------
   Elementary rotation matrices (3x3, row-major arrays of arrays)
--------------------------------------------------------------- */

function rotationMatrixX(phiRad) {
  const c = Math.cos(phiRad);
  const s = Math.sin(phiRad);
  return [
    [1, 0, 0],
    [0, c, -s],
    [0, s, c],
  ];
}

function rotationMatrixY(thetaRad) {
  const c = Math.cos(thetaRad);
  const s = Math.sin(thetaRad);
  return [
    [c, 0, s],
    [0, 1, 0],
    [-s, 0, c],
  ];
}

function rotationMatrixZ(psiRad) {
  const c = Math.cos(psiRad);
  const s = Math.sin(psiRad);
  return [
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1],
  ];
}

/* ---------------------------------------------------------------
   3x3 matrix multiplication: A * B
--------------------------------------------------------------- */

function multiplyMatrices(A, B) {
  const result = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) {
        sum += A[i][k] * B[k][j];
      }
      result[i][j] = sum;
    }
  }
  return result;
}

/* ---------------------------------------------------------------
   Core update: read sliders -> compute R -> orient body frame
   -> refresh matrix display -> refresh numeric readouts
--------------------------------------------------------------- */

function updateRotation() {
  // 1-2. Read angles (degrees) and convert to radians
  const phi = THREE.MathUtils.degToRad(state.roll);
  const theta = THREE.MathUtils.degToRad(state.pitch);
  const psi = THREE.MathUtils.degToRad(state.yaw);

  // 3-5. Elementary rotation matrices
  const Rx = rotationMatrixX(phi);
  const Ry = rotationMatrixY(theta);
  const Rz = rotationMatrixZ(psi);

  // 6. Combined rotation matrix: R = Rz * Ry * Rx
  const Rzy = multiplyMatrices(Rz, Ry);
  const R = multiplyMatrices(Rzy, Rx);

  // 7. Apply R directly to the body frame's transform (same matrix, no
  //    independent visualization math — this is the single source of truth).
  const m = new THREE.Matrix4();
  // THREE.Matrix4.set() takes arguments in row-major order.
  m.set(
    R[0][0], R[0][1], R[0][2], 0,
    R[1][0], R[1][1], R[1][2], 0,
    R[2][0], R[2][1], R[2][2], 0,
    0, 0, 0, 1
  );
  bodyFrameGroup.matrix.copy(m);
  bodyFrameGroup.matrixWorldNeedsUpdate = true;

  // 8. Update the numerical matrix panel
  updateMatrixDisplay(R);

  // 9. Update the numeric angle readouts
  updateAngleReadouts();
}

/* ---------------------------------------------------------------
   Matrix panel rendering
--------------------------------------------------------------- */

function initMatrixGrid() {
  const grid = document.getElementById("matrix-grid");
  grid.innerHTML = "";
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement("div");
    cell.className = "matrix-cell";
    cell.id = `m-cell-${i}`;
    cell.textContent = "0.0000";
    grid.appendChild(cell);
  }
}

function updateMatrixDisplay(R) {
  let idx = 0;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const cell = document.getElementById(`m-cell-${idx}`);
      const value = R[i][j];
      // Normalize -0.0000 to 0.0000 for a clean display
      const display = (Math.abs(value) < 1e-4 ? 0 : value).toFixed(4);
      cell.textContent = display;
      idx++;
    }
  }
}

/* ---------------------------------------------------------------
   Angle readouts (slider labels + on-canvas HUD)
--------------------------------------------------------------- */

function updateAngleReadouts() {
  // On-canvas HUD
  document.getElementById("readout-roll").textContent = state.roll.toFixed(1) + "\u00B0";
  document.getElementById("readout-pitch").textContent = state.pitch.toFixed(1) + "\u00B0";
  document.getElementById("readout-yaw").textContent = state.yaw.toFixed(1) + "\u00B0";

  // Typed numeric inputs — only overwrite when the field isn't currently
  // focused, so we never fight the user while they're mid-keystroke.
  syncNumberInput("roll-number", state.roll);
  syncNumberInput("pitch-number", state.pitch);
  syncNumberInput("yaw-number", state.yaw);
}

function syncNumberInput(id, value) {
  const el = document.getElementById(id);
  if (document.activeElement === el) return;
  el.value = value.toFixed(1);
}

/* ---------------------------------------------------------------
   Reset
--------------------------------------------------------------- */

function resetRotation() {
  setAutoRoll(false);

  state.roll = 0;
  state.pitch = 0;
  state.yaw = 0;

  document.getElementById("roll-slider").value = 0;
  document.getElementById("pitch-slider").value = 0;
  document.getElementById("yaw-slider").value = 0;
  document.getElementById("roll-number").value = "0.0";
  document.getElementById("pitch-number").value = "0.0";
  document.getElementById("yaw-number").value = "0.0";

  updateRotation();
}

/* ---------------------------------------------------------------
   Slider + button wiring
--------------------------------------------------------------- */

function bindUI() {
  const rollSlider = document.getElementById("roll-slider");
  const pitchSlider = document.getElementById("pitch-slider");
  const yawSlider = document.getElementById("yaw-slider");
  const rollNumber = document.getElementById("roll-number");
  const pitchNumber = document.getElementById("pitch-number");
  const yawNumber = document.getElementById("yaw-number");
  const resetBtn = document.getElementById("reset-btn");
  const autoRollToggle = document.getElementById("auto-roll-toggle");
  const autoRollSpeed = document.getElementById("auto-roll-speed");

  // --- Sliders drive state directly ---

  rollSlider.addEventListener("input", (e) => {
    setAutoRoll(false); // manual drag takes back control from Auto Roll
    setAngle("roll", parseFloat(e.target.value));
  });

  pitchSlider.addEventListener("input", (e) => {
    setAngle("pitch", parseFloat(e.target.value));
  });

  yawSlider.addEventListener("input", (e) => {
    setAngle("yaw", parseFloat(e.target.value));
  });

  // --- Typed numeric inputs mirror the sliders ---

  bindNumberInput(rollNumber, rollSlider, "roll", true);
  bindNumberInput(pitchNumber, pitchSlider, "pitch", false);
  bindNumberInput(yawNumber, yawSlider, "yaw", false);

  // --- Reset ---

  resetBtn.addEventListener("click", resetRotation);

  // --- Auto Roll ---

  autoRollToggle.addEventListener("click", () => {
    setAutoRoll(!autoRoll.enabled);
  });

  autoRollSpeed.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    autoRoll.speedDegPerSec = isNaN(val) ? autoRoll.speedDegPerSec : val;
  });
}

/**
 * Sets an angle in state, keeps the matching slider + number input in sync,
 * and triggers a full rotation recompute.
 */
function setAngle(key, value) {
  const clamped = clampAngle(key, value);
  state[key] = clamped;
  document.getElementById(`${key}-slider`).value = clamped;
  updateRotation();
}

function clampAngle(key, value) {
  if (isNaN(value)) return state[key];
  const limits = { roll: 180, pitch: 90, yaw: 180 };
  const max = limits[key];
  return Math.max(-max, Math.min(max, value));
}

/**
 * Wires a typed <input type="number"> to mirror and drive a given slider.
 * `disablesAutoRoll` — for the Roll field, typing manually should hand
 * control back from Auto Roll, same as dragging the slider does.
 */
function bindNumberInput(numberEl, sliderEl, key, disablesAutoRoll) {
  numberEl.addEventListener("input", (e) => {
    if (disablesAutoRoll) setAutoRoll(false);
    const raw = e.target.value;
    if (raw === "" || raw === "-") return; // let the user keep typing
    setAngle(key, parseFloat(raw));
  });

  // On blur, normalize the displayed value (e.g. clamp + fixed decimals)
  numberEl.addEventListener("blur", () => {
    numberEl.value = state[key].toFixed(1);
  });

  numberEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") numberEl.blur();
  });
}

/**
 * Enables or disables Auto Roll, updating the toggle button's visual state
 * and the on-canvas HUD badge.
 */
function setAutoRoll(enabled) {
  autoRoll.enabled = enabled;

  const toggleBtn = document.getElementById("auto-roll-toggle");
  const badgeRow = document.getElementById("auto-roll-badge-row");

  toggleBtn.classList.toggle("active", enabled);
  toggleBtn.setAttribute("aria-pressed", String(enabled));
  badgeRow.hidden = !enabled;

  if (enabled) {
    clock.getDelta(); // discard elapsed idle time so roll doesn't jump on enable
  }
}

/* ---------------------------------------------------------------
   Resize handling
--------------------------------------------------------------- */

function onWindowResize() {
  const width = container.clientWidth;
  const height = container.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

/* ---------------------------------------------------------------
   Render loop
--------------------------------------------------------------- */

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  if (autoRoll.enabled) {
    let nextRoll = state.roll + autoRoll.speedDegPerSec * delta;
    // Wrap smoothly within the -180..180 range instead of clamping/stalling
    nextRoll = ((nextRoll + 180) % 360 + 360) % 360 - 180;
    state.roll = nextRoll;
    document.getElementById("roll-slider").value = nextRoll;
    updateRotation();
  }

  controls.update();
  renderer.render(scene, camera);
}

/* ---------------------------------------------------------------
   Boot
--------------------------------------------------------------- */

function init() {
  createScene();
  initMatrixGrid();
  bindUI();
  updateRotation(); // establishes identity matrix + initial HUD values
  animate();
}

init();
