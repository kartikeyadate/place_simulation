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
