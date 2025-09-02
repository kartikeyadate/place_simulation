class PeopleManager {
  constructor (spaceManager) {
    this.spaceManager = spaceManager
    this.persons = []
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
    this.initAgents(num)
  }

  updateAllPerceptions () {
    this.populate_qtree()
    for (let p of this.persons) {
      // --- Update cone geometry ---
      let c = p.perceptionCone
      c.x = p.position.x
      c.y = p.position.y
      if (p.activity?.state === 'MOVING') {
        c.angle = p.update_heading(c) // freeze heading if not moving
      }
      c.dir = createVector(cos(c.angle), sin(c.angle))
      c.cosFov = cos(c.fov)
      c.rSquared = c.r * c.r

      // --- Update circle geometry ---
      let circ = p.perceptionCircle
      circ.x = p.position.x
      circ.y = p.position.y
      circ.rSquared = circ.r * circ.r

      // --- Reset perception buckets ---
      p.currentlyPerceivedThings.dynamic = []
      p.currentlyPerceivedThings.targets = []
      p.currentlyPerceivedThings.onPath = []
      p.currentlyPerceivedThings.withinCircle = [] // 👈 nearby persons when waiting/meeting

      // --- Path lookup cache ---
      let pathSet = new Set()
      if (p.activity?.currentMove?.path) {
        for (let wp of p.activity.currentMove.path) {
          pathSet.add(`${floor(wp.x)},${floor(wp.y)}`)
        }
      }

      // --- Query quadtree once using cone's bounding box ---
      let hits = this.spaceManager.qt.query(c) || []
      for (let h of hits) {
        if (!h?.userData) continue
        let obj = h.userData
        if (obj === p) continue

        // Cone-based perception
        if (obj instanceof Person) {
          p.currentlyPerceivedThings.dynamic.push(obj)

          // 🔄 Circle-based perception (only Persons matter here)
          const dx = p.position.x - obj.position.x
          const dy = p.position.y - obj.position.y
          const dSq = dx * dx + dy * dy
          if (dSq < circ.rSquared) {
            p.currentlyPerceivedThings.withinCircle.push(obj)
          }
        } else if (obj instanceof Location) {
          p.currentlyPerceivedThings.targets.push(obj)
        }

        // Path membership check
        if (obj.waypoint) {
          let key = `${floor(obj.waypoint.x)},${floor(obj.waypoint.y)}`
          if (pathSet.has(key)) {
            p.currentlyPerceivedThings.onPath.push(obj)
          }
        }
      }
    }
  }

  run () {
    this.poissonSpawn()
    this.commuterSpawn()
    this.updateAllPerceptions()
    for (let i = this.persons.length - 1; i >= 0; i--) {
      this.persons[i].activity.run()
      if (this.persons[i].activity.completed) {
        //console.log('Removing ' + this.persons[i].id)
        this.persons.splice(i, 1)
      }
    }
    this.obstacles = this.persons
  }

  showPeople () {
    for (let person of this.persons) {
      person.show()
    }
  }

  showPaths () {
    for (let person of this.persons) {
      person.activity?.currentMove?.showPath?.()
      person.activity?.currentMove?.showTarget?.()
    }
  }

  // --- Train arrival wave state ---
  triggerCommuterArrival () {
    // number of commuters for this wave
    const n = floor(random(120, 240)) // 60–120
    const secs = random(420, 720) // 10–15 min
    const frames = secs * FPS

    this.commuterWave = {
      remaining: n,
      lambdaPerSecond: n / secs,
      framesLeft: frames
    }

    flashMessagePara.html(
      `Train arrived: ${n} commuters over ~${secs.toFixed(0)}s`
    )
  }

  commuterSpawn () {
    if (!this.commuterWave) return

    let w = this.commuterWave
    if (w.framesLeft <= 0 || w.remaining <= 0) {
      this.trainWave = null
      return
    }

    // convert λ to per-frame probability
    const pFrame = 1 - Math.exp(-w.lambdaPerSecond / FPS)

    if (random(1) < pFrame && w.remaining > 0) {
      this.commuter()
      w.remaining--
    }

    w.framesLeft--
  }

  commuter () {
    let enter_in = 'entry_two'
    let possible_exits = [
      'entry_one',
      'entry_three',
      'entry_four',
      'entry_five'
    ]
    let exit_at = random(possible_exits)
    let entryLoc, exitLoc
    for (let loc of this.spaceManager.entryLocations) {
      if (loc.name === exit_at) {
        exitLoc = loc
      }
      if (loc.name === enter_in) {
        entryLoc = loc
      }
    }

    const spawnAt = random(entryLoc.pixels)
    exitLoc.selectWeightedWaypoint()

    let person = new Person(
      spawnAt.x,
      spawnAt.y,
      pixelsPerMeter,
      minShoulderCm,
      maxShoulderCm,
      minSpeedCmS,
      maxSpeedCmS
    )
    let activities = []
    activities.push({ type: 'move', waypoint: exitLoc.waypoint.copy() })

    person.activity = new Activity(
      person,
      activities,
      this.spaceManager.locationGraph
    )

    this.persons.push(person)
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

// Utility for squared distance
function distSq (x1, y1, x2, y2) {
  let dx = x1 - x2
  let dy = y1 - y2
  return dx * dx + dy * dy
}
