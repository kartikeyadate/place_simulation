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
    } else if (activity.type === 'meet') {
      // activity should contain: { partners: [...], duration: n, kind: 'unplanned' }
      this.meet = new Meet(activity.partners, activity.duration, activity.kind)
      this.state = 'MEETING'
      this.person.velocity.mult(0)
    }
  }

  run (obstacles) {
    if (this.completed) return

    if (this.state === 'MOVING') {
      this.currentMove.move(obstacles)
      this.person.velocity.add(this.person.acceleration)
      this.person.velocity.limit(this.person.maxSpeed)
      if (this.person.velocity.mag() < this.person.minSpeed) {
        this.person.velocity.setMag(this.person.minSpeed)
      }
      this.person.position.add(this.person.velocity)
      this.person.acceleration.mult(0)
      this.currentMove.updateHistory()
      if (this.currentMove.isStuck()) {
        this.currentMove.unstick()
      }
      if (this.currentMove.isFinished()) {
        this.currentActivityIndex++
        this.startNextActivity()
      }
    } else if (this.state === 'WAITING') {
      this.waitTimer--
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
}
