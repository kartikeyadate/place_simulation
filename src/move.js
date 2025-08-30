class Move {
  static _nextId = 1

  constructor (person, targetWaypointVec, graph) {
    this.person = person
    this.graph = graph

    this.finalTargetWaypoint = targetWaypointVec.copy
      ? targetWaypointVec.copy()
      : createVector(targetWaypointVec.x, targetWaypointVec.y)

    this.path = [] // array of p5.Vector waypoints (start..goal)
    this.pathIndex = 0
    this.targetWaypoint = null
    this.isMovingToFinalTarget = false
    this._uid = Move._nextId++

    this.recalculatePath()
  }

  recalculatePath () {
    const g = this.graph.clone()
    const startName = `__start_${this._uid}`
    const goalName = `__goal_${this._uid}`

    const startLoc = new Location(
      startName,
      -1,
      'waypoint',
      'null',
      this.person.position.copy()
    )
    const goalLoc = new Location(
      goalName,
      -2,
      'waypoint',
      'null',
      this.finalTargetWaypoint.copy()
    )

    g.addNode(startLoc)
    g.addNode(goalLoc)

    const connect = srcLoc => {
      for (let key in g.nodes) {
        const other = g.nodes[key]
        if (!other || !other.waypoint || other.name === srcLoc.name) continue
        if (spaceManager.visibilityTest(srcLoc.waypoint, other.waypoint)) {
          const w = p5.Vector.dist(srcLoc.waypoint, other.waypoint)
          g.addEdge(srcLoc.name, other.name, w)
        }
      }
    }

    connect(startLoc)
    connect(goalLoc)

    let namePath
    if (spaceManager.visibilityTest(startLoc.waypoint, goalLoc.waypoint)) {
      namePath = [startName, goalName]
    } else {
      namePath = findPath(g, startName, goalName)
    }

    this.path = namePath.map(n => g.getNode(n).waypoint)
    if (this.path.length >= 2) {
      this.path = this._pruneLineOfSight(this.path)
    }

    if (this.path.length > 1) {
      this.pathIndex = 1
      this.targetWaypoint = this.path[this.pathIndex]
      this.isMovingToFinalTarget = false
    } else {
      this.pathIndex = 0
      this.targetWaypoint = this.finalTargetWaypoint
      this.isMovingToFinalTarget = true
    }
  }

  isFinished () {
    const dist = p5.Vector.dist(this.person.position, this.finalTargetWaypoint)

    // Use body size as tolerance (half shoulder span feels natural)
    const tolerance = this.person.major * 2

    // Option A: close enough
    if (dist < tolerance) return true

    // Option B: close *and* basically stopped
    if (
      dist < tolerance * 2 &&
      this.person.velocity.mag() < this.person.minSpeed * 0.5
    ) {
      return true
    }

    return false
  }

  move (obstacles, neighbors = []) {
    if (!this.targetWaypoint) {
      this.person.velocity.mult(0)
      return
    }
    const dt = 1 / FPS

    let distanceToWaypoint = p5.Vector.dist(
      this.person.position,
      this.targetWaypoint
    )

    if (!this.isMovingToFinalTarget) {
      if (distanceToWaypoint < 10) {
        if (this.pathIndex < this.path.length - 1) {
          this.pathIndex++
          this.targetWaypoint = this.path[this.pathIndex]
        } else {
          this.isMovingToFinalTarget = true
          this.targetWaypoint = this.finalTargetWaypoint
        }
      }
    }

    let combinedForce = this.applyBehaviorForces(obstacles, neighbors)
    this.person.applyForce(combinedForce)

    // Semi-implicit Euler
    this.person.velocity.add(p5.Vector.mult(this.person.acceleration, dt))
    this.person.velocity.limit(this.person.maxSpeed)
    if (this.person.velocity.mag() < this.person.minSpeed) {
      this.person.velocity.setMag(this.person.minSpeed)
    }
    this.person.position.add(p5.Vector.mult(this.person.velocity, dt))
    this.person.acceleration.mult(0)
  }

  getAdaptiveWeights (obstacles, neighbors) {
    let weights = {
      queueing: 1.2,
      cohesion: 0.25,
      alignment: 0.25,
      seek: 1.8,
      avoidStatic: 7.0,
      avoidDynamic: 4.5,
      bounds: 2.0,
      wander: 0.08
    }

    // Distance to nearest obstacle
    let nearestObs = this.evaluate_obstacles(obstacles)
    let nearestDist = nearestObs.mag()

    // Distance to goal
    let goalDist = p5.Vector.dist(
      this.person.position,
      this.finalTargetWaypoint
    )

    // === ADAPTIVE WEIGHTING LOGIC ===

    // 1. Prioritize avoidance when danger is imminent (same as before)
    if (nearestDist > 0 && nearestDist < this.person.major * 2) {
      weights.avoidStatic *= 2.0
      weights.avoidDynamic *= 2.0
      weights.seek *= 0.5
    }
    // 2. Prioritize goal-seeking on final approach
    else if (goalDist < this.person.seeing_Distance) {
      // Agent is close to its goal, boost seek and suppress avoidance
      let closeFactor = 1 - goalDist / this.person.seeing_Distance // 0 to 1
      weights.seek += 2.0 * closeFactor // Add a significant boost
      weights.avoidStatic *= 1 - closeFactor * 0.5 // Slightly reduce avoidance
      weights.avoidDynamic *= 1 - closeFactor * 0.5
      weights.wander = 0 // Turn off wandering on the final approach
    }

    // 3. Handle crowding (same as before)
    if (neighbors.length > 3) {
      weights.queueing *= 1.5
      weights.cohesion *= 1.2
    }

    // 4. If far from goal, wander more (same as before)
    if (goalDist > this.person.seeing_Distance * 5) {
      weights.wander *= 1.5
    }

    return weights
  }

  applyBehaviorForces (obstacles, neighbors) {
    let combined = createVector(0, 0)
    const weights = this.getAdaptiveWeights(obstacles, neighbors)

    combined.add(
      this.seek(this.targetWaypoint, this.isMovingToFinalTarget).mult(
        weights.seek
      )
    )
    combined.add(this.avoidStaticObstacles().mult(weights.avoidStatic))
    combined.add(this.evaluate_obstacles(obstacles).mult(weights.avoidDynamic))
    combined.add(this.bounds().mult(weights.bounds))
    combined.add(this.wander().mult(weights.wander))
    combined.add(this.queueing(neighbors).mult(weights.queueing))
    combined.add(this.cohesion(neighbors).mult(weights.cohesion))
    combined.add(this.alignment(neighbors).mult(weights.alignment))

    combined.limit(this.person.maxAccel)
    return combined
  }

  // --- Queueing (acceleration) ---
  queueing (neighbors) {
    let steering = createVector()
    let total = 0
    if (this.person.velocity.mag() === 0) return steering

    let forward = this.person.velocity.copy().normalize()
    let lookAhead = this.person.velocity.mag() * 0.8 // px

    for (let other of neighbors) {
      if (other === this.person) continue

      let offset = p5.Vector.sub(other.position, this.person.position)
      let proj = p5.Vector.dot(offset, forward)

      if (proj > 0 && proj < lookAhead) {
        let dist = offset.mag()

        // Only react if inside personal space
        if (dist < this.person.major * 3) {
          // Relative velocity along forward axis
          let relVel = p5.Vector.dot(
            p5.Vector.sub(this.person.velocity, other.velocity),
            forward
          )

          if (relVel > 0) {
            // only if we're actually closing in
            // Quadratic falloff → sharp when close, soft when farther
            let falloff = 1 / Math.pow(dist / this.person.major, 2)

            let strength = this.person.maxAccel * falloff

            // Scale by relative speed so faster agents brake harder
            strength *= relVel / this.person.maxSpeed

            let brake = forward.copy().mult(-strength)
            steering.add(brake)
            total++
          }
        }
      }
    }

    if (total > 0) steering.div(total)
    return steering
  }

  cohesion (neighbors) {
    let perceptionRadius = this.getSeeingDistance()
    let sum = createVector()
    let total = 0

    for (let other of neighbors) {
      let d = p5.Vector.dist(this.person.position, other.position)
      if (other !== this.person && d < perceptionRadius) {
        sum.add(other.position)
        total++
      }
    }

    if (total > 0) {
      sum.div(total)
      let desired = p5.Vector.sub(sum, this.person.position)
      desired.setMag(this.person.maxSpeed) // desired vel
      let steer = p5.Vector.sub(desired, this.person.velocity) // Δv
      steer.mult(FPS) // accel
      steer.limit(this.person.maxAccel)
      return steer
    }
    return createVector()
  }

  alignment (neighbors) {
    let perceptionRadius = this.getSeeingDistance()
    let sum = createVector()
    let total = 0

    for (let other of neighbors) {
      let d = p5.Vector.dist(this.person.position, other.position)
      if (other !== this.person && d < perceptionRadius) {
        sum.add(other.velocity)
        total++
      }
    }

    if (total > 0) {
      sum.div(total)
      sum.setMag(this.person.maxSpeed)
      let steer = p5.Vector.sub(sum, this.person.velocity)
      steer.mult(FPS)
      steer.limit(this.person.maxAccel)
      return steer
    }
    return createVector()
  }

  seek (target, arrive) {
    let desired = p5.Vector.sub(target, this.person.position)
    let d = desired.mag()
    if (d === 0) return createVector(0, 0)

    let speed = this.person.maxSpeed
    if (arrive && d < this.person.seeing_Distance) {
      speed = map(d, 0, this.person.seeing_Distance, 0, this.person.maxSpeed)
    }
    desired.setMag(speed)
    let steer = p5.Vector.sub(desired, this.person.velocity)
    steer.mult(FPS)
    steer.limit(this.person.maxAccel)
    return steer
  }

  avoidStaticObstacles () {
    let rayAngles = [0, -50, 50] // degrees
    let rayLength = map(
      this.person.velocity.mag(),
      this.person.minSpeed,
      this.person.maxSpeed,
      this.person.seeing_Distance * 4,
      this.person.seeing_Distance * 7
    )

    let steering = createVector(0, 0)
    let hits = 0

    for (let a of rayAngles) {
      let dir = this.person.velocity.copy()
      if (dir.mag() === 0) dir = createVector(1, 0)
      dir.setMag(rayLength).rotate(radians(a))

      let aheadPoint = p5.Vector.add(this.person.position, dir)

      for (let t = 0; t <= 1; t += 0.02) {
        let probe = p5.Vector.lerp(this.person.position, aheadPoint, t)
        if (spaceManager.isObstacle(probe.x, probe.y)) {
          let d = p5.Vector.dist(this.person.position, probe)

          // Repulsion away from obstacle
          let away = p5.Vector.sub(this.person.position, probe)
          let strength = map(d, 0, rayLength, this.person.maxAccel, 0)

          // Scale side rays less than forward ray
          let angleWeight = a === 0 ? 1.0 : 0.7

          away.setMag(strength * angleWeight)
          steering.add(away)

          hits++
          break
        }
      }
    }

    if (hits > 0) {
      steering.div(hits)
      steering.limit(this.person.maxAccel)
    }

    return steering
  }

  // For dynamic (other agents)
  evaluate_obstacles (obstacles) {
    let nearest = null
    let minD = Infinity
    for (let o of obstacles) {
      if (o === this.person) continue
      let d = p5.Vector.dist(this.person.position, o.position)
      if (d < minD) {
        minD = d
        nearest = o
      }
    }
    if (nearest && minD < this.person.seeing_Distance) {
      let away = p5.Vector.sub(this.person.position, nearest.position)
      let strength = this.person.maxAccel * (1 / (minD / this.person.major))
      away.setMag(Math.min(strength, this.person.maxAccel * 2.5))
      return away
    }
    return createVector(0, 0)
  }

  wander () {
    let wanderPoint = this.person.velocity.copy()
    wanderPoint.setMag(this.person.seeing_Distance)
    wanderPoint.add(this.person.position)

    let wanderRadius = this.person.seeing_Distance * 0.5
    let angle = this.person.wanderTheta + this.person.velocity.heading()
    wanderPoint.add(wanderRadius * cos(angle), wanderRadius * sin(angle))

    let wanderForce = p5.Vector.sub(wanderPoint, this.person.position)
    wanderForce.setMag(this.person.maxAccel * 0.3)
    this.person.wanderTheta += random(-0.25, 0.25)
    return wanderForce
  }

  bounds () {
    let steer = createVector(0, 0)
    let margin = this.person.seeing_Distance
    if (this.person.position.x < margin) steer.x = this.person.maxAccel
    else if (this.person.position.x > width - margin)
      steer.x = -this.person.maxAccel
    if (this.person.position.y < margin) steer.y = this.person.maxAccel
    else if (this.person.position.y > height - margin)
      steer.y = -this.person.maxAccel
    return steer
  }

  getSeeingDistance () {
    const base = pixelsPerMeter
    const scale = map(
      this.person.velocity.mag(),
      this.person.minSpeed,
      this.person.maxSpeed,
      2,
      6,
      true
    )
    return base * scale
  }

  _pruneLineOfSight (vecs) {
    if (vecs.length <= 2) return vecs
    const pruned = [vecs[0]]
    let i = 0
    while (i < vecs.length - 1) {
      let j = vecs.length - 1
      while (j > i + 1) {
        if (spaceManager.visibilityTest(vecs[i], vecs[j])) break
        j--
      }
      pruned.push(vecs[j])
      i = j
    }
    return pruned
  }

  showTarget () {
    if (this.finalTargetWaypoint) {
      push()
      noStroke()
      fill(0, 255, 0, 127)
      strokeWeight(2)
      ellipse(this.finalTargetWaypoint.x, this.finalTargetWaypoint.y, 15, 15)
      pop()
    }
  }
}
