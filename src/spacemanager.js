class SpaceManager {
  constructor (img, locationsData, k, qtcap) {
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
    this.qtcapacity = qtcap
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

    this.walkableColors = []
    for (let [key, cfg] of Object.entries(this.locationsData)) {
      // Numeric walkable zones
      if (/^\d+$/.test(key) && cfg && cfg.walkable === true) {
        this.walkableColors.push(key.toString())
      }
      // Entries should also be considered walkable
      if (key.startsWith('entry_') && cfg && cfg.walkable === true) {
        this.walkableColors.push(key.toString())
      }
    }

    for (let i = 0; i < this.img.width; i++) {
      for (let j = 0; j < this.img.height; j++) {
        let c = this.img.get(i, j)
        this.locationGrid[i][j] = c[0]
        if (this.walkableColors.includes(c[0].toString())) {
          this.walkableSet.push(createVector(i, j))
        }
      }
    }

    console.log(this.walkableSet.length)

    this.populate_entries_and_subgoals()
    this.loadCentroidsOrGenerate()
    //this.voronoi_generate_waypoints()
    this.buildGraph()
    this.makeQTree()
  }

  loadCentroidsOrGenerate () {
    if (preloadedCentroids) {
      if (Array.isArray(preloadedCentroids)) {
        this.centroids = preloadedCentroids.map(d => createVector(d.x, d.y))
        this.convertCentroidsIntoLocations()
        return
      } else if (
        typeof preloadedCentroids === 'object' &&
        preloadedCentroids !== null
      ) {
        this.centroids = Object.values(preloadedCentroids).map(d =>
          createVector(d.x, d.y)
        )
        this.convertCentroidsIntoLocations()
        return
      }
    }
    //not found → regenerate
    console.log(`No preloaded centroids for ${key}, generating fresh.`)
    randomSeed(SEED)
    this.voronoi_generate_waypoints()
    this.saveCentroids()
  }

  saveCentroids () {
    const fileName = getCentroidFileName()
    saveJSON(
      this.centroids.map(c => ({ x: c.x, y: c.y })),
      fileName
    )
    console.log(
      `Downloaded "${fileName}" → move it into /resources for next run.`
    )
  }

  populate_entries_and_subgoals () {
    // 1) Entries: keys that start with "entry_"
    for (const [key, cfg] of Object.entries(this.locationsData)) {
      if (key.startsWith('entry_') && cfg && Array.isArray(cfg.rect)) {
        const entryLoc = new Location(cfg.name || key, key, 'entry', cfg)
        entryLoc.populateFromRect(this.locationGrid, this.walkableColors)
        // pick a centroid-weighted waypoint within the rect
        entryLoc.calculateCentroid()
        entryLoc.selectWeightedWaypoint()
        this.entryLocations.push(entryLoc)
        this.entryLocationList.push(entryLoc.name)
        //this.locationGraph.addNode(entryLoc)
        this.locationList.push(entryLoc)
      }
    }

    // 2) Sub-goal locations: numeric keys in your chosen range (keep your 105..118 rule)
    for (const [key, cfg] of Object.entries(this.locationsData)) {
      if (/^\d+$/.test(key)) {
        const kNum = Number(key)
        if (kNum >= 105 && kNum <= 118) {
          const subGoalLoc = new Location(
            cfg.name || `loc_${key}`,
            key,
            'pixel',
            cfg
          )
          subGoalLoc.populatePixels(this.locationGrid)
          subGoalLoc.calculateCentroid()
          subGoalLoc.selectWeightedWaypoint()
          this.subGoalLocations.push(subGoalLoc)
          this.subGoalLocationList.push(subGoalLoc.name)
          this.locationList.push(subGoalLoc)
          //this.locationGraph.addNode(subGoalLoc)
          this.targetLocationList.push(subGoalLoc.name)
        }
      }
    }
  }

  voronoi_generate_waypoints () {
    //1. Initialize centroids. Favoring narrow corridors.
    // --- Step A: Scan walkable pixels for corridor candidates ---
    // --- Step A: Scan walkable pixels for corridor candidates ---
    let corridorScores = []
    const CLEARANCE_THRESHOLD = 60 // px (~3m)
    for (let pixel of this.walkableSet) {
      let minClear = Infinity
      let dirs = [
        createVector(1, 0),
        createVector(-1, 0),
        createVector(0, 1),
        createVector(0, -1)
      ]
      for (let d of dirs) {
        let dist = 0
        let x = pixel.x,
          y = pixel.y
        while (dist < CLEARANCE_THRESHOLD) {
          x += d.x
          y += d.y
          if (x < 0 || x >= this.img.width || y < 0 || y >= this.img.height)
            break
          if (this.isObstacle(x, y)) break
          dist++
        }
        minClear = Math.min(minClear, dist)
      }

      if (minClear < CLEARANCE_THRESHOLD / 2) {
        // Estimate corridor length in one axis (crude proxy)
        let extent = 0
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (abs(dx) + abs(dy) !== 1) continue // 4-neighbourhood only
            let steps = 0
            let x = pixel.x,
              y = pixel.y
            while (steps < 200) {
              // hard cap
              x += dx
              y += dy
              if (x < 0 || x >= this.img.width || y < 0 || y >= this.img.height)
                break
              if (this.isObstacle(x, y)) break
              steps++
            }
            extent = Math.max(extent, steps)
          }
        }

        // corridor score = (tightness factor) × (extent factor)
        let tightness = 1 / (1 + minClear) // smaller clearance → higher
        let score = tightness * extent
        corridorScores.push({ pixel, score })
      }
    }

    // --- Step B: Normalize scores into centroid quota ---
    let totalScore = corridorScores.reduce((sum, c) => sum + c.score, 0)
    let k_uniform = floor(this.k * 0.5)
    let k_corridor = this.k - k_uniform

    this.centroids = []
    this.colors = []

    // Uniform coverage
    for (let i = 0; i < k_uniform; i++) {
      let randomPixel = random(this.walkableSet)
      this.centroids.push(randomPixel)
      this.colors.push(color(random(255), random(255), random(255)))
    }

    // Corridor-biased coverage
    for (let i = 0; i < k_corridor; i++) {
      let r = random() * totalScore
      let accum = 0
      for (let c of corridorScores) {
        accum += c.score
        if (r <= accum) {
          this.centroids.push(c.pixel.copy())
          this.colors.push(color(random(255), random(255), random(255)))
          break
        }
      }
    }

    console.log(
      `Seeded ${k_uniform} uniform + ${k_corridor} corridor-biased centroids`
    )

    /*
    
    // 1. Initialize centroids randomly from the walkable set
    for (let i = 0; i < this.k; i++) {
      let randomPixel = random(this.walkableSet)
      this.centroids.push(randomPixel)
      this.colors.push(color(random(255), random(255), random(255)))
    }
      */

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
    this.convertCentroidsIntoLocations()
  }

  convertCentroidsIntoLocations () {
    for (let i = 0; i < this.centroids.length; i++) {
      let locName = `voronoi_wp_${i}`

      let cx = Math.round(this.centroids[i].x)
      let cy = Math.round(this.centroids[i].y)

      // Build a 9x9 patch around the centroid
      let patch = []
      for (let dx = -4; dx <= 4; dx++) {
        for (let dy = -4; dy <= 4; dy++) {
          let px = cx + dx
          let py = cy + dy
          if (
            px >= 0 &&
            px < this.locationGrid.length &&
            py >= 0 &&
            py < this.locationGrid[0].length
          ) {
            patch.push(createVector(px, py))
          }
        }
      }

      // Pick a valid walkable pixel from patch
      let valid = patch.filter(p => !this.isObstacle(p.x, p.y))
      let chosen = valid.length > 0 ? random(valid) : createVector(cx, cy)

      // Create Location with snapped waypoint
      let loc = new Location(locName, i, 'waypoint', null, chosen)
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
        if (
          this.locationGraph.isANode(a) &&
          this.locationGraph.isANode(b) &&
          a.waypoint &&
          b.waypoint
        ) {
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
            let isWalkable = this.walkableColors.includes(colorValue.toString())
            if (colorValue >= 200) {
              return true
            }
          }
        }
      }
    }
    return false // otherwise obstacle
  }

  visibilityTest (a, b) {
    let steps = p5.Vector.dist(a, b)
    let visib = true
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

  snapToNearestWalkable (position) {
    let nearest = null
    let bestDist = Infinity
    for (let p of this.walkableSet) {
      let d = p5.Vector.dist(position, p)
      if (d < bestDist) {
        bestDist = d
        nearest = p
      }
    }
    return nearest ? nearest.copy() : position
  }

  makeQTree () {
    this.qtboundary = new QtRt(0, 0, img.width, img.height)
    this.qt = new Quadtree(this.qtboundary, this.qtcapacity)
  }
}

