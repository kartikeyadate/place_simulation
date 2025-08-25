const SETUP = 'setup'
const SIMULATE = 'simulate'
let currentMode = SIMULATE
const k = 16 // the desired number of waypoints

const pixelsPerMeter = 20
const minShoulderCm = 40
const maxShoulderCm = 50
const minSpeedCmS = 65
const maxSpeedCmS = 85
