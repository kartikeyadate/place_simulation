class SpaceManager {
  constructor (img, locationsData, k) {
    this.img = img
    this.locationsData = locationsData
    this.locationGrid = []
    this.walkableColors = []
    this.locationList = []
    this.locationGraph = new Graph()
    this.targetLocationList = []
    this.subGoalLocationList = []
    this.entryLocationList = [] // names (kept if you still want labels)
    this.walkableSet = []
    this.entryLocations = [] // Location objects
    this.subGoalLocations = []

    // Voronoi variables
    this.centroids = []
    this.k = k
    this.assignments = new Map()
    this.epsilon = 1
    this.colors = []
    this.count = 0
  }

  setupEnvironment () {
    this.img.loadPixels()
    this.locationGrid = Array(this.img.width)
      .fill(null)
      .map(() => Array(this.img.height).fill(null))

    this.walkableColors = this.locationsData.walkable || []
    for (let i = 0; i < this.img.width; i++) {
      for (let j = 0; j < this.img.height; j++) {
        let c = this.img.get(i, j)
        this.locationGrid[i][j] = c[0]
        if (this.walkableColors.includes(c[0].toString())) {
          this.walkableSet.push(createVector(i, j))
        }
      }
    }

    this.populate_entries_and_subgoals()
    this.voronoi_generate_waypoints()
    this.buildGraph()
  }

  populate_entries_and_subgoals () {
    const entryData = this.locationsData['entries']
    for (const entry of entryData) {
      const [key, val] = Object.entries(entry)[0]
      const [x, y, w, h] = val
      let name = key.split('_')[1]
      const entryLoc = new Location(name, key, 'pixel')
      entryLoc.populatePixelsbyDims(
        x,
        y,
        w,
        h,
        this.walkableColors,
        this.locationGrid
      )
      entryLoc.calculateCentroid()
      entryLoc.selectWeightedWaypoint()
      this.entryLocations.push(entryLoc)
      this.entryLocationList.push(entryLoc.name)
    }

    for (let key in this.locationsData) {
      if (key >= 105 && key <= 118) {
        let id = key
        let name = `loc_${key}`
        const subGoalLoc = new Location(name, id, 'pixel')
        subGoalLoc.populatePixels(this.locationGrid)
        subGoalLoc.calculateCentroid()
        subGoalLoc.selectWeightedWaypoint()
        this.subGoalLocations.push(subGoalLoc)
        this.subGoalLocationList.push(subGoalLoc.name)
        this.locationList.push(subGoalLoc)
        this.locationGraph.addNode(subGoalLoc)
        this.targetLocationList.push(subGoalLoc.name)
      }
    }
  }

  voronoi_generate_waypoints () {
    // 1. Initialize centroids randomly from the walkable set
    for (let i = 0; i < this.k; i++) {
      let randomPixel = random(this.walkableSet)
      this.centroids.push(randomPixel)
      this.colors.push(color(random(255), random(255), random(255)))
    }

    // 2. Main k-means loop
    while (true) {
      let changed = false
      let newAssignments = new Map()
      let sums = new Array(this.k)
        .fill(null)
        .map(() => ({ x: 0, y: 0, count: 0 }))

      for (let pixel of this.walkableSet) {
        let nearestCentroidIndex = -1
        let minDist = Infinity
        for (let i = 0; i < this.centroids.length; i++) {
          let d = p5.Vector.dist(pixel, this.centroids[i])
          if (d < minDist) {
            minDist = d
            nearestCentroidIndex = i
          }
        }
        newAssignments.set(pixel.toString(), nearestCentroidIndex)
        sums[nearestCentroidIndex].x += pixel.x
        sums[nearestCentroidIndex].y += pixel.y
        sums[nearestCentroidIndex].count++

        if (this.assignments.get(pixel.toString()) !== nearestCentroidIndex) {
          changed = true
        }
      }

      this.assignments = newAssignments

      let oldCentroids = this.centroids.map(c => c.copy())
      this.centroids = []

      for (let i = 0; i < this.k; i++) {
        if (sums[i].count > 0) {
          this.centroids.push(
            createVector(sums[i].x / sums[i].count, sums[i].y / sums[i].count)
          )
        } else {
          this.centroids.push(random(this.walkableSet))
        }
      }

      let totalCentroidMove = 0
      for (let i = 0; i < this.centroids.length; i++) {
        totalCentroidMove += p5.Vector.dist(this.centroids[i], oldCentroids[i])
      }

      if (
        totalCentroidMove / this.centroids.length < this.epsilon ||
        !changed
      ) {
        console.log(`Voronoi/K-Means converged after ${this.count} iterations.`)
        break
      }
      this.count++
      if (this.count > 100) {
        console.log('K-Means did not converge after 100 iterations. Breaking.')
        break
      }
    }

    // Convert centroids to waypoint Locations
    for (let i = 0; i < this.centroids.length; i++) {
      let locName = `voronoi_wp_${i}`
      let loc = new Location(locName, i, 'waypoint', this.centroids[i])
      this.locationList.push(loc)
      this.locationGraph.addNode(loc)
      this.targetLocationList.push(locName)
    }
  }

  buildGraph () {
    for (let i = 0; i < this.locationList.length; i++) {
      for (let j = i + 1; j < this.locationList.length; j++) {
        let a = this.locationList[i]
        let b = this.locationList[j]
        if (a.waypoint && b.waypoint) {
          if (this.visibilityTest(a.waypoint, b.waypoint)) {
            let d = p5.Vector.dist(a.waypoint, b.waypoint)
            this.locationGraph.addEdge(a.name, b.name, d)
          }
        }
      }
    }
  }

  showWaypoints () {
    // Draw edges
    for (let nodeName in this.locationGraph.edges) {
      let edges = this.locationGraph.edges[nodeName]
      let currentNode = this.locationGraph.nodes[nodeName]
      if (currentNode && currentNode.waypoint) {
        for (let edge of edges) {
          let neighborNode = this.locationGraph.nodes[edge.node]
          if (neighborNode && neighborNode.waypoint) {
            strokeWeight(1)
            stroke(255, 99, 71, 150)
            line(
              currentNode.waypoint.x,
              currentNode.waypoint.y,
              neighborNode.waypoint.x,
              neighborNode.waypoint.y
            )
          }
        }
      }
    }
    // Draw nodes
    for (let nodeName in this.locationGraph.nodes) {
      let loc = this.locationGraph.nodes[nodeName]
      if (loc && loc.waypoint) {
        noStroke()
        fill(255, 99, 71, 200)
        circle(loc.waypoint.x, loc.waypoint.y, 10)
      }
    }
  }

  findRandomWalkablePosition () {
    let attempts = 0
    while (attempts < 500) {
      let x = random(width)
      let y = random(height)
      if (!this.isObstacle(x, y)) {
        return createVector(x, y)
      }
      attempts++
    }
    console.error('Could not find a walkable position after 500 attempts.')
    return null
  }

  isObstacle (x, y) {
    let floor_x = floor(x)
    let floor_y = floor(y)

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        let check_x = floor_x + dx
        let check_y = floor_y + dy

        if (check_x >= 0 && check_x < this.locationGrid.length) {
          if (check_y >= 0 && check_y < this.locationGrid[check_x].length) {
            let colorValue = this.locationGrid[check_x][check_y]
            if (this.walkableColors.includes(colorValue.toString())) {
              return false
            }
          }
        }
      }
    }
    return true
  }

  visibilityTest (a, b) {
    // a, b are p5.Vector
    let steps = int(p5.Vector.dist(a, b))
    if (steps === 0) return true
    for (let i = 0; i <= steps; i++) {
      let t = i / steps
      let x = lerp(a.x, b.x, t)
      let y = lerp(a.y, b.y, t)
      if (this.isObstacle(x, y)) {
        return false
      }
    }
    return true
  }
}

