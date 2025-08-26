class PeopleManager {
  constructor (spaceManager) {
    this.spaceManager = spaceManager
    this.persons = []
    this.obstacles = []
    this.spawnRateLambda = 1 / 15
  }

  initAgents (num) {
    this.persons = []
    for (let i = 0; i < num; i++) {
      this.spawnPerson()
    }
  }

  resetAndInit (num) {
    this.persons = []
    this.obstacles = []
    this.initAgents(num)
  }

  run () {
    this.poissonSpawn()
    for (let i = this.persons.length - 1; i >= 0; i--) {
      this.persons[i].activity.run(this.obstacles)
      if (this.persons[i].activity.completed) {
        this.persons.splice(i, 1)
      }
    }
    this.obstacles = this.persons
  }

  show () {
    for (let person of this.persons) {
      person.show()
    }
  }

  poissonSpawn () {
    // base lambda from JSON demand (per second)
    const lambdaPerSecond = this.deriveSpawnRate()
    // scale by busyness slider (0.5x..2x)
    const busy = busynessSlider?.value ? busynessSlider.value() : 1.0
    const scaledSpawnRate = lambdaPerSecond * busy

    // Convert to per-frame probability (Poisson thinning):
    // p = 1 - exp(-lambda * dt), with dt = 1/FPS
    const pFrame = 1 - Math.exp(-scaledSpawnRate / FPS)

    if (random(1) < pFrame) {
      this.spawnPerson()
    }
  }

  spawnPerson () {
    // Weighted pick an entry by its "traffic" (if present), otherwise equal
    const entry = this.pickWeighted(this.spaceManager.entryLocations, loc =>
      typeof loc?.traffic === 'number' && loc.traffic > 0 ? loc.traffic : 1
    )

    if (!entry || !entry.pixels || entry.pixels.length === 0) return

    const spawnPos = random(entry.pixels)
    if (!spawnPos) return

    const activities = []
    let person = new Person(
      spawnPos.x,
      spawnPos.y,
      pixelsPerMeter,
      minShoulderCm,
      maxShoulderCm,
      minSpeedCmS,
      maxSpeedCmS
    )

    // Build an itinerary: random number of sub-goal visits, weighted by "traffic"
    const numStops = floor(random(3, 7))
    for (let c = 1; c < numStops - 1; c++) {
      const targetLoc = this.pickWeighted(
        this.spaceManager.subGoalLocations,
        loc =>
          typeof loc?.traffic === 'number' && loc.traffic > 0
            ? 1 / loc.traffic
            : 0
      )
      if (!targetLoc) continue

      targetLoc.selectWeightedWaypoint()

      // Wait duration: use targetLoc.wait (seconds) -> frames
      let waitFrames = 0
      if (targetLoc.wait && targetLoc.wait.type === 'time') {
        const mn = Math.max(0, Number(targetLoc.wait.min) || 0)
        const mx = Math.max(mn, Number(targetLoc.wait.max) || mn)
        const secs = random(mn, mx)
        waitFrames = floor(secs * FPS)
      }

      if (targetLoc?.waypoint) {
        activities.push({ type: 'move', waypoint: targetLoc.waypoint.copy() })
        if (waitFrames > 0)
          activities.push({ type: 'wait', duration: waitFrames })
      }
    }

    // Exit via a (possibly) different entry, chosen weighted by entry demand
    const lastTarget = this.pickWeighted(
      this.spaceManager.entryLocations,
      loc =>
        typeof loc?.traffic === 'number' && loc.traffic > 0
          ? 1 / loc.traffic
          : 1
    )
    if (lastTarget?.waypoint) {
      activities.push({ type: 'move', waypoint: lastTarget.waypoint.copy() })
    }

    person.activity = new Activity(
      person,
      activities,
      this.spaceManager.locationGraph
    )
    this.persons.push(person)
  }

  recalculateAllPaths () {
    for (let person of this.persons) {
      person.activity.recalculatePath()
    }
  }

  reset () {
    this.persons = []
    this.obstacles = []
  }

  deriveSpawnRate () {
    let sum = 0
    //1/traffic (stored in rate) gives the people per second.
    for (let loc of this.spaceManager.subGoalLocations) {
      let rate = loc?.traffic
      if (typeof rate === 'number' && rate > 0) {
        sum += 1 / rate
      }
    }
    return sum
  }

  pickWeighted (arr, weightFn) {
    let weights = arr.map(item => Math.max(0, weightFn(item)) || 0)
    let total = weights.reduce((a, b) => a + b, 0)

    if (total <= 0) {
      return random(arr) // fallback: uniform random
    }

    let r = random(total)
    for (let i = 0; i < arr.length; i++) {
      r -= weights[i]
      if (r <= 0) {
        return arr[i]
      }
    }
    return arr[arr.length - 1] // fallback
  }
}
