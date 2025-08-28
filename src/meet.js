class Meet {
  constructor (partners, duration, kind = 'unplanned') {
    this.type = 'meet'
    this.partners = partners
    this.duration = duration
    this.kind = kind
    this.elapsed = 0
    this.active = false
  }

  update (person) {
    if (!this.active) {
      return false
    }
    let center = createVector(0, 0)
    for (let p of this.partners) {
      center.add(p.position)
    }
    center.div(this.partners.length)
    person.face(center)
    this.elapsed++
    if (this.elapsed >= this.duration) {
      this.breakUp()
      return false
    }
    return true
  }

  breakUp () {
    this.active = false
    this.partners.forEach(p => {
      if (p.currentActivity instanceof Meet) {
        p.currentActivity = null
      }
    })
  }

  static sampleDuration () {
    return int(random(120, 300))
  }

  static canMeet (person, nearby, openCheck) {
    let available = nearby.filter(p => openCheck(p))
    return available.length > 0 ? available : null
  }
}
