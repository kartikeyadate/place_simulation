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

    // Acceleration capacity (px/s²)
    this.maxAccel = this.maxSpeed * 0.5 // tweak factor

    this.major = random(minShoulderPx, maxShoulderPx)
    this.minor = (this.major * 2) / 3

    this.seeing_Distance = this.major * 5
    this.wanderTheta = 0.0
    this.recentPositions = []
    this.stuckFrames = 0
    this.activity = null
    this.meetingPropensity = random(0.1)
    this.in_meeting = false
    this.in_fov = new Set()
    this.id = nextPersonId()
  }

  show () {
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
    line(0, 0, this.seeing_Distance * 0.3, 0)
    pop()
  }

  applyForce (f) {
    // f is in px/s²
    this.acceleration.add(f)
  }
}
