// Refactored Move + Person with unit-consistent steering behaviors (px/s²)
// All forces return accelerations in px/s², integration is semi-implicit Euler

class Person {
  constructor(
    x,
    y,
    pixelsPerMeter,
    minShoulderCm,
    maxShoulderCm,
    minSpeedCmS,
    maxSpeedCmS
  ) {
    this.position = createVector(x, y);
    this.velocity = createVector(random(-1, 1), random(-1, 1));
    this.acceleration = createVector();

    const pxPerCm = pixelsPerMeter / 100;
    const minShoulderPx = minShoulderCm * pxPerCm;
    const maxShoulderPx = maxShoulderCm * pxPerCm;
    const minSpeedPxS = minSpeedCmS * pxPerCm;
    const maxSpeedPxS = maxSpeedCmS * pxPerCm;

    this.major = random(minShoulderPx, maxShoulderPx);
    this.minor = (this.major * 2) / 3;
    this.maxSpeed = random(minSpeedPxS, maxSpeedPxS); // px/s
    this.minSpeed = this.maxSpeed * 0.5;
    this.maxAccel = this.maxSpeed * 2.0; // px/s², tunable

    this.seeing_Distance = this.major * 3;
    this.wanderTheta = 0.0;
    this.recentPositions = [];
    this.stuckFrames = 0;
    this.activity = null;
    this.meetingPropensity = random(0.1);
    this.in_meeting = false;
    this.in_fov = new Set();
    this.id = nextPersonId();
  }

  show() {
    let angle = this.velocity.heading();
    fill(127);
    stroke(0);
    push();
    translate(this.position.x, this.position.y);
    rotate(angle);
    ellipse(0, 0, this.minor, this.major);
    fill(255);
    ellipse(0, 0, this.major / 3, (this.minor * 2) / 3);
    stroke(127, 127);
    line(0, 0, this.seeing_Distance * 0.3, 0);
    pop();
  }

  applyForce(force) {
    // force is px/s²
    this.acceleration.add(force);
  }
}

class Move {
  constructor(person, targetWaypointVec, graph) {
    this.person = person;
    this.graph = graph;
    this.finalTargetWaypoint = targetWaypointVec.copy
      ? targetWaypointVec.copy()
      : createVector(targetWaypointVec.x, targetWaypointVec.y);
    this.path = [];
    this.pathIndex = 0;
    this.targetWaypoint = null;
    this.isMovingToFinalTarget = false;
    this.recalculatePath();
  }

  move(obstacles, neighbors = []) {
    if (!this.targetWaypoint) {
      this.person.velocity.mult(0);
      return;
    }
    const dt = 1 / FPS;

    let distanceToWaypoint = p5.Vector.dist(
      this.person.position,
      this.targetWaypoint
    );

    if (!this.isMovingToFinalTarget) {
      if (distanceToWaypoint < 10) {
        if (this.pathIndex < this.path.length - 1) {
          this.pathIndex++;
          this.targetWaypoint = this.path[this.pathIndex];
        } else {
          this.isMovingToFinalTarget = true;
          this.targetWaypoint = this.finalTargetWaypoint;
        }
      }
    }

    let combinedForce = this.applyBehaviorForces(obstacles, neighbors);
    this.person.applyForce(combinedForce);

    // Semi-implicit Euler
    this.person.velocity.add(p5.Vector.mult(this.person.acceleration, dt));
    this.person.velocity.limit(this.person.maxSpeed);
    if (this.person.velocity.mag() < this.person.minSpeed) {
      this.person.velocity.setMag(this.person.minSpeed);
    }
    this.person.position.add(p5.Vector.mult(this.person.velocity, dt));
    this.person.acceleration.mult(0);
  }

  applyBehaviorForces(obstacles, neighbors) {
    let combined = createVector(0, 0);
    const weights = {
      queueing: 1.0,
      cohesion: 0.2,
      alignment: 0.2,
      seek: 2.0,
      avoidStatic: 3.5,
      avoidDynamic: 3.0,
      bounds: 1.0,
      wander: 0.05,
    };

    combined.add(this.seek(this.targetWaypoint, this.isMovingToFinalTarget).mult(weights.seek));
    combined.add(this.avoidStaticObstacles().mult(weights.avoidStatic));
    combined.add(this.evaluate_obstacles(obstacles).mult(weights.avoidDynamic));
    combined.add(this.bounds().mult(weights.bounds));
    combined.add(this.wander().mult(weights.wander));
    combined.add(this.queueing(neighbors).mult(weights.queueing));
    combined.add(this.cohesion(neighbors).mult(weights.cohesion));
    combined.add(this.alignment(neighbors).mult(weights.alignment));

    combined.limit(this.person.maxAccel);
    return combined;
  }

