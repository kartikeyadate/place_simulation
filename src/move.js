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
    /*
    if (this.path.length >= 2) {
      this.path = this._pruneLineOfSight(this.path)
    }
      */

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
    if (!this.isMovingToFinalTarget) return false // 🔒 never finish early

    const dist = p5.Vector.dist(this.person.position, this.finalTargetWaypoint)
    const tolerance = this.person.major * 2

    // Within body span = done
    if (dist < tolerance) return true

    // Close enough and not actually approaching anymore
    if (
      dist < tolerance * 2 &&
      p5.Vector.dot(
        this.person.velocity,
        p5.Vector.sub(this.finalTargetWaypoint, this.person.position)
      ) <= 0
    ) {
      return true
    }

    return false
  }

  move () {
    /*
    if (frameCount % floor(frameRate()) === 0) {
      this.recalculatePath()
    }
      */
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

    let combinedForce = this.applyBehaviorForces()
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

  getAdaptiveWeights () {
    let weights = {
      queueing: 1.2,
      cohesion: 0.25,
      alignment: 0.25,
      seek: 3.0,
      avoidStatic: 7.0,
      avoidDynamic: 5.0,
      bounds: 2.0,
      wander: 0.4
    }

    // --- GOAL FACTOR (0 = far, 1 = very close) ---
    let goalDist = p5.Vector.dist(
      this.person.position,
      this.finalTargetWaypoint
    )
    let goalFactor = constrain(
      1 - goalDist / this.person.perceptionCone.r,
      0,
      1
    )

    // --- CROWD FACTOR (0 = empty, 1 = fully crowded) ---
    const dyn = this.person.currentlyPerceivedThings.dynamic || []
    const CROWD_MAX = 5 // tweak threshold
    let crowdFactor = constrain(dyn.length / CROWD_MAX, 0, 1)

    // --- Adaptive logic ---

    // Near goal → boost seek, suppress wander
    weights.seek *= 1 + 3 * goalFactor
    weights.avoidStatic *= 1 - 0.6 * goalFactor
    // 🔑 don’t reduce avoidDynamic here — leave it alone near goal
    weights.wander *= 1 - goalFactor

    // Crowding → boost social behaviors + avoidance
    weights.queueing *= 1 + 1.5 * crowdFactor
    weights.cohesion *= 1 + 0.8 * crowdFactor
    weights.alignment *= 1 + 0.8 * crowdFactor
    weights.wander *= 1 - 0.8 * crowdFactor

    // 🔑 In crowds, *increase* dynamic avoidance
    weights.avoidDynamic *= 1 + 1.2 * crowdFactor

    // Far + crowded → suppress blind seeking
    if (goalFactor < 0.3 && crowdFactor > 0.6) {
      weights.seek *= 0.7
      weights.queueing *= 1.3
    }

    return weights
  }

  applyBehaviorForces () {
    let combined = createVector(0, 0)
    const weights = this.getAdaptiveWeights()
    if (this.person.activity?.state === 'MOVING') {
      combined.add(
        this.seek(this.targetWaypoint, this.isMovingToFinalTarget).mult(
          weights.seek
        )
      )
      combined.add(this.avoidStaticObstacles().mult(weights.avoidStatic))
      combined.add(this.evaluate_obstacles().mult(weights.avoidDynamic))
      combined.add(this.bounds().mult(weights.bounds))
      combined.add(this.wander().mult(weights.wander))
      combined.add(this.queueing().mult(weights.queueing))
      combined.add(this.cohesion().mult(weights.cohesion))
      combined.add(this.alignment().mult(weights.alignment))

      combined.limit(this.person.maxAccel)
    } else if (
      this.person.activity?.state === 'WAITING' ||
      this.person.activity?.state === 'MEETING'
    ) {
      combined.add(this.giveWay().mult(2.0)) // step aside
      combined.add(this.returnToGoal().mult(1.0)) // drift back
    }

    return combined
  }

  giveWay () {
    let steering = createVector(0, 0)
    let total = 0

    // only check nearby persons in the perceptionCircle
    for (let other of this.currentlyPerceivedThings.withinCircle) {
      if (other === this) continue

      let offset = p5.Vector.sub(this.position, other.position)
      let d = offset.mag()

      if (d > 0 && d < this.perceptionCircle.r) {
        let away = offset.copy().normalize()
        let strength = map(d, 0, this.perceptionCircle.r, this.maxAccel, 0)
        away.mult(strength)

        steering.add(away)
        total++
      }
    }

    if (total > 0) {
      steering.div(total)
      steering.limit(this.maxAccel * 0.5) // softer nudge than dynamic avoidance
    }

    return steering
  }

  // --- Return to goal behaviour (drifts back to original waiting spot) ---
  returnToGoal (goalPos) {
    let desired = p5.Vector.sub(goalPos, this.position)
    let d = desired.mag()

    if (d < 1) return createVector(0, 0) // already at goal

    desired.setMag(map(d, 0, this.perceptionCircle.r, 0, this.maxSpeed * 0.5))
    let steer = p5.Vector.sub(desired, this.velocity)
    steer.limit(this.maxAccel * 0.3) // gentle correction
    return steer
  }

  // --- Queueing (acceleration) ---
  queueing () {
    let steering = createVector()
    let total = 0
    if (this.person.velocity.mag() === 0) return steering

    let forward = this.person.velocity.copy().normalize()
    let lookAhead = this.person.velocity.mag() * 0.8 // px

    const dyn = this.person.currentlyPerceivedThings.dynamic
    if (!dyn || dyn.length === 0) return steering

    for (let other of dyn) {
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
            let falloff = 1 / Math.pow(dist / this.person.major, 2)
            let strength = this.person.maxAccel * falloff
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

  cohesion () {
    let sum = createVector()
    let total = 0

    const dyn = this.person.currentlyPerceivedThings.dynamic
    if (!dyn || dyn.length === 0) return createVector(0, 0)

    for (let other of dyn) {
      let d = p5.Vector.dist(this.person.position, other.position)
      if (other !== this.person && d < this.person.perceptionCone.r) {
        sum.add(other.position)
        total++
      }
    }

    if (total > 0) {
      sum.div(total)
      let desired = p5.Vector.sub(sum, this.person.position)
      desired.setMag(this.person.maxSpeed)
      let steer = p5.Vector.sub(desired, this.person.velocity)
      steer.mult(FPS)
      steer.limit(this.person.maxAccel)
      return steer
    }
    return createVector()
  }

  alignment () {
    let sum = createVector()
    let total = 0

    const dyn = this.person.currentlyPerceivedThings.dynamic
    if (!dyn || dyn.length === 0) return createVector(0, 0)

    for (let other of dyn) {
      let d = p5.Vector.dist(this.person.position, other.position)
      if (other !== this.person && d < this.person.perceptionCone.r) {
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
    if (arrive && d < this.person.perceptionCone.r) {
      speed = map(d, 0, this.person.perceptionCone.r, 0, this.person.maxSpeed)
    }
    desired.setMag(speed)
    let steer = p5.Vector.sub(desired, this.person.velocity)
    steer.mult(FPS)
    steer.limit(this.person.maxAccel)
    return steer
  }

  avoidStaticObstacles () {
    // Rays: forward + cone edges
    let rayAngles = [
      0,
      -this.person.perceptionCone.fov / 2,
      this.person.perceptionCone.fov / 2
    ]

    // Adaptive ray length based on velocity and stopping distance
    let speed = this.person.velocity.mag()
    let stopDist = (speed * speed) / (2 * this.person.maxAccel)
    let rayLength = constrain(
      map(
        speed,
        this.person.minSpeed,
        this.person.maxSpeed,
        this.person.perceptionCone.r * 0.5, // low speed: shorter rays
        this.person.perceptionCone.r * 1.2 // high speed: slightly longer than cone
      ),
      stopDist,
      this.person.perceptionCone.r * 1.2
    )

    let steering = createVector(0, 0)
    let hits = 0

    for (let a of rayAngles) {
      // Direction of ray
      let dir = this.person.velocity.copy()
      if (dir.mag() === 0) dir = createVector(1, 0)
      dir.setMag(rayLength).rotate(a) // a already in radians

      let aheadPoint = p5.Vector.add(this.person.position, dir)

      // Probe along ray
      for (let t = 0; t <= 1; t += 0.02) {
        let probe = p5.Vector.lerp(this.person.position, aheadPoint, t)
        if (spaceManager.isObstacle(probe.x, probe.y)) {
          let d = p5.Vector.dist(this.person.position, probe)
          let away = p5.Vector.sub(this.person.position, probe)
          let strength = map(d, 0, rayLength, this.person.maxAccel, 0)

          // Center ray = stronger correction, side rays = softer
          let angleWeight = a === 0 ? 1.0 : 0.7
          away.setMag(strength * angleWeight)

          steering.add(away)
          hits++
          break // stop after first obstacle hit along this ray
        }
      }
    }

    if (hits > 0) {
      steering.div(hits)
      steering.limit(this.person.maxAccel)
    }

    return steering
  }

  evaluate_obstacles () {
    const dyn = this.person.currentlyPerceivedThings.dynamic
    if (!dyn || dyn.length === 0) {
      return createVector(0, 0)
    }

    let nearest = null
    let minD = Infinity

    // Adaptive lookahead time based on current speed
    // Faster → longer horizon, slower → shorter
    const minHorizon = 5 // frames (≈0.1s at 60 FPS)
    const maxHorizon = 30 // frames (≈0.5s at 60 FPS)
    const horizonFrames = map(
      this.person.velocity.mag(),
      this.person.minSpeed,
      this.person.maxSpeed,
      minHorizon,
      maxHorizon,
      true
    )

    const dt = 1 / FPS
    const lookaheadTime = horizonFrames * dt

    for (let o of dyn) {
      if (o === this.person) continue

      // predict other’s position at lookaheadTime
      let futurePos = p5.Vector.add(
        o.position,
        p5.Vector.mult(o.velocity, lookaheadTime)
      )

      let d = p5.Vector.dist(this.person.position, futurePos)

      if (d < minD) {
        minD = d
        nearest = { obj: o, predicted: futurePos }
      }
    }

    if (nearest && minD < this.person.perceptionCone.r) {
      let away = p5.Vector.sub(this.person.position, nearest.predicted)
      let strength = this.person.maxAccel * (1 / (minD / this.person.major))
      away.setMag(Math.min(strength, this.person.maxAccel * 2.5))
      return away
    }

    return createVector(0, 0)
  }

  wander () {
    let wanderPoint = this.person.velocity.copy()
    wanderPoint.setMag(this.person.perceptionCone.r)
    wanderPoint.add(this.person.position)

    let wanderRadius = this.person.perceptionCone.r * 0.5
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

  showPath () {
    if (this.path && this.path.length > 1) {
      push()
      noFill()
      stroke(0, 150, 255, 100) // light blue
      strokeWeight(2)
      beginShape()
      for (let wp of this.path) {
        vertex(wp.x, wp.y)
      }
      endShape()
      pop()

      for (let i = 0; i < this.path.length; i++) {
        let wp = this.path[i]
        push()
        noStroke()
        fill(i === this.pathIndex ? 'orange' : 'cyan')
        ellipse(wp.x, wp.y, 6, 6)
        pop()
      }
    }
  }

  showTarget () {
    if (this.finalTargetWaypoint) {
      push()
      strokeWeight(2)
      noFill()
      if (this.isMovingToFinalTarget) {
        stroke(0, 255, 0, 180)
        fill(0, 255, 0, 80)
      } else {
        stroke(255, 0, 0, 180)
        fill(255, 0, 0, 80)
      }
      ellipse(this.finalTargetWaypoint.x, this.finalTargetWaypoint.y, 18, 18)
      pop()
    }
  }
}
