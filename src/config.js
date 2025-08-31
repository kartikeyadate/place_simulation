const SETUP = 'setup'
const SIMULATE = 'simulate'
let currentMode = SIMULATE
const k = 36 // the desired number of waypoints
const WALKABILITY_THRESHOLD = 183

//scaling pixel <-> m, and frame <-> second
const FPS = 20
const pixelsPerMeter = 20

// --- Helpers ---
function speedToPxPerFrame (v_mps) {
  return (v_mps * pixelsPerMeter) / FPS
}

function accelToPxPerFrame2 (a_mps2) {
  return (a_mps2 * pixelsPerMeter) / (FPS * FPS)
}

function distToPixels (d_m) {
  return d_m * pixelsPerMeter
}

function createIdCounter (start = 0) {
  let id = start
  return function () {
    return id++
  }
}

// --- Unit helpers ---
function cmToMeters (cm) {
  return cm / 100
}

function cmpsToMps (cmps) {
  return cmps / 100
}

const nextPersonId = createIdCounter(0)

const minShoulderCm = 40
const maxShoulderCm = 50
const minSpeedCmS = 65
const maxSpeedCmS = 85
