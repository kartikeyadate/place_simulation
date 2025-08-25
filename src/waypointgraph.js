class Graph {
  constructor () {
    this.nodes = {}
    this.edges = {}
  }

  addNode (loc) {
    this.nodes[loc.name] = loc
    if (!(loc.name in this.edges)) {
      this.edges[loc.name] = []
    }
  }

  addEdge (a, b, w) {
    if (!(a in this.nodes) || !(b in this.nodes)) {
      console.error(`Cannot add edge: ${a} or ${b} not in graph`)
      return
    }
    this.edges[a].push({ node: b, w })
    this.edges[b].push({ node: a, w })
  }

  getNode (name) {
    return this.nodes[name]
  }

  getEdges (name) {
    return this.edges[name] || []
  }

  removeNode (name) {
    if (!(name in this.nodes)) return
    delete this.nodes[name]
    delete this.edges[name]
    for (let key in this.edges) {
      this.edges[key] = this.edges[key].filter(e => e.node !== name)
    }
  }

  findNearestNode (pos) {
    let best = null
    let bestDist = Infinity
    for (let key in this.nodes) {
      if (this.nodes[key].waypoint) {
        let d = p5.Vector.dist(pos, this.nodes[key].waypoint)
        if (d < bestDist) {
          bestDist = d
          best = key
        }
      }
    }
    return best
  }

  clone () {
    const g = new Graph()
    for (let key in this.nodes) {
      const loc = this.nodes[key]
      const cloned = new Location(loc.name, loc.id, loc.type)
      cloned.waypoint = loc.waypoint ? loc.waypoint.copy() : null
      cloned.centroid = loc.centroid ? loc.centroid.copy() : null
      cloned.zoneCenter = loc.zoneCenter ? loc.zoneCenter.copy() : null
      cloned.zoneRadius = loc.zoneRadius
      cloned.pixels = loc.pixels ? loc.pixels.slice() : []
      g.nodes[key] = cloned
      g.edges[key] = (this.edges[key] || []).map(e => ({
        node: e.node,
        w: e.w
      }))
    }
    return g
  }
}

// ---------- A* ----------
function findPath (graph, start, end) {
  let openSet = new Heap()
  openSet.push(start, 0)

  let cameFrom = {}

  let gScore = {}
  Object.keys(graph.nodes).forEach(node => (gScore[node] = Infinity))
  gScore[start] = 0

  let fScore = {}
  Object.keys(graph.nodes).forEach(node => (fScore[node] = Infinity))
  if (graph.getNode(start) && graph.getNode(end)) {
    fScore[start] = heuristic(graph.getNode(start), graph.getNode(end))
  }

  while (!openSet.isEmpty()) {
    let current = openSet.pop().element

    if (current === end) {
      return constructPath(cameFrom, current)
    }

    for (let nbr of graph.getEdges(current)) {
      let approx = gScore[current] + nbr.w
      if (approx < gScore[nbr.node]) {
        cameFrom[nbr.node] = current
        gScore[nbr.node] = approx
        let h = heuristic(graph.getNode(nbr.node), graph.getNode(end))
        fScore[nbr.node] = approx + h
        openSet.push(nbr.node, fScore[nbr.node])
      }
    }
  }
  return []
}

function heuristic (a, b) {
  if (!a || !b) return Infinity
  return p5.Vector.dist(a.waypoint, b.waypoint)
}

function constructPath (cameFrom, current) {
  let path = [current]
  while (current in cameFrom) {
    current = cameFrom[current]
    path.unshift(current)
  }
  return path
}

class Heap {
  constructor () {
    this.items = []
  }
  isEmpty () {
    return this.items.length === 0
  }
  push (element, priority) {
    this.items.push({ element, priority })
    this._rise(this.items.length - 1)
  }
  pop () {
    if (this.isEmpty()) return null
    this._swap(0, this.items.length - 1)
    const popped = this.items.pop()
    this._sink(0)
    return popped
  }
  _rise (i) {
    while (i > 0) {
      let p = Math.floor((i - 1) / 2)
      if (this.items[p].priority <= this.items[i].priority) break
      this._swap(p, i)
      i = p
    }
  }
  _sink (i) {
    let n = this.items.length
    while (true) {
      let l = 2 * i + 1,
        r = 2 * i + 2,
        s = i
      if (l < n && this.items[l].priority < this.items[s].priority) s = l
      if (r < n && this.items[r].priority < this.items[s].priority) s = r
      if (s === i) break
      this._swap(i, s)
      i = s
    }
  }
  _swap (a, b) {
    ;[this.items[a], this.items[b]] = [this.items[b], this.items[a]]
  }
}