  // --- Reynolds behaviors (return px/s²) ---

  seek(target, arrive) {
    let desired = p5.Vector.sub(target, this.person.position);
    let d = desired.mag();
    if (d === 0) return createVector(0, 0);
    let speed = this.person.maxSpeed;
    if (arrive && d < this.person.seeing_Distance) {
      speed = map(d, 0, this.person.seeing_Distance, 0, this.person.maxSpeed);
    }
    desired.setMag(speed);
    let steer = p5.Vector.sub(desired, this.person.velocity);
    steer.limit(this.person.maxAccel);
    return steer;
  }

  cohesion(neighbors) {
    let steering = createVector();
    let total = 0;
    for (let other of neighbors) {
      let d = p5.Vector.dist(this.person.position, other.position);
      if (other !== this.person && d < this.person.seeing_Distance) {
        steering.add(other.position);
        total++;
      }
    }
    if (total > 0) {
      steering.div(total);
      steering.sub(this.person.position);
      steering.setMag(this.person.maxSpeed);
      steering.sub(this.person.velocity);
      steering.limit(this.person.maxAccel);
    }
    return steering;
  }

  alignment(neighbors) {
    let steering = createVector();
    let total = 0;
    for (let other of neighbors) {
      let d = p5.Vector.dist(this.person.position, other.position);
      if (other !== this.person && d < this.person.seeing_Distance) {
        steering.add(other.velocity);
        total++;
      }
    }
    if (total > 0) {
      steering.div(total);
      steering.setMag(this.person.maxSpeed);
      steering.sub(this.person.velocity);
      steering.limit(this.person.maxAccel);
    }
    return steering;
  }

  wander() {
    let wanderPoint = this.person.velocity.copy();
    wanderPoint.setMag(this.person.seeing_Distance);
    wanderPoint.add(this.person.position);
    let wanderRadius = this.person.seeing_Distance * 0.5;
    let angle = this.person.wanderTheta + this.person.velocity.heading();
    wanderPoint.add(wanderRadius * cos(angle), wanderRadius * sin(angle));
    let wanderForce = p5.Vector.sub(wanderPoint, this.person.position);
    wanderForce.setMag(this.person.maxAccel * 0.3);
    this.person.wanderTheta += random(-0.25, 0.25);
    return wanderForce;
  }

  queueing(neighbors) {
    let steering = createVector();
    let total = 0;
    if (this.person.velocity.mag() === 0) return steering;
    let lookAhead = this.person.velocity.mag() * 0.5;
    let forward = this.person.velocity.copy().normalize();
    for (let other of neighbors) {
      if (other === this.person) continue;
      let offset = p5.Vector.sub(other.position, this.person.position);
      let proj = p5.Vector.dot(offset, forward);
      if (proj > 0 && proj < lookAhead) {
        let dist = offset.mag();
        if (dist < this.person.major * 2) {
          let away = forward.copy().mult(-1 / dist);
          steering.add(away);
          total++;
        }
      }
    }
    if (total > 0) {
      steering.div(total);
      steering.setMag(this.person.maxAccel * 0.5);
    }
    return steering;
  }

  bounds() {
    let steer = createVector(0, 0);
    let margin = this.person.seeing_Distance;
    if (this.person.position.x < margin) steer.x = this.person.maxAccel;
    else if (this.person.position.x > width - margin) steer.x = -this.person.maxAccel;
    if (this.person.position.y < margin) steer.y = this.person.maxAccel;
    else if (this.person.position.y > height - margin) steer.y = -this.person.maxAccel;
    return steer;
  }

  avoidStaticObstacles() {
    // Simple raycast-based avoidance, returns px/s²
    let rayLength = this.person.seeing_Distance;
    let best = createVector(0, 0);
    let forward = this.person.velocity.copy().normalize();
    let ahead = p5.Vector.add(this.person.position, p5.Vector.mult(forward, rayLength));
    if (spaceManager.isObstacle(ahead.x, ahead.y)) {
      best = p5.Vector.sub(this.person.position, ahead).setMag(this.person.maxAccel);
    }
    return best;
  }

  evaluate_obstacles(obstacles) {
    // Dynamic avoidance: pick nearest neighbor
    let nearest = null;
    let minD = Infinity;
    for (let o of obstacles) {
      if (o === this.person) continue;
      let d = p5.Vector.dist(this.person.position, o.position);
      if (d < minD) {
        minD = d;
        nearest = o;
      }
    }
    if (nearest && minD < this.person.seeing_Distance) {
      let away = p5.Vector.sub(this.person.position, nearest.position);
      away.setMag(this.person.maxAccel);
      return away;
    }
    return createVector(0, 0);
  }
}
