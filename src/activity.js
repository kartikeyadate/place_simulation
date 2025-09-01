class Activity {
  constructor (person, activities, graph) {
    this.person = person
    this.activities = activities
    this.graph = graph
    this.currentActivityIndex = 0
    this.currentMove = null
    this.state = 'IDLE'
    this.waitTimer = 0
    this.meet = null
    this.completed = false
    this.startNextActivity()
  }

  startNextActivity () {
    if (this.currentActivityIndex >= this.activities.length) {
      this.completed = true
      this.person.velocity.mult(0)
      return
    }

    let activity = this.activities[this.currentActivityIndex]

    if (activity.type === 'move') {
      this.currentMove = new Move(this.person, activity.waypoint, this.graph)
      this.state = 'MOVING'
    } else if (activity.type === 'wait') {
      this.waitTimer = activity.duration
      this.state = 'WAITING'
      this.person.velocity.mult(0)
      if (!activity.waypoint) {
        activity.waypoint = this.person.position.copy()
      }
    } else if (activity.type === 'meet') {
      this.meet = new Meet(activity.partners, activity.duration, activity.kind)
      this.state = 'MEETING'
      this.person.velocity.mult(0)
    }
  }

  run (obstacles) {
    if (this.completed) return

    if (this.state === 'MOVING') {
      this.currentMove.move(obstacles)
      if (this.currentMove.isFinished()) {
        this.currentActivityIndex++
        this.startNextActivity()
      }
    } else if (this.state === 'WAITING') {
      this.waitTimer--
      let combined = createVector(0, 0)
      combined.add(this.person.giveWay().mult(1.8))
      combined.add(
        this.person
          .returnToGoal(this.activities[this.currentActivityIndex].waypoint)
          .mult(3.0)
      )
      this.person.applyForce(combined)

      // usual physics update (Euler integration)
      const dt = 1 / FPS
      this.person.velocity.add(p5.Vector.mult(this.person.acceleration, dt))
      this.person.velocity.limit(this.person.maxSpeed * 0.3) // 🔒 cap speed lower while waiting
      this.person.velocity.mult(0.85)
      this.person.position.add(p5.Vector.mult(this.person.velocity, dt))
      this.person.acceleration.mult(0)
      if (this.waitTimer <= 0) {
        this.currentActivityIndex++
        this.startNextActivity()
      }
    } else if (this.state === 'MEETING') {
      if (this.meet) {
        let stillMeeting = this.meet.update(this.person)
        if (!stillMeeting) {
          this.currentActivityIndex++
          this.startNextActivity()
        }
      }
    }
  }

  recalculatePath () {
    if (this.state === 'MOVING' && this.currentMove) {
      this.currentMove.recalculatePath()
    }
  }

  // 🔍 draw target waypoint (green circle)
  show () {
    if (this.state === 'MOVING' && this.currentMove) {
      this.currentMove.showTarget()
    }
  }
}
