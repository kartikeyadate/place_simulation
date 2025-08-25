//Variable to manage zoom and pan;
let panX = 0
let panY = 0
let zoom = 1.0
let isDragging = false

function setMode (mode) {
  currentMode = mode
  console.log(`Switched to ${currentMode} mode.`)
  if (currentMode === SIMULATE) {
    peopleManager.recalculateAllPaths()
  }
}

function mousePressed () {
  isDragging = true
}

function mouseReleased () {
  isDragging = false
}

function mouseDragged () {
  if (isDragging) {
    let dx = mouseX - pmouseX
    let dy = mouseY - pmouseY
    panX += dx
    panY += dy
  }
}

function keyPressed () {
  if (key === '+' || key === '=') {
    zoom *= 1.05
  } else if (key === '-' || key === '_') {
    zoom /= 1.05
  } else if (key === 'r' || key === 'R') {
    resetView()
  }
}

function resetView () {
  panX = 0
  panY = 0
  zoom = 1.0
}
