class Person {
  constructor (
    x,
    y,
    ppm,
    minShoulderCm,
    maxShoulderCm,
    minSpeedCmS,
    maxSpeedCmS
  ) {
    this.position = createVector(x, y)
    this.velocity = createVector() // px/s
    this.acceleration = createVector(0, 0) // px/s²

    // Shoulder in meters → convert to pixels
    const minShoulderM = cmToMeters(minShoulderCm)
    const maxShoulderM = cmToMeters(maxShoulderCm)
    const minShoulderPx = minShoulderM * ppm
    const maxShoulderPx = maxShoulderM * ppm

    // Speed in m/s
    const minSpeed = cmpsToMps(minSpeedCmS)
    const maxSpeed = cmpsToMps(maxSpeedCmS)
    this.maxSpeedMps = random(minSpeed, maxSpeed)
    this.minSpeedMps = this.maxSpeedMps * 0.5

    // Convert speeds to px/s
    this.maxSpeed = this.maxSpeedMps * ppm
    this.minSpeed = this.minSpeedMps * ppm

    // --- Perception cone (canonical perception object) ---
    // radius = 6 meters -> convert to pixels using pixelsPerMeter
    const perceptionRadiusPx = 3 * pixelsPerMeter
    // QtCone expects fov = half-angle in radians; total FOV = 120° => half-angle = 60° = PI/3
    const coneHalfAngle = PI / 3

    this.perceptionCone = new QtCone(
      this.position.x,
      this.position.y,
      // initial angle — use current velocity heading if non-zero, otherwise 0
      this.velocity && this.velocity.mag && this.velocity.mag() > 0
        ? this.velocity.heading()
        : 0,
      coneHalfAngle,
      perceptionRadiusPx
    )
    this.perceptionCone.angle = 0

    this.perceptionCircle = {
      r: this.perceptionCone.r * 0.6 // smaller than cone radius, tunable
    }
    this.currentlyPerceivedThings = {
      dynamic: [], //dynamic obstacles
      targets: [], //waypoints, meeting points, goals.
      onPath: [] //locations which are on current move path.
    }

    // Acceleration capacity (px/s²)
    this.maxAccel = this.maxSpeed * 0.5 // tweak factor

    this.major = random(minShoulderPx, maxShoulderPx)
    this.minor = (this.major * 2) / 3

    this.wanderTheta = 0.0
    this.recentPositions = []
    this.stuckFrames = 0
    this.activity = null
    this.meetingPropensity = random(0.1)
    this.in_meeting = false
    this.in_fov = new Set()
    this.id = nextPersonId()
  }

  updatePerceptionCone (qt) {
    //update the position and heading of the perception cone.
    let c = this.perceptionCone
    c.x = this.position.x
    c.y = this.position.y
    if (this.activity?.state === 'MOVING') {
      c.angle = this.update_heading(c)
    }
    c.dir = createVector(cos(c.angle), sin(c.angle))
    c.cosFov = cos(c.fov)
    c.rSquared = c.r * c.r

    //reset currentPercievedThings.
    this.currentlyPerceivedThings.dynamic = []
    this.currentlyPerceivedThings.targets = []
    this.currentlyPerceivedThings.onPath = []

    if (!qt) return

    let hits = qt.query(c) || []
    for (let h of hits) {
      if (!h || !h.userData) {
        continue
      }
      let obj = h.userData
      if (obj === this) {
        continue
      }

      if (obj instanceof Person) {
        this.currentlyPerceivedThings.dynamic.push(obj)
      } else if (obj instanceof Location) {
        this.currentlyPerceivedThings.targets.push(obj)
      }
    }
  }

  update_heading (previous) {
    if (this.velocity && this.velocity.mag() > 0) {
      return this.velocity.heading()
    } else {
      return previous.angle || 0
    }
  }

  // --- Step aside gently when waiting ---
  giveWay () {
    let steering = createVector(0, 0)
    let total = 0

    for (let other of this.currentlyPerceivedThings.withinCircle) {
      if (other === this) continue

      let offset = p5.Vector.sub(this.position, other.position)
      let d = offset.mag()

      if (d > 0 && d < this.perceptionCircle.r) {
        // Instead of directly away, bias to a sideways nudge
        let away = offset.copy().normalize()

        // Rotate ±90° randomly to break symmetry (avoids "dance")
        away.rotate(random([HALF_PI, -HALF_PI]))

        let strength = map(d, 0, this.perceptionCircle.r, this.maxAccel, 0)
        away.mult(strength * 0.5) // softer than avoidance

        steering.add(away)
        total++
      }
    }

    if (total > 0) {
      steering.div(total)
      steering.limit(this.maxAccel * 0.3) // gentle
    }

    return steering
  }

  // --- Drift back toward waiting goal when there's space ---
  returnToGoal (goalPos) {
    let desired = p5.Vector.sub(goalPos, this.position)
    let d = desired.mag()

    if (d < 1) return createVector(0, 0) // already at goal

    // Only start drifting back if no one is pressing in the circle center
    if (
      this.currentlyPerceivedThings.withinCircle.length > 0 &&
      d < this.perceptionCircle.r * 0.5
    ) {
      return createVector(0, 0) // hold position, don't fight
    }

    desired.setMag(map(d, 0, this.perceptionCircle.r, 0, this.maxSpeed * 0.3))
    let steer = p5.Vector.sub(desired, this.velocity)
    steer.limit(this.maxAccel * 0.2) // very gentle correction
    return steer
  }

  show () {
    this.seeing_Distance = this.perceptionCone.r
    let angle = this.velocity.heading()
    fill(127)
    stroke(0)
    push()
    translate(this.position.x, this.position.y)
    rotate(angle)
    ellipse(0, 0, this.minor, this.major)
    fill(255)
    ellipse(0, 0, this.major / 3, (this.minor * 2) / 3)
    stroke(127, 127)
    line(0, 0, this.seeing_Distance, 0)
    pop()
  }

  applyForce (f) {
    // f is in px/s²
    this.acceleration.add(f)
  }
}