class Location {
  constructor (name, id, type, config, waypoint = null) {
    this.name = name
    this.id = id
    this.type = type
    this.pixels = []
    this.waypoint = waypoint
    this.centroid = null
    this.pixelSet = {}
    if (config && config.traffic) {
      this.traffic = config.traffic
      this.wait = config.wait
    } else {
      this.traffic = 0
      this.wait = null
    }

    if (config && config.rect) {
      this.rect = config.rect
    }
  }

  populateFromRect (locationGrid, walkable) {
    if (this.type === 'entry' && this.rect) {
      const [x, y, w, h] = this.rect
      for (let i = x; i < x + w; i++) {
        for (let j = y; j < y + h; j++) {
          let c = locationGrid[i][j]
          this.pixels.push(createVector(i, j))
        }
      }
      this.pixelSet = new Set(this.pixels.map(p => `${p.x},${p.y}`))
    }
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
    if (
      (this.type === 'pixel' || this.type === 'entry') &&
      this.pixels.length > 0
    ) {
      // Arithmetic centroid
      let xSum = 0
      let ySum = 0
      for (let pixel of this.pixels) {
        xSum += pixel.x
        ySum += pixel.y
      }
      let cx = Math.round(xSum / this.pixels.length)
      let cy = Math.round(ySum / this.pixels.length)

      // Build a 9x9 patch around centroid
      let patch = []
      for (let dx = -4; dx <= 4; dx++) {
        for (let dy = -4; dy <= 4; dy++) {
          let px = cx + dx
          let py = cy + dy
          if (
            px >= 0 &&
            px < spaceManager.locationGrid.length &&
            py >= 0 &&
            py < spaceManager.locationGrid[0].length
          ) {
            patch.push(createVector(px, py))
          }
        }
      }

      // Pick a valid walkable pixel from patch
      let valid = patch.filter(p => !spaceManager.isObstacle(p.x, p.y))
      this.centroid = valid.length > 0 ? random(valid) : createVector(cx, cy)
    }
  }

