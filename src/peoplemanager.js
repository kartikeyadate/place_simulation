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

  updateAllPerceptions () {
    this.populate_qtree()
    for (let p of this.persons) {
      let c = p.perceptionCone
      c.x = p.position.x
      c.y = p.position.y
      c.angle = p.update_heading(c)
      c.dir = createVector(cos(c.angle), sin(c.angle))
      c.cosFov = cos(c.fov)
      c.rSquared = c.r * c.r

      //reset currentPercievedThings.
      p.currentlyPerceivedThings.dynamic = []
      p.currentlyPerceivedThings.targets = []
      p.currentlyPerceivedThings.onPath = []

      let pathSet = new Set()
      if (p.activity && p.activity.currentMove && p.activity.currentMove.path) {
        for (let wp of p.activity.currentMove.path) {
          pathSet.add(`${floor(wp.x)},${floor(wp.y)}`)
        }
      }

      let hits = this.spaceManager.qt.query(c) || []
      for (let h of hits) {
        let obj = h.userData
        if (obj !== p) {
          if (obj instanceof Person) {
            p.currentlyPerceivedThings.dynamic.push(obj)
          } else if (obj instanceof Location) {
            p.currentlyPerceivedThings.targets.push(obj)
          }

          if (obj.waypoint) {
            let key = `${floor(obj.waypoint.x)},${floor(obj.waypoint.y)}`
            if (pathSet.has(key)) {
              p.currentlyPerceivedThings.onPath.push(obj)
            }
          }
        }
      }
    }
  }

  run () {
    this.poissonSpawn()
    this.updateAllPerceptions()
    for (let i = this.persons.length - 1; i >= 0; i--) {
      this.persons[i].activity.run(this.obstacles)
      if (this.persons[i].activity.completed) {
        console.log('Removing ' + this.persons[i].id)
        this.persons.splice(i, 1)
      }
    }
    this.obstacles = this.persons
  }

  show () {
    for (let person of this.persons) {
      person.show()
      person.activity?.currentMove?.showPath?.()
      person.activity?.currentMove?.showTarget?.()
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
    const entry = this.pickWeighted(this.spaceManager.entryLocations, loc =>
      typeof loc?.traffic === 'number' && loc.traffic > 0 ? loc.traffic : 1
    )

    if (!entry || !entry.pixels || entry.pixels.length === 0) return
    const spawnPos = random(entry.pixels)
    if (!spawnPos) return

    const activities = []

    // Person now expects physical params (same call signature as before)
    let person = new Person(
      spawnPos.x,
      spawnPos.y,
      pixelsPerMeter,
      minShoulderCm,
      maxShoulderCm,
      minSpeedCmS,
      maxSpeedCmS
    )

    // --- build itinerary ---
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

      // Wait time in seconds → frames
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

    // Exit
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

  populate_qtree () {
    this.spaceManager.qt.clear()
    for (let p of this.persons) {
      let pt = new QtPt(p.position.x, p.position.y, p)
      this.spaceManager.qt.insert(pt)
    }
    for (let loc of this.spaceManager.locationList) {
      if (loc.waypoint) {
        let pt = new QtPt(loc.waypoint.x, loc.waypoint.y, loc)
        this.spaceManager.qt.insert(pt)
      }
    }
  }

  identify_possible_meetings () {
    this.populate_qtree()
    for (let p of this.persons) {
      angleMode(RADIANS)
      let angle = p.velocity.heading()
      let pos = p.position
      let fov = 5 / 18
      let range = new QtCone(pos.x, pos.y, angle, fov, p.seeing_Distance * 5)
      let finds = this.qt.query(range)
      for (let f of finds) {
        let other = f.userData
        if (other !== p) {
          p.in_fov(other)
        }
      }
    }
    let possible_meetings = new Set()
    for (let a of this.persons) {
      for (let b of a.in_fov) {
        //the spatial test for an unplanned meeting.
        if (b.in_fov.has(a)) {
          //the social test for an unplanned meeting.
          let already_meeting = a.in_meeting || b.in_meeting
          let prop = random()
          let meet_propensity =
            prop < a.meetingPropensity && prop < b.meetingPropensity
          if (!already_meeting && meet_propensity) {
            let pair = [a.id, b.id].sort().join('-')
            possible_meetings.add(pair)
          }
        }
      }
    }
    return possible_meetings
  }
}
