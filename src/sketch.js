// ================================
// sketch.js — refactored
// The full sketch in a single file is stored locally at backups/combined.js
// This is version 0.0.2 of a simulation of 'use'.
// It uses a combination of local Reynolds steering behaviours
// and global pathfinding along a voronoi tessellation of walkable areas
// to simulate how many users might share a space.
// Author: Kartikeya Date
// Last Updated: August 26, 2025
//
// ================================
// Global variables for the main sketch.js file
let img, locations
let peopleManager
let spaceManager
let coordsPara, frPara
let maxAgents = 40
let tempwp = null
let makingwp = false
let diagnosticGrid
let running = true
let stopButton

let personCountP
let busynessSlider
let currentSpawnRateP
let showHeatMap = true
let heatMapCheckBox

// --------------------
// p5 lifecycle
// --------------------
function preload () {
  img = loadImage('resources/plan_alt_1.png')
  locations = loadJSON('resources/location_map.json')
}

function setup () {
  pixelDensity(1)
  let canvas = createCanvas(img.width, img.height)
  canvas.position(20, 20)

  // /* uncomment this for part 5 of the howto.

  let setupBtn = createButton('Setup')
  setupBtn.position(width - 110, img.height + 25)
  setupBtn.mousePressed(() => setMode(SETUP))

  let simulateBtn = createButton('Simulate')
  simulateBtn.position(width - 50, img.height + 25)
  simulateBtn.mousePressed(() => setMode(SIMULATE))

  stopButton = createButton('Pause Simulation')
  stopButton.position(width / 3, img.height + 25)
  stopButton.mousePressed(() => {
    toggleSimulation()
  })

  // uncomment this for part 5 of the howto */

  coordsPara = createP(`Mouse is at (0,0)`)
  coordsPara.position(20, img.height + 20)
  frPara = createP('Frame rate is 0')
  frPara.position(20, img.height + 40)

  // /*uncomment this for part 5 of the howto
  heatMapCheckBox = createCheckbox('Show Heatmap', true)
  heatMapCheckBox.position(width / 2, img.height + 20)
  heatMapCheckBox.changed(() => {
    showHeatMap = heatMapCheckBox.checked()
  })

  spaceManager = new SpaceManager(img, locations, k)
  peopleManager = new PeopleManager(spaceManager)

  personCountP = createP(`Total persons: 0`)
  personCountP.position(20, img.height + 60)

  currentSpawnRateP = createP('Arrivals/min (derived): 0')
  currentSpawnRateP.position(20, img.height + 80)

  busynessSlider = createSlider(0.5, 2.0, 1.0, 0.01)
  busynessSlider.position(width - 350, img.height + 25)
  busynessSlider.style('width', '200px')

  spaceManager.setupEnvironment()
  peopleManager.initAgents(5)

  diagnosticGrid = new Grid(pixelsPerMeter)

  setMode(SETUP)

  // uncomment this for part 5 of the howto */
}

function draw () {
  background(255)

  push()
  translate(panX, panY)
  scale(zoom)
  image(img, 0, 0)

  // /* uncomment this for part 5 of the howto.
  diagnosticGrid.update(peopleManager.persons)
  if (showHeatMap) {
    diagnosticGrid.showDensities()
  }

  if (currentMode === SIMULATE) {
    if (running) {
      peopleManager.run()
    }

    peopleManager.show()
  } else if (currentMode === SETUP) {
    spaceManager.showWaypoints()
  }
  pop()

  // uncomment this for part 5 of the howto. */

  coordsPara.html(`Mouse is at (` + mouseX + `, ` + mouseY + `)`)
  frPara.html('Frame rate is ' + frameRate().toFixed(1) + ' frames per second')

  // /* uncomment this for part 5 of the howto
  personCountP.html(`Total persons: ${peopleManager.persons.length}`)

  // Show derived arrivals per minute (at current busyness)
  const baseLambda = peopleManager.deriveSpawnRate()
  const busy = busynessSlider?.value ? busynessSlider.value() : 1.0
  const arrivalsPerMin = baseLambda * busy * 60
  currentSpawnRateP.html(
    `Arrivals/min (derived): ${arrivalsPerMin.toFixed(
      2
    )} — Busyness ×${busy.toFixed(2)}`
  )
  // uncomment this for part 5 of the howto */
}

function toggleSimulation () {
  if (running) {
    console.log('Simulation paused.')
    noLoop()
    stopButton.html('Resume Simulation')
  } else {
    console.log('Simulation resumed.')
    loop()
    stopButton.html('Pause Simulation')
  }
  running = !running
}
