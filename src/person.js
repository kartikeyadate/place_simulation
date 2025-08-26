class Person {
  constructor (
    x,
    y,
    pixelsPerMeter,
    minShoulderCm,
    maxShoulderCm,
    minSpeedCmS,
    maxSpeedCmS
  ) {
    this.position = createVector(x, y)
    this.velocity = createVector(random(-1, 1), random(-1, 1))
    this.acceleration = createVector()

    const pxPerCm = pixelsPerMeter / 100
    const minShoulderPx = minShoulderCm * pxPerCm
    const maxShoulderPx = maxShoulderCm * pxPerCm
    const minSpeedPxS = minSpeedCmS * pxPerCm
    const maxSpeedPxS = maxSpeedCmS * pxPerCm

    const minSpeedPxPerFrame = minSpeedPxS / FPS
    const maxSpeedPxPerFrame = maxSpeedPxS / FPS

    this.major = random(minShoulderPx, maxShoulderPx)
    this.minor = (this.major * 2) / 3
    this.maxSpeed = random(minSpeedPxPerFrame, maxSpeedPxPerFrame)
    this.minSpeed = this.maxSpeed * 0.5
    this.maxForce = this.maxSpeed * 0.5

    this.seeing_Distance = this.major * 3
    this.wanderTheta = 0.0
    this.recentPositions = []
    this.stuckFrames = 0
    this.activity = null
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

    if (
      this.activity &&
      this.activity.currentMove &&
      this.activity.currentMove.finalTargetWaypoint
    ) {
      fill(0, 200, 0, 150)
      noStroke()
      circle(
        this.activity.currentMove.finalTargetWaypoint.x,
        this.activity.currentMove.finalTargetWaypoint.y,
        15
      )
    }
  }

  applyForce (f) {
    this.acceleration.add(f)
  }
}
