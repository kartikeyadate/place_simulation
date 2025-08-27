//This file builds a single file backup for the whole project.
//To create the combined file, run 'node build.js' in the root directory.

const fs = require('fs')
const path = require('path')

const srcDir = path.join(__dirname, 'src')
const backupDir = path.join(__dirname, 'backups')
const outputFile = path.join(backupDir, 'combined.js')

const fileOrder = [
  'config.js',
  'waypointgraph.js',
  'spacemanager.js',
  'person.js',
  'move.js',
  'peoplemanager.js',
  'activity.js',
  'ui.js',
  'diagnostics.js',
  'meet.js',
  'sketch.js'
]

const now = new Date()
const timestamp = now.toLocaleString('en-IN', {
  dateStyle: 'full',
  timeStyle: 'long'
})

let output = `// Combined build generated on ${timestamp}\n\n`

for (let file of fileOrder) {
  code = fs.readFileSync(path.join(srcDir, file), 'utf8') + '\n'
  output += `\n// ---- ${file} ----\n` + code + '\n'
}

fs.writeFileSync(path.join(backupDir, 'combined.js'), output)
