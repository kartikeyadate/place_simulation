// ================================
// sketch.js — refactored
// The full sketch in a single file is stored locally at backups/combined.js
// This is version 0.0.1 of a simulation of 'use'.
// It uses a combination of local Reynolds steering behaviours
// and global pathfinding along a voronoi tessellation of walkable areas
// to simulate how many users might share a space.
// Author: Kartikeya Date
// Last Updated: August 25, 2025
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

let personCountP
let spawnRateSlider
let currentSpawnRateP
let showHeatMap = true
let heatMapCheckBox

// --------------------
// p5 lifecycle
// --------------------
function preload () {
  img = loadImage('resources/plan_alt.png')
  locations = loadJSON('resources/location_map.json')
}

function setup () {
  pixelDensity(1)
  let canvas = createCanvas(img.width, img.height)
  canvas.position(20, 20)

  let setupBtn = createButton('Setup')
  setupBtn.position(width - 110, img.height + 25)
  setupBtn.mousePressed(() => setMode(SETUP))

  let simulateBtn = createButton('Simulate')
  simulateBtn.position(width - 50, img.height + 25)
  simulateBtn.mousePressed(() => setMode(SIMULATE))

  coordsPara = createP(`Mouse is at (0,0)`)
  coordsPara.position(20, img.height + 20)
  frPara = createP('Frame rate is 0')
  frPara.position(20, img.height + 40)

  heatMapCheckBox = createCheckbox('Show Heatmap', true)
  heatMapCheckBox.position(width / 2, img.height + 20)
  heatMapCheckBox.changed(() => {
    showHeatMap = heatMapCheckBox.checked()
  })

  spaceManager = new SpaceManager(img, locations, k)
  peopleManager = new PeopleManager(spaceManager)

  personCountP = createP(`Total persons: 0`)
  personCountP.position(20, img.height + 60)

  currentSpawnRateP = createP('Current spawn rate: 0')
  currentSpawnRateP.position(20, img.height + 80)

  spawnRateSlider = createSlider(1, 500, 50, 1)
  spawnRateSlider.position(width - 350, img.height + 25)
  spawnRateSlider.style('width', '200px')

  spaceManager.setupEnvironment()
  peopleManager.initAgents(5)

  diagnosticGrid = new Grid(pixelsPerMeter)

  setMode(SETUP)
}

function draw () {
  background(255)

  push()
  translate(panX, panY)
  scale(zoom)
  image(img, 0, 0)
  diagnosticGrid.update(peopleManager.persons)
  if (showHeatMap) {
    diagnosticGrid.showDensities()
  }

  if (currentMode === SIMULATE) {
    peopleManager.run()
    peopleManager.show()
  } else if (currentMode === SETUP) {
    spaceManager.showWaypoints()
  }
  pop()

  coordsPara.html(`Mouse is at (` + mouseX + `, ` + mouseY + `)`)
  frPara.html('Frame rate is ' + frameRate().toFixed(1) + ' frames per second')
  personCountP.html(`Total persons: ${peopleManager.persons.length}`)
  currentSpawnRateP.html(
    `Current spawn rate: One person every ${spawnRateSlider.value()} frames`
  )
}
