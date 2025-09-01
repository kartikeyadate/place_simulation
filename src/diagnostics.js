class Grid {
  constructor (size) {
    this.size = size
    this.cols = floor(img.width / this.size)
    this.rows = floor(img.height / this.size)

    this.cellCount = Array.from({ length: this.cols }, () =>
      Array(this.rows).fill(0)
    )
    this.totalCount = 0
  }

  update (persons) {
    for (let p of persons) {
      let i = floor(p.position.x / this.size)
      let j = floor(p.position.y / this.size)
      if (i >= 0 && i < this.cols && j >= 0 && j < this.rows) {
        this.cellCount[i][j]++
        this.totalCount++ // global counter
      }
    }
  }

  showDensities () {
    if (this.totalCount === 0) return

    let fromCol = color(255, 255, 255)
    let toCol = color(255, 99, 71)
    let smooth = this.smoothCellCount()

    for (let i = 0; i < this.cols; i++) {
      for (let j = 0; j < this.rows; j++) {
        let share =
          (smooth[i][j] / (this.totalCount / (this.size * this.size))) ** 0.5
        if (share > 0) {
          let col = lerpColor(fromCol, toCol, share)
          col.setAlpha(100)
          noStroke()
          fill(col)
          rect(i * this.size, j * this.size, this.size, this.size)
        }
      }
    }
  }
  smoothCellCount () {
    let newCounts = []
    const kernel = [
      [1, 2, 1],
      [2, 4, 2],
      [1, 2, 1]
    ]
    const kernelWeight = 16 // sum of kernel entries

    for (let i = 0; i < this.cols; i++) {
      newCounts[i] = []
      for (let j = 0; j < this.rows; j++) {
        let sum = 0
        for (let ki = -1; ki <= 1; ki++) {
          for (let kj = -1; kj <= 1; kj++) {
            let ni = i + ki
            let nj = j + kj
            if (ni >= 0 && ni < this.cols && nj >= 0 && nj < this.rows) {
              sum += this.cellCount[ni][nj] * kernel[ki + 1][kj + 1]
            }
          }
        }

        newCounts[i][j] = sum / kernelWeight
        if (newCounts[i][j] === undefined) {
          console.log(i, j)
        }
      }
    }
    return newCounts
  }
}
