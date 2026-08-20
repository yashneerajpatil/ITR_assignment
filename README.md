# 3D Rigid Body Rotation Visualizer

## Project

An interactive 3D visualization tool for understanding rigid-body orientation
and rotation matrices, built with HTML, CSS, JavaScript, and Three.js.

## Objective

This project visualizes the orientation of a rigid body relative to a fixed
reference frame. A **reference frame** (fixed, representing the world/global
coordinate system) and a **body frame** (rotatable, representing the rigid
body) are rendered simultaneously in 3D. As the user adjusts Roll, Pitch, and
Yaw, the body frame rotates in real time, and the corresponding 3×3 rotation
matrix is calculated and displayed live, using the same computation that
drives the 3D visualization.

## Features

- Fixed reference frame (X, Y, Z) that never moves
- Rotatable body frame (X_B, Y_B, Z_B) driven directly by the computed rotation matrix
- Roll (φ), Pitch (θ), and Yaw (ψ) sliders **and** paired numeric input boxes
  — drag the slider or type an exact angle directly, both stay in sync
- Auto Roll — a toggle that continuously spins Roll (φ) at an adjustable
  speed (°/s); dragging the Roll slider or typing a Roll value hands control
  back to manual immediately
- Real-time 3×3 rotation matrix display (updates on every slider/typed-value change)
- ZYX Euler-angle rotation convention: `R = Rz(ψ) · Ry(θ) · Rx(φ)`
- Reset button that returns the system to the identity rotation and turns off Auto Roll
- Interactive 3D camera (orbit, zoom, pan) that does **not** affect the
  rotation of either coordinate frame
- Responsive layout — the control panel stacks below the 3D view on
  narrow/mobile screens
- Legend and on-canvas HUD showing current angle values, frame status, and Auto Roll state

## Mathematics

### Elementary rotation matrices

**Roll — rotation about X by φ:**

```
Rx(φ) = | 1      0        0     |
        | 0   cos(φ)  -sin(φ)   |
        | 0   sin(φ)   cos(φ)   |
```

**Pitch — rotation about Y by θ:**

```
Ry(θ) = |  cos(θ)   0   sin(θ) |
        |    0      1     0    |
        | -sin(θ)   0   cos(θ) |
```

**Yaw — rotation about Z by ψ:**

```
Rz(ψ) = | cos(ψ)  -sin(ψ)   0 |
        | sin(ψ)   cos(ψ)   0 |
        |   0        0      1 |
```

### Combined rotation

```
R = Rz(ψ) · Ry(θ) · Rx(φ)
```

This matrix is recalculated from scratch on every slider input (never
hard-coded), and the exact same matrix is used to orient the body frame in
the 3D scene — the numeric display and the visualization are always in sync.

### Angle ranges

| Angle          | Symbol | Axis | Range         |
|----------------|:------:|:----:|:-------------:|
| Roll           | φ      | X    | −180° to 180° |
| Pitch          | θ      | Y    | −90° to 90°   |
| Yaw            | ψ      | Z    | −180° to 180° |

## How to Run

### Option 1 — Open directly

Because this project loads Three.js from a CDN via an ES module import map,
simply opening `index.html` directly in most modern browsers will work,
**provided you have an internet connection** (required to fetch the Three.js
module and the Google Fonts stylesheet).

### Option 2 — Local server (recommended)

Some browsers restrict ES module imports (`type="module"`) when a page is
opened via the `file://` protocol. If `index.html` appears blank or the
console shows a module-loading error, serve the folder with a simple local
server instead:

```bash
# Python 3
python -m http.server 8000

# or, if you have Node.js installed
npx serve .
```

Then open `http://localhost:8000` (or the port shown) in your browser.

## Project Structure

```
rigid-body-rotation-visualizer/
│
├── index.html   — page structure, layout, slider/matrix markup
├── style.css    — dark engineering/HUD visual theme, responsive layout
├── script.js    — Three.js scene, rotation math, live sync logic
└── README.md    — this file
```

## Code Organization

`script.js` is organized into focused functions:

- `createScene()` — sets up the Three.js scene, camera, renderer, lighting
- `createReferenceFrame()` — builds the fixed world-frame axes
- `createBodyFrame()` — builds the rotatable body-frame axes
- `createControls()` — sets up OrbitControls for camera navigation
- `rotationMatrixX()`, `rotationMatrixY()`, `rotationMatrixZ()` — elementary rotation matrices
- `multiplyMatrices()` — 3×3 matrix multiplication
- `updateRotation()` — reads slider state, computes R, applies it to the body frame, refreshes UI
- `updateMatrixDisplay()` — renders the 3×3 matrix panel
- `resetRotation()` — restores identity rotation
- `animate()` — the render loop

## Notes

- No physics, forces, torques, mass/inertia, or collision detection are
  included — this project is strictly a rotation/orientation visualizer.
- Tested against the standard ZYX Euler-angle identities for 90° single-axis
  rotations about each of Roll, Pitch, and Yaw.
- Typed values are clamped to each angle's valid range (Roll/Yaw: ±180°,
  Pitch: ±90°) and normalized to one decimal place on blur or Enter.
- Auto Roll wraps smoothly from 180° to −180° (and vice versa) rather than
  clamping or stalling at the slider's endpoint, using frame-delta timing so
  the spin speed is consistent across different refresh rates.