class Location {
  constructor (name, id, type, waypoint = null) {
    this.name = name
    this.id = id
    this.type = type
    this.pixels = []
    this.waypoint = waypoint
    this.centroid = null
    this.pixelSet = {}
  }

  populatePixels (locationGrid) {
    if (this.type === 'pixel') {
      for (let i = 0; i < locationGrid.length; i++) {
        for (let j = 0; j < locationGrid[i].length; j++) {
          let col = locationGrid[i][j]
          if (this.id.toString() === col.toString()) {
            this.pixels.push(createVector(i, j))
          }
        }
      }
      this.pixelSet = new Set(this.pixels.map(p => `${p.x},${p.y}`))
    } else {
      this.pixelSet = {}
    }
  }

  populatePixelsbyDims (x, y, w, h, walkable, locGrid) {
    if (this.type === 'pixel') {
      for (let i = x; i < x + w; i++) {
        for (let j = y; j < y + h; j++) {
          let c = locGrid[i][j]
          if (walkable.includes(c.toString())) {
            this.pixels.push(createVector(i, j))
          }
        }
      }
      this.pixelSet = new Set(this.pixels.map(p => `${p.x},${p.y}`))
    }
  }

  calculateCentroid () {
    if (this.type === 'pixel' && this.pixels.length > 0) {
      let xSum = 0
      let ySum = 0
      for (let pixel of this.pixels) {
        xSum += pixel.x
        ySum += pixel.y
      }
      this.centroid = createVector(
        xSum / this.pixels.length,
        ySum / this.pixels.length
      )
    }
  }

  selectWaypoint () {
    if (this.type === 'pixel' && this.pixels.length > 0) {
      const randomPixel = random(this.pixels)
      this.waypoint = createVector(randomPixel.x, randomPixel.y)
    }
  }

  selectWeightedWaypoint () {
    if (this.type === 'pixel' && this.pixels.length > 0) {
      let sortedPixels = this.pixels.sort((a, b) => {
        let dA = p5.Vector.dist(a, this.centroid)
        let dB = p5.Vector.dist(b, this.centroid)
        return dA - dB
      })
      let randomIndex = floor(random() * random() * sortedPixels.length)
      let randomPixel = sortedPixels[randomIndex]
      this.waypoint = createVector(randomPixel.x, randomPixel.y)
    }
  }

  contains (pos) {
    if (this.type === 'pixel') {
      return this.pixelSet.has(`${floor(pos.x)},${floor(pos.y)}`)
    } else if (this.type === 'zone' && this.zoneCenter) {
      return p5.Vector.dist(pos, this.zoneCenter) <= this.zoneRadius
    }
    return false
  }
}