  selectWaypoint () {
    if (this.type === 'pixel' && this.pixels.length > 0) {
      const randomPixel = random(this.pixels)
      this.waypoint = createVector(randomPixel.x, randomPixel.y)
    }
  }

  selectWeightedWaypoint () {
    if (
      (this.type === 'pixel' || this.type === 'entry') &&
      this.pixels.length > 0
    ) {
      // Sort pixels by closeness to centroid (as before)
      let sortedPixels = this.pixels.sort((a, b) => {
        let dA = p5.Vector.dist(a, this.centroid)
        let dB = p5.Vector.dist(b, this.centroid)
        return dA - dB
      })

      // Pick a biased pixel near centroid
      let randomIndex = floor(random() * random() * sortedPixels.length)
      let randomPixel = sortedPixels[randomIndex]

      // Build a 9x9 patch around that chosen pixel
      let cx = Math.round(randomPixel.x)
      let cy = Math.round(randomPixel.y)
      let patch = []
      for (let dx = -4; dx <= 4; dx++) {
        for (let dy = -4; dy <= 4; dy++) {
          let px = cx + dx
          let py = cy + dy
          if (
            px >= 0 &&
            px < spaceManager.locationGrid.length &&
            py >= 0 &&
            py < spaceManager.locationGrid[0].length
          ) {
            patch.push(createVector(px, py))
          }
        }
      }

      // Pick a valid walkable pixel from patch
      let valid = patch.filter(p => !spaceManager.isObstacle(p.x, p.y))
      let chosen = valid.length > 0 ? random(valid) : createVector(cx, cy)

      this.waypoint = chosen
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
