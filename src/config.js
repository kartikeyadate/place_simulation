const SETUP = 'setup'
const SIMULATE = 'simulate'
let currentMode = SIMULATE
const k = 22 // the desired number of waypoints

const FPS = 60

const pixelsPerMeter = 20
const minShoulderCm = 40
const maxShoulderCm = 50
const minSpeedCmS = 65
const maxSpeedCmS = 85
