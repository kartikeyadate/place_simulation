class QtPt {
  constructor (x, y, userData) {
    this.x = x
    this.y = y
    this.userData = userData //add your person, vehicle object here
  }
}

class QtRt {
  constructor (x, y, w, h) {
    this.x = x
    this.y = y
    this.w = w
    this.h = h
  }

  contains (point) {
    return (
      point.x >= this.x - this.w &&
      point.x < this.x + this.w &&
      point.y >= this.y - this.h &&
      point.y < this.y + this.h
    )
  }

  intersects (range) {
    return !(
      range.x - range.w > this.x + this.w ||
      range.x + range.w < this.x - this.w ||
      range.y - range.h > this.y + this.h ||
      range.y + range.h < this.y - this.h
    )
  }

  show () {
    stroke(0, 255, 0)
    strokeWeight(3)
    fill(0, 255, 0, 200)
    rect(this.x - this.w, this.y - this.h, this.w * 2, this.h * 2)
  }
}

class QtCir {
  constructor (x, y, r) {
    this.x = x
    this.y = y
    this.r = r
    this.rSquared = this.r * this.r
  }

  contains (point) {
    let d = Math.pow(point.x - this.x, 2) + Math.pow(point.y - this.y, 2)
    return d <= this.rSquared
  }

  intersects (range) {
    let xDist = Math.abs(range.x - this.x)
    let yDist = Math.abs(range.y - this.y)
    let r = this.r
    let w = range.w / 2
    let h = range.h / 2

    let edges = Math.pow(xDist - w, 2) + Math.pow(yDist - h, 2)

    if (xDist > r + w || yDist > r + h) {
      return false
    }

    if (xDist <= w || yDist <= h) {
      return true
    }

    return edges <= this.rSquared
  }
}

class Quadtree {
  constructor (boundary, n) {
    this.boundary = boundary
    this.capacity = n
    this.points = []
    this.divided = false
  }

  insert (point) {
    //This is a recursive function which inserts a point into the QT.
    if (!this.boundary.contains(point)) {
      return
    } else {
      if (this.points.length < this.capacity) {
        this.points.push(point)
        return true
      } else {
        if (!this.divided) {
          this.subdivide()
        }
        if (this.ne.insert(point)) {
          return true
        } else if (this.nw.insert(point)) {
          return true
        } else if (this.se.insert(point)) {
          return true
        } else if (this.sw.insert(point)) {
          return true
        }
      }
    }
  }

  subdivide () {
    let x = this.boundary.x
    let y = this.boundary.y
    let w = this.boundary.w
    let h = this.boundary.h

    let ner = new Rectangle(x + w / 2, y - h / 2, w / 2, h / 2)
    this.ne = new Quadtree(ner, this.capacity)
    let nwr = new Rectangle(x - w / 2, y - h / 2, w / 2, h / 2)
    this.nw = new Quadtree(nwr, this.capacity)
    let ser = new Rectangle(x + w / 2, y + h / 2, w / 2, h / 2)
    this.se = new Quadtree(ser, this.capacity)
    let swr = new Rectangle(x - w / 2, y + h / 2, w / 2, h / 2)
    this.sw = new Quadtree(swr, this.capacity)

    this.divided = true
  }

  query (range, found) {
    if (!found) {
      found = []
    }
    if (this.boundary.intersects(range)) {
      if (this.divided) {
        this.ne.query(range, found)
        this.nw.query(range, found)
        this.se.query(range, found)
        this.sw.query(range, found)
      }

      for (let p of this.points) {
        if (range.contains(p)) {
          found.push(p)
        }
      }
    }
    return found
  }

  show () {
    stroke(0, 150)
    strokeWeight(0.5)
    noFill()
    rectMode(CENTER)
    rect(
      this.boundary.x,
      this.boundary.y,
      this.boundary.w * 2,
      this.boundary.h * 2
    )
    if (this.divided) {
      this.ne.show()
      this.nw.show()
      this.se.show()
      this.sw.show()
    }
    /*
    for (let p of this.points) {
      stroke(255)
      strokeWeight(2)
      point(p.x, p.y)
    }
      */
  }
}
