class PeopleManager {
  constructor (spaceManager) {
    this.spaceManager = spaceManager
    this.persons = []
    this.obstacles = []
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
    this.obstacles = []
    this.initAgents(num)
  }

  run () {
    this.poissonSpawn()
    for (let i = this.persons.length - 1; i >= 0; i--) {
      this.persons[i].activity.run(this.obstacles)
      if (this.persons[i].activity.completed) {
        this.persons.splice(i, 1)
      }
    }
    this.obstacles = this.persons
  }

  show () {
    for (let person of this.persons) {
      person.show()
    }
  }

  poissonSpawn () {
    this.spawnRateLambda = 1 / spawnRateSlider.value()
    if (random(1) < this.spawnRateLambda) {
      this.spawnPerson()
    }
  }

  spawnPerson () {
    // Choose an entry Location (not just a name)
    const entry = random(this.spaceManager.entryLocations)
    if (!entry || !entry.pixels || entry.pixels.length === 0) return

    const spawnPos = random(entry.pixels)
    const activities = []

    if (spawnPos) {
      let person = new Person(
        spawnPos.x,
        spawnPos.y,
        pixelsPerMeter,
        minShoulderCm,
        maxShoulderCm,
        minSpeedCmS,
        maxSpeedCmS
      )

      // Build a random itinerary visiting random entries
      const numStops = floor(random(3, 7))
      for (let c = 1; c < numStops - 1; c++) {
        const targetLoc = random(this.spaceManager.subGoalLocations)
        targetLoc.selectWeightedWaypoint()
        let mins = [random([1, 2, 3]), random([6, 8, 10])]
        const waittime = floor(random(mins[0] * 60, mins[1] * 60))
        if (targetLoc?.waypoint) {
          activities.push({ type: 'move', waypoint: targetLoc.waypoint.copy() })
          activities.push({ type: 'wait', duration: waittime })
        }
      }

      const lastTarget = random(this.spaceManager.entryLocations)
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
}
