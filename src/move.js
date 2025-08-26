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
    //add person and target locations to the waypoint graph.
    g.addNode(startLoc)
    g.addNode(goalLoc)

    let newNodes = [startLoc, goalLoc]

    //generate edges
    const connect = srcLoc => {
      for (let key in newNodes) {
        if (key === srcLoc.name) continue
        const other = g.nodes[key]
        if (!other || !other.waypoint) continue
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
    return p5.Vector.dist(this.person.position, this.finalTargetWaypoint) < 10
  }

  move (obstacles, neighbors = []) {
    if (!this.targetWaypoint) {
      this.person.velocity.mult(0)
      return
    }
    this.person.seeing_Distance = this.getSeeingDistance()

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

    this.person.velocity.add(this.person.acceleration)
    this.person.velocity.limit(this.person.maxSpeed)
    if (this.person.velocity.mag() < this.person.minSpeed) {
      this.person.velocity.setMag(this.person.minSpeed)
    }
    this.person.position.add(this.person.velocity)
    this.person.acceleration.mult(0)

    this.updateHistory()
    if (this.isStuck()) {
      this.unstick()
    }
  }

  applyBehaviorForces (obstacles, neighbors) {
    let combinedForce = createVector(0, 0)

    const weights = {
      queueing: 1.0,
      cohesion: 0.2,
      alignment: 0.2,
      seek: 2.0,
      avoidStatic: 3.5,
      avoidDynamic: 3.0,
      bounds: 1.0,
      wander: 0.05
    }

    let seekForce = this.seek(this.targetWaypoint, this.isMovingToFinalTarget)
    let avoidStaticForce = this.avoidStaticObstacles()
    let avoidDynamicForce = this.evaluate_obstacles(obstacles)
    let boundsForce = this.bounds()
    let wanderForce = this.wander()
    let queueingForce = this.queueing(neighbors)
    let cohesionForce = this.cohesion(neighbors)
    let alignmentForce = this.alignment(neighbors)

    combinedForce.add(seekForce.mult(weights.seek))
    combinedForce.add(avoidStaticForce.mult(weights.avoidStatic))
    combinedForce.add(avoidDynamicForce.mult(weights.avoidDynamic))
    combinedForce.add(boundsForce.mult(weights.bounds))
    combinedForce.add(wanderForce.mult(weights.wander))
    combinedForce.add(queueingForce.mult(weights.queueing))
    combinedForce.add(cohesionForce.mult(weights.cohesion))
    combinedForce.add(alignmentForce.mult(weights.alignment))

    return combinedForce.limit(this.person.maxForce)
  }

  // --- Queueing behavior (forward separation) ---
  queueing (neighbors) {
    let steering = createVector()
    let total = 0
    if (!this.person.velocity || this.person.velocity.mag() === 0)
      return steering

    let lookAhead = this.person.velocity.mag() * 4
    let forward = this.person.velocity.copy().normalize()

    for (let other of neighbors) {
      if (other === this.person) continue
      let offset = p5.Vector.sub(other.position, this.person.position)
      let projection = p5.Vector.dot(offset, forward)

      if (projection > 0 && projection < lookAhead) {
        let dist = offset.mag()
        if (dist < 30) {
          let away = forward.copy().mult(-1 / dist)
          steering.add(away)
          total++
        }
      }
    }

    if (total > 0) {
      steering.div(total)
      steering.setMag(this.person.maxSpeed * 0.5)
      steering.sub(this.person.velocity)
      steering.limit(this.person.maxForce)
    }
    return steering
  }

  cohesion (neighbors) {
    let perceptionRadius = this.getSeeingDistance()
    let steering = createVector()
    let total = 0
    for (let other of neighbors) {
      let d = p5.Vector.dist(this.person.position, other.position)
      if (other !== this.person && d < perceptionRadius) {
        steering.add(other.position)
        total++
      }
    }
    if (total > 0) {
      steering.div(total)
      steering.sub(this.person.position)
      steering.setMag(this.person.maxSpeed)
      steering.sub(this.person.velocity)
      steering.limit(this.person.maxForce)
    }
    return steering
  }

  alignment (neighbors) {
    let perceptionRadius = this.getSeeingDistance()
    let steering = createVector()
    let total = 0
    for (let other of neighbors) {
      let d = p5.Vector.dist(this.person.position, other.position)
      if (other !== this.person && d < perceptionRadius) {
        steering.add(other.velocity)
        total++
      }
    }
    if (total > 0) {
      steering.div(total)
      steering.setMag(this.person.maxSpeed)
      steering.sub(this.person.velocity)
      steering.limit(this.person.maxForce)
    }
    return steering
  }

  // -------------- helpers --------------
  updateHistory () {
    this.person.recentPositions.push(this.person.position.copy())
    if (this.person.recentPositions.length > 12) {
      this.person.recentPositions.shift()
    }
  }

  isStuck () {
    if (this.person.recentPositions.length <= 12) {
      return false
    }
    let total = 0
    for (let i = 1; i < this.person.recentPositions.length; i++) {
      total += p5.Vector.dist(
        this.person.recentPositions[i],
        this.person.recentPositions[i - 1]
      )
    }
    let avgMove = total / (this.person.recentPositions.length - 1)
    return avgMove < 4
  }

  unstick () {
    let jitter = p5.Vector.random2D().mult(this.person.maxForce * 2)
    this.person.applyForce(jitter)
  }

  seek (target, arrive) {
    let force = p5.Vector.sub(target, this.person.position)
    let dist = p5.Vector.dist(target, this.person.position)
    let speed = this.person.maxSpeed
    if (arrive && dist <= this.seeing_Distance) {
      speed = map(
        force.mag(),
        0,
        this.person.seeing_Distance,
        0,
        this.person.maxSpeed
      )
    }
    force.setMag(speed)
    force.limit(this.person.maxForce)
    return force
  }

  avoidStaticObstacles () {
    let rayAngles = [0, -40, 40]
    let rayLength = map(
      this.person.velocity.mag(),
      this.person.minSpeed,
      this.person.maxSpeed,
      this.person.seeing_Distance * 3,
      this.person.seeing_Distance * 6
    )

    let bestForce = createVector(0, 0)
    let minDist = Infinity

    for (let a of rayAngles) {
      let dir = this.person.velocity.copy().setMag(rayLength).rotate(radians(a))
      let aheadPoint = p5.Vector.add(this.person.position, dir)

      for (let t = 0; t <= 1; t += 0.02) {
        let probe = p5.Vector.lerp(this.person.position, aheadPoint, t)
        if (spaceManager.isObstacle(probe.x, probe.y)) {
          let d = p5.Vector.dist(this.person.position, probe)
          if (d < minDist) {
            minDist = d
            let force = p5.Vector.sub(this.person.position, probe)
            force.setMag(map(d, 0, rayLength, this.person.maxForce, 0))
            bestForce = force
          }
          break
        }
      }
    }
    return bestForce
  }

  get_nearest_obstacles (obstacles) {
    let maxDist = Infinity
    let nearest
    for (let i = 0; i < obstacles.length; i++) {
      if (this.person !== obstacles[i]) {
        let d = p5.Vector.dist(obstacles[i].position, this.person.position)
        if (d < maxDist && d > 0) {
          maxDist = d
          nearest = obstacles[i]
        }
      }
    }
    return nearest
  }

  avoid (obstacle) {
    let normalPoint = this.get_normal_point(obstacle)
    let futurePoint = this.get_future_point()
    let futureDist = p5.Vector.dist(obstacle.position, futurePoint)
    let normalDist = p5.Vector.dist(obstacle.position, normalPoint)
    let force = createVector()
    if (
      normalDist < obstacle.major * 1.2 + this.person.major * 1.2 &&
      futureDist < obstacle.major * 1.2
    ) {
      force = p5.Vector.sub(futurePoint, obstacle.position)
      force.setMag(this.person.maxForce)
    }
    return force
  }

  evaluate_obstacles (obstacles) {
    let nearest = this.get_nearest_obstacles(obstacles)
    if (nearest) {
      return this.avoid(nearest)
    }
    return createVector(0, 0)
  }

  get_normal_point (other) {
    let vA = p5.Vector.sub(other.position, this.person.position)
    let vB = this.person.velocity.copy().normalize()
    vB.mult(vA.dot(vB))
    return p5.Vector.add(this.person.position, vB)
  }

  get_future_point () {
    return p5.Vector.add(
      this.person.position,
      this.person.velocity.copy().mult(this.person.seeing_Distance)
    )
  }

  wander () {
    let wanderPoint = this.person.velocity.copy()
    wanderPoint.setMag(this.person.seeing_Distance * 5)
    wanderPoint.add(this.person.position)

    let wanderRadius = this.person.seeing_Distance * 20
    let angle = this.person.wanderTheta + this.person.velocity.heading()
    let xoff = wanderRadius * cos(angle)
    let yoff = wanderRadius * sin(angle)

    wanderPoint.add(xoff, yoff)
    let wander = wanderPoint.sub(this.person.position)
    wander.setMag(this.person.maxForce)
    this.person.wanderTheta += random(-0.05, 0.05)
    return wander
  }

  edges () {
    if (this.person.position.x > width) this.person.position.x = 0
    else if (this.person.position.x < 0) this.person.position.x = width
    if (this.person.position.y > height) this.person.position.y = 0
    else if (this.person.position.y < 0) this.person.position.y = height
  }

  bounds () {
    let desired = null

    if (this.person.position.x - this.person.seeing_Distance < 0) {
      desired = createVector(this.person.maxSpeed, this.person.velocity.y)
    } else if (this.person.position.x > width - this.person.seeing_Distance) {
      desired = createVector(-this.person.maxSpeed, this.person.velocity.y)
    }

    if (this.person.position.y < this.person.seeing_Distance) {
      desired = createVector(this.person.velocity.x, this.person.maxSpeed)
    } else if (this.person.position.y > height - this.person.seeing_Distance) {
      desired = createVector(this.person.velocity.x, -this.person.maxSpeed)
    }

    let steer = createVector(0, 0)
    if (desired) {
      desired.normalize()
      desired.mult(this.person.maxSpeed)
      steer = p5.Vector.sub(desired, this.person.velocity)
      steer.limit(this.person.maxForce)
    }
    return steer
  }

  getSeeingDistance () {
    // Base distance when standing still
    const base = pixelsPerMeter
    // Scale linearly with velocity magnitude
    const scale = map(
      this.person.velocity.mag(),
      this.person.minSpeed,
      this.person.maxSpeed,
      1.0,
      3.0,
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
}
